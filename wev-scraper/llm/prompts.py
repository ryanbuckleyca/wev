"""Centralized prompt templates and utilities for LLM providers.

This module contains reusable prompt components to avoid duplication across
different LLM provider implementations while allowing provider-specific
customization when needed.
"""

from typing import Literal


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


def get_unified_system_prompt(include_sse: bool = False) -> str:
    """Get system prompt for unified job processing."""
    base_parts = [
        "You are an expert job analyst. For each job, provide:",
        "1. summary: 1 sentence describing the work and its impact",
        "2. values: array of the top 5 most relevant values from the provided taxonomy — rank by strength of evidence in the job text and return only the 5 best matches",
    ]
    
    if include_sse:
        base_parts.extend([
            "3. is_sse: boolean - true if social/solidarity economy (non-profit, cooperative, etc.)",
            "4. sse_confidence: float 0-1 for classification confidence",
            "Use web search for SSE classification. ",
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
    if include_sse:
        return (
            "For each job, extract: 1) Summary (1 sentence), "
            "2) Work values (top 5 most relevant from taxonomy — rank by strength of evidence and return only the 5 best), "
            "3) SSE classification (using web search)."
        )
    else:
        return (
            "For each job, extract: 1) Summary (1 sentence), "
            "2) Work values (top 5 most relevant from taxonomy — rank by strength of evidence and return only the 5 best). "
            "Skip SSE classification."
        )
