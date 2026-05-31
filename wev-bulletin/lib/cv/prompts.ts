import { VALUES_DICTIONARY, VALUES_LIST } from '@/lib/values';
import type { CvLocale } from './types';

export const MAX_TEXT_CHARS = 12_000;
export const MAX_VALUES = 5;
export const PROMPT_VERSION = 2;

function truncateAtWord(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const sliced = text.slice(0, maxLen);
  const lastSpace = Math.max(sliced.lastIndexOf(' '), sliced.lastIndexOf('\n'));
  return lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced;
}

export function buildPrompt(cvText: string, locale: CvLocale = 'en'): string {
  const valuesTaxonomy = VALUES_LIST.map(
    (label) => `- ${label}: ${VALUES_DICTIONARY[label].description}`,
  ).join('\n');

  if (locale === 'fr') {
    return `Tu analyses le CV d'une candidate ou d'un candidat. Effectue deux taches:

TACHE A - EXPRESSIONS DE COMPETENCES
Extrait 12 a 18 expressions distinctes de competences professionnelles du CV.
Pour chaque competence, attribue un score de "prominence" de 1 a 10 indiquant a quel point cette competence est centrale dans le parcours de la personne selon:
- Duree: plusieurs annees d'usage comptent plus qu'une seule mention
- Profondeur: un travail senior/lead compte plus qu'un usage accessoire d'un outil
- Recence: les roles recents comptent plus que les anciens
- Preuves: des accomplissements concrets (mesures, resultats) comptent plus qu'une simple mention

Regles:
- Chaque expression doit decrire une capacite specifique et contextuelle (par ex. "Developpement d'applications web frontend", pas seulement "programmation").
- Regroupe les technologies tres proches dans une seule expression lorsqu'elles ont ete utilisees ensemble (par ex. "Analyse et visualisation de donnees avec Python et SQL" plutot que des expressions separees).
- N'extrais PAS un outil, une plateforme ou un framework mineur comme competence autonome s'il n'a ete utilise qu'accessoirement dans un role plus large. Integre-le plutot dans la capacite plus generale. Donne a un logiciel specifique sa propre expression uniquement si le travail principal de la personne etait fortement centre dessus.
- Couvre TOUS les domaines professionnels visibles dans le CV; ne laisse pas un seul domaine dominer la liste.
- Extrait uniquement des competences que la personne a reellement demontrees ou pratiquees. N'infere pas a partir du seul titre du poste ni d'une collaboration avec d'autres specialistes.
- Inclue a la fois des competences techniques (outils, technologies, methodes) et professionnelles (leadership, formation, conseil).
- Si le texte du CV semble degrade ou mal formate (par ex. artefacts d'OCR), fais de ton mieux pour l'interpreter.

TACHE B - VALEURS AU TRAVAIL
Deduis les 3 a ${MAX_VALUES} valeurs au travail les plus importantes a partir du CV.
Valeurs autorisees: utilise exactement les libelles canoniques anglais ci-dessous, en respectant la casse, meme si le CV est en francais:
${valuesTaxonomy}
- N'inclus une valeur que si le CV fournit des preuves concretes: domaines d'interet, choix, accomplissements.
- Trie de la PLUS importante a la MOINS importante selon la force des preuves.

CV:
"""
${truncateAtWord(cvText, MAX_TEXT_CHARS)}
"""

Retourne uniquement du JSON:
{
  "skills": [{"phrase": "...", "prominence": 8}, ...],
  "values": ["CanonicalEnglishValue1", ...]
}`;
  }

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
