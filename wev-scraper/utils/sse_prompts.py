"""SSE Classification prompt templates for Gemini."""

# Keywords added to organization searches to find mission/values/governance info
# Focused on "information containers" that describe structure (bylaws, reports, etc.)
SSE_SEARCH_KEYWORDS = '(governance OR bylaws OR "articles of incorporation" OR "annual report" OR "impact report" OR "board of directors")'

SSE_JSON_FIELDS = """  "rating": "strong_yes",
  "confidence": 0.85,
  "reasoning": "2–4 concise sentences citing key evidence for the rating (max 400 characters — paraphrase to fit completely; do not truncate). Do NOT restate must_haves_met or nice_to_haves_met — those belong only in their arrays. Volunteer/internship positions are acceptable if mission is clear and disclosed upfront and volunteering or internship role is clearly stated.",
  "must_haves_met": ["short labels of must-have criteria met — not prose paragraphs"],
  "nice_to_haves_met": ["short labels of nice-to-have criteria met — not prose paragraphs"],
  "flags": ["any concerns", "ambiguities", "missing info"]"""

# Hard limits for the LLM: compose complete text that fits. If the model
# overshoots, OrganizationAssessor truncates with _smart_truncate.
LENGTH_LIMITED_FIELD_RULES = """LENGTH LIMITS FOR TEXT FIELDS (description_en, description_fr, mission_statement_en, mission_statement_fr, reasoning / sse_reasoning_en / sse_reasoning_fr, values_raw):
- Each field lists a maximum character count — the returned string MUST fit within it.
- Never cut off mid-word or mid-sentence in your own writing.
- If source material is longer, paraphrase and condense: keep vital facts, do not invent details, and do not drop essential meaning.
- Prefer shorter complete sentences over anything that would exceed the limit.
- End every string on a complete sentence with proper punctuation.
- Reasoning must be brief (2–4 sentences). Put criterion checklists only in must_haves_met / nice_to_haves_met — never expand those lists into reasoning prose."""

JSON_INSTRUCTIONS = """IMPORTANT:
- Return ONLY the JSON output, no commentary.
- Escape any double quotes inside string values (use \" or replace with single quotes).
- Do not include trailing commas or extra text outside the JSON.
"""

SSE_JSON_OBJECT_SPEC = f"""OUTPUT FORMAT (valid JSON only):
{{
{SSE_JSON_FIELDS}
}}

{LENGTH_LIMITED_FIELD_RULES}

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

{LENGTH_LIMITED_FIELD_RULES}

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
8. Governance model stated - nonprofit, cooperative, mutual, union
9. Investment in workers/volunteers - training, mentorship, learning opportunities, professional dev
10. Mission reinvestment - surplus goes to people/community/mission, not shareholders

AUTOMATIC NO FLAGS (triggers 'no' rating):
- Government / public-sector employer or role (municipality, federal/provincial agency,
  crown corp, school board, public hospital authority, etc.) — never SSE
- Conventional for-profit employer (private consultancy, public company, founder-owned
  business, corporate CSR / ESG / "social impact" team) — even when the role itself is
  environmental, community, or mission-flavored. Mission-driven work inside a
  traditional corporation is NOT Solidarity Economy.
- No social/environmental/community mission (pure profit-focused)
- Profit-maximization focused with no visible social good
- No reference to cooperation beyond internal team collaboration
- Mission-neutral language with generic CSR
- Vague or missing compensation AND no volunteer/internship disclosure (if salary is "Volunteer" or role is internship, treat as disclosed)
- Hidden unpaid work (e.g., "unpaid trial" rather than transparent volunteer role)"""

RATING_GUIDELINES = """Be strict:
- GOVERNANCE GATE for any Yes (strong_yes or weak_yes): the employer must be a
  nonprofit / cooperative / union / community association — NOT a conventional
  for-profit, consultancy, or public company. Environmental scientist / technician /
  engineer roles at private environmental consultancies, and "social impact" or CSR
  roles at tech/corporate employers, are "no" even when the work is mission-flavored.
  Do NOT use weak_yes for "mission-driven roles in traditional corporations."
- "strong_yes" requires SSE-eligible employer governance PLUS clear mission and
  values (registered charity / coop / community org with substantive public mission).
  Prefer strong_yes over weak_yes when the employer is a clear nonprofit/charity and
  the role clearly advances that mission (including wildlife rehab, food security,
  community programs, fellowships, parks/wilderness conservation, environmental
  justice advocacy). Volunteer/internship roles can be strong_yes when mission +
  organization alignment are clear.
- "weak_yes" ONLY for SSE-eligible employers (nonprofit/coop/union/community) that
  meet must-haves but show thinner participatory governance or thinner mission
  evidence — never for conventional for-profits with green/social marketing.
- "no" for: government/public-sector; conventional for-profit / private consultancy /
  corporate CSR; profit-focused roles; opaque/missing compensation (volunteer/
  internship work MUST be explicitly disclosed); pure market-rate tech jobs."""

# Organization-level SSE criteria (NOT job-post criteria).
# Used by OrganizationAssessor — never rate an org on job compensation/hours.
ORG_EVALUATION_CRITERIA = """EVALUATION CRITERIA (organization-level — NOT the job posting):

Rate the ORGANIZATION itself from research (official website, mission, governance,
public materials). Job title/description below are ONLY optional hints to identify
the employer — they must NOT raise or lower the SSE rating.

GOVERNANCE GATE (required for any Yes — strong_yes or weak_yes):
The organization must be a Solidarity Economy form, not a conventional for-profit
and not a government / public-sector body.
IMPORTANT — evidence over labels: score sse_rating from researched mission,
governance, ownership, and public materials — NOT from the "type" string alone.
An eligible type (nonprofit / cooperative / union) without mission/governance
evidence is not enough for Yes. Conversely, do not invent Yes from CSR slogans
when structure is a conventional for-profit.
Map "type" to one of the stored values only:
  nonprofit, cooperative, government, union, other.
SSE-eligible stored types (may be Yes when evidence supports it — type alone
is never sufficient):
  nonprofit, cooperative, union.
Never-SSE stored types (always No): government, other.
TYPE MAPPING (do not invent other type labels):
- nonprofit — registered charity / nonprofit corporation / association; ALSO use this
  for mutual societies, mutual-aid groups, community associations, and community
  projects when they are not clearly cooperatives. Prefer this when public materials
  show nonprofit/charity registration, an independent board serving a non-proprietary
  mission, or clear non-distribution constraints — not merely a mission-driven
  private business. A conventional board + executive director is still nonprofit
  when charity/nonprofit evidence is present — do NOT require cooperative labels.
- cooperative — worker, consumer, producer, multi-stakeholder coop, or credit union
- union — labour union
- government — public agency / municipality / crown corp / school board / etc. → "no"
  (NOT political parties — parties are not public bodies; see "other" below)
- other — conventional for-profit / private company / privately owned school or
  program / political party or electoral organization / residual → "no"
  (even if the mission mentions environment, community, children, nature, or
  "respect for people"; even if founded by an educator with a clear social purpose)
CRITICAL — charities are never "other" for lacking cooperative governance:
- Registered charities and community environmental / social nonprofits with a clear
  public-benefit mission → type "nonprofit" (never "other" merely because they lack
  cooperative, mutualist, or SSE-branded governance language).
- "other" means for-profit / private ownership / political party / residual — NOT
  "standard nonprofit" or "board+ED charity".
There is no "social enterprise" type. Mission-driven private businesses are "other".
Political parties and electoral organizations → type "other", rating "no" (never SSE;
never "government"; do not store as nonprofit Yes even if incorporated as a society).
Public service is not SSE. CSR/greenwashing in a for-profit is not SSE.
Mission-driven private enterprise is not SSE.

MUST-HAVES (required for any Yes, in addition to the governance gate):
1. Clear purpose beyond profit - mission prioritizes people/community/planet
2. Impact described intentionally - not CSR/greenwashing or marketing slogans
3. Organization's work contributes to social/community/environmental good
(Only these three. Do NOT copy job must-haves 4–5 such as "Transparent compensation"
or "Clear job expectations" into must_haves_met — those are job-posting criteria only.)

NICE-TO-HAVES (strengthen Yes rating):
4. Solidarity-driven culture - cooperation, mutual support, collective/community language
5. Participatory governance - workers/members have voice in decisions
   (Many nonprofits use a conventional board + director hierarchy; that alone does
   NOT disqualify them and does NOT force type "other" or rating "no".)
6. Explicit SSE governance model in public materials
7. Investment in people - training, mentorship, education, leadership development
8. Mission reinvestment - surplus goes to people/community/mission, not private shareholders

AUTOMATIC NO FLAGS (triggers 'no' rating):
- type is government or other (never SSE)
- Government / public-sector employer (any level) — never SSE
- Political party / electoral organization — never SSE (type "other", not "government")
- Conventional for-profit with only CSR / ESG / "we respect the environment" language
- Privately owned / founder-owned business or private school/program with a social
  or environmental mission but no nonprofit, cooperative, or union governance
  evidence → type "other", rating "no"
- No social/environmental/community mission (pure profit-focused)
- Profit-maximization / competitiveness-first with social language as marketing
- Mission-neutral language with only generic CSR
- Do NOT flag missing job salary, hours, contract type, or truncated job text —
  those are job-posting concerns, not organization identity
- Do NOT put "Transparent compensation" or "Clear job expectations" in
  must_haves_met / nice_to_haves_met / flags — org rubric has no compensation criteria
- NEVER score is_sse / sector / language / type from SOURCE DESCRIPTION or listing
  notes — those fields require official-website / supporting web research (or null)
- NEVER rate a registered charity / community nonprofit "no" or type "other" solely
  because governance is board+ED or lacks cooperative labels"""

ORG_RATING_GUIDELINES = """Be strict about the ORGANIZATION (ignore job-post completeness):
- Base the rating on mission/governance evidence from research, not the type label alone
- Type is necessary but not sufficient: nonprofit/cooperative/union still need must-haves
- Decide type BEFORE rating. If governance evidence only shows a private/founder-owned
  business (including private schools and mission-driven education programs), type
  MUST be "other" and rating MUST be "no"
- Registered charity / community environmental or social nonprofit with a clear
  public-benefit mission → type "nonprofit" and AT LEAST "weak_yes" (usually
  "strong_yes" when mission evidence is clear). Never "other"/"no" merely for
  lacking cooperative or SSE-labeled governance; board+ED is SSE-eligible.
- "strong_yes" = nonprofit / cooperative / union with clear people/community/planet
  mission. Prefer strong_yes (do not default to weak_yes) when ANY of these hold:
  • registered charity / clear non-distribution / public-benefit constraints
  • mutual-aid, collective care, or solidarity / "entraide" language in public materials
  • flat or non-hierarchical structure, or meaningful participatory governance
  • established community / social-economy org or grantmaking foundation with a
    clear public-benefit mission — including conventional board + ED
  • civil-rights / anti-racism / ethnocultural community leagues and similar
    advocacy nonprofits with a clear people/community mission
  Explicit cooperative labels are NOT required for strong_yes.
- "weak_yes" = eligible SSE type that meets must-haves but has thin/partial mission
  evidence OR ambiguous whether the entity is truly nonprofit vs private — NOT merely
  because a clear nonprofit uses board/ED structure, and NOT merely because it is a
  nonprofit without coop labels. Nonprofit or foundation status alone is never
  automatic Yes — still apply must-haves and automatic-no flags.
  NEVER government or other.
- "no" = government, other/conventional for-profit / privately owned mission business
  / political party (type "other"), or no substantive social/environmental mission
- Greenwashing test: environmental, nature, outdoor-education, wellness, or
  "community" mission without nonprofit/coop/union governance → "no" (type "other")
  — but a registered charity or clear community nonprofit with that mission is
  nonprofit Yes, not this greenwashing case
- Never rate "no" because a job description is truncated or lacks compensation details"""

BATCH_RATING_GUIDELINES = """Be strict with ratings. Return JSON array ONLY, no preamble.
- GOVERNANCE GATE: Yes only when the employer is nonprofit / coop / union / community —
  never conventional for-profit, consultancy, or corporate CSR / "social impact" teams.
- "strong_yes" = SSE-eligible employer with clear SSE values OR volunteer/internship role
  with strong mission and clear organizational alignment at an SSE-eligible employer
- "weak_yes" = SSE-eligible employer that meets must-haves but has weaker participatory
  governance / thinner mission evidence (nonprofit legal form alone is not automatic Yes).
  Do NOT use weak_yes for mission-driven roles inside traditional corporations.
- "no" = government/public-sector, conventional for-profit / CSR roles, profit-focused,
  no mission, or unpaid work without clear volunteer/internship disclosure"""

# Single job classification (for real-time during scraping)
SSE_CLASSIFICATION_PROMPT = f"""You are evaluating whether a job posting aligns with Solidarity Economy (SSE) principles.

{SSE_PRINCIPLES}

{EVALUATION_CRITERIA}

ANALYZE THIS JOB:

Organization (scrape metadata — may be stale): {{org_name}}
Role: {{job_title}}
Location: {{location}}
Salary: {{salary}}
Posted: {{posted_date}}

Description:
{{job_description}}

EMPLOYER IDENTITY (mandatory):
- The hiring employer is whoever the posting itself describes (e.g. an "About …"
  section, application/host org, or explicit employer name in the body).
- The Organization metadata field above is only a scrape hint — it can be wrong,
  outdated, or a related brand. If it conflicts with a clear employer in the
  description, trust the description and use that name in reasoning.
- Supporting web evidence must not introduce a third unrelated organization.

{RATING_GUIDELINES}

{ESCAPED_SSE_JSON_OBJECT_SPEC}
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
