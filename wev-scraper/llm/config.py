"""Global LLM configuration.

Controls when to use grounding (Google Search/Tavily) across all LLM providers.
Only SSE classification should use grounding by default.
"""

import os


def should_use_grounding(task_type: str = "default") -> bool:
    """Determine if grounding should be used for a given task type.
    
    Args:
        task_type: Type of task ("sse", "summarization", "classification", etc.)
        
    Returns:
        True if grounding should be used for this task type
    """
    # Check explicit environment override
    force_grounding = os.environ.get("FORCE_GROUNDING", "").lower()
    if force_grounding in ("1", "true", "yes", "on"):
        return True
    
    if force_grounding in ("0", "false", "no", "off"):
        return False
    
    # Default behavior: only SSE classification uses grounding
    return task_type.lower() == "sse"

