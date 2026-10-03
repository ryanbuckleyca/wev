"""Centralized prompt templates and utilities for LLM providers.

This module contains reusable prompt components to avoid duplication across
different LLM provider implementations while allowing provider-specific
customization when needed.
"""

import os


def get_summary_prompt_base(max_words: int) -> str:
    """Get the base summary prompt that's common across all providers."""
    return (
        f"Write a single fluent sentence of no more than {max_words} words describing what this person will do and why it matters. "
        "Focus on the day-to-day work, its purpose, and its impact — not on hiring requirements or qualifications. "
        "Where the role serves a social, environmental, or community mission, make that the heart of the sentence. "
        "Do not mention or invent any organisation name, even if it appears in the text — omit the name entirely. "
        "Do not begin with the job title. Do not use phrases like 'This role requires', 'X role requires', or 'The role of X'. "
    )


def get_language_instruction() -> str:
    """Get the language detection and matching instruction."""
    return (
        "IMPORTANT: Detect the language of the job posting. Look for French words, phrases, or job titles. "
        "If the posting contains French content, you MUST write the summary in French. "
        "If the posting is in French, write your sentence in French. If in English, write in English. "
        "If the posting is written in both English and French, or explicitly requires both languages, "
        "you may write the summary in either language."
    )


def get_formatting_rules() -> str:
    """Get formatting rules for summaries."""
    return (
        "Plain prose only — no markdown, no bold, no bullet points, no quotation marks. "
        "No colons anywhere — use 'and', 'while', or a comma instead."
    )


def get_summary_system_prompt_base() -> str:
    """Get the base system prompt for summary generation."""
    return (
        "Output only the summary sentence. "
        "No preamble, no quotation marks, no explanation, no extra sentences, no markdown. "
        "NEVER use a colon. "
        "NEVER start with the job title or 'This role'. "
        "NEVER mention any organisation name. "
    )


def get_language_system_instruction() -> str:
    """Get the language instruction for system prompts."""
    return (
        "CRITICAL: Match the language of the job posting exactly. "
        "French job titles/descriptions → French summary. English → English. "
        "Look for French words, phrases, and job titles in the posting."
    )


def build_summary_prompt(max_words: int, job_title: str | None = None, include_formatting: bool = True) -> str:
    """Build a complete summary prompt from reusable components."""
    prompt_parts = [
        get_summary_prompt_base(max_words),
        get_language_instruction(),
    ]

    if include_formatting:
        prompt_parts.append(get_formatting_rules())

    prompt_parts.append("\n\n")  # Add spacing before the text content

    if job_title:
        prompt_parts.append(f"Job Title: {job_title}\n")

    return "".join(prompt_parts)


def build_summary_system_prompt() -> str:
    """Build a complete summary system prompt from reusable components."""
    return get_summary_system_prompt_base() + get_language_system_instruction()


def get_skills_and_values_extraction_rules() -> str:
    """Get rules for skills and values extraction in batch processing."""
    return (
        "2. Extract and list all key skills, knowledge, or abilities required for this role as a JSON array under the key 'skills'. "
        "Use standardised ESCO (European Skills, Competences, Qualifications and Occupations) terminology where possible — "
        "e.g. 'project management', 'community development', 'data analysis' rather than job-ad phrases like 'strong communicator' or 'team player'. "
        "Prefer concise competency labels (2–4 words) that would appear in a professional skills taxonomy. "
        "Avoid vague soft-skill filler. Aim for 5–8 skills per job.\n\n"
        "3. Extract and list the core work values reflected in this role as a JSON array under the key 'values'. "
    )


def get_batch_processing_rules(max_values: int) -> str:
    """Get rules specific to batch processing."""
    return (
        f"Choose 3 to {max_values} values from the ALLOWED VALUES list below. Values must exactly match the labels (case-sensitive).\n\n"
    )


def get_json_output_rules(max_values: int) -> str:
    """Get JSON output formatting rules."""
    return (
        f"Rules:\n"
        f"- Skills must use ESCO-style terminology: concise competency labels (2–4 words) that would appear in a professional skills taxonomy. Avoid vague phrases like 'strong communicator'.\n"
        f"- Values must exactly match allowed labels (case-sensitive).\n"
        f"- No duplicate labels per job. Maximum {max_values} values per job.\n"
        f"- CRITICAL: Match the language of each job posting exactly. French job titles/descriptions → French summary and French skills. English → English.\n"
        f"- Return ONLY the JSON array. No text before or after it.\n"
    )


def build_batch_summary_prompt(max_words: int, max_values: int) -> str:
    """Build the summary portion of a batch processing prompt.

    Composes from the same shared components as build_summary_prompt,
    prefixed with "1." for numbered batch instructions.
    """
    return (
        f"1. {get_summary_prompt_base(max_words)}"
        f"{get_language_instruction()}"
        f"{get_formatting_rules()}\n\n"
    )


def get_json_system_prompt(include_sse: bool = False) -> str:
    """Get system prompt for JSON output processing."""
    base_prompt = (
        "You output only valid JSON. Do not include any text, explanation, or markdown "
        "before or after the JSON array. Every item must have index, summary, skills, and values fields. "
        "CRITICAL: Match the language of each job posting exactly. "
        "French job titles/descriptions → French summary. English → English. "
        "Look for French words, phrases, and job titles in the posting."
    )

    if include_sse:
        base_prompt = base_prompt.replace("index, summary, skills, and values fields", "index, summary, skills, values, and SSE fields")

    return base_prompt


# ---------------------------------------------------------------------------
# skills_raw extraction prompt variants
# Active variant: SKILLS_RAW_PROMPT_VARIANT=v3|v4|…|v11 (default v5).
# V3/V5 remain known-good fallbacks if a newer variant regresses in dry-evals.
# V11 ports the llm-extract Phase 1 idea (verbatim-quote grounding) into skills_raw.
# ---------------------------------------------------------------------------

SKILLS_RAW_RULES_V3 = (
    "array of short competency phrases (ideally 2–4 words each) naming the "
    "distinct skills, tools, methods, licenses, and certifications that the "
    "posting EXPLICITLY requires or describes as part of the work. "
    "Each phrase should read like a reusable skill label (e.g. 'grant writing', "
    "'donor stewardship', 'CRM data management', 'valid driver's license', "
    "'urban agriculture', 'workshop facilitation'), not a duty sentence or org blurb. "
    "WHERE TO LOOK: pull from requirements/qualifications AND from responsibilities/"
    "duties when those sections name a concrete capability, tool, method, or domain "
    "(e.g. 'Sort donations' → 'donation sorting'; 'animer des ateliers en agriculture "
    "urbaine' → 'animation d'ateliers' and 'agriculture urbaine'; 'Manage cash register "
    "and cash reconciliation' → 'cash reconciliation' and 'point of sale systems'). "
    "Light normalization of explicit wording is OK; inventing capabilities is not. "
    "Do NOT invent soft skills from personality adjectives or vibes "
    "('souriante', 'à l'écoute', 'empathique', 'motivée', 'team player', "
    "'storyteller') and do NOT invent skills from the job title alone when the "
    "body has little content. "
    "THIN POSTINGS: if the ad is mostly a teaser that points to a website / "
    "'full posting elsewhere' with almost no skill content, return [] — never pad. "
    "DO include named tools, software, licenses, and professional certs when listed "
    "(Microsoft Office, Dynamics GP, driver's license, Zumba brevet, etc.). "
    "Do NOT list degrees, years of experience, immunization/proof-of-status, "
    "salary, benefits, location, employer/org names, or job titles as skills. "
    "A typical full posting has about 8–15 distinct competencies; "
    "short ads fewer, dense technical/admin ads sometimes more — calibration hint, "
    "not a hard cap. Prefer missing a borderline soft skill over dropping an "
    "explicitly named tool or core domain skill. "
    "Deduplicate and merge near-duplicates into one phrase. "
    "Match the language of the posting (French posting → French phrases)."
)

SKILLS_RAW_RULES_V4 = (
    "array of short CV-style skill labels (2–4 words) for capabilities EXPLICITLY "
    "stated in the posting. "
    "Include: (a) named tools/software/licenses/certs, and (b) concrete domain "
    "skills from requirements OR duties when the text names a transferable "
    "capability (e.g. 'Sort donations' → 'donation sorting'; 'animer des ateliers "
    "en agriculture urbaine' → 'agriculture urbaine' + 'animation d'ateliers'). "
    "EXCLUDE task crumbs and soft process filler that are not standalone skills: "
    "priority management, multitasking, shelf stocking, 'work independently', "
    "'positive attitude', 'gestion des priorités', 'suivi des récoltes' as a "
    "standalone if it is just a duty bullet without a skill framing — fold into "
    "a broader domain skill instead when possible. "
    "THIN TEASERS (points to website / almost no skill content): return [] only. "
    "Do NOT invent from personality vibes or the job title alone. "
    "Do NOT list degrees, years of experience, immunization, salary, org names, "
    "or job titles as skills. "
    "Calibration: most full ads → about 8–12 skills; short coaching/arts ads → 2–5; "
    "dense admin/finance with many named tools may go a bit higher. Not a hard cap. "
    "Deduplicate. Match posting language."
)

SKILLS_RAW_RULES_V5 = (
    "array of short skill-label phrases. Mentally extract in two passes, then merge: "
    "(1) TOOLS PASS — named software, systems, and occupational licenses/certs that "
    "are capabilities someone performs with (Office, Dynamics GP, Tessitura, "
    "driver's license, Zumba brevet, CPR, trade tickets, etc.). "
    "(2) DOMAIN PASS — distinct transferable domains/methods clearly required from "
    "duties or requirements (fundraising, urban agriculture, workshop facilitation, "
    "accounts payable, donor stewardship, etc.). "
    "Do not atomize every duty bullet into its own skill; merge related bullets "
    "into one domain label. "
    "CLASSIFY before including — omit entire categories that are not transferable skills: "
    "(a) ELIGIBILITY / SCREENING — anything that proves fitness to be hired rather than "
    "ability to do the work (background checks, vulnerable-sector checks, security "
    "clearances, proof of immunization/status, citizenship/work-permit attestations); "
    "(b) LEGAL INSTRUMENTS — titles of statutes, acts, regulations, or bylaws as labels; "
    "if the posting describes applied regulatory work, use a domain skill such as "
    "'regulatory compliance' instead of the instrument's name; "
    "(c) FORMAL EDUCATION CREDENTIALS — degrees, diplomas, and years-of-experience lines "
    "(our matcher targets ESCO skills/competences, not the ESCO qualifications pillar); "
    "(d) SOFT VIBES / META — personality adjectives, org names, job titles, salary/benefits. "
    "Keep occupational licenses and professional practice certs in (1); drop screening "
    "clearances even when listed under 'Requirements'. "
    "Thin teasers with almost no skill content → []. "
    "Calibration: aim for roughly 8–12 on a typical full posting after merging; "
    "short ads fewer. Prefer a slightly short precise list over a padded one. "
    "Match posting language."
)

SKILLS_RAW_RULES_V6 = (
    "array of short skill-label phrases (2–4 words). "
    "INCLUDE a phrase ONLY if you can point to a supporting span in the posting "
    "(requirements, qualifications, tools, or duty text). No support span → omit. "
    "Named tools/software/licenses/certs always count when present. "
    "Domain skills count when duties/requirements name a transferable capability "
    "(normalize lightly: 'Sort donations' → 'donation sorting'). "
    "Hard rules: thin teasers / 'see website for full posting' with almost no skill "
    "content → []; never invent from personality adjectives or the title alone; "
    "never list degrees, years of experience, immunization, org names, or job titles. "
    "Merge near-duplicates. Typical full ad ≈ 8–12 skills. Match posting language."
)

SKILLS_RAW_RULES_V7 = (
    "Two-pass extraction into short skill labels, then merge: "
    "(1) every named tool/system/license/cert; "
    "(2) distinct domain skills from requirements AND duties. "
    "Also apply these exclusions: no personality vibes; no degrees/years/"
    "immunization/org names/job titles; no soft process filler "
    "(gestion des priorités, multitasking, work independently, shelf stocking, "
    "positive attitude) — fold duty crumbs into a broader domain skill instead. "
    "Thin teasers → []. Do not atomize every bullet. Aim ~8–12 on full ads. "
    "Match posting language."
)

SKILLS_RAW_RULES_V8 = (
    "array of short ESCO-style competency labels (noun phrases, 2–4 words) that a "
    "skills taxonomy would recognize — e.g. 'grant writing', 'accounts payable', "
    "'workshop facilitation', 'Microsoft Excel', 'valid driver's license'. "
    "Source only from explicit posting text (requirements + duties). "
    "Prefer taxonomy-like wording over duty verbs ('manage cellar' → skip unless "
    "it is a real transferable skill; 'donor stewardship' OK). "
    "Include named tools/licenses. Omit vibes, degrees, years, immunization, "
    "org names, job titles. Thin teasers → []. Merge duplicates. "
    "Typical full ad ≈ 8–12. Match posting language."
)

SKILLS_RAW_RULES_V9 = (
    "Return short skill labels explicitly grounded in the job text. "
    "Must-have when named: software, systems, licenses, professional certs. "
    "Also include clear domain competencies from duties/qualifications "
    "(fundraising, horticulture, payroll, retail merchandising, etc.). "
    "Skip: soft vibes, degrees, YoE lines, immunization, org/job-title strings, "
    "and one-off chore bullets that are not transferable skills. "
    "If the posting is a thin teaser, return []. "
    "Target about 8–12 skills for a normal full posting. Match language."
)

SKILLS_RAW_RULES_V10 = (
    "Extract reusable skill labels from this job posting. "
    "Rules: (1) only what the text explicitly supports; "
    "(2) always keep named tools/licenses/certs; "
    "(3) keep distinct domains from duties/requirements after merging related bullets; "
    "(4) drop personality fluff, degrees, years-of-experience, immunization, "
    "employer names, and job titles-as-skills; "
    "(5) empty list for thin 'see website' teasers; "
    "(6) prefer precision — a good list is usually 6–12 items, not 20+. "
    "Output skill phrases only (2–4 words). Match posting language."
)

# Inspired by the llm-extract tagger Phase 1: explicit asks only, each phrase
# must be supportable by a verbatim quote (quote is mental check — do not emit it).
SKILLS_RAW_RULES_V11 = (
    "array of short skill-label phrases (2–4 words) listing skills, tools, "
    "qualifications, certifications, and languages the posting EXPLICITLY asks for. "
    "Grounding rule: include a phrase ONLY if you can point to a verbatim quote in "
    "the posting that supports it — do not invent from vibes, job title alone, or "
    "topical adjacency. Do not emit the quote; emit the normalized skill label only. "
    "This is extraction, not taxonomy recall — never invent ESCO/occupation labels "
    "the posting did not ask for. "
    "Normalize lightly ('Experience with Salesforce' → 'Salesforce'; "
    "'Sort donations' → 'donation sorting'). "
    "Merge near-duplicates; do not atomize every duty bullet. "
    "Omit: personality adjectives, degrees-as-skills, years-of-experience lines, "
    "immunization/proof-of-status, salary/benefits, org names, job titles. "
    "Thin teasers that point to a website with almost no skill content → []. "
    "Calibration: typical full posting ≈ 8–12 after merging; short ads fewer; "
    "dense tool lists may go higher when each tool is named. Match posting language."
)

_SKILLS_RAW_RULES_BY_VARIANT = {
    "v3": SKILLS_RAW_RULES_V3,
    "v4": SKILLS_RAW_RULES_V4,
    "v5": SKILLS_RAW_RULES_V5,
    "v6": SKILLS_RAW_RULES_V6,
    "v7": SKILLS_RAW_RULES_V7,
    "v8": SKILLS_RAW_RULES_V8,
    "v9": SKILLS_RAW_RULES_V9,
    "v10": SKILLS_RAW_RULES_V10,
    "v11": SKILLS_RAW_RULES_V11,
}

_SKILLS_BIT_BY_VARIANT = {
    "v3": (
        "3) Skills (explicit competencies / tools / licenses from requirements AND "
        "duties — short skill-label phrases; never invent from personality vibes or "
        "thin teasers; include named software/licenses and core domain skills stated "
        "in the posting; omit degrees and years-of-experience lines)"
    ),
    "v4": (
        "3) Skills (CV-style labels only — named tools/licenses plus concrete domain "
        "skills from requirements/duties; no soft process filler or thin-teaser padding; "
        "omit degrees)"
    ),
    "v5": (
        "3) Skills (two-pass tools/occupational-certs then domain skills; classify and "
        "omit eligibility/screening, legal-instrument titles, and formal education "
        "credentials — matcher is ESCO skills not qualifications; thin → [])"
    ),
    "v6": (
        "3) Skills (only phrases with a supporting span in the posting; tools/licenses "
        "plus grounded domain skills; thin teasers → []; no vibes/degrees)"
    ),
    "v7": (
        "3) Skills (two-pass tools then domains; ban soft process filler; merge duty "
        "crumbs; thin → [])"
    ),
    "v8": (
        "3) Skills (ESCO-style taxonomy labels from explicit text only; tools/licenses "
        "included; thin → []; no vibes/degrees)"
    ),
    "v9": (
        "3) Skills (named tools/certs + clear domain competencies; skip chores/vibes/"
        "degrees; thin → []; ~8–12 on full ads)"
    ),
    "v10": (
        "3) Skills (explicit only; keep tools/licenses; merge domains; usually 6–12 "
        "items; thin teasers → [])"
    ),
    "v11": (
        "3) Skills (explicit asks only — each phrase must be supportable by a verbatim "
        "quote in the posting; tools/quals/languages included; no taxonomy hallucination; "
        "thin → []; ~8–12 after merging)"
    ),
}


def get_skills_raw_prompt_variant() -> str:
    """Return active skills_raw prompt variant (default v5; v3 is a known-good fallback)."""
    raw = (os.environ.get("SKILLS_RAW_PROMPT_VARIANT") or "v5").strip().lower()
    return raw if raw in _SKILLS_RAW_RULES_BY_VARIANT else "v5"


def get_skills_raw_extraction_rules() -> str:
    """Quality-focused rules for jobs.skills_raw phrase extraction.

    Phrases are later 1:1 embedded and matched to ESCO — junk phrases crowd out
    real competencies, so prefer sparse, distinct skill labels over exhaustive
    dump of job-ad wording.

    Select variant via SKILLS_RAW_PROMPT_VARIANT (v3|v4|…|v11). Default: v5.
    Set SKILLS_RAW_PROMPT_VARIANT=v3 to use the earlier fallback rules.
    """
    return _SKILLS_RAW_RULES_BY_VARIANT[get_skills_raw_prompt_variant()]


def get_unified_system_prompt(include_sse: bool = False) -> str:
    """Get system prompt for unified job processing."""
    base_parts = [
        "You are an expert job analyst. For each job, provide:",
        "- summary: 1 sentence describing the work and its impact",
        "- language: string - 'en', 'fr', or 'bilingual' (if the job explicitly requires both English and French, or has significant content in both languages)",
        "- values: array of the top 5 most relevant values from the provided taxonomy — rank by strength of evidence in the job text and return only the 5 best matches",
        f"- skills_raw: {get_skills_raw_extraction_rules()}",
    ]

    if include_sse:
        base_parts.extend([
            "- is_sse: boolean - true only for social/solidarity economy employers "
            "(nonprofit, cooperative, mutual, union, etc.). "
            "false for government/public-sector employers and conventional for-profits",
            "- sse_confidence: float 0-1 for classification confidence",
        ])

    base_parts.extend([
        "CRITICAL: Match the language of each job posting exactly. ",
        "French job titles/descriptions → French summary. English → English. ",
        "Look for French words, phrases, and job titles in the posting. ",
        "Output a raw JSON array only. No markdown, no code fences, no explanation."
    ])

    return "\n".join(base_parts)


def get_unified_prompt_instructions(include_sse: bool = False) -> str:
    """Get the main instructions for unified processing prompts."""
    skills_bit = _SKILLS_BIT_BY_VARIANT[get_skills_raw_prompt_variant()]
    if include_sse:
        return (
            "For each job, extract: 1) Summary (1 sentence), "
            "2) Work values (top 5 most relevant from taxonomy — rank by strength of evidence and return only the 5 best), "
            f"{skills_bit}, "
            "4) SSE classification."
        )
    else:
        return (
            "For each job, extract: 1) Summary (1 sentence), "
            "2) Work values (top 5 most relevant from taxonomy — rank by strength of evidence and return only the 5 best), "
            f"{skills_bit}. "
            "Skip SSE classification."
        )
