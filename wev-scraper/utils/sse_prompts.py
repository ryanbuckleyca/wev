"""SSE Classification prompt templates for Gemini."""

# Keywords added to organization searches to find mission/values/governance info
# Focused on "information containers" that describe structure (bylaws, reports, etc.)
SSE_SEARCH_KEYWORDS = '(governance OR bylaws OR "articles of incorporation" OR "annual report" OR "impact report" OR "board of directors")'

SSE_JSON_FIELDS = """  "rating": "strong_yes",
  "confidence": 0.85,
  "reasoning": "Brief explanation of rating explaining which criteria are met/not met (max 200 chars). Volunteer/internship positions are acceptable if mission is clear and disclosed upfront and volunteering or internship role is clearly stated.",
  "must_haves_met": ["list", "of", "criteria"],
  "nice_to_haves_met": ["list", "of", "criteria"],
  "flags": ["any concerns", "ambiguities", "missing info"]"""

JSON_INSTRUCTIONS = """IMPORTANT:
- Return ONLY the JSON output, no commentary.
- Escape any double quotes inside string values (use \" or replace with single quotes).
- Do not include trailing commas or extra text outside the JSON.
"""

SSE_JSON_OBJECT_SPEC = f"""OUTPUT FORMAT (valid JSON only):
{{
{SSE_JSON_FIELDS}
}}

{JSON_INSTRUCTIONS}"""

def _indent_fields(fields: str, spaces: int = 4) -> str:
    prefix = " " * spaces
    return "\n".join(prefix + line if line else prefix for line in fields.splitlines())


SSE_JSON_ARRAY_SPEC = f"""OUTPUT FORMAT (valid JSON array only - one object per job, in the same order as provided):
[
  {{
    "index": 1,
{_indent_fields(SSE_JSON_FIELDS, spaces=4)}
  }},
  ...
]

{JSON_INSTRUCTIONS}"""


def _escape_braces(text: str) -> str:
    return text.replace("{", "{{").replace("}", "}}")


ESCAPED_SSE_JSON_OBJECT_SPEC = _escape_braces(SSE_JSON_OBJECT_SPEC)
ESCAPED_SSE_JSON_ARRAY_SPEC = _escape_braces(SSE_JSON_ARRAY_SPEC)


# Shared constants for SSE evaluation. 
# Source: https://solidarityeconomyprinciples.org/wp-content/uploads/2023/02/SE-Principles-2-pager-handout.pdf
SSE_PRINCIPLES = """The Solidarity Economy (SSE) prioritizes people and planet over profit. You must evaluate the organization against the following 24 principles:

COLLECTIVE CARE, RELATIONSHIPS, & ACCOUNTABILITY:
1. Relationships over transactions and single outcomes.
2. Collective accountability to values. 
3. Respect for traditions, ancestors, and legacies of social movements.
4. Embracing conflict as generative and clarifying.

SHARED RESOURCES & SHARED VISION:
5. Cooperation to access resources at all levels (local to international).
6. Financial and data transparency as a democratic essential.
7. Direct investment in Solidarity Economy and cooperative entities.

LIBERATION CULTURE:
8. Building movements and social transformation, not just projects.
9. Relationships based on solidarity and cooperation, not competition.
10. Shifting culture through language, practices, and pedagogy.
11. Respect for nature and all living beings.
12. Robust commitment to racial justice and shifting power.
13. Addressing legacies of patriarchy and misogyny.
14. Support for worker's rights and the liberation of poor/working people.
15. Incorporation of disability justice principles.
16. Reverence for life, making room for joy and connection.

DEMOCRACY & PROCESS:
17. Democracy in all aspects: the whole body deciding how power is shared.
18. Localized decision-making by those directly impacted.
19. Enterprises are autonomous, sovereign, and democratically controlled by members.
20. Consideration of impact on community, future generations, and the earth.

EDUCATION & LEADERSHIP DEVELOPMENT:
21. Ongoing education for members.
22. Collective learning to examine, adapt, and improve.
23. Democratized educational practices (everyone is a learner and teacher).
24. Continual building of new leadership within organizations."""

EVALUATION_CRITERIA = """EVALUATION CRITERIA:

MUST-HAVES (required for any Yes):
1. Clear purpose beyond profit - mission prioritizes people/community/planet
2. Impact described intentionally - not as afterthought or greenwashing
3. Role contributes to social/community/environmental good
4. Transparent compensation or role type - salary/pay clearly stated OR volunteer opportunity disclosed upfront (including "Volunteer" as salary) OR internship role clearly specified
5. Clear job expectations - hours, contract type, no unpaid trials (volunteer work explicitly disclosed upfront is acceptable)

NICE-TO-HAVES (strengthen Yes rating):
6. Solidarity-driven culture - cooperation, mutual support, "we"/"collective"/"community" language
7. Participatory governance - workers/members have voice in decisions
8. Governance model stated - nonprofit, cooperative, mutual, social enterprise
9. Investment in workers/volunteers - training, mentorship, learning opportunities, professional dev
10. Mission reinvestment - surplus goes to people/community/mission, not shareholders

AUTOMATIC NO FLAGS (triggers 'no' rating):
- No social/environmental/community mission (pure profit-focused)
- Profit-maximization focused with no visible social good
- No reference to cooperation beyond internal team collaboration
- Mission-neutral language with generic CSR
- Vague or missing compensation AND no volunteer/internship disclosure (if salary is "Volunteer" or role is internship, treat as disclosed)
- Hidden unpaid work (e.g., "unpaid trial" rather than transparent volunteer role)"""

ORG_EVALUATION_CRITERIA = """ORGANIZATION EVALUATION CRITERIA (evaluate the employer organization, NOT the job posting):

MUST-HAVES (required for strong_yes or weak_yes):
1. Clear purpose beyond profit - mission prioritizes people, community, or planet
2. Impact described intentionally on the organization's website or public materials
3. Governance model identifiable - nonprofit, cooperative, mutual, social enterprise, government, union, etc.

NICE-TO-HAVES (strengthen toward strong_yes):
4. Solidarity-driven culture - cooperation, mutual support, community language
5. Participatory governance - workers/members have voice in decisions
6. Mission reinvestment - surplus supports mission, not extractive shareholders
7. Transparent public information about programs, governance, or annual impact

AUTOMATIC NO SIGNALS (sse_rating should be "no"):
- Pure profit-maximization with no visible social/community/environmental mission
- Mission-neutral corporate language with only generic CSR
- Cannot identify any social purpose from available public information

IMPORTANT:
- Use web search on the ORGANIZATION NAME and location. Do not refuse because the scraped job text is narrow.
- The job title/description below are optional context only. Missing or specialist job text is NOT a reason to skip assessment.
- If public information is limited, still return valid JSON with sse_rating "no", values [], and explain uncertainty in flags."""

ORG_RATING_GUIDELINES = """Organization SSE rating guidelines:
- "strong_yes": nonprofit, cooperative, community-based, or similar with clear SSE-aligned mission and values
- "weak_yes": mission-driven organization with partial SSE alignment or mixed structure
- "no": profit-focused, no discernible social mission, or insufficient public evidence of SSE alignment
- Never refuse to answer. Always return JSON even when evidence is thin."""

ORG_ASSESSMENT_JSON_INSTRUCTIONS = """IMPORTANT OUTPUT RULES:
- Return ONLY one JSON object. No markdown fences, preamble, apologies, or requests for more input.
- Never ask the user for a website URL or more information.
- If information is limited, return JSON anyway: use sse_rating "no", values [], nullable text fields as null, and note gaps in flags.
- Escape any double quotes inside string values.
- Do not include trailing commas or text outside the JSON."""

RATING_GUIDELINES = """Be strict: 
- "strong_yes" requires organizational commitment to SSE (nonprofit, coop, community-based) with clear stated values. Volunteer/internship roles can be strong_yes when mission + organization alignment are clear.
- "weak_yes" for: mission-driven roles in traditional corps, environmental/social roles, for-profits with transparent SSE alignment, OR volunteer/internship roles with partial SSE alignment.
- "no" for: profit-focused, no social mission, opaque/missing compensation (volunteer/internship work MUST be explicitly disclosed), or pure market-rate tech jobs."""

BATCH_RATING_GUIDELINES = """Be strict with ratings. Return JSON array ONLY, no preamble.
- "strong_yes" = nonprofit/coop/community org with clear SSE values OR volunteer/internship role with strong mission and clear organizational alignment
- "weak_yes" = mission element but mixed structure OR volunteer/internship role with partial SSE alignment
- "no" = profit-focused, no mission, or unpaid work without clear volunteer/internship disclosure"""

# Single job classification (for real-time during scraping)
SSE_CLASSIFICATION_PROMPT = f"""You are evaluating whether a job posting aligns with Solidarity Economy (SSE) principles.

{SSE_PRINCIPLES}

{EVALUATION_CRITERIA}

ANALYZE THIS JOB:

Organization: {{org_name}}
Role: {{job_title}}
Location: {{location}}
Salary: {{salary}}
Posted: {{posted_date}}

Description:
{{job_description}}

{ESCAPED_SSE_JSON_OBJECT_SPEC}

{RATING_GUIDELINES}
"""


def get_sse_classification_prompt(
    org_name: str,
    job_title: str,
    location: str,
    salary: str,
    job_description: str,
    posted_date: str,
) -> str:
    """Format the SSE classification prompt with job details.

    Args:
        org_name: Organization name
        job_title: Job title
        location: Job location
        salary: Salary or compensation info (or "Not specified")
        job_description: Full job description text
        posted_date: Date job was posted (ISO format preferred)

    Returns:
        Formatted prompt string ready for Gemini API
    """
    return SSE_CLASSIFICATION_PROMPT.format(
        org_name=org_name,
        job_title=job_title,
        location=location,
        salary=salary,
        posted_date=posted_date,
        job_description=job_description[:10000],
    )


# Batch classification (process multiple jobs in single API call to minimize quota usage)
SSE_BATCH_CLASSIFICATION_PROMPT = f"""You are evaluating whether job postings align with Solidarity Economy (SSE) principles.

{SSE_PRINCIPLES}

{EVALUATION_CRITERIA}

ANALYZE THESE JOBS (1-indexed):

{{job_list}}

{ESCAPED_SSE_JSON_ARRAY_SPEC}

{BATCH_RATING_GUIDELINES}
"""


def get_sse_batch_classification_prompt(jobs: list[dict]) -> str:
    """Format the batch SSE classification prompt with multiple job details.
    
    Args:
        jobs: List of job dicts with keys: org_name, title (or job_title), location,
             salary, description, posted_date
    
    Returns:
        Formatted prompt string ready for Gemini API
    """
    job_list_text = []
    for i, job in enumerate(jobs, 1):
        org_name = job.get("org_name") or job.get("organization", "Unknown")
        job_title = job.get("title") or job.get("job_title", "Unknown")
        location = job.get("location", "Unknown")
        salary = job.get("salary") or "Not specified"
        description = job.get("description", "")[:3000]  # Truncate for batch
        posted_date = job.get("posted_date", "")
        job_text = f"""
JOB {i}:
Organization: {org_name}
Role: {job_title}
Location: {location}
Salary: {salary}
Posted: {posted_date}
Description:
{description}
"""
        job_list_text.append(job_text)
    
    return SSE_BATCH_CLASSIFICATION_PROMPT.format(
        job_list="\n".join(job_list_text)
    )
