import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';

const DATA_DIR = path.resolve('data');
const SEEN_FILE = path.join(DATA_DIR, 'seen-jobs.json');

// Tracks which job IDs have already been scored, so re-runs only spend
// API calls on genuinely new listings.
export async function loadSeen(): Promise<Set<string>> {
  try {
    const raw = await readFile(SEEN_FILE, 'utf-8');
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

export async function saveSeen(seen: Set<string>): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(SEEN_FILE, JSON.stringify([...seen], null, 2));
}
