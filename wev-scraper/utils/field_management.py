"""Field management utilities for job data processing and override logic.

This module defines how different job fields are grouped and controlled
by environment variables during the override process.
"""

from utils.env import is_truthy_env


def get_field_groups():
    """Return field groups configuration for job data processing.
    
    Each field group defines:
    - fields: List of database fields in this group
    - process_flag: Environment variable that controls whether this group is processed
    - reprocess_flag: Environment variable that controls whether existing data is updated
    
    Returns:
        dict: Field groups configuration
    """
    return {
        # Summary fields
        "summary": {
            "fields": ["summary"],
            "process_flag": "SHOULD_SUMMARIZE",
            "reprocess_flag": "SHOULD_RE_SUMMARIZE",
            "description": "Job summarization using LLM"
        },
        
        # SSE classification fields  
        "sse": {
            "fields": ["sse_rating", "sse_details", "is_sse"],
            "process_flag": "SHOULD_CLASSIFY",
            "reprocess_flag": "SHOULD_RE_CLASSIFY",
            "description": "Solidarity Economy classification with web search grounding"
        },
        
        # Geocoding fields (from Geocodio API)
        "geocoding": {
            "fields": ["municipality", "province"],
            "process_flag": "SHOULD_GEOCODE",
            "reprocess_flag": "SHOULD_RE_GEOCODE",
            "description": "Location geocoding using Geocodio API"
        },
        
        # Work type detection (from location text analysis)
        "work_type": {
            "fields": ["work_type", "is_remote"],
            "process_flag": "SHOULD_GEOCODE",  # These are processed in normalize_job_data
            "reprocess_flag": "SHOULD_RE_GEOCODE",  # Follow same logic as geocoding
            "description": "Work type detection from location text (remote/hybrid/office)"
        },
        
        # Values tagging fields
        "values": {
            "fields": ["values"],
            "process_flag": "SHOULD_TAG_VALUES", 
            "reprocess_flag": "SHOULD_RE_TAG_VALUES",
            "description": "Work values tagging using predefined taxonomy"
        },
        
        # Skills tagging fields
        "skills": {
            "fields": ["skills"],
            "process_flag": "SHOULD_TAG_SKILLS",
            "reprocess_flag": "SHOULD_RE_TAG_SKILLS",
            "description": "ESCO skills tagging via vector embeddings (Jina v3)"
        }
    }


def should_preserve_field_group(group_name: str, config: dict, new_data: dict, existing_data: dict) -> bool:
    """Determine if a field group should be preserved during override.
    
    Args:
        group_name: Name of the field group
        config: Field group configuration
        new_data: New job data being processed
        existing_data: Existing job data from database
        
    Returns:
        bool: True if fields should be preserved, False if they should be updated
    """
    should_process = is_truthy_env(config["process_flag"])
    should_reprocess = is_truthy_env(config["reprocess_flag"])
    
    # Skip preservation if we're not processing this group at all
    if not should_process:
        return True  # Preserve existing data
    
    # If processing but not reprocessing, preserve existing when new data is missing
    if should_process and not should_reprocess:
        # Check if any field in this group has new data
        has_new_data = any(
            field in new_data and new_data[field] and new_data[field] is not None
            for field in config["fields"]
        )
        return not has_new_data  # Preserve if no new data
    
    # If processing and reprocessing, always update
    return False


def build_update_row_with_field_preservation(job_row: dict, source_id: int, existing_data: dict) -> dict:
    """Build an update payload that preserves existing fields unless explicitly overridden.
    
    Logic:
    - Start with new job data
    - For each field group, check if we should override existing data
    - Override rules:
      * If field is missing in new data → preserve existing
      * If processing is disabled (SHOULD_* flags) → preserve existing  
      * If reprocessing is disabled (SHOULD_RE_* flags) → preserve existing
    
    Args:
        job_row: New job data from _job_row()
        source_id: Source ID for the job
        existing_data: Existing job data from database
        
    Returns:
        dict: Update row with preserved fields where appropriate
    """
    row = job_row
    field_groups = get_field_groups()
    
    # For each field group, apply preservation logic
    for group_name, config in field_groups.items():
        should_process = is_truthy_env(config["process_flag"])
        should_reprocess = is_truthy_env(config["reprocess_flag"])
        
        # Skip preservation if we're not processing this group at all
        if not should_process:
            for field in config["fields"]:
                if existing_data.get(field) is not None:
                    row[field] = existing_data[field]
            continue
            
        # If processing but not reprocessing, preserve existing when new data is missing
        if should_process and not should_reprocess:
            for field in config["fields"]:
                # Preserve existing if new field is None/empty
                if (field not in row or not row[field] or row[field] is None):
                    if existing_data.get(field) is not None:
                        row[field] = existing_data[field]
    
    return row


def print_field_groups_help():
    """Print help information about field groups and their controls."""
    field_groups = get_field_groups()
    
    print("📊 Job Field Groups and Controls")
    print("=" * 50)
    
    for group_name, config in field_groups.items():
        print(f"\n🏷️  {group_name.title()}:")
        print(f"   Fields: {', '.join(config['fields'])}")
        print(f"   Process Flag: {config['process_flag']}")
        print(f"   Reprocess Flag: {config['reprocess_flag']}")
        print(f"   Description: {config['description']}")
    
    print(f"\n📋 Control Logic:")
    print(f"   Process Flag = 0 → Never process, always preserve existing")
    print(f"   Process Flag = 1 + Reprocess Flag = 0 → Process but preserve existing")
    print(f"   Process Flag = 1 + Reprocess Flag = 1 → Process and update existing")
