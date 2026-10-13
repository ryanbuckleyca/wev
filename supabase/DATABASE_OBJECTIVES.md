# wev Database: Mission Statement and Mission Objectives

Database design, Step 1 (Database Design for Mere Mortals, Chapter 5). Agreed October 11, 2026.

## Mission Statement

The purpose of the wev database is to maintain reliable data on SSE job opportunities and the organizations that offer them, in support of our services to job seekers and our analysis of the SSE labour market.

## Mission Objectives

### Job postings

1. Keep a record of every job posting exactly as it was collected.
2. Keep track of where each posting was collected from.
3. Identify postings from different boards that are the same job.
4. Support search and discovery of jobs.

### Organizations

5. Maintain complete organization information.
6. Maintain organization profiles, including sector, governance type, and values.

### Skills

7. Maintain the raw skills each posting describes.
8. Maintain a reference list of standard skills (ESCO).

### Data trust

9. Keep track of how each LLM-derived value was produced, including the model and prompt version.
10. Keep track of corrections made to extracted data.

### Users

11. Maintain complete user account and contact information.
12. Store the text extracted from user CVs and the skills they match.
13. Keep track of each user's saved jobs, watch terms, and saved searches.

### Matching and outreach

14. Match jobs to users.
15. Recommend jobs to users.
16. Alert users when new jobs match their watch terms or saved searches.
17. Support production of the biweekly newsletter.

### Analysis

18. Analyze skill demand, including frequency, co-occurrence, and profiles by sector and governance type.
19. Analyze job title patterns across sectors.
20. Analyze trends in postings and skill demand over time.

### Future

21. Provide job data to partner organizations, such as university career centers, through a public API.

## Details set aside for later design steps

- Date each posting was first collected.
- Model and prompt version recorded on each LLM-derived value.
- Original and corrected values for each manual fix.
- Links between duplicate postings from different boards.
- The top 30 to 50 skills cutoff for frequency analysis.
- Example sectors and governance types, such as cooperatives and nonprofits.
- Not tracked today, so outside the objectives: whether a posting is still live, and user-reported data errors.
