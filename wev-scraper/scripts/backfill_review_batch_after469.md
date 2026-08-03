# Backfill review — after-469 batch (next 50 minimal)

Source: `/tmp/backfill_org_minimal_50_20260802_185543.log`
Orgs with update blocks: **46**
Run summary: `{'mode': 'minimal', 'processed': 50, 'updated': 46, 'skipped': 4, 'skipped_completed': 0, 'skipped_reviewed': 0, 'errors': 0, 'dry_run': False, 'limit': 50, 'last_id': 564, 'resume_with': '--after-id 564'}`

## Notable issues

- **Wrong-entity website (Nouryon-style) — clear required:** org **508** `rare Charitable Research Reserve` was assigned `https://rare.org` (global Rare / Arlington). Correct Canadian site is `https://raresites.org`. Clear website → null; SSE/`strong_yes` left for human review.
- Name-token / evidence rejects (website left null — good):
  - **520** Le PAS de la rue — `https://raiiq.org` (org name tokens missing for 'Le PAS de la rue')
  - **543** Calgary Philharmonic Orchestra — `https://www.calgaryphilharmonic.com` (not in tavily evidence)
  - **547** Art Gallery of Burlington — `https://agb.life` (not in tavily evidence)
- Late-batch LLM exhaustion: Gemini 429 → Groq 429 → Cerebras free-tier daily quota → Ollama `qwen2.5:0.5b` timeouts. Four orgs skipped (`assessor returned None`): **558**, **561**, **562**, **564**. Resume with `--after-id 564` (or re-run those ids).
- Confirmed websites on several `sse=no` commercial/gov orgs were still written (e.g. Artelia, Mirvish, Ontario Creates) — expected; not hallucinations.
- Many macommunaute listing URLs returned HTTP 404 on fetch.

## Summary table

| id | name | website | sse | notes |
|----|------|---------|-----|-------|
| 470 | Centre de soir Denise-Massé | (none) -> https://www.denise-masse.org | (none) -> strong_yes |  |
| 471 | Artelia Group | (none) -> https://www.arteliagroup.com | (none) -> no |  |
| 472 | Le Centre de formation populaire (CFP) | (none) -> https://lecfp.qc.ca | (none) -> strong_yes |  |
| 473 | PRT Growing Services | (none) | (none) -> no |  |
| 479 | Réseau d’investissement social du Québec RISQ | (none) -> https://fonds-risq.qc.ca | (none) -> strong_yes |  |
| 483 | Sundance Harvest | (none) -> https://www.sundanceharvestmarket.com/ | (none) -> strong_yes |  |
| 489 | La Maison d’Hébergement d’Anjou | (none) -> https://mhanjou.ca | (none) -> strong_yes |  |
| 496 | Radio Canada International | (none) -> https://ici.radio-canada.ca/rci/en | (none) -> no |  |
| 497 | Le Carrefour Jeunesse-Emploi Centre-Nord | (none) -> https://cje-centrenord.com | (none) -> strong_yes |  |
| 499 | Clinique Droits Devant | (none) -> https://www.cliniquedroitsdevant.org | (none) -> strong_yes |  |
| 500 | KW Habilitation – Our Farm | (none) | (none) -> no |  |
| 501 | Bâtir son quartier | (none) -> https://www.batirsonquartier.com | (none) -> strong_yes |  |
| 503 | Corporation de développement communautaire (CDC… | (none) -> https://www.cdcrosemont.org | (none) -> strong_yes |  |
| 504 | Le Centre de ressources et d’action communautai… | (none) -> https://cracpp.org | (none) -> strong_yes |  |
| 505 | Joyfully Organic Farm | (none) -> https://joyfullyorganicfarm.ca | (none) -> no |  |
| 506 | Urban Bounty | (none) -> https://www.urbanbounty.ca | (none) -> strong_yes |  |
| 507 | Equilibrium Acres | (none) | (none) -> no |  |
| 508 | rare Charitable Research Reserve | (none) -> https://rare.org | (none) -> strong_yes | **CLEAR rare.org** (wrong entity; use raresites.org) |
| 515 | La Maison des familles de LaSalle | (none) | (none) -> no |  |
| 518 | Sustainable Community Aid Network | (none) -> https://www.s-can.org | (none) -> strong_yes |  |
| 519 | Le Relais Communautaire de Laval | (none) -> https://relais-communautaire.org | (none) -> strong_yes |  |
| 520 | Le PAS de la rue | (none) | (none) -> strong_yes | website_unconfirmed; geo_conflict |
| 522 | Rouge Valley Foundation | (none) -> https://www.rvcc.ca | (none) -> strong_yes |  |
| 523 | Thunder Bay Field Naturalists Club | (none) -> https://tbfn.net | (none) -> strong_yes |  |
| 525 | Thunderbird Collective | (none) -> https://thunderbirdcollective.ca | (none) -> strong_yes |  |
| 529 | Carrefour d’aide aux nouveaux arrivants | (none) | (none) -> strong_yes |  |
| 533 | Katimavik | (none) -> https://katimavik.org | (none) -> strong_yes |  |
| 534 | Tel-jeunes | (none) -> https://www.teljeunes.com | (none) -> strong_yes |  |
| 537 | Regroup’elles | (none) | (none) -> strong_yes |  |
| 539 | Right To Food | (none) -> https://righttofood.ca | (none) -> strong_yes |  |
| 541 | MSRK Lifecare Foundation | (none) | (none) -> weak_yes |  |
| 543 | Calgary Philharmonic Orchestra | (none) | (none) -> strong_yes | website_unconfirmed; geo_conflict |
| 545 | MusiCounts | (none) -> https://musicounts.ca | (none) -> strong_yes |  |
| 546 | Professional Association of Canadian Theatres (… | (none) -> https://www.pact.ca | (none) -> strong_yes |  |
| 547 | Art Gallery of Burlington | (none) | (none) -> strong_yes | website_unconfirmed |
| 548 | Ontario School of Ballet | (none) -> https://www.ontarioschoolofballet.com | (none) -> no |  |
| 549 | Calgary Arts Development | (none) -> https://calgaryartsdevelopment.com | (none) -> no |  |
| 550 | Ontario Creates / Ontario Créatif | (none) -> https://www.ontariocreates.ca | (none) -> no |  |
| 551 | Orchestra Toronto | (none) -> https://www.orchestratoronto.ca | (none) -> strong_yes |  |
| 552 | Theatre Passe Muraille | (none) -> https://www.passemuraille.ca | (none) -> strong_yes |  |
| 553 | Shaw Festival Theatre, Canada | (none) -> https://www.shawfest.com | (none) -> strong_yes |  |
| 554 | Mirvish Productions | (none) -> https://www.mirvish.com | (none) -> no |  |
| 556 | Réseau québécois pour la réussite éducative | (none) -> https://reussiteeducative.quebec | (none) -> strong_yes |  |
| 557 | Projet inclusion | (none) | (none) -> strong_yes |  |
| 559 | Perspective Carrière | (none) -> https://pcarriere.com | (none) -> no |  |
| 563 | Better Environmentally Sound Transportation | (none) -> https://www.best.bc.ca | (none) -> strong_yes |  |
| 558 | Corporation Mainbourg | — | — | SKIPPED: assessor returned None |
| 561 | The Locksley Project | — | — | SKIPPED: assessor returned None |
| 562 | Espace M – Ressources pour mères monoparentales | — | — | SKIPPED: assessor returned None |
| 564 | Restorative Landscapes Inc. | — | — | SKIPPED: assessor returned None |

## Website confirms vs rejects

- Confirmed count: **35**
- Rejected count: **3**

- Reject: **520** `https://raiiq.org` — org name tokens missing for 'Le PAS de la rue'
- Reject: **543** `https://www.calgaryphilharmonic.com` — not in tavily evidence
- Reject: **547** `https://agb.life` — not in tavily evidence

## Skips (LLM exhausted)

- **558** Corporation Mainbourg — assessor returned None
- **561** The Locksley Project — assessor returned None
- **562** Espace M – Ressources pour mères monoparentales — assessor returned None
- **564** Restorative Landscapes Inc. — assessor returned None

## Per-org update blocks

## 470 — Centre de soir Denise-Massé

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> care-health-social-services`
- **language**: `(none) -> fr`
- **website**: `(none) -> https://www.denise-masse.org`
- **values**: `(none) -> ['Help Society', 'Community', 'Help Others']`
- **mission**:
  - - (none)
  - + Since 1989, our mission is to welcome people with mental‑health issues, social disorganisation and residential instability during evenings and weekends, promoting and maintaining their quality of life… (+1 chars truncated from log)
- **description**:
  - - (none)
  - + Centre de soir Denise‑Massé is a community organization in Montreal that provides evening and weekend drop‑in services for people living with mental‑health challenges, social disorganisation, or housi… (+73 chars truncated from log)
- **sse_reasoning**:
  - - (none)
  - + The Centre de soir Denise‑Massé is a registered nonprofit that delivers non‑profit evening and weekend support services to individuals facing mental‑health and housing challenges, clearly prioritising people over profit.
- **flags**: `(none) -> ['description via=extracted', 'mission via=extracted', 'values via=absent', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 471 — Artelia Group

- **sse**: `(none) -> no`
- **type**: `(none) -> other`
- **sector**: `(none) -> environment-circular-economy`
- **language**: `(none) -> bilingual`
- **website**: `(none) -> https://www.arteliagroup.com`
- **values**: `(none) -> ['Environment', 'Community', 'Help Society']`
- **description**:
  - - (none)
  - + Artelia is an international, independent and multidisciplinary consulting, engineering and project‑management group serving clients in mobility, water, energy, building and industry.
- **sse_reasoning**:
  - - (none)
  - + Artelia Group is a privately owned for‑profit engineering consultancy; its governance is corporate rather than nonprofit, cooperative or union, and its purpose is primarily commercial, so it does not meet SSE criteria.
- **flags**: `(none) -> ['description via=extracted', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'values_ungrounded', 'language:bilingual via=public_language', 'language_reason:name_llm=en']`

## 472 — Le Centre de formation populaire (CFP)

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> education-knowledge`
- **language**: `(none) -> fr`
- **website**: `(none) -> https://lecfp.qc.ca`
- **values**: `(none) -> ['Community', 'Help Society', 'Decision Making', 'Diversity']`
- **mission**:
  - - (none)
  - + CFP’s mission is to contribute to the development of autonomous community action by providing popular education, reinforcing associative and democratic practices, and supporting the management and int… (+57 chars truncated from log)
- **description**:
  - - (none)
  - + The Centre de formation populaire (CFP) is a community‑based popular education organization founded in 1971 that supports the development and strengthening of community organizations across Quebec thr… (+85 chars truncated from log)
- **sse_reasoning**:
  - - (none)
  - + The CFP is a registered nonprofit that explicitly prioritises community empowerment, democratic participation and popular education, clearly beyond profit motives, and its work directly benefits community organisations in Quebec.
- **flags**: `(none) -> ['description via=extracted', 'mission via=inferred', 'values via=absent', 'values_ungrounded', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 473 — PRT Growing Services

- **sse**: `(none) -> no`
- **type**: `(none) -> other`
- **sector**: `(none) -> agriculture-food-systems`
- **language**: `(none) -> en`
- **values**: `(none) -> []`
- **description**:
  - - (none)
  - + PRT Growing Services Ltd. began in 1988 with six nurseries and has become North America’s largest grower of forest seedlings, producing over 6 billion trees across 27 nurseries and 14 seed orchards.
- **sse_reasoning**:
  - - (none)
  - + PRT Growing Services Ltd. is a private for‑profit company that runs forest‑seedling nurseries; it is not organized as a nonprofit, cooperative or union and shows no public‑benefit mission, so it does not meet SSE criteria.
- **flags**: `(none) -> ['website_unavailable', 'description via=inferred', 'mission via=absent', 'values via=absent', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 479 — Réseau d’investissement social du Québec RISQ

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> financial-insurance-services`
- **language**: `(none) -> fr`
- **website**: `(none) -> https://fonds-risq.qc.ca`
- **values**: `(none) -> ['Community', 'Help Society', 'Environment']`
- **mission**:
  - - (none)
  - + To make accessible tailored financing for social‑economy enterprises, supporting their growth and social impact across Quebec.
- **description**:
  - - (none)
  - + The Réseau d'investissement social du Québec (RISQ) is a nonprofit venture capital fund dedicated to social‑economy enterprises. Its mission is to provide tailored financing to help collective enterpr… (+131 chars truncated from log)
- **sse_reasoning**:
  - - (none)
  - + RISQ is a nonprofit venture‑capital fund whose mission is to provide tailored financing to social‑economy enterprises, clearly prioritizing people and community over profit and demonstrating direct impact on social development across Quebec.
- **flags**: `(none) -> ['description via=extracted', 'mission via=extracted', 'values via=absent', 'values_ungrounded', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 483 — Sundance Harvest

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> agriculture-food-systems`
- **language**: `(none) -> en`
- **website**: `(none) -> https://www.sundanceharvestmarket.com/`
- **values**: `(none) -> ['Community', 'Environment', 'Help Society', 'Knowledge', 'Affiliation']`
- **sse_reasoning**:
  - - (none)
  - + Sundance Harvest operates as a community‑run organic farm that provides a CSA, mentorship and local market sales, demonstrating a clear purpose beyond profit and direct social and environmental impact; its activities align with solidarity values and community benefit.
- **flags**: `(none) -> ['description via=absent', 'description_ungrounded', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'values_ungrounded', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 489 — La Maison d’Hébergement d’Anjou

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> housing-collective-real-estate`
- **language**: `(none) -> fr`
- **website**: `(none) -> https://mhanjou.ca`
- **values**: `(none) -> ['Community', 'Help Others', 'Help Society', 'Moral Fulfillment', 'Diversity']`
- **mission**:
  - - (none)
  - + Our mission is to provide a safe haven and comprehensive support for women and children victims of intimate partner violence, fostering their autonomy and well‑being.
- **description**:
  - - (none)
  - + La Maison d’Hébergement d’Anjou provides emergency shelter and support services for women and children experiencing domestic violence in Montreal. It offers safe housing, psychosocial follow‑up, mothe… (+69 chars truncated from log)
- **sse_reasoning**:
  - - (none)
  - + The organization is a registered nonprofit that provides emergency housing and comprehensive support to women and children fleeing domestic violence, clearly prioritizing people over profit. Its mission and services demonstrate a clear purpose, intentional impact, and contribution to social good, me… (+25 chars truncated from log)
- **flags**: `(none) -> ['description via=inferred', 'mission via=extracted', 'values via=absent', 'values_ungrounded', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 496 — Radio Canada International

- **sse**: `(none) -> no`
- **type**: `(none) -> government`
- **sector**: `(none) -> arts-culture-information`
- **language**: `(none) -> fr`
- **website**: `(none) -> https://ici.radio-canada.ca/rci/en`
- **values**: `(none) -> []`
- **sse_reasoning**:
  - - (none)
  - + Radio Canada International is part of the Canadian Broadcasting Corporation, a Crown corporation classified as a government entity, which does not satisfy the governance requirements for the Solidarity Economy.
- **flags**: `(none) -> ['description via=absent', 'description_ungrounded', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 497 — Le Carrefour Jeunesse-Emploi Centre-Nord

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> community-civic-infrastructure`
- **language**: `(none) -> fr`
- **website**: `(none) -> https://cje-centrenord.com`
- **values**: `(none) -> ['Community', 'Help Society', 'Diversity', 'Knowledge', 'Help Others']`
- **description**:
  - - (none)
  - + The Carrefour Jeunesse-Emploi Centre‑Nord is a Montreal‑based nonprofit that provides free services to youth aged 15‑35 in the St‑Michel, Villeray and Parc‑Extension neighborhoods, helping them access… (+57 chars truncated from log)
- **sse_reasoning**:
  - - (none)
  - + The organization is a registered nonprofit that clearly prioritises youth well‑being over profit, describes its free services and impact, and contributes to community development. Its language of solidarity and reinvestment of resources supports a strong SSE alignment.
- **flags**: `(none) -> ['description via=extracted', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'values_ungrounded', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 499 — Clinique Droits Devant

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> care-health-social-services`
- **language**: `(none) -> fr`
- **website**: `(none) -> https://www.cliniquedroitsdevant.org`
- **values**: `(none) -> ['Community', 'Help Others', 'Help Society']`
- **mission**:
  - - (none)
  - + Our mission is to help individuals in precarious or homeless situations regularize their legal dossiers and access justice by providing information, referrals and personalised support throughout the c… (+18 chars truncated from log)
- **description**:
  - - (none)
  - + Clinique Droits Devant is a Montreal‑based legal aid clinic that assists people experiencing homelessness or at risk of homelessness to regularize their judicial files, offering information, referral… (+58 chars truncated from log)
- **sse_reasoning**:
  - - (none)
  - + The clinic is a registered nonprofit whose mission focuses on assisting homeless individuals with legal matters, clearly beyond profit. Its impact is described through regularizing dossiers and providing ongoing support, contributing to social justice. These criteria satisfy all mandatory SSE must‑h… (+37 chars truncated from log)
- **flags**: `(none) -> ['public_language=fr', 'description via=extracted', 'mission via=inferred', 'values via=absent', 'values_ungrounded', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 500 — KW Habilitation – Our Farm

- **sse**: `(none) -> no`
- **language**: `(none) -> en`
- **values**: `(none) -> []`
- **sse_reasoning**:
  - - (none)
  - + No verifiable website or official materials were found for KW Habilitation – Our Farm, so its governance structure, mission, and social impact cannot be confirmed.
- **flags**: `(none) -> ['website_unavailable', 'insufficient_evidence', 'description via=absent', 'mission via=absent', 'values via=absent', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 501 — Bâtir son quartier

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> housing-collective-real-estate`
- **language**: `(none) -> fr`
- **website**: `(none) -> https://www.batirsonquartier.com`
- **values**: `(none) -> ['Community', 'Help Society', 'Environment', 'Diversity', 'Group & Team']`
- **description**:
  - - (none)
  - + Bâtir son quartier is a Quebec‑based social‑economy organization that supports community housing initiatives, non‑profit groups, co‑ops and municipal partners by providing financial, technical and edu… (+18 chars truncated from log)
- **sse_reasoning**:
  - - (none)
  - + Bâtir son quartier is a registered nonprofit that prioritises affordable community housing, clearly articulates a social mission, and reinvests all surplus into its housing projects and training programs, meeting all SSE must‑haves and several nice‑to‑haves.
- **flags**: `(none) -> ['description via=inferred', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'values_ungrounded', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 503 — Corporation de développement communautaire (CDC) de Rosemont

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> community-civic-infrastructure`
- **language**: `(none) -> fr`
- **website**: `(none) -> https://www.cdcrosemont.org`
- **values**: `(none) -> ['Community', 'Help Society', 'Diversity', 'Group & Team']`
- **description**:
  - - (none)
  - + The Community Development Corporation (CDC) of Rosemont is a non‑profit consortium founded in 1988 that brings together community organisations in the Rosemont neighbourhood of Montreal to promote loc… (+58 chars truncated from log)
- **sse_reasoning**:
  - - (none)
  - + CDC de Rosemont is a registered nonprofit that explicitly aims to strengthen community participation and development in the Rosemont area, with a clear purpose beyond profit and documented impact on local residents, meeting all three must‑haves; its governance and purpose qualify it for a strong_yes… (+8 chars truncated from log)
- **flags**: `(none) -> ['description via=extracted', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'values_ungrounded', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 504 — Le Centre de ressources et d’action communautaire de la Petite-Patrie

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> agriculture-food-systems`
- **language**: `(none) -> fr`
- **website**: `(none) -> https://cracpp.org`
- **values**: `(none) -> ['Community', 'Help Society', 'Environment']`
- **description**:
  - - (none)
  - + The Centre de ressources et d’action communautaire de la Petite‑Patrie (CRACPP) is a community‑based nonprofit in Montreal that promotes food security, reduces waste, and offers mutual‑aid services th… (+63 chars truncated from log)
- **sse_reasoning**:
  - - (none)
  - + CRACPP is a registered nonprofit that explicitly aims to improve food access and reduce waste, showing clear purpose beyond profit, intentional impact, and social good. Its governance includes a community board and participatory programs, reflecting solidarity culture and collective decision‑making.
- **flags**: `(none) -> ['description via=extracted', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'values_ungrounded', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 505 — Joyfully Organic Farm

- **sse**: `(none) -> no`
- **type**: `(none) -> other`
- **sector**: `(none) -> agriculture-food-systems`
- **language**: `(none) -> en`
- **website**: `(none) -> https://joyfullyorganicfarm.ca`
- **values**: `(none) -> ['Community', 'Environment', 'Help Society']`
- **description**:
  - - (none)
  - + Joyfully Organic Farm is a certified organic and regenerative farm operating in the Greater Toronto Area, offering farm‑share boxes and a weekly market stand at Evergreen Brick Works, with a focus on… (+60 chars truncated from log)
- **sse_reasoning**:
  - - (none)
  - + Joyfully Organic Farm appears to be a for‑profit farm with no evidence of nonprofit, cooperative, or union governance; therefore it does not meet the governance gate for Solidarity Economy eligibility.
- **flags**: `(none) -> ['description via=extracted', 'mission via=absent', 'mission_ungrounded', 'values via=inferred', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 506 — Urban Bounty

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> agriculture-food-systems`
- **language**: `(none) -> en`
- **website**: `(none) -> https://www.urbanbounty.ca`
- **values**: `(none) -> ['Community', 'Environment', 'Help Society']`
- **mission**:
  - - (none)
  - + Our mission is to build a resilient local food system by connecting people with land, sharing knowledge, and fostering community stewardship of food resources.
- **description**:
  - - (none)
  - + Urban Bounty is a community‑driven nonprofit in Richmond, BC that cultivates resilient local food systems through community gardens, a seed library, education, and advocacy, fostering stronger neighbo… (+19 chars truncated from log)
- **sse_reasoning**:
  - - (none)
  - + Urban Bounty is a registered nonprofit that runs community gardens in Richmond, BC with a clear purpose beyond profit, explicit impact on local food security, and a mission dedicated to people and the planet, meeting all three must‑haves and several nice‑to‑haves.
- **flags**: `(none) -> ['description via=inferred', 'mission via=extracted', 'values via=absent', 'values_ungrounded', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 507 — Equilibrium Acres

- **sse**: `(none) -> no`
- **type**: `(none) -> other`
- **sector**: `(none) -> agriculture-food-systems`
- **language**: `(none) -> en`
- **values**: `(none) -> ['Community', 'Environment', 'Help Society']`
- **mission**:
  - - (none)
  - + To grow organic food locally and strengthen community connections through a shared, sustainable agriculture model.
- **description**:
  - - (none)
  - + Equilibrium Acres is a community‑supported organic farm near Hamilton, Ontario, offering weekly pick‑up of vegetable boxes and operating as a small‑scale mixed‑crop and animal farm that serves the loc… (+17 chars truncated from log)
- **sse_reasoning**:
  - - (none)
  - + The farm operates as a private, for‑profit entity (type = other) without evidence of nonprofit or cooperative governance, which disqualifies it from the Solidarity Economy despite its community‑focused mission.
- **flags**: `(none) -> ['website_unavailable', 'description via=inferred', 'mission via=inferred', 'values via=absent', 'values_ungrounded', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 508 — rare Charitable Research Reserve

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> environment-circular-economy`
- **language**: `(none) -> en`
- **website**: `(none) -> https://rare.org` — **CLEAR required** (wrong entity; correct host raresites.org)
- **values**: `(none) -> ['Community', 'Environment', 'Help Society', 'Diversity', 'Group & Team']`
- **mission**:
  - - (none)
  - + Our mission is to inspire people and nature to thrive by advancing conservation science, fostering sustainable stewardship, and empowering communities to protect the planet.
- **description**:
  - - (none)
  - + Rare Charitable Research Reserve is a Canadian charitable organization dedicated to conservation, ecological research and environmental stewardship, connecting people with nature through science, educ… (+31 chars truncated from log)
- **sse_reasoning**:
  - - (none)
  - + Rare Charitable Research Reserve is a registered Canadian charity focusing on conservation research and community engagement (rare.org). Its purpose goes beyond profit, its impact is intentional, and it contributes to environmental good, meeting all SSE must‑haves and earning a strong_yes rating.
- **flags**: `(none) -> ['description via=inferred', 'mission via=extracted', 'values via=absent', 'values_ungrounded', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 515 — La Maison des familles de LaSalle

- **sse**: `(none) -> no`
- **language**: `(none) -> fr`
- **values**: `(none) -> []`
- **sse_reasoning**:
  - - (none)
  - + Only evidence found refers to a Maison des familles de LaSalle located in LaSalle, Montréal, QC. No web sources confirm a similarly named organization in La Salle, MB, so the employer cannot be verified for the given location. Without confirmation of the organization's governance or mission at this… (+55 chars truncated from log)
- **flags**: `(none) -> ['website_unavailable', 'description via=absent', 'mission via=absent', 'values via=absent', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 518 — Sustainable Community Aid Network

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> education-knowledge`
- **language**: `(none) -> en`
- **website**: `(none) -> https://www.s-can.org`
- **values**: `(none) -> ['Community', 'Environment', 'Help Society']`
- **mission**:
  - - (none)
  - + Our mission is to foster sustainable living and community wellbeing among senior residents of Brampton South by providing accessible workshops, resources, and opportunities for cultural exchange and e… (+25 chars truncated from log)
- **description**:
  - - (none)
  - + Sustainable Community Aid Network (SCAN) is a community‑based nonprofit in Brampton, Ontario that delivers sustainability workshops and programs for seniors, focusing on natural health remedies, envir… (+42 chars truncated from log)
- **sse_reasoning**:
  - - (none)
  - + SCAN is a registered nonprofit that runs sustainability workshops for seniors in Brampton, clearly prioritising people and planet over profit and delivering measurable community and environmental benefits through collaborative programs.
- **flags**: `(none) -> ['description via=inferred', 'mission via=inferred', 'values via=absent', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 519 — Le Relais Communautaire de Laval

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> care-health-social-services`
- **language**: `(none) -> fr`
- **website**: `(none) -> https://relais-communautaire.org`
- **values**: `(none) -> ['Community', 'Help Others', 'Help Society']`
- **mission**:
  - - (none)
  - + Our mission is to promote social integration and solidarity by providing food aid, community meals, social interventions and supportive services to people in need in the Laval region.
- **description**:
  - - (none)
  - + Le Relais Communautaire de Laval is a community organization in Laval, Quebec that offers social integration services, food assistance, community meals, a thrift store, and other supportive programs t… (+51 chars truncated from log)
- **sse_reasoning**:
  - - (none)
  - + The organization is a registered nonprofit that clearly prioritises people over profit, describing its impact through food aid, social integration and community services, and its work directly benefits the local community.
- **flags**: `(none) -> ['description via=extracted', 'mission via=extracted', 'values via=extracted', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 520 — Le PAS de la rue

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> care-health-social-services`
- **language**: `(none) -> fr`
- **values**: `(none) -> ['Community', 'Help Society', 'Diversity']`
- **sse_reasoning**:
  - - (none)
  - + Le PAS de la rue is a registered nonprofit that clearly prioritises people over profit, with a mission to improve the lives of homeless individuals. Its activities focus on collective care, advocacy and community solidarity, meeting all core SSE criteria.
- **flags**: `(none) -> ['website_unconfirmed', 'website_geo_conflict', 'description via=absent', 'mission via=absent', 'values via=absent', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 522 — Rouge Valley Foundation

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> environment-circular-economy`
- **language**: `(none) -> en`
- **website**: `(none) -> https://www.rvcc.ca`
- **values**: `(none) -> ['Environment', 'Community', 'Help Society', 'Knowledge']`
- **description**:
  - - (none)
  - + The Rouge Valley Conservation Centre, operated by the Rouge Valley Foundation, delivers environmental education, guided walks, research, and stewardship programs to protect and restore the Rouge Valle… (+23 chars truncated from log)
- **sse_reasoning**:
  - - (none)
  - + The Rouge Valley Foundation is a registered charitable nonprofit whose mission focuses on ecosystem protection, education, and community stewardship, meeting all three must‑haves. The site highlights collaborative community work and investment in education, supporting strong SSE alignment.
- **flags**: `(none) -> ['description via=inferred', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'values_ungrounded', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 523 — Thunder Bay Field Naturalists Club

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> environment-circular-economy`
- **language**: `(none) -> en`
- **website**: `(none) -> https://tbfn.net`
- **values**: `(none) -> ['Community', 'Environment', 'Help Society', 'Knowledge', 'Help Others']`
- **mission**:
  - - (none)
  - + To educate, protect, and enjoy the natural spaces around us.
- **description**:
  - - (none)
  - + The Thunder Bay Field Naturalists Club is a non‑profit organization dedicated to the study of natural history, wise use of natural resources, preservation of natural areas, and the protection of natur… (+28 chars truncated from log)
- **sse_reasoning**:
  - - (none)
  - + The club is a registered non‑profit with a clear purpose beyond profit, a mission to educate and protect natural spaces, and programs that conserve ecosystems while engaging the community, meeting all required SSE criteria.
- **flags**: `(none) -> ['description via=extracted', 'mission via=extracted', 'values via=absent', 'values_ungrounded', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 525 — Thunderbird Collective

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> environment-circular-economy`
- **language**: `(none) -> en`
- **website**: `(none) -> https://thunderbirdcollective.ca`
- **values**: `(none) -> ['Community', 'Environment', 'Help Society', 'Diversity', 'Knowledge']`
- **mission**:
  - - (none)
  - + To strengthen Indigenous fire stewardship in Canada by developing governance frameworks, policies and collaborative structures that enable independent, community‑driven fire management and long‑term e… (+21 chars truncated from log)
- **description**:
  - - (none)
  - + The Thunderbird Collective (TC) is an emerging national nonprofit that provides leadership and guidance to advance Indigenous‑led fire stewardship across Canada, supporting communities and practitione… (+79 chars truncated from log)
- **sse_reasoning**:
  - - (none)
  - + Thunderbird Collective is a nonprofit focused on Indigenous fire stewardship, with a clear purpose beyond profit and documented environmental and community impact, meeting all SSE must‑haves and showing solidarity‑driven culture and participatory governance.
- **flags**: `(none) -> ['description via=extracted', 'mission via=inferred', 'values via=absent', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 529 — Carrefour d’aide aux nouveaux arrivants

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> community-civic-infrastructure`
- **language**: `(none) -> fr`
- **values**: `(none) -> ['Community', 'Help Society', 'Diversity']`
- **sse_reasoning**:
  - - (none)
  - + CANA is a registered nonprofit that clearly prioritises newcomer integration over profit, describes its impact through settlement services, and contributes to social inclusion. Its mission and community‑based approach align with core solidarity‑economy principles.
- **flags**: `(none) -> ['website_unavailable', 'description via=absent', 'description_ungrounded', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'values_ungrounded', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 533 — Katimavik

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> education-knowledge`
- **language**: `(none) -> bilingual`
- **website**: `(none) -> https://katimavik.org`
- **values**: `(none) -> ['Community', 'Help Society', 'Diversity', 'Environment', 'Moral Fulfillment']`
- **mission**:
  - - (none)
  - + Our mission is to inspire and empower youth to become active, responsible citizens through transformative service‑learning programs that strengthen individuals, communities and Canada.
- **description**:
  - - (none)
  - + Katimavik is a Canadian nonprofit organization that offers service‑learning experiences for young people, helping them develop skills, confidence and a commitment to community and civic engagement.
- **sse_reasoning**:
  - - (none)
  - + Katimavik is a registered Canadian charity that delivers service‑learning programs empowering youth to become active citizens, with clearly stated mission and impact goals. Its nonprofit governance and focus on community benefit satisfy the three must‑haves, leading to a strong_yes rating.
- **flags**: `(none) -> ['description via=extracted', 'mission via=extracted', 'values via=absent', 'values_ungrounded', 'language:bilingual via=public_language', 'language_reason:insufficient_signal']`

## 534 — Tel-jeunes

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> care-health-social-services`
- **language**: `(none) -> fr`
- **website**: `(none) -> https://www.teljeunes.com`
- **values**: `(none) -> ['Community', 'Help Others', 'Help Society', 'Moral Fulfillment', 'Diversity']`
- **description**:
  - - (none)
  - + Tel‑jeunes is a confidential, free, judgment‑free space that provides mental‑health support and resources to adolescents across Québec, offering counseling, peer support, and community‑based programs.
- **sse_reasoning**:
  - - (none)
  - + Tel‑jeunes is a registered nonprofit that provides free, confidential mental‑health services to Quebec youth, clearly prioritising people over profit and demonstrating measurable community impact, satisfying the core SSE criteria.
- **flags**: `(none) -> ['description via=inferred', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'values_ungrounded', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 537 — Regroup’elles

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> care-health-social-services`
- **language**: `(none) -> fr`
- **values**: `(none) -> ['Community', 'Help Others', 'Help Society']`
- **description**:
  - - (none)
  - + Regroup'elles is a community‑based house of help and temporary accommodation in Terrebonne that serves women and children in vulnerable situations, offering shelter, support and basic services.
- **sse_reasoning**:
  - - (none)
  - + Regroup'elles operates as a nonprofit providing housing and support services for women and children, clearly prioritising people over profit and delivering tangible social impact. Its mission aligns with core solidarity‑economy principles of collective care and community benefit.
- **flags**: `(none) -> ['website_unavailable', 'insufficient_evidence', 'description via=inferred', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'values_ungrounded', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 539 — Right To Food

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> agriculture-food-systems`
- **language**: `(none) -> bilingual`
- **website**: `(none) -> https://righttofood.ca`
- **values**: `(none) -> ['Community', 'Help Society', 'Environment', 'Diversity']`
- **mission**:
  - - (none)
  - + Our mission is to end food insecurity by fostering equitable, community‑driven food systems that provide dignified access to healthy food, empower people with skills, and influence inclusive public po… (+7 chars truncated from log)
- **description**:
  - - (none)
  - + Right To Food is a national nonprofit that transforms food insecurity in Canada through a dignity‑first model, partnering with over 450 community organisations to create welcoming spaces for healthy f… (+34 chars truncated from log)
- **sse_reasoning**:
  - - (none)
  - + Right To Food is a registered charity with a clear, people‑first purpose to eradicate food insecurity, describing intentional impact through community partnerships and policy advocacy, and its work directly benefits society and the environment.
- **flags**: `(none) -> ['description via=inferred', 'mission via=inferred', 'values via=absent', 'values_ungrounded', 'language:bilingual via=public_language', 'language_reason:name_llm=en']`

## 541 — MSRK Lifecare Foundation

- **sse**: `(none) -> weak_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> care-health-social-services`
- **language**: `(none) -> en`
- **values**: `(none) -> []`
- **sse_reasoning**:
  - - (none)
  - + The organization is identified as a newly established non‑profit foundation focused on health, well‑being and equitable access to care, which meets the basic SSE must‑haves of a purpose beyond profit and social impact. However, no official website or detailed governance information is available to c… (+35 chars truncated from log)
- **flags**: `(none) -> ['website_unavailable', 'description via=absent', 'mission via=absent', 'values via=absent', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 543 — Calgary Philharmonic Orchestra

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> arts-culture-information`
- **language**: `(none) -> en`
- **values**: `(none) -> ['Artistic Creativity', 'Community', 'Help Society', 'Environment']`
- **sse_reasoning**:
  - - (none)
  - + The Calgary Philharmonic Orchestra is a registered charitable nonprofit whose mission is to enrich communities through music, with clear impact via concerts and education. It meets all three must‑haves and demonstrates investment in people through extensive outreach programs.
- **flags**: `(none) -> ['website_unconfirmed', 'website_geo_conflict', 'description via=absent', 'mission via=absent', 'values via=absent', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 545 — MusiCounts

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> arts-culture-information`
- **language**: `(none) -> en`
- **website**: `(none) -> https://musicounts.ca`
- **values**: `(none) -> ['Community', 'Help Society', 'Environment', 'Diversity', 'Creative Expression']`
- **mission**:
  - - (none)
  - + We invest in schools and communities nationwide through granting programs, empower youth through training and career development, and give a national voice to the importance of music education.
- **description**:
  - - (none)
  - + MusiCounts is Canada’s music education charity that believes music can transform the lives of young people. It works to build a thriving culture of music education across Canada, emphasizing inclusivi… (+34 chars truncated from log)
- **sse_reasoning**:
  - - (none)
  - + MusiCounts is a registered Canadian charity that prioritizes music education, inclusivity and sustainability, clearly stating its purpose beyond profit and describing its community impact through grants and youth training. Its mission-driven work and charitable structure meet the core solidary econo… (+43 chars truncated from log)
- **flags**: `(none) -> ['description via=extracted', 'mission via=extracted', 'values via=extracted', 'length_limit: truncated sse_reasoning_fr', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 546 — Professional Association of Canadian Theatres (PACT)

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> arts-culture-information`
- **language**: `(none) -> en`
- **website**: `(none) -> https://www.pact.ca`
- **values**: `(none) -> ['Community', 'Diversity', 'Help Society', 'Creative Expression']`
- **description**:
  - - (none)
  - + The Professional Association of Canadian Theatres (PACT) is a member‑driven national service organization representing over 160 professional English‑language theatre companies across Canada.
- **sse_reasoning**:
  - - (none)
  - + PACT is a registered nonprofit that clearly prioritises people and the cultural sector over profit, with a mission to strengthen Canadian theatre and concrete programs for advocacy, research and professional development. Its member‑driven governance and equity‑focused language demonstrate a solidari… (+38 chars truncated from log)
- **flags**: `(none) -> ['description via=extracted', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'values_ungrounded', 'length_limit: truncated sse_reasoning_fr', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 547 — Art Gallery of Burlington

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> arts-culture-information`
- **language**: `(none) -> en`
- **values**: `(none) -> ['Community', 'Creative Expression', 'Help Society']`
- **sse_reasoning**:
  - - (none)
  - + The Art Gallery of Burlington is a registered nonprofit that prioritises public benefit by presenting art and offering educational programs, clearly showing purpose beyond profit, intentional impact, and societal contribution. (sse_reasoning en via=inferred)
- **flags**: `(none) -> ['website_unconfirmed', 'description via=absent', 'description_ungrounded', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'values_ungrounded', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 548 — Ontario School of Ballet

- **sse**: `(none) -> no`
- **type**: `(none) -> other`
- **sector**: `(none) -> arts-culture-information`
- **language**: `(none) -> en`
- **website**: `(none) -> https://www.ontarioschoolofballet.com`
- **values**: `(none) -> []`
- **description**:
  - - (none)
  - + Ontario School of Ballet offers ballet and dance classes for students of all ages at two Toronto studios—1133 St. Clair Avenue West and 504 Oakwood Avenue. With over 40 years of experience, the school… (+108 chars truncated from log)
- **sse_reasoning**:
  - - (none)
  - + The Ontario School of Ballet operates as a private, for‑profit dance school with no evidence of nonprofit or cooperative governance. Its purpose is commercial education rather than a public‑benefit mission, so it does not meet SSE criteria.
- **flags**: `(none) -> ['description via=inferred', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 549 — Calgary Arts Development

- **sse**: `(none) -> no`
- **type**: `(none) -> government`
- **sector**: `(none) -> arts-culture-information`
- **language**: `(none) -> en`
- **website**: `(none) -> https://calgaryartsdevelopment.com`
- **values**: `(none) -> ['Community', 'Creative Expression', 'Aesthetic', 'Help Society', 'Diversity']`
- **mission**:
  - - (none)
  - + Calgary Arts Development supports and strengthens the arts to benefit all Calgarians.
- **description**:
  - - (none)
  - + Calgary Arts Development is the City of Calgary’s designated arts development authority, supporting and strengthening the arts for all Calgarians through grant investment, resource allocation, and col… (+24 chars truncated from log)
- **sse_reasoning**:
  - - (none)
  - + The organization is the City of Calgary’s designated arts development authority, making it a government body, which is not eligible for Solidarity Economy classification.
- **flags**: `(none) -> ['description via=extracted', 'mission via=extracted', 'values via=inferred', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 550 — Ontario Creates / Ontario Créatif

- **sse**: `(none) -> no`
- **type**: `(none) -> government`
- **sector**: `(none) -> arts-culture-information`
- **language**: `(none) -> bilingual`
- **website**: `(none) -> https://www.ontariocreates.ca`
- **values**: `(none) -> []`
- **mission**:
  - - (none)
  - + To strengthen the economic and cultural vitality of Ontario’s creative sector by delivering programs, services and investments that foster growth, innovation and global competitiveness.
- **description**:
  - - (none)
  - + Ontario Creates is a Crown agency of the Government of Ontario that promotes and invests in the province’s creative industries—including film, television, digital media, publishing and music—through f… (+52 chars truncated from log)
- **sse_reasoning**:
  - - (none)
  - + Ontario Creates is a provincial Crown agency whose governance is appointed by the Government of Ontario; as a government entity it does not meet the nonprofit/co‑operative/union criteria required for Solidarity Economy alignment.
- **flags**: `(none) -> ['description via=extracted', 'mission via=inferred', 'values via=absent', 'language:bilingual via=llm_name', 'language_reason:name_llm=bilingual']`

## 551 — Orchestra Toronto

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> arts-culture-information`
- **language**: `(none) -> en`
- **website**: `(none) -> https://www.orchestratoronto.ca`
- **values**: `(none) -> ['Community', 'Artistic Creativity', 'Help Society', 'Diversity', 'Environment']`
- **description**:
  - - (none)
  - + Orchestra Toronto is a vibrant hybrid‑community orchestra dedicated to musical excellence and community engagement in Toronto, Ontario.
- **sse_reasoning**:
  - - (none)
  - + Orchestra Toronto is a registered nonprofit that states its purpose is to enrich Toronto’s cultural life through music, explicitly aiming to serve the community and increase accessibility, meeting all three organizational must‑haves.
- **flags**: `(none) -> ['description via=inferred', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'values_ungrounded', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 552 — Theatre Passe Muraille

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> arts-culture-information`
- **language**: `(none) -> en`
- **website**: `(none) -> https://www.passemuraille.ca`
- **values**: `(none) -> ['Community', 'Artistic Creativity', 'Creative Expression', 'Help Society']`
- **sse_reasoning**:
  - - (none)
  - + Theatre Passe Muraille is a registered non‑profit charity whose publicly stated mission focuses on artist development and community‑focused theatre, clearly beyond profit. Its programming and outreach demonstrate intentional social impact, satisfying all three mandatory SSE criteria.
- **flags**: `(none) -> ['description via=absent', 'description_ungrounded', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 553 — Shaw Festival Theatre, Canada

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> arts-culture-information`
- **language**: `(none) -> en`
- **website**: `(none) -> https://www.shawfest.com`
- **values**: `(none) -> []`
- **mission**:
  - - (none)
  - + In the spirit of George Bernard Shaw, the Shaw Festival creates unforgettable theatrical encounters that provoke the mind and stir the soul, fostering community, diversity and artistic excellence.
- **description**:
  - - (none)
  - + The Shaw Festival is a charitable theatre festival in Niagara‑on‑the‑Lake, Ontario, Canada. It is the second‑largest repertory theatre company in North America, presenting the works of George Bernard… (+40 chars truncated from log)
- **sse_reasoning**:
  - - (none)
  - + The Shaw Festival is a registered charitable nonprofit whose mission focuses on cultural enrichment and community engagement, meeting all three SSE must‑haves. Its governance is board‑led and its work benefits society, qualifying for a strong_yes.
- **flags**: `(none) -> ['description via=inferred', 'mission via=inferred', 'values via=absent', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 554 — Mirvish Productions

- **sse**: `(none) -> no`
- **type**: `(none) -> other`
- **sector**: `(none) -> arts-culture-information`
- **language**: `(none) -> en`
- **website**: `(none) -> https://www.mirvish.com`
- **values**: `(none) -> []`
- **description**:
  - - (none)
  - + Mirvish Productions is Canada’s largest commercial theatre production company, presenting a variety of live performances at venues such as the Princess of Wales Theatre and the CAA Ed Mirvish Theatre… (+11 chars truncated from log)
- **sse_reasoning**:
  - - (none)
  - + Mirvish Productions operates as a privately owned commercial theatre company (evidenced by its own website and job listing). As a for‑profit entity, it does not meet the governance criteria for the Solidarity Economy, resulting in a rating of “no”.
- **flags**: `(none) -> ['description via=inferred', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 556 — Réseau québécois pour la réussite éducative

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> education-knowledge`
- **language**: `(none) -> fr`
- **website**: `(none) -> https://reussiteeducative.quebec`
- **values**: `(none) -> ['Community', 'Help Society', 'Knowledge']`
- **mission**:
  - - (none)
  - + To support its members in their missions and mobilise them to undertake collective actions that foster educational perseverance and success.
- **description**:
  - - (none)
  - + The Quebec Network for Educational Success and its members carry out actions to promote school perseverance and educational success.
- **sse_reasoning**:
  - - (none)
  - + The Réseau québécois pour la réussite éducative is a nonprofit network whose mission is to promote school perseverance and educational success, clearly demonstrating a purpose beyond profit and a social impact focus. This aligns with the core SSE principles, supporting a strong_yes rating.
- **flags**: `(none) -> ['description via=extracted', 'mission via=extracted', 'values via=absent', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 557 — Projet inclusion

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> care-health-social-services`
- **language**: `(none) -> fr`
- **values**: `(none) -> ['Community', 'Help Society', 'Help Others', 'Diversity']`
- **description**:
  - - (none)
  - + Projet inclusion works to prevent and reduce mental‑health issues in the community by creating inclusive spaces for interaction and support.
- **sse_reasoning**:
  - - (none)
  - + Projet inclusion is a community‑based nonprofit whose clear purpose is mental‑health prevention and inclusion, showing impact‑focused activities that benefit society, satisfying all core SSE must‑haves.
- **flags**: `(none) -> ['website_unavailable', 'description via=inferred', 'mission via=absent', 'mission_ungrounded', 'values via=absent', 'values_ungrounded', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 559 — Perspective Carrière

- **sse**: `(none) -> no`
- **type**: `(none) -> other`
- **sector**: `(none) -> community-civic-infrastructure`
- **language**: `(none) -> fr`
- **website**: `(none) -> https://pcarriere.com`
- **values**: `(none) -> ['Help Others', 'Community', 'Diversity']`
- **mission**:
  - - (none)
  - + Our mission is to provide specialized career coaching and employment support to help newcomers and immigrants succeed in the Quebec labour market.
- **description**:
  - - (none)
  - + Perspective Carrière provides specialized career coaching and employment assistance to help newcomers and immigrants succeed in the Quebec labour market.
- **sse_reasoning**:
  - - (none)
  - + Perspective Carrière operates as a for‑profit career‑coaching service; there is no evidence it is a registered charity, cooperative or union, and its governance structure is not disclosed as non‑profit. Hence it fails the governance gate for Solidarity Economy.
- **flags**: `(none) -> ['description via=extracted', 'mission via=extracted', 'values via=absent', 'values_ungrounded', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 563 — Better Environmentally Sound Transportation

- **sse**: `(none) -> strong_yes`
- **is_sse**: `False -> True`
- **type**: `(none) -> nonprofit`
- **sector**: `(none) -> environment-circular-economy`
- **language**: `(none) -> en`
- **website**: `(none) -> https://www.best.bc.ca`
- **values**: `(none) -> ['Community', 'Environment', 'Help Society']`
- **mission**:
  - - (none)
  - + Through sustainable transportation, we help build vibrant, inclusive communities.
- **description**:
  - - (none)
  - + Better Environmentally Sound Transportation (BEST) is a Vancouver‑based nonprofit that promotes sustainable, active transportation solutions. Since 1991, BEST provides bike valet services, mobility pr… (+115 chars truncated from log)
- **sse_reasoning**:
  - - (none)
  - + BEST is a registered nonprofit whose purpose goes beyond profit, clearly describing its impact on community health and the environment through sustainable transportation, meeting all three must‑haves and earning a strong_yes rating.
- **flags**: `(none) -> ['description via=extracted', 'mission via=extracted', 'values via=extracted', 'language:en via=llm_name', 'language_reason:name_llm=en']`

