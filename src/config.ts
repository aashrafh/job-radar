// Edit this file to tune what "a good fit" means for you.
// Nothing here calls any API - it's just data the scorer reads.

export const profile = {
  currentRole: 'Senior Software Engineer (Frontend / Full-Stack)',
  yearsExperience: 5,

  coreSkills: [
    'React',
    'TypeScript',
    'JavaScript',
    'Next.js',
    'Node.js',
    'Ruby on Rails',
    'Micro-frontends',
  ],

  // A job's title/tags must contain at least one of these to be considered.
  targetRoleKeywords: [
    'frontend',
    'front-end',
    'front end',
    'full stack',
    'fullstack',
    'full-stack',
    'software engineer',
    'react',
  ],

  // A job is dropped immediately if its title/tags contain any of these.
  excludeKeywords: ['junior', 'intern', 'internship', 'entry level', 'entry-level'],

  targetCountries: [
    'United Kingdom',
    'Germany',
    'Netherlands',
    'Portugal',
    'Australia',
    'New Zealand',
    'Ireland',
    'Spain',
    'Estonia',
    'Lithuania',
    'Canada',
  ],

  needsSponsorship: true,

  // Fed to the model so it can judge fit against real, specific achievements
  // instead of just matching keywords.
  proofPoints: [
    'Redesigned a data-loading architecture (Row Patching) that cut load times from 80s to 7s, a 91% reduction',
    'Led a FedRAMP-compliant micro-frontend deployment',
    'Tech lead for a 4-person team modernizing a legacy module from Rails ERB to a React micro-frontend',
    'Built a merchant portal serving 10,000+ merchants across UAE, Saudi Arabia, and Egypt',
  ],

  // Jobs scoring below this are still saved to the results file but not
  // printed front-and-center. Raise it if you're getting too much noise.
  minScoreToShow: 55,
};

export const searchConfig = {
  // Used as search terms for sources that require a query (currently Adzuna).
  queries: ['senior frontend engineer', 'senior software engineer react', 'full stack engineer'],
};
