"""Dynamic batching utilities for LLM providers."""

from typing import List, Dict, Any
from llm.base import BaseLLMProvider


def estimate_tokens_for_text(text: str) -> int:
    """Rough estimate of tokens for text (4 chars per token)."""
    return len(text) // 4


def estimate_tokens_for_job_batch(jobs: List[Dict[str, Any]], fixed_overhead: int = 717) -> int:
    """Estimate total tokens needed for a batch of jobs.
    
    Args:
        jobs: List of job dictionaries
        fixed_overhead: Fixed tokens (taxonomy, instructions, etc.)
        
    Returns:
        Estimated token count
    """
    job_tokens = 0
    for job in jobs:
        # Job description (capped at 4000 chars)
        description_chars = len(job.get("description", "") or "")
        description_tokens = min(description_chars, 4000) // 4
        
        # Job metadata
        metadata_chars = (
            len(job.get("organization", "") or "") +
            len(job.get("job_title", "") or "") +
            len(job.get("location", "") or "") +
            len(job.get("employment_type", "") or "") +
            100  # padding for labels, formatting
        )
        metadata_tokens = metadata_chars // 4
        
        job_tokens += description_tokens + metadata_tokens
    
    return fixed_overhead + job_tokens


def create_dynamic_batches(
    items: List[Dict[str, Any]], 
    provider: BaseLLMProvider,
    token_estimator: callable = estimate_tokens_for_job_batch,
    max_tokens_override: int | None = None
) -> List[List[Dict[str, Any]]]:
    """Create dynamic batches based on provider token limits.
    
    Args:
        items: List of items to batch (jobs, etc.)
        provider: LLM provider instance
        token_estimator: Function to estimate tokens for a batch
        max_tokens_override: Override provider's recommended batch size
        
    Returns:
        List of batches, each staying under token limits
    """
    if not items:
        return []
    
    # Get token limits from provider
    limits = provider.get_token_limits()
    max_tokens = max_tokens_override or limits["recommended_batch_size"]
    
    print(f"Using token limit: {max_tokens} (provider: {type(provider).__name__})")
    
    batches = []
    current_batch = []
    
    for item in items:
        # Test if adding this item would exceed token limit
        test_batch = current_batch + [item]
        estimated_tokens = token_estimator(test_batch)
        
        if estimated_tokens <= max_tokens:
            # Item fits in current batch
            current_batch.append(item)
        else:
            # Item doesn't fit - start new batch
            if current_batch:
                batches.append(current_batch)
                current_tokens = token_estimator(current_batch)
                print(f"  Created batch: {len(current_batch)} items, ~{current_tokens} tokens")
            current_batch = [item]
    
    # Add the last batch if it has items
    if current_batch:
        batches.append(current_batch)
        current_tokens = token_estimator(current_batch)
        print(f"  Created batch: {len(current_batch)} items, ~{current_tokens} tokens")
    
    return batches


def create_provider_aware_batches(
    items: List[Dict[str, Any]], 
    provider: BaseLLMProvider | Any,  # Allow UnifiedJobProcessor too
    content_type: str = "jobs",
    max_tokens_override: int | None = None
) -> List[List[Dict[str, Any]]]:
    """Create batches with provider-specific token estimation.
    
    Args:
        items: List of items to batch
        provider: LLM provider instance or UnifiedJobProcessor  
        content_type: Type of content ('jobs', 'values', etc.)
        max_tokens_override: Override provider limits
        
    Returns:
        List of batches optimized for the provider
    """
    # Select appropriate token estimator based on content type
    estimators = {
        "jobs": estimate_tokens_for_job_batch,
        # Add more estimators as needed
    }
    
    token_estimator = estimators.get(content_type, estimate_tokens_for_job_batch)
    
    return create_dynamic_batches(
        items=items,
        provider=provider,
        token_estimator=token_estimator,
        max_tokens_override=max_tokens_override
    )
