import { VALUES_DICTIONARY, VALUES_LIST } from '@/lib/values';

export const MAX_TEXT_CHARS = 12_000;
export const MAX_VALUES = 5;
export const PROMPT_VERSION = 1;

function truncateAtWord(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const sliced = text.slice(0, maxLen);
  const lastSpace = Math.max(sliced.lastIndexOf(' '), sliced.lastIndexOf('\n'));
  return lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced;
}

export function buildPrompt(cvText: string): string {
  const valuesTaxonomy = VALUES_LIST.map(
    (label) => `- ${label}: ${VALUES_DICTIONARY[label].description}`,
  ).join('\n');

  return `You are analyzing a candidate's CV. Perform two tasks:

TASK A — SKILL PHRASES
Extract 12 to 18 distinct professional skill phrases from the CV.
For each skill, assign a "prominence" score from 1 to 10 reflecting how central that skill is to the candidate's career based on:
- Duration: years of sustained use outweighs a single mention
- Depth: senior/lead-level work outweighs incidental use of a tool
- Recency: recent roles matter more than old ones
- Evidence: concrete achievements (metrics, outcomes) outweigh bare mentions

Rules:
- Each phrase should be a specific, contextual description of one capability (e.g. "Frontend web application development", not just "programming").
- Consolidate closely related technologies into one phrase when they were used together (e.g. "Data analysis and visualization using Python and SQL" rather than separate phrases for each).
- Do NOT extract a minor tool, platform, or framework as its own standalone skill phrase if it was only used incidentally within a larger role. Instead, fold it into the broader capability phrase. Only give a specific software tool its own phrase if the candidate's primary job was heavily centered on that tool.
- Cover ALL professional domains evident in the CV — do not let one domain dominate the list.
- Extract only skills the candidate has personally demonstrated or performed. Do not infer from job titles alone or from collaboration with specialists in other fields.
- Include both technical skills (tools, technologies, methodologies) and professional skills (leadership, training, consulting).
- If the CV text appears damaged or poorly formatted (e.g. OCR artifacts), do your best to interpret it.

TASK B — WORK VALUES
Infer the candidate's 3 to ${MAX_VALUES} most important work values from the CV.
Allowed values (use exact spelling, case-sensitive):
${valuesTaxonomy}
- Only include a value when the CV gives concrete evidence — focus areas, choices, achievements.
- Order from MOST to LEAST important based on evidence strength.

CV:
"""
${truncateAtWord(cvText, MAX_TEXT_CHARS)}
"""

Return JSON:
{
  "skills": [{"phrase": "...", "prominence": 8}, ...],
  "values": ["Value1", ...]
}`;
}
