"""Thin async client for ZAI / Zhipu GLM (OpenAI-compatible chat completions).

Uses httpx directly so behavior is explicit and debuggable. Enforces JSON
output and parses into Pydantic models with retry-on-parse-error. Includes a
deterministic offline mock so the app can be smoke-tested without API keys.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional, Type, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from app.config import Settings

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

# Strip ```json fences and grab the outermost JSON object/array
_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL)


class ZAIClientError(RuntimeError):
    """Raised for unrecoverable ZAI/GLM failures."""


def _extract_json(text: str) -> str:
    """Best-effort extraction of a JSON object/array from an LLM response."""
    if not text:
        raise ValueError("Empty model response")
    # 1) fenced block
    m = _FENCE_RE.search(text)
    candidate = m.group(1) if m else text
    # 2) try whole thing
    try:
        json.loads(candidate)
        return candidate
    except Exception:
        pass
    # 3) grab the outermost { ... } or [ ... ]
    for opener, closer in (("{", "}"), ("[", "]")):
        start = candidate.find(opener)
        end = candidate.rfind(closer)
        if start != -1 and end != -1 and end > start:
            sub = candidate[start : end + 1]
            try:
                json.loads(sub)
                return sub
            except Exception:
                continue
    raise ValueError(f"Could not extract JSON from model output:\n{text[:500]}")


class ZAIClient:
    """Async ZAI/Zhipu GLM client (OpenAI-compatible)."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._base = settings.zai_base_url.rstrip("/")
        self._headers = {
            "Authorization": f"Bearer {settings.zai_api_key}",
            "Content-Type": "application/json",
        }
        # generous timeouts: LLMs can be slow
        self._timeout = httpx.Timeout(60.0, connect=15.0)

    @property
    def offline(self) -> bool:
        return not bool(self.settings.zai_api_key)

    async def chat(self, user_prompt: str, system: Optional[str] = None) -> str:
        """Send a chat completion and return the raw text content."""
        if self.offline:
            raise ZAIClientError(
                "ZAI_API_KEY is not set — cannot make live GLM calls. "
                "Add your key to .env (see .env.example)."
            )
        messages: list[dict[str, Any]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": user_prompt})

        payload = {
            "model": self.settings.zai_model,
            "messages": messages,
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
        }
        url = f"{self._base}/chat/completions"
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(url, headers=self._headers, json=payload)
        except httpx.RequestError as exc:
            raise ZAIClientError(f"Network error contacting ZAI: {exc}") from exc
        if resp.status_code >= 400:
            raise ZAIClientError(
                f"ZAI API error {resp.status_code}: {resp.text[:500]}"
            )
        try:
            data = resp.json()
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, json.JSONDecodeError) as exc:
            raise ZAIClientError(f"Malformed ZAI response: {exc}") from exc

    async def chat_json(
        self,
        user_prompt: str,
        model: Type[T],
        system: Optional[str] = None,
        retries: int = 2,
    ) -> T:
        """Call GLM, parse JSON, validate into `model`. Retries on parse failure."""
        last_err: Optional[Exception] = None
        for attempt in range(retries + 1):
            raw = await self.chat(user_prompt, system=system)
            try:
                payload = _extract_json(raw)
                return model.model_validate_json(payload)
            except (ValueError, ValidationError) as exc:
                last_err = exc
                logger.warning(
                    "GLM JSON parse failed (attempt %d/%d): %s",
                    attempt + 1,
                    retries + 1,
                    exc,
                )
        raise ZAIClientError(
            f"GLM response could not be parsed as {model.__name__} after retries: {last_err}"
        )

    async def chat_text(
        self, user_prompt: str, system: Optional[str] = None
    ) -> str:
        """Call GLM and return raw text (no JSON parsing)."""
        return await self.chat(user_prompt, system=system)