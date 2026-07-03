/**
 * Work value definitions used in profile selection and downstream parsing.
 * Value names and descriptions are sourced from the Knowdell Career Values Card Sort
 * (Richard Knowdell, Career Research & Testing).
 */
import sharedValues from '@shared/taxonomy/work_values.json';

export interface ValueDefinition {
  name?: string; // Optional translated display name
  description: string;
  example: string;
  category?: string;
  /** Short phrases commonly found in job postings that indicate this value. */
  signals?: string[];
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
export const VALUE_TO_CATEGORY = {
  Advancement: 'growth',
  Challenge: 'growth',
  Competence: 'growth',
  Knowledge: 'growth',
  'Decision Making': 'growth',
  'Power and Authority': 'growth',
  Practicality: 'growth',
  'Research and Development': 'growth',
  'Steep Learning Curve': 'growth',
  Aesthetic: 'creativity',
  'Artistic Creativity': 'creativity',
  'Creative Expression': 'creativity',
  Creativity: 'creativity',
  'Precision Work': 'creativity',
  Affiliation: 'social',
  Community: 'social',
  Diversity: 'social',
  Environment: 'social',
  Friendship: 'social',
  'Group & Team': 'social',
  'Help Others': 'social',
  'Help Society': 'social',
  'Influence People': 'social',
  'Public Contact': 'social',
  'Work with Others': 'social',
  Adventure: 'workstyle',
  'Change and Variety': 'workstyle',
  Excitement: 'workstyle',
  Family: 'workstyle',
  'Fast Pace': 'workstyle',
  'Fun and Humor': 'workstyle',
  'Honesty and Integrity': 'workstyle',
  Independence: 'workstyle',
  'Job Tranquility': 'workstyle',
  Location: 'workstyle',
  'Moral Fulfillment': 'workstyle',
  'Physical Challenge': 'workstyle',
  Spirituality: 'workstyle',
  Supervision: 'workstyle',
  'Time Freedom': 'workstyle',
  Tradition: 'workstyle',
  'Work Alone': 'workstyle',
  'Work Under Pressure': 'workstyle',
  'Work-Life Balance': 'workstyle',
  Competition: 'rewards',
  'Financial Gain': 'rewards',
  'High Earnings': 'rewards',
  'Intellectual Status': 'rewards',
  Recognition: 'rewards',
  Status: 'rewards',
  'Personal Safety': 'stability',
  Security: 'stability',
  Stability: 'stability',
  'Structure and Predictability': 'stability',
} as const satisfies Record<string, string>;

export type Value = keyof typeof VALUE_TO_CATEGORY;

export const VALUES_DICTIONARY: Record<Value, ValueDefinition> = sharedValues.reduce(
  (acc, val) => {
    acc[val.label as Value] = {
      description: val.definition,
      example: val.example,
      signals: val.signals,
    };
    return acc;
  },
  {} as Record<Value, ValueDefinition>,
);

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
