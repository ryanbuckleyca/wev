/**
 * Work value definitions used in profile selection and downstream parsing.
 * Definitions are aligned to work-values theory and O*NET/MIQ-style need language.
 */

export interface ValueDefinition {
  name?: string; // Optional translated display name
  description: string;
  example: string;
  category?: string;
}

export interface WorkValue {
  id: string;
  label: { en: string; fr: string };
  summary: { en: string; fr: string };
  category: { en: string; fr: string };
}

/**
 * Category groupings for work values, inspired by O*NET work value clusters.
 * Each category has bilingual labels.
 */
export const VALUE_CATEGORIES: Record<string, { en: string; fr: string }> = {
  growth: { en: 'Growth & Achievement', fr: 'Croissance et accomplissement' },
  creativity: { en: 'Creativity & Expression', fr: 'Créativité et expression' },
  social: { en: 'Social & Relationships', fr: 'Social et relations' },
  workstyle: { en: 'Work Style & Environment', fr: 'Style de travail et environnement' },
  rewards: { en: 'Rewards & Recognition', fr: 'Récompenses et reconnaissance' },
  stability: { en: 'Stability & Security', fr: 'Stabilité et sécurité' },
};

/** Maps each value key to its category key */
const VALUE_TO_CATEGORY: Record<string, string> = {
  Advancement: 'growth',
  Challenge: 'growth',
  Competence: 'growth',
  Experience: 'growth',
  Knowledge: 'growth',
  'Decision Making': 'growth',
  'Research and Development': 'growth',
  Aesthetic: 'creativity',
  'Artistic Creativity': 'creativity',
  'Creative Expression': 'creativity',
  Creativity: 'creativity',
  'Precision Work': 'creativity',
  Affiliation: 'social',
  Community: 'social',
  Friendship: 'social',
  'Help Others': 'social',
  'Help Society': 'social',
  'Influence People': 'social',
  'Public Contact': 'social',
  'Work with Others': 'social',
  'Change and Variety': 'workstyle',
  Excitement: 'workstyle',
  'Fast Pace': 'workstyle',
  'Job Tranquility': 'workstyle',
  Location: 'workstyle',
  'Moral Fulfillment': 'workstyle',
  Organization: 'workstyle',
  'Physical Challenge': 'workstyle',
  Supervision: 'workstyle',
  'Time Freedom': 'workstyle',
  'Work Alone': 'workstyle',
  'Work Under Pressure': 'workstyle',
  Competition: 'rewards',
  'Financial Gain': 'rewards',
  'High Earnings': 'rewards',
  'Intellectual Status': 'rewards',
  Recognition: 'rewards',
  Status: 'rewards',
  Security: 'stability',
  Stability: 'stability',
};

export const VALUES_DICTIONARY = {
  Advancement: {
    description: 'Progressing to higher levels of responsibility, authority, or scope.',
    example: 'Example: opportunities to move from specialist to manager over time.',
  },
  Aesthetic: {
    description: 'Working in environments where beauty, design, and form matter.',
    example: 'Example: creating polished visual work and improving how things look and feel.',
  },
  Affiliation: {
    description: 'Feeling accepted and connected to a supportive work group.',
    example: 'Example: being part of a close, collaborative team culture.',
  },
  'Artistic Creativity': {
    description: 'Producing original artistic work with room for imagination and style.',
    example: 'Example: creating unique illustrations, writing, music, or multimedia work.',
  },
  Challenge: {
    description: 'Taking on difficult goals that stretch skills and problem-solving ability.',
    example: 'Example: solving complex problems with no obvious solution path.',
  },
  'Change and Variety': {
    description: 'Having different tasks, contexts, or priorities instead of repetition.',
    example: 'Example: shifting between projects and learning new tools often.',
  },
  Community: {
    description: 'Feeling rooted in and connected to a broader local or professional community.',
    example: 'Example: work that builds stronger neighborhoods or community programs.',
  },
  Competition: {
    description: 'Measuring performance against peers and aiming to win or outperform.',
    example: 'Example: sales targets, rankings, or performance leaderboards.',
  },
  Competence: {
    description: 'Using skills effectively and being trusted for high-quality execution.',
    example: 'Example: being known as reliable and technically strong in core tasks.',
  },
  'Creative Expression': {
    description: 'Expressing personal ideas, voice, and perspective through work output.',
    example: 'Example: shaping content, messaging, or design in your own style.',
  },
  Creativity: {
    description: 'Generating novel and useful ideas, methods, or solutions.',
    example: 'Example: inventing new approaches that improve outcomes.',
  },
  'Decision Making': {
    description: 'Having authority to make meaningful choices that affect outcomes.',
    example: 'Example: owning project direction, priorities, or resource tradeoffs.',
  },
  Excitement: {
    description: 'Experiencing energy, stimulation, and novelty in day-to-day work.',
    example: 'Example: high-engagement work with visible momentum and action.',
  },
  Experience: {
    description: 'Building broad real-world exposure to roles, systems, and situations.',
    example: 'Example: rotating across functions to gain practical perspective.',
  },
  'Fast Pace': {
    description: 'Working quickly with short cycles, tight timelines, and rapid feedback.',
    example: 'Example: handling frequent deliverables in a high-tempo environment.',
  },
  'Financial Gain': {
    description: 'Increasing income through performance, growth, or financial upside.',
    example: 'Example: bonus structures, commissions, equity, or profit sharing.',
  },
  Friendship: {
    description: 'Forming warm, personal relationships with coworkers at work.',
    example: 'Example: enjoying genuine day-to-day friendships on the team.',
  },
  'Help Others': {
    description: 'Providing direct support that improves another person’s well-being or success.',
    example: 'Example: coaching, mentoring, advising, or solving client problems.',
  },
  'Help Society': {
    description: 'Contributing to social good and positive impact at a broader level.',
    example: 'Example: work that advances health, equity, education, or sustainability.',
  },
  'High Earnings': {
    description: 'Prioritizing a top-tier salary compared with alternatives.',
    example: 'Example: choosing roles known for strong compensation ceilings.',
  },
  'Influence People': {
    description: 'Persuading others and shaping decisions, priorities, or behavior.',
    example: 'Example: guiding stakeholders to align on a proposed direction.',
  },
  'Intellectual Status': {
    description: 'Being respected for expertise, insight, and intellectual contribution.',
    example: 'Example: recognition as a thought partner in complex domains.',
  },
  'Job Tranquility': {
    description: 'Maintaining low stress, emotional calm, and predictable work pressure.',
    example: 'Example: steady workloads with limited urgency and crisis response.',
  },
  Knowledge: {
    description: 'Continually learning, understanding, and mastering new information.',
    example: 'Example: roles that reward study, analysis, and deep domain learning.',
  },
  Location: {
    description: 'Working in a preferred geographic setting or physical environment.',
    example: 'Example: staying in a specific city, region, or remote setup.',
  },
  'Moral Fulfillment': {
    description: 'Doing work that aligns with personal ethics and sense of right action.',
    example: 'Example: choosing projects that match your values and integrity standards.',
  },
  'Physical Challenge': {
    description: 'Engaging the body through strength, movement, stamina, or coordination.',
    example: 'Example: active work with meaningful physical demands.',
  },
  'Precision Work': {
    description: 'Producing accurate, detail-oriented output with minimal errors.',
    example: 'Example: tasks where quality depends on careful, exact execution.',
  },
  'Public Contact': {
    description: 'Interacting frequently with clients, customers, or the general public.',
    example: 'Example: front-facing roles with regular external communication.',
  },
  Recognition: {
    description: 'Receiving visible appreciation, credit, and acknowledgment for work.',
    example: 'Example: public praise, awards, or clear attribution for contributions.',
  },
  'Research and Development': {
    description: 'Investigating ideas, testing hypotheses, and creating new capabilities.',
    example: 'Example: experimentation and prototyping to develop future solutions.',
  },
  Security: {
    description: 'Having confidence in continued employment and dependable income.',
    example: 'Example: stable organizations with low perceived layoff risk.',
  },
  Stability: {
    description: 'Working within consistent routines, structures, and expectations.',
    example: 'Example: predictable schedules and clearly defined processes.',
  },
  Status: {
    description: 'Holding a respected position with visible prestige or standing.',
    example: 'Example: title, role visibility, and perceived importance in an organization.',
  },
  Supervision: {
    description: 'Leading, directing, and developing the work of other people.',
    example: 'Example: managing a team and being accountable for team outcomes.',
  },
  'Time Freedom': {
    description: 'Controlling when work is done, including schedule flexibility.',
    example: 'Example: setting your own hours or adjusting work around life demands.',
  },
  'Work Alone': {
    description: 'Having focused, independent work with minimal collaboration demands.',
    example: 'Example: long stretches of autonomous work and individual ownership.',
  },
  'Work Under Pressure': {
    description: 'Performing effectively in urgent, high-stakes, or deadline-driven situations.',
    example: 'Example: staying effective during peak load and time-critical decisions.',
  },
  'Work with Others': {
    description: 'Collaborating closely and regularly with teammates or partners.',
    example: 'Example: planning and executing work through shared responsibility.',
  },
} as const satisfies Record<string, ValueDefinition>;

export type Value = keyof typeof VALUES_DICTIONARY;

export const VALUES_LIST = Object.keys(VALUES_DICTIONARY) as Value[];

const DEFAULT_VALUE_DEFINITION: ValueDefinition = {
  description: 'A work-related outcome or condition someone may prioritize in a job.',
  example: 'Example: choosing roles that better match personal motivation and needs.',
};

/**
 * Get value definition with optional translations.
 * If translations are provided, returns translated version; otherwise returns English default.
 */
export function getValueDefinition(
  value: string,
  translations?: {
    name?: string;
    description: string;
    example: string;
  },
): ValueDefinition {
  if (translations) {
    return {
      name: translations.name,
      description: translations.description,
      example: translations.example,
    };
  }

  // Fallback to English dictionary
  if (Object.prototype.hasOwnProperty.call(VALUES_DICTIONARY, value)) {
    return VALUES_DICTIONARY[value as Value];
  }

  return DEFAULT_VALUE_DEFINITION;
}

/**
 * Build the full WorkValue list for use with ValuesSelector.
 * Requires a translation function `t(key)` that resolves keys under
 * the `values` namespace (e.g. `values.Advancement.name`).
 *
 * @param tEn - Translation function for English locale
 * @param tFr - Translation function for French locale
 */
export function buildWorkValues(
  tEn: (key: string, opts?: { defaultValue: string }) => string,
  tFr: (key: string, opts?: { defaultValue: string }) => string,
): WorkValue[] {
  const uncategorised = { en: 'Other', fr: 'Autre' };
  return VALUES_LIST.map((id) => {
    const catKey = VALUE_TO_CATEGORY[id] ?? '';
    const cat = VALUE_CATEGORIES[catKey] ?? uncategorised;
    const def = VALUES_DICTIONARY[id];
    return {
      id,
      label: {
        en: tEn(`${id}.name`, { defaultValue: id }),
        fr: tFr(`${id}.name`, { defaultValue: id }),
      },
      summary: {
        en: tEn(`${id}.description`, { defaultValue: def.description }),
        fr: tFr(`${id}.description`, { defaultValue: def.description }),
      },
      category: cat,
    };
  });
}
