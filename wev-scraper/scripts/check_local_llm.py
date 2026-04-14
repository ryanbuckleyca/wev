#!/usr/bin/env python3
"""Test script to verify local grounded LLM provider works."""

import os
from pathlib import Path

# Add wev-scraper to path
scraper_root = Path(__file__).resolve().parent

# scraper_root is resolved first so sys.path is correct before importing local modules.
from llm.factory import (  # noqa: E402
    _is_local_mode,
    get_job_summary_provider,
    get_provider,
    get_sse_provider,
)


def test_env_detection():
    """Test that ENV_MODE=local is detected correctly."""
    print(f"ENV_MODE={os.environ.get('ENV_MODE', 'not set')}")
    print(f"Is local mode: {_is_local_mode()}")
    return _is_local_mode()


def test_local_provider():
    """Test local grounded provider availability and functionality."""
    print("\n=== Testing Local Grounded Provider ===")

    try:
        provider = get_provider(name="local_grounded")
        print(f"✓ Provider created: {type(provider).__name__}")

        available = provider.is_available()
        print(f"✓ Available: {available}")

        if available:
            limits = provider.get_token_limits()
            print(f"✓ Token limits: {limits}")

            # Test a simple completion
            try:
                response = provider.complete("What is 2+2?")
                print(f"✓ Test response: {response[:100]}...")
                return True
            except Exception as e:
                print(f"✗ Test completion failed: {e}")
                return False
        else:
            print("✗ Provider not available - check Tavily API key and Ollama")
            return False

    except Exception as e:
        print(f"✗ Failed to create provider: {e}")
        return False


def test_factory_functions():
    """Test factory functions with local mode detection."""
    print("\n=== Testing Factory Functions ===")

    # Test job summary provider
    provider = get_job_summary_provider()
    if provider:
        print(f"✓ Job summary provider: {type(provider).__name__}")
    else:
        print("✗ No job summary provider available")

    # Test SSE provider
    provider = get_sse_provider()
    if provider:
        print(f"✓ SSE provider: {type(provider).__name__}")
    else:
        print("✗ No SSE provider available")

    # Test default provider
    provider = get_provider()
    if provider:
        print(f"✓ Default provider: {type(provider).__name__}")
    else:
        print("✗ No default provider available")


def main():
    """Run all tests."""
    print("Local Grounded LLM Provider Test")
    print("=" * 40)

    # Check environment
    is_local = test_env_detection()

    if not is_local:
        print("\n⚠️  Not in local mode (ENV_MODE=local)")
        print("Set ENV_MODE=local to use local grounded provider automatically")

    # Test the provider
    local_works = test_local_provider()

    # Test factory functions
    test_factory_functions()

    print("\n" + "=" * 40)
    if local_works:
        print("✅ Local grounded provider is working!")
        print("\nTo use:")
        print("1. Make sure Ollama is running: ollama serve")
        print("2. Ensure TAVILY_API_KEY is set in .env")
        print("3. Set ENV_MODE=local in .env")
    else:
        print("❌ Local grounded provider not available")
        print("\nTroubleshooting:")
        print("1. Install tavily-python and ollama: pip install tavily-python ollama")
        print("2. Start Ollama: ollama serve")
        print("3. Pull mistral model: ollama pull mistral")
        print("4. Set TAVILY_API_KEY in .env")


if __name__ == "__main__":
    main()
