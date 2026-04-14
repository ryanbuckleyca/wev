"""Grounded LLM using Tavily search + Ollama for local development.

This module provides a simple abstraction similar to your example.
When ENV_MODE=local, this will be used instead of Gemini/Groq APIs.
"""

import os
from pathlib import Path

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    load_dotenv()
except ImportError:
    pass


def grounded_query(prompt: str, task_type: str = "default") -> str:
    """Execute a query using Tavily search + Ollama if grounding is enabled.

    Args:
        prompt: The query prompt
        task_type: Type of task ("sse", "summarization", etc.) - only "sse" uses grounding by default

    Returns:
        Response from local Ollama model (grounded or ungrounded based on config)
    """
    try:
        import ollama
        from tavily import TavilyClient

        from llm.config import should_use_grounding

        # Check if we should use grounding for this task type
        use_grounding = should_use_grounding(task_type)

        if use_grounding:
            # Initialize Tavily client
            tavily = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))

            # 1. Search for relevant context
            results = tavily.search(prompt, search_depth="basic", max_results=5)
            context = "\n\n".join([r["content"] for r in results["results"]])

            # 2. Generate response using local Ollama with context
            full_prompt = f"Using these search results:\n\n{context}\n\nAnswer: {prompt}"
        else:
            # Use prompt directly without search
            full_prompt = prompt

        # Generate response using local Ollama
        response = ollama.generate(
            model="mistral",
            prompt=full_prompt
        )

        return response["response"]

    except ImportError as e:
        raise ImportError(
            f"Missing dependencies for local LLM: {e}. "
            "Install with: pip install tavily-python ollama"
        ) from e
    except Exception as e:
        raise RuntimeError(f"Local query failed: {e}") from e


def is_available() -> bool:
    """Check if local grounded LLM is available."""
    try:
        import ollama
        from tavily import TavilyClient  # noqa: F401

        # Check Tavily API key
        if not os.getenv("TAVILY_API_KEY"):
            return False

        # Check Ollama is running and has mistral
        models = ollama.list()
        model_names = [m.model for m in models.get("models", [])]
        return any("mistral" in name.lower() for name in model_names)

    except (ImportError, Exception):
        return False
