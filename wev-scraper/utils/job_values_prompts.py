"""Prompt templates for tagging job postings with work values."""

from __future__ import annotations

from typing import Final


WORK_VALUES_TAXONOMY: Final[list[tuple[str, str]]] = [
    ("Advancement", "Growth into higher responsibility/authority."),
    ("Adventure", "Frequent risk-taking and bold decisions."),
    ("Aesthetic", "Beauty, design, and form in work output."),
    ("Affiliation", "Belonging and acceptance in a work group."),
    ("Artistic Creativity", "Original artistic work and style."),
    ("Challenge", "Difficult goals and hard problems."),
    ("Change and Variety", "Frequent task/context variety."),
    ("Community", "Connection to and impact on community."),
    ("Competition", "Performance against others and winning."),
    ("Competence", "Mastery and high-quality execution."),
    ("Creative Expression", "Expressing personal voice/ideas in work."),
    ("Creativity", "Generating novel, useful ideas."),
    ("Decision Making", "Authority to make consequential decisions."),
    ("Diversity", "Working with people of diverse backgrounds."),
    ("Environment", "Positive effect on the natural environment."),
    ("Excitement", "High stimulation and energetic work."),
    ("Family", "Work hours and type fit family responsibilities."),
    ("Fast Pace", "Rapid cadence and tight timelines."),
    ("Financial Gain", "Income upside from performance/growth."),
    ("Friendship", "Warm personal relationships at work."),
    ("Fun and Humor", "A workplace culture with levity and laughter."),
    ("Group & Team", "Collaborative work toward shared team results."),
    ("Help Others", "Directly helping individuals."),
    ("Help Society", "Broader social/public good impact."),
    ("High Earnings", "Top-end salary potential."),
    ("Honesty and Integrity", "Transparency and ethical behaviour are valued."),
    ("Independence", "Work without close supervision or strict rules."),
    ("Influence People", "Persuasion and shaping decisions/behavior."),
    ("Intellectual Status", "Respect for expertise and insight."),
    ("Job Tranquility", "Low stress and calm work conditions."),
    ("Knowledge", "Continuous learning and deep understanding."),
    ("Location", "Preferred geography or work setting."),
    ("Moral Fulfillment", "Alignment with ethics and integrity."),
    ("Personal Safety", "High probability of being safe and healthy at work."),
    ("Physical Challenge", "Meaningful physical demands."),
    ("Power and Authority", "Control over the work or destinies of others."),
    ("Practicality", "Work that yields a tangible, useful, real-world result."),
    ("Precision Work", "Accuracy and detail-oriented work."),
    ("Public Contact", "Frequent interaction with the public."),
    ("Recognition", "Visible credit and acknowledgment."),
    ("Research and Development", "Investigation, experiments, innovation."),
    ("Security", "Job stability and dependable income."),
    ("Spirituality", "Work setting supportive of spiritual beliefs."),
    ("Stability", "Predictable routines and structure."),
    ("Status", "Prestige and standing of role."),
    ("Steep Learning Curve", "New, difficult tasks to be rapidly mastered."),
    ("Structure and Predictability", "High structure and consistent expectations."),
    ("Supervision", "Leading and managing others."),
    ("Time Freedom", "Control over schedule and hours."),
    ("Tradition", "Work consistent with established customs or heritage."),
    ("Work Alone", "Independent, autonomous work."),
    ("Work Under Pressure", "Effectiveness in urgent/high-stakes situations."),
    ("Work with Others", "Close ongoing collaboration."),
    ("Work-Life Balance", "Adequate time for family, hobbies, and social life."),
]

WORK_VALUES_SET: Final[set[str]] = {label for label, _ in WORK_VALUES_TAXONOMY}


# System instruction to anchor any provider to pure JSON output.
VALUES_SYSTEM_MSG = (
    "You output only valid JSON. Do not include any text, explanation, or markdown "
    "before or after the JSON array."
)

VALUES_BATCH_PROMPT_TEMPLATE = """You are tagging each job posting with work values.

Use ONLY labels from the allowed list below.
Choose 3 to {max_values} labels per job.
Do not infer values from the company name alone; use the title, summary, and description.

ALLOWED VALUES (label: meaning):
{taxonomy}

JOBS (1-indexed):
{job_list}

OUTPUT FORMAT (JSON array only, same order as jobs):
[
  {{
    "index": 1,
    "values": ["Value A", "Value B"],
    "reasoning": "Short evidence-based rationale citing specific text."
  }}
]

Rules:
- Values must exactly match allowed labels (case-sensitive).
- No duplicate labels per job. Maximum {max_values} values per job — exceed this limit and your response is invalid.
- Aim for 4–5 values per job; only drop below 4 if genuine evidence is truly absent.
- Only include a label when there is clear, direct evidence in the description or title.
- Do NOT use "Experience" as a generic fallback — only include it when the role is explicitly framed as a broad learning or cross-functional exposure opportunity.
- Do NOT use "Competence" as a default — only include it when mastery or high-craft execution is explicitly emphasised.
- Do NOT use "Challenge" unless the posting contains at least one of these exact words verbatim: 'challenging', 'challenge', 'complex', 'demanding', 'difficult'. If none of those words appear, do not assign Challenge under any circumstances, even if the work sounds hard.
- Do NOT use "Aesthetic" unless the role explicitly involves beauty, design, visual form, or artistic output (e.g. graphic design, UX, photography).
- Do NOT use "Location" unless geography or work setting is a prominent, stated feature of the role (e.g. field work, required relocation, unique site).
- Do NOT use "Advancement" unless the posting explicitly mentions career growth, promotion paths, or progression opportunities.
- Do NOT use "Community" as a default for any role that involves working with people. Only include it when the posting explicitly frames community connection, belonging, or local impact as a core feature of the work.
- Do NOT use "Moral Fulfillment" unless the posting explicitly uses language about ethics, integrity, or values alignment as a draw.
- "Supervision" = managing or directing direct reports (team lead, manager, coordinator of staff). "Influence People" = persuading, coaching, or shaping behaviour of stakeholders, clients, or communities beyond direct reports. Use both where evidence supports it.
- Do NOT use "Diversity" unless the posting explicitly mentions diverse backgrounds, inclusion, or equity as a feature of the team or organisation.
- Do NOT use "Environment" unless the role explicitly involves sustainability, conservation, or reducing environmental impact.
- Do NOT use "Family" unless the posting explicitly mentions flexible hours, family-friendly scheduling, or work-life accommodation.
- Do NOT use "Fun and Humor" unless the posting explicitly describes a playful, light-hearted, or humorous team culture.
- Do NOT use "Honesty and Integrity" unless the posting explicitly names ethics, transparency, or integrity as organisational values.
- Do NOT use "Independence" unless the posting explicitly describes autonomous work, self-direction, or minimal supervision.
- Do NOT use "Personal Safety" unless the role explicitly involves safety protocols, physical risk management, or health and safety as a feature.
- Do NOT use "Power and Authority" unless the role explicitly grants control over others' work, budgets, or strategic direction.
- Do NOT use "Spirituality" unless the posting explicitly references spiritual practice, faith-based mission, or religious community.
- Do NOT use "Steep Learning Curve" unless the posting explicitly frames rapid skill acquisition or mastery of new domains as a core feature.
- Do NOT use "Structure and Predictability" unless the posting explicitly describes well-defined processes, clear expectations, or stable routines.
- Do NOT use "Tradition" unless the posting explicitly references heritage, established customs, or long-standing organisational practices.
- Do NOT use "Work-Life Balance" unless the posting explicitly mentions balance, reasonable hours, or respect for personal time.
- Do NOT use "Adventure" unless the role explicitly involves physical risk, bold decisions, or unconventional environments.
- Do NOT use "Group & Team" as a default for any collaborative role — only use it when team-based outcomes and shared accountability are explicitly emphasised over individual contribution.
- Return ONLY the JSON array. No text before or after it.
- Every label in the "values" array MUST be in the ALLOWED VALUES list above. Labels not in that list (e.g. 'Strategic', 'Impact', 'Innovation') are INVALID and must not appear.
"""


def _format_taxonomy() -> str:
    return "\n".join(f"- {label}: {definition}" for label, definition in WORK_VALUES_TAXONOMY)


def get_values_batch_prompt(jobs: list[dict], max_values: int = 5) -> str:
    """Format the batch prompt for value tagging."""
    job_chunks: list[str] = []
    for idx, job in enumerate(jobs, 1):
        description = (job.get("description") or "")[:2500]
        summary = (job.get("summary") or "")[:400]
        job_chunks.append(
            (
                f"JOB {idx}:\n"
                f"Organization: {job.get('organization', 'Unknown')}\n"
                f"Title: {job.get('job_title', 'Unknown')}\n"
                f"Location: {job.get('location', 'Unknown')}\n"
                f"Employment Type: {job.get('employment_type', 'Unknown')}\n"
                f"Wage: {job.get('wage', 'Not specified')}\n"
                f"Summary: {summary}\n"
                f"Description:\n{description}"
            )
        )

    return VALUES_BATCH_PROMPT_TEMPLATE.format(
        max_values=max_values,
        taxonomy=_format_taxonomy(),
        job_list="\n\n".join(job_chunks),
    )

