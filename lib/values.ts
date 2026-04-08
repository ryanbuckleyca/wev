/**
 * Work value definitions used in profile selection and downstream parsing.
 * Value names and descriptions are sourced from the Knowdell Career Values Card Sort
 * (Richard Knowdell, Career Research & Testing).
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
export const VALUE_TO_CATEGORY: Record<string, string> = {
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
};

export const VALUES_DICTIONARY = {
  Advancement: {
    description:
      'Be able to get ahead rapidly, gaining opportunities for growth and seniority from work well-done.',
    example: 'Example: opportunities to move from specialist to manager over time.',
  },
  Adventure: {
    description: 'Have job duties which involve frequent risk-taking.',
    example: 'Example: roles that regularly involve bold decisions or physical risk.',
  },
  Aesthetic: {
    description: 'Be involved in studying or appreciating the beauty of things or ideas.',
    example: 'Example: creating polished visual work and improving how things look and feel.',
  },
  Affiliation: {
    description: 'Be recognized as a member of a particular organization.',
    example: 'Example: being part of a close, collaborative team culture.',
  },
  'Artistic Creativity': {
    description: 'Engage in creative work in any of several art forms.',
    example: 'Example: creating unique illustrations, writing, music, or multimedia work.',
  },
  Challenge: {
    description:
      'Engage continually with complex questions and demanding tasks, trouble-shooting and problem-solving as a core part of my job.',
    example: 'Example: solving complex problems with no obvious solution path.',
  },
  'Change and Variety': {
    description: 'Have work responsibilities frequently changed in content or setting.',
    example: 'Example: shifting between projects and learning new tools often.',
  },
  Community: {
    description:
      'Live in a town or city where I can meet my neighbors and become active in local politics or service projects.',
    example: 'Example: work that builds stronger neighborhoods or community programs.',
  },
  Competition: {
    description: 'Engage in activities which pit my abilities against others.',
    example: 'Example: sales targets, rankings, or performance leaderboards.',
  },
  Competence: {
    description:
      'Demonstrate a high degree of proficiency in job skills and knowledge; show above average effectiveness.',
    example: 'Example: being known as reliable and technically strong in core tasks.',
  },
  'Creative Expression': {
    description:
      'Be able to express in writing and in person my ideas concerning my job and how I might improve it; have opportunities for experimentation and innovation.',
    example: 'Example: shaping content, messaging, or design in your own style.',
  },
  Creativity: {
    description:
      'Create new ideas, programs, organized structures or anything else not following a format developed by others.',
    example: 'Example: inventing new approaches that improve outcomes.',
  },
  'Decision Making': {
    description: 'Have the power to decide courses of action, policies, etc — a judgement job.',
    example: 'Example: owning project direction, priorities, or resource tradeoffs.',
  },
  Diversity: {
    description:
      'Work in a setting that includes individuals of diverse religious, racial or social backgrounds.',
    example: 'Example: a team that actively values and reflects diverse perspectives.',
  },
  Environment: {
    description: 'Work on tasks that have a positive effect on the natural environment.',
    example: 'Example: projects focused on sustainability or reducing environmental impact.',
  },
  Excitement: {
    description:
      'Experience a high degree of stimulation or frequent novelty and drama on the job.',
    example: 'Example: high-engagement work with visible momentum and action.',
  },
  Family: {
    description:
      'Insure that the type of work I do and the hours I work fit with my family responsibilities.',
    example: 'Example: flexible scheduling that accommodates school pickups or family care.',
  },
  'Fast Pace': {
    description:
      'Work in circumstances where there is a high pace of activity and work is done rapidly.',
    example: 'Example: handling frequent deliverables in a high-tempo environment.',
  },
  'Financial Gain': {
    description:
      'Have a strong likelihood of accumulating large amounts of money or other material gain through ownership, profit-sharing, commissions, merit increases, etc.',
    example: 'Example: bonus structures, commissions, equity, or profit sharing.',
  },
  Friendship: {
    description: 'Develop close personal relationships with people as a result of work activity.',
    example: 'Example: enjoying genuine day-to-day friendships on the team.',
  },
  'Fun and Humor': {
    description: 'Work in a setting where it is possible (and appropriate) to joke and have fun.',
    example: 'Example: a team culture that balances hard work with levity and laughter.',
  },
  'Group & Team': {
    description: 'Work with a group to obtain team (rather than individual) results.',
    example: 'Example: collaborative sprints where success is shared across the team.',
  },
  'Help Others': {
    description: 'Be involved in helping people directly, either individually or in small groups.',
    example: 'Example: coaching, mentoring, advising, or solving client problems.',
  },
  'Help Society': {
    description: 'Do something to contribute to the betterment of the world.',
    example: 'Example: work that advances health, equity, education, or sustainability.',
  },
  'High Earnings': {
    description: 'Be able to purchase essentials and the luxuries of life that I wish.',
    example: 'Example: choosing roles known for strong compensation ceilings.',
  },
  'Honesty and Integrity': {
    description: 'Work in a setting where honesty and integrity are assets.',
    example: 'Example: an organization that rewards transparency and ethical behavior.',
  },
  Independence: {
    description:
      'Be able to determine the nature of my work without significant direction of others. Not have to follow instructions or to conform to regulations.',
    example: 'Example: setting your own priorities and working without close supervision.',
  },
  'Influence People': {
    description: 'Be in a position to change attitudes or opinions of others.',
    example: 'Example: guiding stakeholders to align on a proposed direction.',
  },
  'Intellectual Status': {
    description:
      'Be regarded as very well-informed and strong theorist, as one acknowledged expert in a given field.',
    example: 'Example: recognition as a thought partner in complex domains.',
  },
  'Job Tranquility': {
    description: 'Avoid pressure and the rat race in my job role and work setting.',
    example: 'Example: steady workloads with limited urgency and crisis response.',
  },
  Knowledge: {
    description: 'Engage myself in pursuit of knowledge, truth and understanding.',
    example: 'Example: roles that reward study, analysis, and deep domain learning.',
  },
  Location: {
    description:
      'Find a place to live (town or geographic area) conducive to my lifestyle, a desirable home base for my leisure, learning and work life.',
    example: 'Example: staying in a specific city, region, or remote setup.',
  },
  'Moral Fulfillment': {
    description: 'Feel that my work is contributing to ideals I feel are very important.',
    example: 'Example: choosing projects that match your values and integrity standards.',
  },
  'Personal Safety': {
    description: 'Have a high probability of being safe and healthy at work.',
    example: 'Example: roles with strong safety protocols and low physical risk.',
  },
  'Physical Challenge': {
    description: 'Have a job that requires bodily strength, speed, dexterity or agility.',
    example: 'Example: active work with meaningful physical demands.',
  },
  'Power and Authority': {
    description: 'Control the work activities or destinies of others.',
    example: 'Example: leading a team or division with real decision-making authority.',
  },
  Practicality: {
    description: 'Be involved in work that yields a practical or useful result.',
    example: 'Example: building tangible products or solving concrete real-world problems.',
  },
  'Precision Work': {
    description:
      'Deal with tasks that have exact specifications, that require careful, accurate attention to detail.',
    example: 'Example: tasks where quality depends on careful, exact execution.',
  },
  'Public Contact': {
    description: 'Have a lot of day-to-day contact with people.',
    example: 'Example: front-facing roles with regular external communication.',
  },
  Recognition: {
    description: 'Get positive feedback and public credit for work well done.',
    example: 'Example: public praise, awards, or clear attribution for contributions.',
  },
  'Research and Development': {
    description:
      'Work in research and development, generating information and new ideas in the academic, scientific, or business communities.',
    example: 'Example: experimentation and prototyping to develop future solutions.',
  },
  Security: {
    description: 'Be assured of keeping my job and a reasonable financial reward.',
    example: 'Example: stable organizations with low perceived layoff risk.',
  },
  Spirituality: {
    description: 'Work in a setting that is supportive of my spiritual beliefs.',
    example: 'Example: an organization whose culture respects and accommodates spiritual practice.',
  },
  Stability: {
    description:
      'Have a work routine and job duties that are largely predictable and not likely to change over a long period of time.',
    example: 'Example: predictable schedules and clearly defined processes.',
  },
  Status: {
    description:
      'Impress or gain the respect of friends, family and community by the nature and/or level of responsibility of my work.',
    example: 'Example: title, role visibility, and perceived importance in an organization.',
  },
  'Steep Learning Curve': {
    description: 'Be presented with new, unique or difficult tasks to be quickly mastered.',
    example: 'Example: onboarding into a complex domain and rapidly gaining expertise.',
  },
  'Structure and Predictability': {
    description: 'Do work with a high level of structure and predictability.',
    example: 'Example: well-defined processes and consistent expectations day to day.',
  },
  Supervision: {
    description: 'Have a job in which I am directly responsible for work done by others.',
    example: 'Example: managing a team and being accountable for team outcomes.',
  },
  'Time Freedom': {
    description:
      'Have responsibilities at which I can work according to my time schedule; no specific working hours required.',
    example: 'Example: setting your own hours or adjusting work around life demands.',
  },
  Tradition: {
    description:
      'Be involved in work that is consistent with the social traditions in which I was brought up with.',
    example: 'Example: roles that honor established customs or community heritage.',
  },
  'Work Alone': {
    description: 'Do projects by myself, without any amount of contact or input from others.',
    example: 'Example: long stretches of autonomous work and individual ownership.',
  },
  'Work Under Pressure': {
    description:
      'Work in time-pressured circumstances, where there is little or no margin for error, or with demanding personal relationships.',
    example: 'Example: staying effective during peak load and time-critical decisions.',
  },
  'Work with Others': {
    description: 'Have close working relations with a group and work as a team to common goals.',
    example: 'Example: planning and executing work through shared responsibility.',
  },
  'Work-Life Balance': {
    description: 'A job that allows me adequate time for my family, hobbies and social activities.',
    example: 'Example: a role with reasonable hours and respect for personal time.',
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
