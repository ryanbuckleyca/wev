# Backfill review — next 10 batch

Source: `/tmp/backfill_org_minimal_10_20260802_162429.log`
Orgs with update blocks: **10**
Run summary: `{'mode': 'minimal', 'processed': 10, 'updated': 10, 'skipped': 0, 'skipped_completed': 0, 'skipped_reviewed': 0, 'errors': 0, 'dry_run': False, 'limit': 10, 'last_id': 370, 'resume_with': '--after-id 370'}`

## 323 — Foxhole Farm

- **sse**: `(none)` → `no`
- **type**: `(none)` → `other`
- **sector**: `(none)` → `agriculture-food-systems`
- **values**: `(none)` → `['Community', 'Environment']`
- **description**:
  - before: (none)
  - after: Foxhole Farm is an organic farm in Rockwood, Ontario. via=inferred
- **sse_reasoning**:
  - before: (none)
  - after: Foxhole Farm does not have a clear mission or governance structure that prioritizes people and planet over profit. via=inferred
- **flags**: `(none)` → `['website_unavailable', 'description via=inferred', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'values_ungrounded', 'language:en via=kept']`

## 336 — Gbi

- **sse**: `(none)` → `no`
- **type**: `(none)` → `government`
- **sector**: `(none)` → `community-civic-infrastructure`
- **values**: `(none)` → `[]`
- **sse_reasoning**:
  - before: (none)
  - after: GBI is a government agency, not a Solidarity Economy form.
- **flags**: `(none)` → `['website_unavailable=false', 'website_unconfirmed', 'website_geo_conflict', 'description via=absent', 'mission via=absent', 'values via=absent', 'language:en via=kept']`

## 347 — Abbottnutrition

- **website**: `(none)` → `https://abbottnutrition.com`
- **sse**: `(none)` → `no`
- **type**: `(none)` → `other`
- **language**: `(none)` → `bilingual`
- **values**: `(none)` → `[]`
- **mission**:
  - before: (none)
  - after: To discover and develop life-changing health technologies that help people live their best lives.
- **description**:
  - before: (none)
  - after: Abbott Nutrition provides innovative and science-based nutrition products.
- **sse_reasoning**:
  - before: (none)
  - after: Abbott Nutrition is a for-profit company that does not prioritize people or planet over profit.
- **flags**: `(none)` → `['description via=extracted', 'mission via=extracted', 'values via=absent', 'language:bilingual via=public_language', 'language_reason:name_llm=en']`

## 362 — Centre le Beau Voyage

- **website**: `(none)` → `https://centrelebeauvoyage.org`
- **sse**: `(none)` → `weak_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `community-civic-infrastructure`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Community', 'Help Society']`
- **mission**:
  - before: (none)
  - after: Accueillir, soutenir et favoriser le développement des jeunes.
- **description**:
  - before: (none)
  - after: Centre le Beau Voyage is a socialization space in Montreal.
- **sse_reasoning**:
  - before: (none)
  - after: Centre le Beau Voyage's mission focuses on socialization, youth development, and community support, aligning with social good and community impact.
- **flags**: `(none)` → `['description via=extracted', 'mission via=extracted', 'values via=absent', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 363 — Regroupement des aidantes et aidants naturels de Montréal

- **website**: `(none)` → `https://www.raanm.net`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `care-health-social-services`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Community', 'Help Others', 'Help Society']`
- **mission**:
  - before: (none)
  - after: Contribute to improving the living conditions of natural caregivers.
- **description**:
  - before: (none)
  - after: Organization supporting natural caregivers in Montreal.
- **sse_reasoning**:
  - before: (none)
  - after: Clear nonprofit mission, contributes to social good, and prioritizes caregivers' well-being.
- **flags**: `(none)` → `['description via=inferred', 'mission via=inferred', 'values via=absent', 'values_ungrounded', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 365 — Severn Sound Environmental Association

- **website**: `(none)` → `https://www.severnsound.ca`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `bilingual`
- **values**: `(none)` → `['Honesty and Integrity', 'Community', 'Help Society']`
- **mission**:
  - before: (none)
  - after: Leading and galvanizing action to protect the lands and waters of the Severn Sound area through sound science, collaboration, and partnerships.
- **description**:
  - before: (none)
  - after: The Severn Sound Environmental Association is a Joint Municipal Service Board that provides environmental support to local municipalities.
- **sse_reasoning**:
  - before: (none)
  - after: The organization prioritizes environmental protection and community well-being, with a strong focus on collaboration and partnerships.
- **flags**: `(none)` → `['description via=extracted', 'mission via=extracted', 'values via=extracted', 'language:bilingual via=public_language', 'language_reason:name_llm=en']`

## 366 — 9076-5215 QUÉBEC Inc.

- **website**: `(none)` → `https://www.nouryon.com`
- **sse**: `(none)` → `no`
- **type**: `(none)` → `other`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Community', 'Environment']`
- **mission**:
  - before: (none)
  - after: Prioritizing the health and safety of employees, contractors, customers, and neighbors.
- **description**:
  - before: (none)
  - after: A global specialty chemicals leader with a location in Magog, Quebec.
- **sse_reasoning**:
  - before: (none)
  - after: Nouryon is a conventional for-profit company with a global presence, prioritizing health and safety but without a clear social or environmental mission beyond standard CSR practices.
- **flags**: `(none)` → `['description via=extracted', 'mission via=inferred', 'values via=extracted', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 367 — Turtle Guardians (of The Land Between charity)

- **website**: `(none)` → `https://www.turtleguardians.com`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `bilingual`
- **values**: `(none)` → `['Community', 'Environment']`
- **mission**:
  - before: (none)
  - after: Turtle Guardians aims to protect Ontario's at-risk turtle species with groundbreaking ecopassage designs.
- **description**:
  - before: (none)
  - after: Turtle Guardians is a charity that works to save turtles and turtle habitats.
- **sse_reasoning**:
  - before: (none)
  - after: Turtle Guardians is a registered charity with a clear mission to protect turtles and their habitats, demonstrating a strong commitment to environmental conservation.
- **flags**: `(none)` → `['description via=extracted', 'mission via=extracted', 'values via=extracted', 'language:bilingual via=public_language', 'language_reason:name_llm=en']`

## 368 — Association des services de réhabilitation sociale du Québec

- **website**: `(none)` → `https://asrsq.ca/en`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `care-health-social-services`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Community', 'Help Society', 'Honesty and Integrity']`
- **mission**:
  - before: (none)
  - after: ASRSQ works to support the reintegration of individuals into society.
- **description**:
  - before: (none)
  - after: The Association of Social Rehabilitation Services of Quebec (ASRSQ) is a community action organization working in the field of criminal justice.
- **sse_reasoning**:
  - before: (none)
  - after: ASRSQ is a community action organization focused on social rehabilitation, showing a clear purpose beyond profit and commitment to social good.
- **flags**: `(none)` → `['description via=extracted', 'mission via=extracted', 'values via=extracted', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 370 — Cyclo Nord-Sud

- **website**: `(none)` → `https://cyclonordsud.org`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `community-civic-infrastructure`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Community', 'Help Society', 'Environment']`
- **mission**:
  - before: (none)
  - after: Cyclo Nord-Sud's mission is to refurbish bicycles and redistribute them to vulnerable communities in Quebec and around the world.
- **description**:
  - before: (none)
  - after: Cyclo Nord-Sud is a non-profit organization that collects used bicycles and ships them to underprivileged communities.
- **sse_reasoning**:
  - before: (none)
  - after: Cyclo Nord-Sud is a nonprofit with a clear mission to help vulnerable communities and promote environmental sustainability.
- **flags**: `(none)` → `['description via=inferred', 'mission via=inferred', 'values via=inferred', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`
