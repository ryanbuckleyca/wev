"""Global LLM configuration.

Controls when to use grounding across LLM providers.

For SSE / org assessment, ``SSEFallbackProvider`` fetches shared Tavily evidence
and injects it into the prompt for every backend (Gemini, Groq, Ollama).
Native Google Search tool use is separate and opt-in
(``USE_GOOGLE_SEARCH_GROUNDING=1``).

Only SSE classification uses grounding by default (``FORCE_GROUNDING`` overrides).
"""

import os


def should_use_grounding(task_type: str = "default") -> bool:
    """Determine if grounding should be used for a given task type.

    Args:
        task_type: Type of task ("sse", "summarization", "classification", etc.)

    Returns:
        True if grounding should be used for this task type
    """
    force_grounding = os.environ.get("FORCE_GROUNDING", "").lower()
    if force_grounding in ("1", "true", "yes", "on"):
        return True

    if force_grounding in ("0", "false", "no", "off"):
        return False

    return task_type.lower() == "sse"