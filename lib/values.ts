/**
 * David Super's Work Values
 * Source: The Life Purpose Institute - Fern Gorin
 */

export const VALUES_LIST = [
  'Advancement',
  'Aesthetic',
  'Affiliation',
  'Artistic Creativity',
  'Challenge',
  'Change and Variety',
  'Community',
  'Competition',
  'Competence',
  'Creative Expression',
  'Creativity',
  'Decision Making',
  'Excitement',
  'Experience',
  'Fast Pace',
  'Financial Gain',
  'Friendship',
  'Help Others',
  'Help Society',
  'High Earnings',
  'Influence People',
  'Intellectual Status',
  'Job Tranquility',
  'Knowledge',
  'Location',
  'Moral Fulfillment',
  'Physical Challenge',
  'Precision Work',
  'Public Contact',
  'Recognition',
  'Research and Development',
  'Security',
  'Stability',
  'Status',
  'Supervision',
  'Time Freedom',
  'Work Alone',
  'Work Under Pressure',
  'Work with Others',
] as const

export type Value = (typeof VALUES_LIST)[number]
