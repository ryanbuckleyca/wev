# Canadian SSE Governance Taxonomy v5.1 Changes

**Date:** 2025-01-23  
**Previous Version:** v5  
**New Version:** v5.1

## Summary

Updated the taxonomy to clarify that Indigenous Nation enterprises are included within the SSE framework when they exercise community self-governance, consistent with global SSE frameworks (RIPESS, UN Resolution 77/281). Made minor reclassifications for two organizations that lack democratic accountability.

---

## Changes Made to Word Document

### 1. Updated GOV_3_2 Category Name

**Previous:**  
`GOV_3_2 — Indigenous & Sovereign Land Trust`

**Updated to:**  
`GOV_3_2 — Indigenous Nation Land & Resource Stewardship`

### 2. Added GOV_3_2 Clarification Text

**New paragraph added after "Identifying Markers":**

> Includes enterprises owned and operated by Indigenous Nations, First Nations, Tribal Nations, and Indigenous peoples exercising community self-governance over land, resources, and economic development. These represent community self-governance distinct from settler-colonial state administration. Global SSE frameworks recognize Indigenous Nation enterprises as core SSE actors when they embody democratic governance, social purpose, and community ownership principles.

### 3. Added Category 4 Clarifying Note

**Added to Category 4: Participatory NPOs description:**

> Note: This category refers to entities established by settler-colonial state governments and their administrative bodies. Indigenous Nation governments exercising community self-governance are classified under GOV_3_2, consistent with global SSE frameworks that distinguish Indigenous self-determination from state administration.

### 4. Added Three New Bibliography Entries

1. **RIPESS (Intercontinental Network for the Promotion of Social Solidarity Economy). 2025.** _Position Papers and Regional Frameworks._ RIPESS. Available at: https://www.ripess.org

2. **Sumner, J., Llewelyn, L., & Quarter, J. 2019.** _Social Economy and Indigenous Economic Development in Canada._ UN Inter-Agency Task Force on Social and Solidarity Economy Knowledge Hub for the SDGs. Available at: https://unsse.org

3. **United Nations General Assembly. 2023.** _Resolution 77/281: Promoting the social and solidarity economy for sustainable development._ UN Doc. A/RES/77/281. Available at: https://undocs.org/A/RES/77/281

---

## Organizational Reclassifications Required

### Organizations Requiring Reclassification to EXCLUDED_NON_SSE

1. **Gates Foundation** (org ID: 1)
   - **Current:** GOV_4_1 (Member-Governed Non-Profit)
   - **Should be:** EXCLUDED_NON_SSE
   - **Reason:** Self-perpetuating trustee board with no voting membership. Violates democratic accountability principle.

2. **Carnegie Foundation** (org ID: 1660)
   - **Current:** GOV_4_1 (Member-Governed Non-Profit)
   - **Should be:** EXCLUDED_NON_SSE
   - **Reason:** Private foundation with self-perpetuating board and no voting membership. Violates democratic accountability principle.

### Organizations Confirmed Correct

3. **Nupqu Resource LP** (org ID: 2311)
   - **Current:** GOV_3_2 (Indigenous Nation Land & Resource Stewardship)
   - **Status:** ✓ CORRECT
   - **Reason:** Owned by Ktunaxa Nation, exercises Indigenous community self-governance over natural resources. Aligns with global SSE frameworks' recognition of Indigenous Nation enterprises.

4. **Holland Bloorview Kids Rehabilitation Hospital** (org ID: 581)
   - **Current:** GOV_4_1 (Member-Governed Non-Profit)
   - **Status:** ✓ CORRECT
   - **Reason:** Has voting membership that elects board. Meets democratic accountability requirements.

---

## Implementation Status

- [x] Word document updated (Canadian_SSE_CED_Governance_Taxonomy_Unified-v5.1.docx)
- [x] Python taxonomy code updated (wev-scraper/utils/governance_taxonomy.py v1.2)
- [x] Reclassification script created (wev-scraper/scripts/reclassify_governance_orgs.py)
- [ ] **PENDING:** Run reclassification script on production database for Gates Foundation & Carnegie Foundation

---

## Rationale

This update clarifies a critical distinction in SSE frameworks: the difference between **community self-governance** (Indigenous Nations exercising sovereignty) and **settler-colonial state administration** (government bureaucracies).

Global SSE frameworks consistently recognize Indigenous Nation enterprises as core SSE actors when they embody democratic governance, social purpose, and community ownership principles:

- **RIPESS** explicitly includes Indigenous solidarity economies across all continents
- **UN Resolution 77/281** recognizes Indigenous peoples' enterprises as integral to SSE
- **UN SSE Knowledge Hub** documents Indigenous economic development as SSE practice in Canada

The taxonomy now reflects this global consensus.
