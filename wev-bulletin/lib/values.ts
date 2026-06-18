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
    signals: ['career path', 'promotion', 'growth opportunity', 'leadership pipeline', 'advance your career', 'progression'],
  },
  Adventure: {
    description: 'Have job duties which involve frequent risk-taking.',
    example: 'Example: roles that regularly involve bold decisions or physical risk.',
    signals: ['uncharted territory', 'bold', 'pioneering', 'venture into', 'high-stakes', 'risk-taking', 'daring'],
  },
  Aesthetic: {
    description: 'Be involved in studying or appreciating the beauty of things or ideas.',
    example: 'Example: creating polished visual work and improving how things look and feel.',
    signals: ['beautiful', 'polished', 'visual excellence', 'brand aesthetic', 'look and feel', 'tasteful', 'curated', 'refined design'],
  },
  Affiliation: {
    description: 'Be recognized as a member of a particular organization.',
    example: 'Example: being part of a close, collaborative team culture.',
    signals: ['part of something bigger', 'proud to work at', 'strong identity', 'our people', 'belong', 'valued member', 'our culture'],
  },
  'Artistic Creativity': {
    description: 'Engage in creative work in any of several art forms.',
    example: 'Example: creating unique illustrations, writing, music, or multimedia work.',
    signals: ['original artwork', 'creative direction', 'artistic vision', 'illustration', 'visual storytelling', 'compose', 'design portfolio'],
  },
  Challenge: {
    description:
      'Engage continually with complex questions and demanding tasks, trouble-shooting and problem-solving as a core part of my job.',
    example: 'Example: solving complex problems with no obvious solution path.',
    signals: ['challenging', 'complex', 'demanding', 'difficult', 'hard problems', 'push boundaries', 'stretch goals'],
  },
  'Change and Variety': {
    description: 'Have work responsibilities frequently changed in content or setting.',
    example: 'Example: shifting between projects and learning new tools often.',
    signals: ['no two days alike', 'diverse projects', 'wear many hats', 'varied responsibilities', 'cross-functional', 'dynamic role'],
  },
  Community: {
    description:
      'Live in a town or city where I can meet my neighbors and become active in local politics or service projects.',
    example: 'Example: work that builds stronger neighborhoods or community programs.',
    signals: ['community impact', 'neighbourhood', 'civic engagement', 'local partnerships', 'community-driven', 'grassroots'],
  },
  Competition: {
    description: 'Engage in activities which pit my abilities against others.',
    example: 'Example: sales targets, rankings, or performance leaderboards.',
    signals: ['leaderboard', 'top performer', 'competitive', 'rank', 'outperform', 'sales targets', 'win'],
  },
  Competence: {
    description:
      'Demonstrate a high degree of proficiency in job skills and knowledge; show above average effectiveness.',
    example: 'Example: being known as reliable and technically strong in core tasks.',
    signals: ['leverage your expertise', 'demonstrate proficiency', 'high standards', 'mastery', 'best-in-class', 'hone your craft', 'deep skill'],
  },
  'Creative Expression': {
    description:
      'Be able to express in writing and in person my ideas concerning my job and how I might improve it; have opportunities for experimentation and innovation.',
    example: 'Example: shaping content, messaging, or design in your own style.',
    signals: ['your voice', 'creative freedom', 'express yourself', 'leave your mark', 'make it your own', 'personal style', 'autonomy to experiment'],
  },
  Creativity: {
    description:
      'Create new ideas, programs, organized structures or anything else not following a format developed by others.',
    example: 'Example: inventing new approaches that improve outcomes.',
    signals: ['innovative', 'from scratch', 'greenfield', 'invent', 'ideation', 'brainstorm', 'novel solutions', 'think outside the box', 'reimagine'],
  },
  'Decision Making': {
    description: 'Have the power to decide courses of action, policies, etc — a judgement job.',
    example: 'Example: owning project direction, priorities, or resource tradeoffs.',
    signals: ['own the decision', 'make the call', 'determine direction', 'judgement', 'weigh trade-offs', 'shape the roadmap', 'your call'],
  },
  Diversity: {
    description:
      'Work in a setting that includes individuals of diverse religious, racial or social backgrounds.',
    example: 'Example: a team that actively values and reflects diverse perspectives.',
    signals: ['diverse team', 'inclusion', 'equity', 'belonging', 'multicultural', 'underrepresented', 'DEI', 'equal opportunity'],
  },
  Environment: {
    description: 'Work on tasks that have a positive effect on the natural environment.',
    example: 'Example: projects focused on sustainability or reducing environmental impact.',
    signals: ['sustainability', 'green', 'carbon neutral', 'climate', 'conservation', 'environmental impact', 'eco-friendly', 'clean energy'],
  },
  Excitement: {
    description:
      'Experience a high degree of stimulation or frequent novelty and drama on the job.',
    example: 'Example: high-engagement work with visible momentum and action.',
    signals: ['fast-moving', 'high-energy', 'thrilling', 'buzzing', 'electrifying', 'momentum', 'adrenaline'],
  },
  Family: {
    description:
      'Insure that the type of work I do and the hours I work fit with my family responsibilities.',
    example: 'Example: flexible scheduling that accommodates school pickups or family care.',
    signals: ['family-friendly', 'parental leave', 'childcare', 'school hours', 'family first', 'caregiver support'],
  },
  'Fast Pace': {
    description:
      'Work in circumstances where there is a high pace of activity and work is done rapidly.',
    example: 'Example: handling frequent deliverables in a high-tempo environment.',
    signals: ['fast-paced', 'tight deadlines', 'rapid iteration', 'ship quickly', 'move fast', 'high velocity', 'sprint-based'],
  },
  'Financial Gain': {
    description:
      'Have a strong likelihood of accumulating large amounts of money or other material gain through ownership, profit-sharing, commissions, merit increases, etc.',
    example: 'Example: bonus structures, commissions, equity, or profit sharing.',
    signals: ['equity', 'stock options', 'profit sharing', 'commission', 'bonus structure', 'OTE', 'uncapped earnings', 'vesting', 'ownership stake'],
  },
  Friendship: {
    description: 'Develop close personal relationships with people as a result of work activity.',
    example: 'Example: enjoying genuine day-to-day friendships on the team.',
    signals: ['close-knit', 'social events', 'team outings', 'we hang out', 'genuine relationships', 'camaraderie', 'like a family'],
  },
  'Fun and Humor': {
    description: 'Work in a setting where it is possible (and appropriate) to joke and have fun.',
    example: 'Example: a team culture that balances hard work with levity and laughter.',
    signals: ['fun culture', 'playful', "we don't take ourselves too seriously", 'game nights', 'lighthearted', 'quirky', 'humor'],
  },
  'Group & Team': {
    description: 'Work with a group to obtain team (rather than individual) results.',
    example: 'Example: collaborative sprints where success is shared across the team.',
    signals: ['shared accountability', 'team-based outcomes', 'collective ownership', 'squad', 'we win together', 'joint responsibility', 'team deliverables'],
  },
  'Help Others': {
    description: 'Be involved in helping people directly, either individually or in small groups.',
    example: 'Example: coaching, mentoring, advising, or solving client problems.',
    signals: ['make a difference', 'support clients', 'one-on-one', 'coaching', 'mentoring', 'empower individuals', 'advocate for', 'direct service'],
  },
  'Help Society': {
    description: 'Do something to contribute to the betterment of the world.',
    example: 'Example: work that advances health, equity, education, or sustainability.',
    signals: ['social impact', 'mission-driven', 'public good', 'non-profit', 'change the world', 'social enterprise', 'humanitarian'],
  },
  'High Earnings': {
    description: 'Be able to purchase essentials and the luxuries of life that I wish.',
    example: 'Example: choosing roles known for strong compensation ceilings.',
    signals: ['competitive salary', 'top-of-market pay', 'above-market compensation', 'lucrative', 'generous total compensation', 'premium pay'],
  },
  'Honesty and Integrity': {
    description: 'Work in a setting where honesty and integrity are assets.',
    example: 'Example: an organization that rewards transparency and ethical behavior.',
    signals: ['transparency', 'ethical', 'integrity', 'trust', 'do the right thing', 'values-driven', 'accountable', 'honest feedback'],
  },
  Independence: {
    description:
      'Be able to determine the nature of my work without significant direction of others. Not have to follow instructions or to conform to regulations.',
    example: 'Example: setting your own priorities and working without close supervision.',
    signals: ['self-directed', 'autonomous', 'minimal oversight', 'own your workflow', 'no micromanagement', 'self-starter'],
  },
  'Influence People': {
    description: 'Be in a position to change attitudes or opinions of others.',
    example: 'Example: guiding stakeholders to align on a proposed direction.',
    signals: ['stakeholder management', 'persuade', 'shape opinions', 'change minds', 'advise executives', 'drive alignment', 'evangelize', 'advocate'],
  },
  'Intellectual Status': {
    description:
      'Be regarded as very well-informed and strong theorist, as one acknowledged expert in a given field.',
    example: 'Example: recognition as a thought partner in complex domains.',
    signals: ['subject matter expert', 'thought leader', 'recognized authority', 'go-to person', 'deep expertise', 'respected voice'],
  },
  'Job Tranquility': {
    description: 'Avoid pressure and the rat race in my job role and work setting.',
    example: 'Example: steady workloads with limited urgency and crisis response.',
    signals: ['low-pressure', 'calm environment', 'sustainable pace', 'no crunch', 'predictable workload', 'stress-free'],
  },
  Knowledge: {
    description: 'Engage myself in pursuit of knowledge, truth and understanding.',
    example: 'Example: roles that reward study, analysis, and deep domain learning.',
    signals: ['learning culture', 'professional development', 'conferences', 'training budget', 'continuous learning', 'upskill', 'L&D'],
  },
  Location: {
    description:
      'Find a place to live (town or geographic area) conducive to my lifestyle, a desirable home base for my leisure, learning and work life.',
    example: 'Example: staying in a specific city, region, or remote setup.',
    signals: ['remote-friendly', 'on-site in', 'relocation package', 'field work', 'work from anywhere', 'hybrid', 'specific city/region'],
  },
  'Moral Fulfillment': {
    description: 'Feel that my work is contributing to ideals I feel are very important.',
    example: 'Example: choosing projects that match your values and integrity standards.',
    signals: ['purpose-driven', 'aligned with your values', 'ethical mission', 'meaningful work', 'work that matters', 'conscience', 'deeply fulfilling'],
  },
  'Personal Safety': {
    description: 'Have a high probability of being safe and healthy at work.',
    example: 'Example: roles with strong safety protocols and low physical risk.',
    signals: ['safety protocols', 'PPE', 'health and safety', 'zero-harm', 'OSHA', 'safe working conditions', 'wellness program'],
  },
  'Physical Challenge': {
    description: 'Have a job that requires bodily strength, speed, dexterity or agility.',
    example: 'Example: active work with meaningful physical demands.',
    signals: ['physically active', 'hands-on', 'fieldwork', 'lifting required', 'outdoor work', 'labour-intensive', 'on your feet'],
  },
  'Power and Authority': {
    description: 'Control the work activities or destinies of others.',
    example: 'Example: leading a team or division with real decision-making authority.',
    signals: ['executive authority', 'budget ownership', 'P&L responsibility', 'org-level decisions', 'strategic control', 'run the division', 'command'],
  },
  Practicality: {
    description: 'Be involved in work that yields a practical or useful result.',
    example: 'Example: building tangible products or solving concrete real-world problems.',
    signals: ['real-world impact', 'tangible outcomes', 'practical applications', 'ship product', 'hands-on results', 'solve real problems'],
  },
  'Precision Work': {
    description:
      'Deal with tasks that have exact specifications, that require careful, accurate attention to detail.',
    example: 'Example: tasks where quality depends on careful, exact execution.',
    signals: ['attention to detail', 'zero-defect', 'meticulous', 'quality assurance', 'exacting standards', 'rigorous', 'thorough'],
  },
  'Public Contact': {
    description: 'Have a lot of day-to-day contact with people.',
    example: 'Example: front-facing roles with regular external communication.',
    signals: ['client-facing', 'customer interaction', 'public-facing', 'front of house', 'community outreach', 'external stakeholders'],
  },
  Recognition: {
    description: 'Get positive feedback and public credit for work well done.',
    example: 'Example: public praise, awards, or clear attribution for contributions.',
    signals: ['employee of the month', 'spotlight', 'shout-outs', 'public praise', 'awards', 'celebrate wins', 'credit where due'],
  },
  'Research and Development': {
    description:
      'Work in research and development, generating information and new ideas in the academic, scientific, or business communities.',
    example: 'Example: experimentation and prototyping to develop future solutions.',
    signals: ['R&D', 'prototyping', 'proof of concept', 'experimentation', 'research', 'lab', 'white-paper', 'pilot program'],
  },
  Security: {
    description: 'Be assured of keeping my job and a reasonable financial reward.',
    example: 'Example: stable organizations with low perceived layoff risk.',
    signals: ['permanent position', 'job security', 'stable employer', 'long-term role', 'pension', 'benefits package', 'recession-proof', 'steady demand'],
  },
  Spirituality: {
    description: 'Work in a setting that is supportive of my spiritual beliefs.',
    example: 'Example: an organization whose culture respects and accommodates spiritual practice.',
    signals: ['faith-based', 'ministry', 'spiritual mission', 'chaplaincy', 'religious organization', 'prayer', 'congregation'],
  },
  Stability: {
    description:
      'Have a work routine and job duties that are largely predictable and not likely to change over a long period of time.',
    example: 'Example: predictable schedules and clearly defined processes.',
    signals: ['predictable schedule', 'consistent hours', 'established company', 'steady workload', 'low turnover', 'long-standing', 'minimal change'],
  },
  Status: {
    description:
      'Impress or gain the respect of friends, family and community by the nature and/or level of responsibility of my work.',
    example: 'Example: title, role visibility, and perceived importance in an organization.',
    signals: ['prestigious', 'renowned', 'elite', 'top-tier firm', 'Fortune 500', 'brand-name employer', 'high-profile', 'C-suite'],
  },
  'Steep Learning Curve': {
    description: 'Be presented with new, unique or difficult tasks to be quickly mastered.',
    example: 'Example: onboarding into a complex domain and rapidly gaining expertise.',
    signals: ['ramp up quickly', 'learn fast', 'sink or swim', 'steep growth', 'rapid onboarding', 'hit the ground running'],
  },
  'Structure and Predictability': {
    description: 'Do work with a high level of structure and predictability.',
    example: 'Example: well-defined processes and consistent expectations day to day.',
    signals: ['well-defined processes', 'clear expectations', 'documented workflows', 'SOPs', 'standardized', 'playbook'],
  },
  Supervision: {
    description: 'Have a job in which I am directly responsible for work done by others.',
    example: 'Example: managing a team and being accountable for team outcomes.',
    signals: ['manage a team', 'direct reports', 'people management', 'team lead', 'oversee staff', 'supervisory', 'coaching reports'],
  },
  'Time Freedom': {
    description:
      'Have responsibilities at which I can work according to my time schedule; no specific working hours required.',
    example: 'Example: setting your own hours or adjusting work around life demands.',
    signals: ['flexible hours', 'async-first', 'results-oriented', 'no fixed schedule', 'flextime', 'work when you want', 'core hours optional'],
  },
  Tradition: {
    description:
      'Be involved in work that is consistent with the social traditions in which I was brought up with.',
    example: 'Example: roles that honor established customs or community heritage.',
    signals: ['heritage', 'long-standing', 'legacy', 'time-honoured', 'family business', 'established since', 'tradition of excellence'],
  },
  'Work Alone': {
    description: 'Do projects by myself, without any amount of contact or input from others.',
    example: 'Example: long stretches of autonomous work and individual ownership.',
    signals: ['solo contributor', 'work independently', 'minimal interaction', 'heads-down', 'individual contributor', 'self-contained tasks', 'focused solitary work'],
  },
  'Work Under Pressure': {
    description:
      'Work in time-pressured circumstances, where there is little or no margin for error, or with demanding personal relationships.',
    example: 'Example: staying effective during peak load and time-critical decisions.',
    signals: ['high-pressure', 'urgent', 'deadline-driven', 'crisis management', 'time-critical', 'mission-critical', 'on-call'],
  },
  'Work with Others': {
    description: 'Have close working relations with a group and work as a team to common goals.',
    example: 'Example: planning and executing work through shared responsibility.',
    signals: ['collaborate daily', 'pair programming', 'team-oriented', 'work closely with', 'close working relationships', 'regular interaction', 'partner with'],
  },
  'Work-Life Balance': {
    description: 'A job that allows me adequate time for my family, hobbies and social activities.',
    example: 'Example: a role with reasonable hours and respect for personal time.',
    signals: ['work-life balance', 'reasonable hours', 'no overtime', 'wellness', 'recharge', 'personal time', 'mental health days', 'boundaries'],
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
