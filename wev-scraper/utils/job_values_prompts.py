"""Prompt templates for tagging job postings with work values."""

from __future__ import annotations

from typing import Final

WORK_VALUES_TAXONOMY: Final[list[tuple[str, str, str]]] = [
    (
        "Advancement",
        "Growth into higher responsibility/authority.",
        "career path, promotion, growth opportunity, leadership pipeline, advance your career, progression",
    ),
    (
        "Adventure",
        "Frequent risk-taking and bold decisions.",
        "uncharted territory, bold, pioneering, venture into, high-stakes, risk-taking, daring",
    ),
    (
        "Aesthetic",
        "Beauty, design, and form in work output.",
        "beautiful, polished, visual excellence, brand aesthetic, look and feel, tasteful, curated, refined design",
    ),
    (
        "Affiliation",
        "Belonging and acceptance in a work group.",
        "part of something bigger, proud to work at, strong identity, our people, belong, valued member, our culture",
    ),
    (
        "Artistic Creativity",
        "Original artistic work and style.",
        "original artwork, creative direction, artistic vision, illustration, visual storytelling, compose, design portfolio",
    ),
    (
        "Challenge",
        "Difficult goals and hard problems.",
        "challenging, complex, demanding, difficult, hard problems, push boundaries, stretch goals",
    ),
    (
        "Change and Variety",
        "Frequent task/context variety.",
        "no two days alike, diverse projects, wear many hats, varied responsibilities, cross-functional, dynamic role",
    ),
    (
        "Community",
        "Connection to and impact on community.",
        "community impact, neighbourhood, civic engagement, local partnerships, community-driven, grassroots",
    ),
    (
        "Competition",
        "Performance against others and winning.",
        "leaderboard, top performer, competitive, rank, outperform, sales targets, win",
    ),
    (
        "Competence",
        "Mastery and high-quality execution.",
        "leverage your expertise, demonstrate proficiency, high standards, mastery, best-in-class, hone your craft, deep skill",
    ),
    (
        "Creative Expression",
        "Expressing personal voice/ideas in work.",
        "your voice, creative freedom, express yourself, leave your mark, make it your own, personal style, autonomy to experiment",
    ),
    (
        "Creativity",
        "Generating novel, useful ideas.",
        "innovative, from scratch, greenfield, invent, ideation, brainstorm, novel solutions, think outside the box, reimagine",
    ),
    (
        "Decision Making",
        "Authority to make consequential decisions.",
        "own the decision, make the call, determine direction, judgement, weigh trade-offs, shape the roadmap, your call",
    ),
    (
        "Diversity",
        "Working with people of diverse backgrounds.",
        "diverse team, inclusion, equity, belonging, multicultural, underrepresented, DEI, equal opportunity",
    ),
    (
        "Environment",
        "Positive effect on the natural environment.",
        "sustainability, green, carbon neutral, climate, conservation, environmental impact, eco-friendly, clean energy",
    ),
    (
        "Excitement",
        "High stimulation and energetic work.",
        "fast-moving, high-energy, thrilling, buzzing, electrifying, momentum, adrenaline",
    ),
    (
        "Family",
        "Work hours and type fit family responsibilities.",
        "family-friendly, parental leave, childcare, school hours, family first, caregiver support",
    ),
    (
        "Fast Pace",
        "Rapid cadence and tight timelines.",
        "fast-paced, tight deadlines, rapid iteration, ship quickly, move fast, high velocity, sprint-based",
    ),
    (
        "Financial Gain",
        "Income upside from performance/growth.",
        "equity, stock options, profit sharing, commission, bonus structure, OTE, uncapped earnings, vesting, ownership stake",
    ),
    (
        "Friendship",
        "Warm personal relationships at work.",
        "close-knit, social events, team outings, we hang out, genuine relationships, camaraderie, like a family",
    ),
    (
        "Fun and Humor",
        "A workplace culture with levity and laughter.",
        "fun culture, playful, we don't take ourselves too seriously, game nights, lighthearted, quirky, humor",
    ),
    (
        "Group & Team",
        "Collaborative work toward shared team results.",
        "shared accountability, team-based outcomes, collective ownership, squad, we win together, joint responsibility, team deliverables",
    ),
    (
        "Help Others",
        "Directly helping individuals.",
        "make a difference, support clients, one-on-one, coaching, mentoring, empower individuals, advocate for, direct service",
    ),
    (
        "Help Society",
        "Broader social/public good impact.",
        "social impact, mission-driven, public good, non-profit, change the world, social enterprise, humanitarian",
    ),
    (
        "High Earnings",
        "Top-end salary potential.",
        "competitive salary, top-of-market pay, above-market compensation, lucrative, generous total compensation, premium pay",
    ),
    (
        "Honesty and Integrity",
        "Transparency and ethical behaviour are valued.",
        "transparency, ethical, integrity, trust, do the right thing, values-driven, accountable, honest feedback",
    ),
    (
        "Independence",
        "Work without close supervision or strict rules.",
        "self-directed, autonomous, minimal oversight, own your workflow, no micromanagement, self-starter",
    ),
    (
        "Influence People",
        "Persuasion and shaping decisions/behavior.",
        "stakeholder management, persuade, shape opinions, change minds, advise executives, drive alignment, evangelize, advocate",
    ),
    (
        "Intellectual Status",
        "Respect for expertise and insight.",
        "subject matter expert, thought leader, recognized authority, go-to person, deep expertise, respected voice",
    ),
    (
        "Job Tranquility",
        "Low stress and calm work conditions.",
        "low-pressure, calm environment, sustainable pace, no crunch, predictable workload, stress-free",
    ),
    (
        "Knowledge",
        "Continuous learning and deep understanding.",
        "learning culture, professional development, conferences, training budget, continuous learning, upskill, L&D",
    ),
    (
        "Location",
        "Preferred geography or work setting.",
        "remote-friendly, on-site in, relocation package, field work, work from anywhere, hybrid, specific city/region",
    ),
    (
        "Moral Fulfillment",
        "Alignment with ethics and integrity.",
        "purpose-driven, aligned with your values, ethical mission, meaningful work, work that matters, conscience, deeply fulfilling",
    ),
    (
        "Personal Safety",
        "High probability of being safe and healthy at work.",
        "safety protocols, PPE, health and safety, zero-harm, OSHA, safe working conditions, wellness program",
    ),
    (
        "Physical Challenge",
        "Meaningful physical demands.",
        "physically active, hands-on, fieldwork, lifting required, outdoor work, labour-intensive, on your feet",
    ),
    (
        "Power and Authority",
        "Control over the work or destinies of others.",
        "executive authority, budget ownership, P&L responsibility, org-level decisions, strategic control, run the division, command",
    ),
    (
        "Practicality",
        "Work that yields a tangible, useful, real-world result.",
        "real-world impact, tangible outcomes, practical applications, ship product, hands-on results, solve real problems",
    ),
    (
        "Precision Work",
        "Accuracy and detail-oriented work.",
        "attention to detail, zero-defect, meticulous, quality assurance, exacting standards, rigorous, thorough",
    ),
    (
        "Public Contact",
        "Frequent interaction with the public.",
        "client-facing, customer interaction, public-facing, front of house, community outreach, external stakeholders",
    ),
    (
        "Recognition",
        "Visible credit and acknowledgment.",
        "employee of the month, spotlight, shout-outs, public praise, awards, celebrate wins, credit where due",
    ),
    (
        "Research and Development",
        "Investigation, experiments, innovation.",
        "R&D, prototyping, proof of concept, experimentation, research, lab, white-paper, pilot program",
    ),
    (
        "Security",
        "Job stability and dependable income.",
        "permanent position, job security, stable employer, long-term role, pension, benefits package, recession-proof, steady demand",
    ),
    (
        "Spirituality",
        "Work setting supportive of spiritual beliefs.",
        "faith-based, ministry, spiritual mission, chaplaincy, religious organization, prayer, congregation",
    ),
    (
        "Stability",
        "Predictable routines and structure.",
        "predictable schedule, consistent hours, established company, steady workload, low turnover, long-standing, minimal change",
    ),
    (
        "Status",
        "Prestige and standing of role.",
        "prestigious, renowned, elite, top-tier firm, Fortune 500, brand-name employer, high-profile, C-suite",
    ),
    (
        "Steep Learning Curve",
        "New, difficult tasks to be rapidly mastered.",
        "ramp up quickly, learn fast, sink or swim, steep growth, rapid onboarding, hit the ground running",
    ),
    (
        "Structure and Predictability",
        "High structure and consistent expectations.",
        "well-defined processes, clear expectations, documented workflows, SOPs, standardized, playbook",
    ),
    (
        "Supervision",
        "Leading and managing others.",
        "manage a team, direct reports, people management, team lead, oversee staff, supervisory, coaching reports",
    ),
    (
        "Time Freedom",
        "Control over schedule and hours.",
        "flexible hours, async-first, results-oriented, no fixed schedule, flextime, work when you want, core hours optional",
    ),
    (
        "Tradition",
        "Work consistent with established customs or heritage.",
        "heritage, long-standing, legacy, time-honoured, family business, established since, tradition of excellence",
    ),
    (
        "Work Alone",
        "Independent, autonomous work.",
        "solo contributor, work independently, minimal interaction, heads-down, individual contributor, self-contained tasks, focused solitary work",
    ),
    (
        "Work Under Pressure",
        "Effectiveness in urgent/high-stakes situations.",
        "high-pressure, urgent, deadline-driven, crisis management, time-critical, mission-critical, on-call",
    ),
    (
        "Work with Others",
        "Close ongoing collaboration.",
        "collaborate daily, pair programming, team-oriented, work closely with, close working relationships, regular interaction, partner with",
    ),
    (
        "Work-Life Balance",
        "Adequate time for family, hobbies, and social life.",
        "work-life balance, reasonable hours, no overtime, wellness, recharge, personal time, mental health days, boundaries",
    ),
]

WORK_VALUES_SET: Final[set[str]] = {label for label, _, _ in WORK_VALUES_TAXONOMY}


# System instruction to anchor any provider to pure JSON output.
VALUES_SYSTEM_MSG = (
    "You output only valid JSON. Do not include any text, explanation, or markdown "
    "before or after the JSON array."
)

VALUES_BATCH_PROMPT_TEMPLATE = """You are tagging each job posting with work values.

Use ONLY labels from the allowed list below.
Choose 3 to {max_values} labels per job.
Do not infer values from the company name alone; use the title, summary, and description.

ALLOWED VALUES (label: meaning | signals — typical job-posting language):
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
    return "\n".join(
        f"- {label}: {definition} | Signals: {signals}"
        for label, definition, signals in WORK_VALUES_TAXONOMY
    )


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

