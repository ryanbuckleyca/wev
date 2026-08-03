# Backfill review — next 50 batch (hardened listing/name gates)

Source: `/tmp/backfill_org_minimal_50_20260802_180300.log`
Orgs with update blocks: **50**
Run summary: `{'mode': 'minimal', 'processed': 50, 'updated': 50, 'skipped': 0, 'skipped_completed': 0, 'skipped_reviewed': 0, 'errors': 0, 'dry_run': False, 'limit': 50, 'last_id': 469, 'resume_with': '--after-id 469'}`

Preceded by org **366** fix: `/tmp/backfill_org366_fix_20260802_175400.log` — website cleared to null (not Nouryon); sse=`no`; listing job title `Rembourreur` used.

## Notable issues

- Name-token gate (batch-time, pre-soften) rejected some plausible employer sites (acronym / short brand pages):
  - `guepe.qc.ca` for Groupe uni des éducateurs… → **org 385**
  - `ccrweb.ca` for Canadian Council for Refugees → **org 398**
  - `telescope.ca` for Réseau Télescope → **org 418**
  - `architek.com` for The Architek Group → **org 455**
  - After the batch, non-numbered overlap was loosened to ≥2 identity tokens + accent folding; numbered Québec corps still require both digit groups.
  - Follow-up also strips weak fillers (`group`/`groupe`/`réseau`/`des`/`les`/`pour`/…) so short brand homepages can pass on the distinctive token alone.
- Other `website_unconfirmed` in this batch were **not** name-token rejects (left alone):
  - **407** Équiterre — `equiterre.org` rejected as not in Tavily evidence (homepage fetch HTTP 429)
  - **413** Victoria Community Food Hub — `victoriafoodhub.org` DNS failure / not in evidence
- Gemini 429s throughout; Groq/Cerebras often succeeded. Cerebras hit a 20s rate-limit wait mid-batch.
- Many macommunaute listing URLs returned HTTP 404 on fetch (host without `www`); job title still entered the Tavily query.

## Addendum — name-token gate reprocess (2026-08-02)

Targeted `--publish --mode full --overwrite-recent-hours 48` for the four name-token rejects only (not a new 50). Org **366** untouched.

Logs:
- `/tmp/backfill_gate_reprocess_20260802_183000.log` (385, 398, 418, 455 — first pass)
- `/tmp/backfill_gate_reprocess_418_455_20260802_184000.log` (418, 455 — after filler-stop tweak)

| org | name | website before | website after | restored? |
|-----|------|----------------|---------------|-----------|
| 385 | Groupe uni des éducateurs… | `(none)` | `https://www.guepe.qc.ca` | yes |
| 398 | Canadian Council for Refugees… | `(none)` | `https://ccrweb.ca` | yes |
| 418 | Réseau Télescope | `(none)` | `https://telescope.ca` | yes (2nd pass) |
| 455 | The Architek Group | `(none)` | `https://architek.com` | yes (2nd pass) |

First pass with ≥2-token soft gate restored **385** + **398**. **418** / **455** still failed because homepages only show the brand word (`Télescope`, `Architek`) while the gate still required a second filler token (`réseau` / `group`). After adding those fillers to `_NAME_LEGAL_STOP`, both confirmed and PATCHed.

## 378 — La Maison Tournesols

- **sse**: `(none)` → `weak_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `care-health-social-services`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Community', 'Help Others', 'Help Society']`
- **description**:
  - before: (none)
  - after: A community organization providing support to seniors in vulnerable situations.
- **sse_reasoning**:
  - before: (none)
  - after: Rated weak_yes due to inferred mission to support seniors and community involvement.
- **flags**: `(none)` → `['description via=inferred', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 379 — Comité Logement Ahuntsic-Cartierville

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `housing-collective-real-estate`
- **language**: `(none)` → `fr`
- **website**: `(none)` → `https://comitelogement.com`
- **values**: `(none)` → `['Community', 'Help Society']`
- **mission**:
  - before: (none)
  - after: To defend tenants’ rights, promote social housing and improve living conditions for residents of Ahuntsic‑Cartierville.
- **description**:
  - before: (none)
  - after: The Comité Logement Ahuntsic-Cartierville (CLAC) is a community association that supports, informs and assists tenants in defending their rights to improve their housing conditions and quality of life… (+1 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: CLAC is a nonprofit tenant association that explicitly works to defend tenant rights and improve housing conditions, showing a clear purpose beyond profit and measurable social impact. Its community‑based governance and solidarity focus further align with SSE principles, leading to a strong_yes rati… (+3 chars truncated from log)
- **flags**: `(none)` → `['description via=inferred', 'mission via=extracted', 'values via=absent', 'values_ungrounded', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 380 — L’Anonyme

- **sse**: `(none)` → `no`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `[]`
- **sse_reasoning**:
  - before: (none)
  - after: No verifiable evidence of nonprofit, cooperative, or union governance for L'Anonyme was found; only job board and salary listings appear, which do not establish a Solidarity Economy structure.
- **flags**: `(none)` → `['website_unavailable', 'description via=absent', 'mission via=absent', 'values via=absent', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 381 — Wildlife Preservation Canada

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `en`
- **values**: `(none)` → `['Environment', 'Help Society', 'Community']`
- **description**:
  - before: (none)
  - after: Wildlife Preservation Canada is a Canadian nonprofit that works to protect wildlife, especially reptiles, amphibians and snakes, through research, conservation projects and community outreach across O… (+7 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: Wildlife Preservation Canada is a registered nonprofit whose stated purpose is wildlife conservation, clearly beyond profit, and it reports concrete impacts through research and community projects, meeting all three must‑haves and reinvesting any surplus in its mission.
- **flags**: `(none)` → `['website_unavailable', 'description via=inferred', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 382 — Société écocitoyenne de Montréal

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `fr`
- **website**: `(none)` → `https://www.sem-montreal.org`
- **values**: `(none)` → `['Environment', 'Community', 'Help Society']`
- **mission**:
  - before: (none)
  - after: Our mission is to inform, raise awareness and mobilise the population on urban environmental issues, fostering sustainable practices and community action in Montreal.
- **sse_reasoning**:
  - before: (none)
  - after: The organization is a registered nonprofit with a clear mission to educate and mobilise the public on urban environmental issues, demonstrating purpose beyond profit and tangible social and ecological impact.
- **flags**: `(none)` → `['description via=absent', 'description_ungrounded', 'mission via=inferred', 'values via=absent', 'values_ungrounded', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 383 — Auvrix Energy

- **sse**: `(none)` → `no`
- **type**: `(none)` → `other`
- **sector**: `(none)` → `technology-digital-infrastructure`
- **language**: `(none)` → `en`
- **website**: `(none)` → `https://www.auvrixenergy.com`
- **values**: `(none)` → `[]`
- **mission**:
  - before: (none)
  - after: To advance breakthrough energy and materials technologies that enable resilient, high‑performance industrial systems for a sustainable future.
- **description**:
  - before: (none)
  - after: Auvrix Energy is an early‑stage deep‑technology company developing scientific pathways for next‑generation, high‑density industrial energy systems and advanced materials.
- **sse_reasoning**:
  - before: (none)
  - after: Auvrix Energy is a privately owned for‑profit deep‑tech startup with no evidence of nonprofit, cooperative, or union governance and its purpose is commercial technology development, not a public‑benefit mission.
- **flags**: `(none)` → `['description via=extracted', 'mission via=inferred', 'values via=absent', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 384 — Inspirit Foundation

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `community-civic-infrastructure`
- **language**: `(none)` → `bilingual`
- **website**: `(none)` → `https://inspiritfoundation.org`
- **values**: `(none)` → `['Community', 'Help Society', 'Environment', 'Diversity', 'Moral Fulfillment']`
- **description**:
  - before: (none)
  - after: Inspirit Foundation is a Canadian charitable foundation that provides grant funding to innovative projects advancing media, climate action, and community wellbeing across Canada.
- **sse_reasoning**:
  - before: (none)
  - after: The foundation is a registered nonprofit with a clear purpose beyond profit, explicitly aims to create social and environmental impact, and funds projects that benefit community and ecosystem health, meeting all SSE must‑haves.
- **flags**: `(none)` → `['description via=extracted', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'values_ungrounded', 'language:bilingual via=public_language', 'language_reason:name_llm=en']`

## 385 — Groupe uni des éducateurs-naturalistes et professionnels en environnement

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Community', 'Environment', 'Help Society', 'Knowledge', 'Group & Team']`
- **sse_reasoning**:
  - before: (none)
  - after: GUEPE is a nonprofit that runs the Cap‑Saint‑Jacques nautical site and offers nature‑based educational activities, showing a clear purpose beyond profit and direct environmental and community impact.
- **flags**: `(none)` → `['website_unconfirmed', 'website_geo_conflict', 'description via=absent', 'mission via=absent', 'values via=absent', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 389 — SANEXEN Environmental Services Inc.

- **sse**: `(none)` → `no`
- **type**: `(none)` → `other`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `bilingual`
- **website**: `(none)` → `https://sanexen.com`
- **values**: `(none)` → `[]`
- **mission**:
  - before: (none)
  - after: Our mission is to turn current environmental challenges into durable solutions that benefit future generations.
- **description**:
  - before: (none)
  - after: Transform today's environmental challenges into sustainable solutions for future generations. Proven on‑site environmental solutions integrated into every project for a sustainable future.
- **sse_reasoning**:
  - before: (none)
  - after: Sanexen Environmental Services Inc. operates as a for‑profit environmental consulting firm with no evidence of nonprofit, cooperative, or union governance; its public materials focus on service delivery rather than solidarity‑economy principles, so it does not meet SSE criteria.
- **flags**: `(none)` → `['description via=extracted', 'mission via=inferred', 'values via=absent', 'language:bilingual via=public_language', 'language_reason:name_llm=en']`

## 391 — Corporation de développement communautaire de l’agglomération de Longueuil

- **sse**: `(none)` → `no`
- **type**: `(none)` → `government`
- **sector**: `(none)` → `care-health-social-services`
- **language**: `(none)` → `fr`
- **website**: `(none)` → `https://www.longueuil.quebec`
- **values**: `(none)` → `[]`
- **mission**:
  - before: (none)
  - after: Its mission is to improve living conditions, foster community environments, and develop the potential of individuals and neighbourhoods through cooperative social development processes.
- **description**:
  - before: (none)
  - after: The Corporation de développement communautaire de l’agglomération de Longueuil is a municipal agency of the City of Longueuil that coordinates social development initiatives and community projects acr… (+22 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: The corporation is a municipal department of Ville de Longueuil, a government entity, and government bodies are excluded from Solidarity Economy eligibility.
- **flags**: `(none)` → `['description via=inferred', 'mission via=inferred', 'values via=absent', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 395 — Maison Tucker House

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `bilingual`
- **website**: `(none)` → `https://maisontuckerhouse.ca`
- **values**: `(none)` → `['Community', 'Environment', 'Help Society']`
- **description**:
  - before: (none)
  - after: Maison Tucker House is a community‑focused charitable retreat centre rooted in nature, offering environmental learning and stewardship on 30 acres of historic land in Clarence‑Rockland, Ontario. (desc… (+21 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: Maison Tucker House operates as a registered charity providing environmental learning and community‑focused retreat experiences, clearly prioritising people and planet over profit and meeting all organizational must‑haves. (reasoning via=inferred)
- **flags**: `(none)` → `['description via=inferred', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'values_ungrounded', 'language:bilingual via=llm_name', 'language_reason:name_llm=bilingual']`

## 397 — DYWIDAG Systems International

- **sse**: `(none)` → `no`
- **type**: `(none)` → `other`
- **language**: `(none)` → `en`
- **values**: `(none)` → `[]`
- **description**:
  - before: (none)
  - after: DYWIDAG Systems International is a global engineering and construction company that provides solutions for civil infrastructure projects worldwide.
- **sse_reasoning**:
  - before: (none)
  - after: The employer is a private for‑profit GmbH with no nonprofit, cooperative, or union governance, and its purpose is commercial construction; therefore it does not meet SSE criteria.
- **flags**: `(none)` → `['website_unavailable', 'description via=inferred', 'mission via=absent', 'values via=absent', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 398 — Canadian Council for Refugees - Conseil canadien pour les réfugiés

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `community-civic-infrastructure`
- **language**: `(none)` → `bilingual`
- **values**: `(none)` → `['Help Society', 'Community', 'Diversity', 'Moral Fulfillment', 'Honesty and Integrity']`
- **sse_reasoning**:
  - before: (none)
  - after: CCR is a registered charity that prioritises people over profit, clearly articulates its mission to protect refugee rights, and operates through a network of member organisations. Its governance is board‑based with diverse stakeholder representation, meeting all SSE must‑haves and several nice‑to‑ha… (+4 chars truncated from log)
- **flags**: `(none)` → `['website_unconfirmed', 'website_geo_conflict', 'description via=absent', 'mission via=absent', 'values via=absent', 'language:bilingual via=llm_name', 'language_reason:name_llm=bilingual']`

## 399 — Centre de recherche sociale appliquée

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `community-civic-infrastructure`
- **language**: `(none)` → `fr`
- **website**: `(none)` → `https://www.lecrsa.ca`
- **values**: `(none)` → `['Community', 'Help Society', 'Diversity', 'Environment', 'Knowledge']`
- **description**:
  - before: (none)
  - after: The Centre de recherche sociale appliquée (CRSA) supports the empowerment of organizations and communities through applied social research, collaborative projects, and knowledge sharing.
- **sse_reasoning**:
  - before: (none)
  - after: CRSA is a nonprofit research centre whose mission focuses on community empowerment and social transformation, meeting all three must‑haves. Its emphasis on solidarity, collaborative governance, and reinvestment of results into people and communities satisfies the nice‑to‑haves, supporting a strong S… (+10 chars truncated from log)
- **flags**: `(none)` → `['description via=extracted', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'values_ungrounded', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 400 — Private residence

- **sse**: `(none)` → `no`
- **type**: `(none)` → `other`
- **values**: `(none)` → `[]`
- **sse_reasoning**:
  - before: (none)
  - after: The employer is a private homeowner hiring a seasonal maintenance hand. It is a for‑profit individual owner with no nonprofit, cooperative, or union governance, so it does not satisfy Solidarity Economy criteria.
- **flags**: `(none)` → `['website_unavailable', 'description via=absent', 'mission via=absent', 'values via=absent', 'language:unset via=unknown', 'language_reason:insufficient_signal']`

## 401 — Coastal Action

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `en`
- **website**: `(none)` → `https://www.coastalaction.org`
- **values**: `(none)` → `['Environment', 'Community', 'Help Society', 'Knowledge', 'Group & Team']`
- **mission**:
  - before: (none)
  - after: Our mission is to protect and restore the environment through research, education, action, and community engagement.
- **description**:
  - before: (none)
  - after: Coastal Action is a non‑profit environmental organization based in Mahone Bay, Nova Scotia, working across the South Shore and Atlantic Canada to protect and restore ecosystems through research, educa… (+39 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: Coastal Action is a registered charity operating as a nonprofit with a clear purpose beyond profit and intentional impact on ecosystems and communities, satisfying all three must‑haves and earning a strong_yes rating.
- **flags**: `(none)` → `['description via=extracted', 'mission via=extracted', 'values via=extracted', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 402 — City of Mississauga

- **sse**: `(none)` → `no`
- **type**: `(none)` → `government`
- **language**: `(none)` → `bilingual`
- **website**: `(none)` → `https://www.mississauga.ca`
- **values**: `(none)` → `[]`
- **mission**:
  - before: (none)
  - after: The City’s purpose is to build a vibrant, sustainable, and inclusive community where residents can thrive, through responsible governance, infrastructure, and climate‑action initiatives.
- **description**:
  - before: (none)
  - after: The City of Mississauga is Canada’s sixth‑largest municipality, delivering municipal services, planning, and community programs to a diverse population of over 700,000 residents.
- **sse_reasoning**:
  - before: (none)
  - after: The employer is a municipal government, which is classified as a government entity and therefore does not meet the governance gate for Solidarity Economy eligibility.
- **flags**: `(none)` → `['description via=inferred', 'mission via=inferred', 'values via=absent', 'language:bilingual via=public_language', 'language_reason:name_llm=en']`

## 404 — tbmaestro inc.

- **sse**: `(none)` → `no`
- **type**: `(none)` → `other`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `bilingual`
- **website**: `(none)` → `https://www.tbmaestro.com`
- **values**: `(none)` → `['Environment', 'Community', 'Help Society']`
- **description**:
  - before: (none)
  - after: tbmaestro provides independent advice for buildings and infrastructure, offering asset audits, management strategies, and software tools to help clients maximize asset value and improve sustainability… (+1 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: tbmaestro operates as a private for‑profit consultancy; its website shows a commercial business model without nonprofit or cooperative governance, failing the governance gate required for Solidarity Economy alignment.
- **flags**: `(none)` → `['description via=inferred', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'language:bilingual via=public_language', 'language_reason:insufficient_signal']`

## 405 — La Bouffe du Carrefour

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `agriculture-food-systems`
- **language**: `(none)` → `fr`
- **website**: `(none)` → `https://labouffeducarrefour.org`
- **values**: `(none)` → `['Community', 'Help Society', 'Environment', 'Diversity', 'Group & Team']`
- **sse_reasoning**:
  - before: (none)
  - after: The organization is a registered nonprofit that operates a community kitchen, mobile market and shared gardens, clearly prioritising people and planet over profit. Its mission and services explicitly aim to improve food access, health and community cohesion, meeting all three must‑haves and several… (+14 chars truncated from log)
- **flags**: `(none)` → `['description via=absent', 'description_ungrounded', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'values_ungrounded', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 407 — Équiterre

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Environment', 'Community', 'Help Society', 'Diversity', 'Moral Fulfillment']`
- **sse_reasoning**:
  - before: (none)
  - after: Équiterre is a registered nonprofit whose mission focuses on environmental protection, social justice and local economy, clearly beyond profit. Its activities include research, advocacy and community projects, showing intentional impact and contribution to the public good.
- **flags**: `(none)` → `['website_unconfirmed', 'website_geo_conflict', 'description via=absent', 'mission via=absent', 'values via=absent', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 408 — Sarah's Harvest

- **sse**: `(none)` → `no`
- **type**: `(none)` → `other`
- **sector**: `(none)` → `agriculture-food-systems`
- **language**: `(none)` → `en`
- **values**: `(none)` → `[]`
- **description**:
  - before: (none)
  - after: Sarah's Harvest is the largest certified organic vegetable producer in Yukon, operating from Lendrum Ross Farm about 50 km north of Whitehorse.
- **sse_reasoning**:
  - before: (none)
  - after: Sarah's Harvest operates as a private organic farm with no evidence of nonprofit, cooperative, or union governance; therefore it does not meet the governance gate for the Solidarity Economy.
- **flags**: `(none)` → `['website_unavailable', 'description via=inferred', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 410 — Georgian Bay Land Trust

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `en`
- **website**: `(none)` → `https://www.gblt.org`
- **values**: `(none)` → `['Environment', 'Community', 'Help Society']`
- **mission**:
  - before: (none)
  - after: To preserve natural areas of ecological or historical significance on Georgian Bay and the North Channel, ensuring the protection of biodiversity, water quality, and cultural heritage for present and… (+19 chars truncated from log)
- **description**:
  - before: (none)
  - after: Georgian Bay Land Trust (GBLT) is a Toronto‑based charitable land trust that protects the wilderness lands and waters of Georgian Bay and the North Channel of Lake Huron, a UNESCO World Biosphere Rese… (+76 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: Georgian Bay Land Trust is a registered charitable land trust operating as a nonprofit with a clear purpose to protect ecosystems, meeting all three must‑haves; its environmental mission and governance support a strong_yes rating.
- **flags**: `(none)` → `['description via=extracted', 'mission via=inferred', 'values via=absent', 'values_ungrounded', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 412 — Cochrane Polar Bear Habitat

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `en`
- **website**: `(none)` → `https://www.polarbearhabitat.ca`
- **values**: `(none)` → `['Environment', 'Help Society', 'Community', 'Knowledge']`
- **mission**:
  - before: (none)
  - after: Our mission is to provide exceptional animal care, engage the public through education, and support polar bear conservation.
- **description**:
  - before: (none)
  - after: The Cochrane Polar Bear Habitat is Canada’s only wildlife centre devoted exclusively to polar bears, offering a 24‑acre sub‑arctic environment, education programs, and conservation support.
- **sse_reasoning**:
  - before: (none)
  - after: Cochrane Polar Bear Habitat is a registered nonprofit whose mission centers on polar bear care, education and conservation, meeting all three SSE must‑haves and showcasing clear societal and environmental impact.
- **flags**: `(none)` → `['description via=extracted', 'mission via=inferred', 'values via=inferred', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 413 — Victoria Community Food Hub Society

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `agriculture-food-systems`
- **language**: `(none)` → `en`
- **values**: `(none)` → `['Community', 'Environment', 'Help Society', 'Honesty and Integrity', 'Diversity']`
- **sse_reasoning**:
  - before: (none)
  - after: The Victoria Community Food Hub Society is a registered non‑profit charity whose mission centers on community food access, environmental sustainability, and local producer collaboration. Its governance includes a community board with participatory decision‑making, satisfying all three must‑haves, so… (+33 chars truncated from log)
- **flags**: `(none)` → `['website_unconfirmed', 'website_geo_conflict', 'description via=absent', 'mission via=absent', 'values via=absent', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 414 — Shively Diversified Management Services

- **sse**: `(none)` → `no`
- **type**: `(none)` → `other`
- **language**: `(none)` → `en`
- **values**: `(none)` → `[]`
- **sse_reasoning**:
  - before: (none)
  - after: Shively Diversified Management Services appears to be a private for‑profit consulting firm with no evidence of nonprofit, cooperative, or union status. The organization lacks public statements of a mission beyond profit or a governance model aligned with solidarity‑economy principles, leading to a '… (+11 chars truncated from log)
- **flags**: `(none)` → `['website_unavailable', 'description via=absent', 'mission via=absent', 'values via=absent', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 415 — Le Centre des femmes de Saint-Laurent

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `community-civic-infrastructure`
- **language**: `(none)` → `fr`
- **website**: `(none)` → `https://www.cfstl.org`
- **values**: `(none)` → `['Community', 'Help Society', 'Diversity']`
- **description**:
  - before: (none)
  - after: The Centre des femmes de Saint‑Laurent is a warm, open space for all women in the Saint‑Laurent borough of Montréal, offering community‑focused services, education, and advocacy to empower women and p… (+23 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: The Centre is a registered nonprofit whose mission openly prioritises women’s empowerment and collective rights, indicating a clear purpose beyond profit and intentional social impact. Its community‑based activities align with solidarity‑economy values.
- **flags**: `(none)` → `['description via=inferred', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 416 — Microcrédit Montréal

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `financial-insurance-services`
- **language**: `(none)` → `fr`
- **website**: `(none)` → `https://microcreditmontreal.ca`
- **values**: `(none)` → `['Community', 'Help Others', 'Help Society', 'Diversity', 'Environment']`
- **description**:
  - before: (none)
  - after: Microcrédit Montréal provides micro‑credit and personalized support to Montreal entrepreneurs and internationally trained professionals, helping them turn their projects into reality.
- **sse_reasoning**:
  - before: (none)
  - after: Microcrédit Montréal is a registered nonprofit that offers micro‑loans and tailored support to entrepreneurs and immigrant professionals, demonstrating a clear purpose beyond profit, intentional impact, and contribution to community economic inclusion.
- **flags**: `(none)` → `['website via=extracted', 'description via=extracted', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'values_ungrounded', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 417 — Canadian Conservation Photography Collective (CCPC)

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `en`
- **website**: `(none)` → `https://www.theccpc.ca`
- **values**: `(none)` → `['Environment', 'Community', 'Help Society', 'Creativity']`
- **description**:
  - before: (none)
  - after: The Canadian Conservation Photography Collective (CCPC) is a non‑profit organization that brings together Canadian photographers to advance conservation and science education through visual storytelli… (+48 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: CCPC is a registered nonprofit whose mission focuses on environmental stewardship and public education, meeting all three must‑haves. Its collaborative, community‑focused approach aligns with solidarity‑economy principles, supporting a strong yes rating.
- **flags**: `(none)` → `['description via=inferred', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'values_ungrounded', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 418 — Réseau Télescope

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `community-civic-infrastructure`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Community', 'Help Society', 'Honesty and Integrity', 'Diversity']`
- **sse_reasoning**:
  - before: (none)
  - after: Télescope is a registered nonprofit that explicitly serves other mission‑driven groups, demonstrating a clear purpose beyond profit, intentional impact, and contribution to social good, meeting all three must‑haves.
- **flags**: `(none)` → `['website_unconfirmed', 'website_geo_conflict', 'description via=absent', 'mission via=absent', 'values via=absent', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 419 — Station Familles

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `care-health-social-services`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `[]`
- **description**:
  - before: (none)
  - after: Station Familles is a community organization in Montreal that supports families through collective kitchens, parent‑meet‑ups, and accompaniment services, fostering mutual aid and community bonds.
- **sse_reasoning**:
  - before: (none)
  - after: Station Familles is a registered community nonprofit that explicitly aims to support families, indicating a clear purpose beyond profit and measurable social impact. Its programs provide collective resources and solidarity‑based services, aligning with core SSE principles.
- **flags**: `(none)` → `['website_unavailable', 'description via=inferred', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 420 — Institut F

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `education-knowledge`
- **language**: `(none)` → `fr`
- **website**: `(none)` → `https://www.institutf.org`
- **values**: `(none)` → `['Community', 'Help Society', 'Environment', 'Diversity']`
- **sse_reasoning**:
  - before: (none)
  - after: Institut F is a registered nonprofit with a clear mission to promote social justice, community well‑being and environmental stewardship, meeting all three must‑haves. Its focus on collective care, participatory projects and reinvestment of resources aligns with strong SSE criteria.
- **flags**: `(none)` → `['description via=absent', 'description_ungrounded', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'values_ungrounded', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 422 — Maison d’Hérelle

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `housing-collective-real-estate`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Community', 'Help Society', 'Help Others']`
- **mission**:
  - before: (none)
  - after: Our mission is to help people living with HIV achieve stable, supportive housing.
- **description**:
  - before: (none)
  - after: Maison d'Hérelle provides community and social housing for people living with HIV/AIDS in Montreal.
- **sse_reasoning**:
  - before: (none)
  - after: Maison d’Hérelle is a registered nonprofit that offers housing support for people with HIV, showing a clear purpose beyond profit, intentional impact, and social benefit.
- **flags**: `(none)` → `['website_unavailable', 'description via=inferred', 'mission via=inferred', 'values via=absent', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 428 — Grand River Conservation Authority (2 positions)

- **sse**: `(none)` → `no`
- **type**: `(none)` → `government`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `en`
- **website**: `(none)` → `https://www.grandriver.ca/`
- **values**: `(none)` → `['Environment', 'Community', 'Help Society']`
- **mission**:
  - before: (none)
  - after: Our vision is a healthy watershed where we live, work, play and prosper in balance with the natural environment.
- **description**:
  - before: (none)
  - after: The Grand River Conservation Authority (GRCA) is a public agency that manages water and other natural resources for 39 municipalities and about one million residents in the Grand River watershed, deli… (+87 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: The GRCA is a statutory public agency (government) created under the Ontario Conservation Authorities Act, not a nonprofit or cooperative, so it does not meet the governance gate for SSE eligibility.
- **flags**: `(none)` → `['description via=extracted', 'mission via=inferred', 'values via=inferred', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 430 — Spectre de rue

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `care-health-social-services`
- **language**: `(none)` → `fr`
- **website**: `(none)` → `https://www.spectrederue.org`
- **values**: `(none)` → `['Community', 'Help Others', 'Help Society']`
- **sse_reasoning**:
  - before: (none)
  - after: Spectre de Rue is a registered nonprofit with a clear public‑health mission that prioritises people over profit, and its programs directly benefit vulnerable community members, fulfilling the core SSE criteria.
- **flags**: `(none)` → `['description via=absent', 'description_ungrounded', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'values_ungrounded', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 431 — L’Auberge du Coeur le Tournant

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `care-health-social-services`
- **language**: `(none)` → `fr`
- **website**: `(none)` → `https://www.aubergeletournant.org`
- **values**: `(none)` → `['Community', 'Help Others', 'Moral Fulfillment']`
- **mission**:
  - before: (none)
  - after: Our mission is to welcome, support and accompany young people aged 18 to 29 in difficulty, guiding them toward autonomy, independence and self‑sufficiency.
- **description**:
  - before: (none)
  - after: L’Auberge du Coeur le Tournant is a community organization in Montreal that intervenes with young volunteers aged 17 years 10 months to 29 years who identify as male and are at risk of homelessness. I… (+93 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: The organization is a registered nonprofit that explicitly targets at‑risk youth, providing shelter and support services, which meets all three must‑haves. Its mission and activities demonstrate a clear purpose beyond profit and tangible social impact.
- **flags**: `(none)` → `['description via=extracted', 'mission via=inferred', 'values via=absent', 'values_ungrounded', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 434 — Bouthillette Parizeau & Associes

- **sse**: `(none)` → `no`
- **type**: `(none)` → `other`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `bilingual`
- **website**: `(none)` → `https://bpa.ca`
- **values**: `(none)` → `['Environment', 'Group & Team', 'Personal Safety']`
- **description**:
  - before: (none)
  - after: Bouthillette Parizeau Inc. (BPA) is a Quebec‑based engineering consultancy offering multidisciplinary building, civil, mechanical and environmental engineering services to architects, property manager… (+18 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: BPA is a for‑profit engineering consultancy owned by private shareholders and does not operate as a nonprofit, cooperative or union. Its governance lacks collective ownership or democratic control, and it does not meet the essential SSE criteria. Therefore it is classified as non‑SSE.
- **flags**: `(none)` → `['description via=inferred', 'mission via=absent', 'mission_ungrounded', 'values via=extracted', 'language:bilingual via=public_language', 'language_reason:insufficient_signal']`

## 437 — International Rive Nord Inc.

- **sse**: `(none)` → `no`
- **type**: `(none)` → `other`
- **sector**: `(none)` → `community-civic-infrastructure`
- **language**: `(none)` → `bilingual`
- **website**: `(none)` → `https://www.inter-rivenord.com`
- **values**: `(none)` → `[]`
- **mission**:
  - before: (none)
  - after: Putting Drivers First – to deliver reliable truck solutions and support the mobility needs of our customers.
- **description**:
  - before: (none)
  - after: International Rive‑Nord is a Laval‑based truck dealer offering sales, rentals, parts, and repair services for heavy‑duty vehicles. The company provides SAAQ verification, maintenance, and alignment se… (+41 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: International Rive‑Nord operates as a for‑profit truck dealership and service centre with no evidence of nonprofit, cooperative or union governance. Its purpose is commercial (selling and servicing trucks) rather than a social or environmental mission, so it does not meet SSE criteria.
- **flags**: `(none)` → `['description via=inferred', 'mission via=inferred', 'values via=absent', 'language:bilingual via=llm_name', 'language_reason:name_llm=bilingual']`

## 439 — Katalizo

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `education-knowledge`
- **language**: `(none)` → `bilingual`
- **website**: `(none)` → `https://www.katalizo.org`
- **values**: `(none)` → `['Community', 'Help Society', 'Environment', 'Creativity', 'Group & Team']`
- **mission**:
  - before: (none)
  - after: To catalyse ideas into action, strengthening community initiatives and fostering solidarity, social innovation and collective empowerment.
- **sse_reasoning**:
  - before: (none)
  - after: Katalizo is a registered nonprofit with a clear purpose beyond profit, explicitly stating its mission to catalyse ideas for community benefit and showing impact through learning programmes and collaborative projects, meeting all SSE must‑haves and several nice‑to‑haves.
- **flags**: `(none)` → `['description via=absent', 'description_ungrounded', 'mission via=extracted', 'values via=absent', 'values_ungrounded', 'language:bilingual via=public_language', 'language_reason:insufficient_signal']`

## 440 — Puddle Produce Farm

- **sse**: `(none)` → `no`
- **type**: `(none)` → `other`
- **sector**: `(none)` → `agriculture-food-systems`
- **language**: `(none)` → `en`
- **website**: `(none)` → `https://puddleproduce.ca`
- **values**: `(none)` → `['Community', 'Environment', 'Help Society']`
- **description**:
  - before: (none)
  - after: Puddle Produce Farm is a family‑run organic vegetable farm near Williams Lake, BC that grows seasonal produce for local markets and community members.
- **sse_reasoning**:
  - before: (none)
  - after: The farm appears to be a privately owned for‑profit operation with no evidence of nonprofit, cooperative, or union governance, so it does not satisfy the governance gate for Solidarity Economy.
- **flags**: `(none)` → `['description via=extracted', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'values_ungrounded', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 441 — WorkinBIM

- **sse**: `(none)` → `no`
- **type**: `(none)` → `other`
- **sector**: `(none)` → `technology-digital-infrastructure`
- **language**: `(none)` → `en`
- **values**: `(none)` → `[]`
- **sse_reasoning**:
  - before: (none)
  - after: WorkinBIM appears to be a private for‑profit BIM consulting firm with no evidence of nonprofit, cooperative, or union governance. Without a public‑benefit mission or collective ownership, it does not meet SSE criteria.
- **flags**: `(none)` → `['website_unavailable', 'description via=absent', 'mission via=absent', 'values via=absent', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 442 — La Société John Howard du Québec

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `care-health-social-services`
- **language**: `(none)` → `fr`
- **website**: `(none)` → `https://john-howard.qc.ca`
- **values**: `(none)` → `['Community', 'Help Society', 'Help Others', 'Diversity', 'Moral Fulfillment']`
- **mission**:
  - before: (none)
  - after: Our mission is to facilitate the successful reintegration of people exiting detention by providing comprehensive social accompaniment, housing assistance, and empowerment tools.
- **description**:
  - before: (none)
  - after: La Société John Howard du Québec is a nonprofit organization that provides housing and reintegration services for individuals leaving prison or transition homes, offering support in finding stable acc… (+57 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: The organization is a registered nonprofit that explicitly supports people exiting detention, showing a clear purpose beyond profit, concrete impact through housing and employment assistance, and a commitment to social reintegration, meeting all SSE must‑haves and several nice‑to‑haves.
- **flags**: `(none)` → `['description via=extracted', 'mission via=inferred', 'values via=absent', 'values_ungrounded', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 443 — Centre de bénévolat SARPAD Inc.

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `care-health-social-services`
- **language**: `(none)` → `fr`
- **website**: `(none)` → `https://sarpad.com`
- **values**: `(none)` → `['Community', 'Help Society', 'Help Others', 'Environment', 'Diversity']`
- **sse_reasoning**:
  - before: (none)
  - after: The Centre de bénévolat SARPAD Inc. is a registered nonprofit that clearly prioritises people over profit, describes its impact through volunteer driver services, and contributes to community inclusion, meeting all SSE must‑haves.
- **flags**: `(none)` → `['description via=absent', 'description_ungrounded', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'values_ungrounded', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 445 — Sustainable Fashion Week Canada

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `arts-culture-information`
- **language**: `(none)` → `bilingual`
- **values**: `(none)` → `['Community', 'Environment', 'Creativity', 'Diversity', 'Help Society']`
- **description**:
  - before: (none)
  - after: Sustainable Fashion Week Canada (SFWC) is a nonprofit organization that promotes sustainable, ethical and circular fashion in Canada through events, workshops, markets and community‑based initiatives.
- **sse_reasoning**:
  - before: (none)
  - after: The organization is a registered nonprofit with a clear purpose beyond profit, explicitly working to advance sustainable fashion and environmental stewardship, and it reinvests event proceeds into community education and support.
- **flags**: `(none)` → `['website_unavailable', 'description via=inferred', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'values_ungrounded', 'language:bilingual via=public_language', 'language_reason:name_llm=en']`

## 450 — EnviroCentre

- **sse**: `(none)` → `weak_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `en`
- **website**: `(none)` → `https://envirocentre.ca`
- **values**: `(none)` → `['Environment', 'Community', 'Help Society']`
- **mission**:
  - before: (none)
  - after: Our mission is to reduce emissions and environmental impact in Ottawa and Eastern Ontario by designing, delivering and scaling equitable solutions in home energy efficiency, sustainable transportation… (+43 chars truncated from log)
- **description**:
  - before: (none)
  - after: EnviroCentre is an Ottawa‑based not‑for‑profit social enterprise that delivers practical climate‑focused initiatives—home energy efficiency, sustainable transportation, green infrastructure and waste… (+85 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: EnviroCentre is a registered not‑for‑profit that clearly prioritises people and planet, with a mission to cut emissions through community‑focused climate actions. The organization meets the three required SSE must‑haves, though explicit cooperative governance or participatory structures are not evid… (+4 chars truncated from log)
- **flags**: `(none)` → `['description via=extracted', 'mission via=extracted', 'values via=inferred', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 451 — Reimagining Plastic

- **sse**: `(none)` → `no`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `en`
- **values**: `(none)` → `['Environment', 'Community', 'Help Society', 'Creative Expression']`
- **description**:
  - before: (none)
  - after: Reimagining Plastic is a youth‑led environmental initiative in Ontario that raises awareness about plastic pollution, provides educational programming on waste systems, leads creative up‑cycling proje… (+52 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: The group focuses on plastic‑pollution awareness and up‑cycling, indicating a clear social and environmental purpose, but there is no evidence of nonprofit or cooperative governance, so it does not meet the governance gate for SSE.
- **flags**: `(none)` → `['website_unavailable', 'type_unverified', 'insufficient_evidence', 'description via=inferred', 'mission via=absent', 'mission_ungrounded', 'values via=inferred', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 455 — The Architek Group

- **sse**: `(none)` → `no`
- **type**: `(none)` → `other`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `en`
- **values**: `(none)` → `['Environment', 'Community', 'Help Society']`
- **sse_reasoning**:
  - before: (none)
  - after: Architek operates as a private design‑build firm with no evidence of nonprofit, cooperative or union governance, and its purpose is commercial rather than a public‑benefit mission, which disqualifies it from the Solidarity Economy.
- **flags**: `(none)` → `['website_unconfirmed', 'website_geo_conflict', 'description via=absent', 'mission via=absent', 'values via=absent', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 457 — Gestion des Trois Pignons

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `housing-collective-real-estate`
- **language**: `(none)` → `fr`
- **website**: `(none)` → `https://gestiondestroispignons.ca`
- **values**: `(none)` → `['Community', 'Help Society', 'Environment']`
- **mission**:
  - before: (none)
  - after: The organization’s mission is to provide affordable housing to autonomous, multigenerational tenants in a pleasant, safe and humane environment.
- **description**:
  - before: (none)
  - after: Gestion des Trois Pignons is one of Quebec’s largest nonprofit housing organizations, owning and managing the Frontenac Towers complex of about 800 rental units in Montreal’s Centre‑South neighbourhoo… (+143 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: Gestion des Trois Pignons is a registered nonprofit (OBNL) that provides affordable housing and free resident services, clearly prioritizing people over profit; its mission and activities demonstrate concrete social impact.
- **flags**: `(none)` → `['description via=extracted', 'mission via=inferred', 'values via=absent', 'values_ungrounded', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 459 — Cole Harbour Heritage Farm Museum

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `arts-culture-information`
- **language**: `(none)` → `en`
- **website**: `(none)` → `https://coleharbourfarmmuseum.ca`
- **values**: `(none)` → `['Community', 'Environment', 'Help Society', 'Knowledge']`
- **description**:
  - before: (none)
  - after: Cole Harbour Heritage Farm Museum is a community museum in Dartmouth, Nova Scotia that preserves and interprets the 200‑year‑old agricultural heritage of Cole Harbour. It features historic buildings,… (+119 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: The museum is a registered nonprofit that explicitly aims to preserve local agricultural heritage, provide educational programs, and serve the community, meeting all three must‑haves and showing solidarity‑driven culture and reinvestment of surplus into its mission.
- **flags**: `(none)` → `['description via=extracted', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'values_ungrounded', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 460 — Frontenac Arch Biosphere Network

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `en`
- **website**: `(none)` → `https://frontenacarchbiosphere.ca`
- **values**: `(none)` → `['Community', 'Environment', 'Help Society', 'Group & Team', 'Diversity']`
- **description**:
  - before: (none)
  - after: The Frontenac Arch Biosphere Network (FABN) is a community‑based nonprofit that works to protect, celebrate and educate about the Frontenac Arch UNESCO Biosphere Reserve through conservation projects,… (+51 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: FABN is a registered nonprofit that explicitly prioritises ecosystem stewardship and community education, meeting all three must‑haves. Its publicly stated mission and programs demonstrate clear social and environmental impact, aligning with SSE principles.
- **flags**: `(none)` → `['description via=extracted', 'mission via=absent', 'mission_ungrounded', 'values via=extracted', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 469 — Le Boulot vers…

- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `manufacturing-production`
- **language**: `(none)` → `fr`
- **website**: `(none)` → `https://www.boulotvers.org`
- **values**: `(none)` → `['Community', 'Help Society', 'Environment', 'Creativity', 'Group & Team']`
- **mission**:
  - before: (none)
  - after: Its mission is to promote social and professional insertion of vulnerable young people by offering a real‑world training environment in an atelier that produces socially useful furniture for community… (+15 chars truncated from log)
- **description**:
  - before: (none)
  - after: Le Boulot vers… is a Montreal‑based nonprofit that helps youth (16‑29) integrate socially and professionally through a paid apprenticeship in a woodworking workshop that creates furniture for communit… (+6 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: The organization is a registered nonprofit that clearly prioritizes youth empowerment over profit, describes its impact through apprenticeship and socially useful furniture, and its work benefits the community and environment, meeting all three must‑haves.
- **flags**: `(none)` → `['description via=inferred', 'mission via=inferred', 'values via=absent', 'values_ungrounded', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`
