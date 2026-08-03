# Backfill review — last 50 batch

Source: `/tmp/backfill_org_minimal_50_20260802_132734.log`
Orgs with update blocks: **49**
Run summary: `{'mode': 'minimal', 'processed': 50, 'updated': 49, 'skipped': 1, 'skipped_completed': 0, 'skipped_reviewed': 0, 'errors': 0, 'dry_run': False, 'limit': 50, 'last_id': 359, 'resume_with': '--after-id 359'}`

## 292 — Speaking of Wildlife

- **website**: `(none)` → `http://speakingofwildlife.ca`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `en`
- **values**: `(none)` → `['Environment', 'Help Society', 'Knowledge', 'Public Contact', 'Moral Fulfillment']`
- **mission**:
  - before: (none)
  - after: To provide permanent sanctuary to non-releasable Ontario wildlife and to deliver lasting educational experiences that foster appreciation and respect.
- **description**:
  - before: (none)
  - after: Speaking of Wildlife is an Ontario-based wildlife education organization and sanctuary that provides permanent care for non-releasable native wildlife and delivers hands-on educational experiences to… (+46 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: Speaking of Wildlife is a non-profit organization dedicated to wildlife conservation, animal sanctuary care, and public education. Its primary mission prioritizes environmental stewardship and animal welfare over profit.
- **flags**: `(none)` → `['description via=inferred', 'mission via=extracted', 'values via=extracted', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 293 — Community University Television Montreal

- **website**: `(none)` → `https://www.cutvmontreal.org`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `arts-culture-information`
- **language**: `(none)` → `en`
- **values**: `(none)` → `['Community', 'Help Society', 'Creative Expression', 'Knowledge', 'Diversity']`
- **mission**:
  - before: (none)
  - after: To provide accessible space, equipment, skills training, and platform for student and community media producers whose interests and needs are not represented by mainstream commercial television.
- **description**:
  - before: (none)
  - after: Community University Television (CUTV) is Canada's oldest campus-based community television station and media production facility. Operating at Concordia University and across Montreal since 1969, CUT… (+77 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: CUTV is a member and student-driven nonprofit community media organization dedicated to democratizing broadcast media through accessible technology, education, and non-commercial news coverage.
- **flags**: `(none)` → `['description via=inferred', 'mission via=inferred', 'values via=inferred', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 294 — Reimagine Agriculture

- **website**: `(none)` → `https://www.reimagineagriculture.org`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `agriculture-food-systems`
- **language**: `(none)` → `en`
- **values**: `(none)` → `['Environment', 'Help Society', 'Moral Fulfillment']`
- **mission**:
  - before: (none)
  - after: To shape the future of agriculture and food by building a sustainable, resilient, and compassionate food system.
- **description**:
  - before: (none)
  - after: Reimagine Agriculture is a Canadian non-profit advocacy organization working to build a sustainable, resilient, and compassionate food system through education and collaboration.
- **sse_reasoning**:
  - before: (none)
  - after: Reimagine Agriculture is a Canadian non-profit advocacy organization dedicated to building a sustainable and compassionate food system for public and environmental benefit.
- **flags**: `(none)` → `['description via=inferred', 'mission via=extracted', 'values via=extracted', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 296 — Groupe S.M. International

- **sse**: `(none)` → `no`
- **type**: `(none)` → `other`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `[]`
- **description**:
  - before: (none)
  - after: Le Groupe S.M. International Inc. (SMi) was a Montreal-based private engineering and consulting firm providing civil engineering, environmental, laboratory, and infrastructure integration services.
- **sse_reasoning**:
  - before: (none)
  - after: Le Groupe S.M. International was a conventional privately owned for-profit engineering firm. Conventional for-profit corporate structures fail the Solidarity Economy governance requirement.
- **flags**: `(none)` → `['description via=inferred', 'mission via=absent', 'values via=absent', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`
- KEEP: is_sse=False, website=(none), mission=(none)

## 297 — Town of Aurora

- **website**: `(none)` → `https://www.aurora.ca`
- **sse**: `(none)` → `no`
- **type**: `(none)` → `government`
- **sector**: `(none)` → `community-civic-infrastructure`
- **language**: `(none)` → `en`
- **values**: `(none)` → `['Community', 'Help Society', 'Public Contact', 'Stability', 'Practicality']`
- **mission**:
  - before: (none)
  - after: To provide accountable local governance, maintain community infrastructure, and deliver municipal programs and services that enhance the quality of life for residents of Aurora.
- **description**:
  - before: (none)
  - after: The Town of Aurora is a municipal government organization in Ontario, Canada, responsible for local public administration, community infrastructure, parks, and civic services.
- **sse_reasoning**:
  - before: (none)
  - after: The Town of Aurora is a municipal government body. Under Solidarity Economy evaluation criteria, public-sector government entities are excluded from SSE rating and classified as government.
- **flags**: `(none)` → `['government_employer', 'description via=inferred', 'mission via=inferred', 'values via=inferred', 'language:en via=llm_name', 'language_reason:name_llm=en']`
- KEEP: is_sse=False

## 298 — Valleyfield Farm

- **website**: `(none)` → `https://www.valleyfieldfarmltd.com`
- **sse**: `(none)` → `no`
- **type**: `(none)` → `other`
- **sector**: `(none)` → `agriculture-food-systems`
- **language**: `(none)` → `en`
- **values**: `(none)` → `['Family', 'Tradition', 'Community', 'Practicality']`
- **mission**:
  - before: (none)
  - after: To provide quality products and personalized service for pets, livestock, lawn, garden, and stable needs while supporting local agricultural and residential customers.
- **description**:
  - before: (none)
  - after: Valleyfield Farm Ltd. is a family-owned and operated farm supply business established in 1935. It offers products for pets, livestock, lawns, gardens, and stables, along with knowledgeable customer se… (+6 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: Valleyfield Farm Ltd. is a conventional family-owned, for-profit retail business. Lacking non-profit or cooperative governance structure, it does not align with Solidarity Economy standards.
- **flags**: `(none)` → `['type via=extracted', 'description via=inferred', 'mission via=inferred', 'values via=extracted', 'language:en via=llm_name', 'language_reason:name_llm=en']`
- KEEP: is_sse=False

## 299 — Six Shooter Records

- **website**: `(none)` → `https://www.sixshooterrecords.com`
- **sse**: `(none)` → `no`
- **type**: `(none)` → `other`
- **sector**: `(none)` → `arts-culture-information`
- **language**: `(none)` → `en`
- **values**: `(none)` → `['Artistic Creativity', 'Creative Expression', 'Community', 'Diversity']`
- **mission**:
  - before: (none)
  - after: To champion distinct songwriters regardless of genre through an artist-first philosophy that focuses on art before commerce.
- **description**:
  - before: (none)
  - after: Established in 2000 in Toronto, Six Shooter Records is an independent full-service music company and record label operating on an artist-first business model.
- **sse_reasoning**:
  - before: (none)
  - after: Six Shooter Records is a privately owned independent record label. As a conventional for-profit enterprise, it does not meet the Solidarity Economy governance criteria.
- **flags**: `(none)` → `['automatic_no: conventional_for_profit', 'description via=inferred', 'mission via=extracted', 'values via=extracted', 'language:en via=llm_name', 'language_reason:name_llm=en']`
- KEEP: is_sse=False

## 300 — Le Groupe l’Entre-Gens

- **website**: `(none)` → `https://groupeentre-gens.ca`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `care-health-social-services`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Community', 'Help Others', 'Help Society']`
- **mission**:
  - before: (none)
  - after: To support senior wellbeing and social connection in the community through meals on wheels, listening, mutual aid, and accessible social activities.
- **description**:
  - before: (none)
  - after: Le Groupe L'Entre-Gens is a Montreal-based community organization providing meals on wheels, listening and referral services, volunteer opportunities, and social activities for seniors and local resid… (+5 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: Le Groupe L'Entre-Gens is a community nonprofit dedicated to senior wellbeing and mutual support in Montreal through meals on wheels and listening services, driven by a social care mission rather than profit.
- **flags**: `(none)` → `['description via=inferred', 'mission via=inferred', 'values via=extracted', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 301 — Alimenter Saint-Léonard

- **website**: `(none)` → `https://alimentersaintleonard.com`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `agriculture-food-systems`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Community', 'Help Society', 'Honesty and Integrity']`
- **mission**:
  - before: (none)
  - after: To coordinate neighborhood food security initiatives and foster solidarity among local organizations to better serve low-income individuals and families in Saint-Léonard.
- **description**:
  - before: (none)
  - after: Alimenter Saint-Léonard is a nonprofit organization focused on local food security and community concertation in Saint-Léonard, Montreal, supporting low-income individuals and families.
- **sse_reasoning**:
  - before: (none)
  - after: Alimenter Saint-Léonard is a registered nonprofit community organization dedicated entirely to food security, mutual aid, and local solidarity for low-income residents.
- **flags**: `(none)` → `['description via=inferred', 'mission via=inferred', 'values via=absent', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 302 — Aids Community Care Montreal

- **website**: `(none)` → `https://accmontreal.org`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `care-health-social-services`
- **language**: `(none)` → `bilingual`
- **values**: `(none)` → `['Community', 'Help Society', 'Help Others', 'Moral Fulfillment', 'Group & Team']`
- **mission**:
  - before: (none)
  - after: To enhance the quality of life of people living with HIV and hepatitis C, and to prevent the transmission of HIV and other STBBIs through education, support, and community action.
- **description**:
  - before: (none)
  - after: AIDS Community Care Montreal (ACCM) is a volunteer-powered community organization providing education, prevention, treatment information, and support services to people living with or affected by HIV,… (+31 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: ACCM is a volunteer-powered community nonprofit delivering health, prevention, and care services for people living with HIV and STBBIs. It operates on non-profit, community-driven care and solidarity principles.
- **flags**: `(none)` → `['description via=inferred', 'mission via=inferred', 'values via=inferred', 'language:bilingual via=public_language', 'language_reason:name_llm=en']`

## 303 — Centre de prévention et d’intervention pour victimes d’agression sexuelle

- **website**: `(none)` → `https://cpivas.com`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `care-health-social-services`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Help Others', 'Community', 'Help Society', 'Honesty and Integrity', 'Moral Fulfillment']`
- **mission**:
  - before: (none)
  - after: To offer specialized intervention, psychotherapy, and prevention services to victims of sexual violence and their families, supporting healing and community well-being.
- **description**:
  - before: (none)
  - after: CPIVAS is a community-based organization dedicated to the prevention of sexual assault and the provision of intervention and support services for victims and their loved ones in the Laval region.
- **sse_reasoning**:
  - before: (none)
  - after: As a registered community nonprofit providing essential support services for sexual assault survivors, CPIVAS operates with a clear public-benefit mission and non-distribution constraint.
- **flags**: `(none)` → `['description via=inferred', 'mission via=inferred', 'values via=inferred', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 304 — EcoFair Toronto

- **website**: `(none)` → `https://ecofair-toronto.org`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `en`
- **values**: `(none)` → `['Community', 'Environment', 'Help Society', 'Honesty and Integrity']`
- **mission**:
  - before: (none)
  - after: To bring together individuals, organizations, and eco-friendly businesses in an annual celebration dedicated to creating a greener, healthier planet and fostering sustainability.
- **description**:
  - before: (none)
  - after: EcoFair Toronto is a free, family-friendly annual event that showcases environmental non-profits, green businesses, makers, and community groups dedicated to creating a greener, healthier planet.
- **sse_reasoning**:
  - before: (none)
  - after: EcoFair Toronto is a community-focused environmental nonprofit that organizes free sustainability events, connecting the public with green initiatives and non-profits.
- **flags**: `(none)` → `['description via=extracted', 'mission via=inferred', 'values via=absent', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 305 — Langford Conservancy

- **website**: `(none)` → `https://lconserv.ca/`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `en`
- **values**: `(none)` → `['Community', 'Environment', 'Help Society', 'Honesty and Integrity', 'Tradition']`
- **mission**:
  - before: (none)
  - after: To promote an inclusive rural community, protect local farmland and ecosystems, and preserve our shared heritage while supporting community well-being in Brant County.
- **description**:
  - before: (none)
  - after: Langford Conservancy is a registered not-for-profit land trust operating in Brant County, Ontario. It manages the historic Langford Schoolhouse as a rural community hub, protects local farmland and ec… (+44 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: As a community-based not-for-profit land trust, Langford Conservancy protects local ecosystems, preserves agricultural land, and supports vulnerable workers with a clear public benefit mission.
- **flags**: `(none)` → `['description via=inferred', 'mission via=inferred', 'values via=extracted', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 306 — Association des locataires de Villeray

- **website**: `(none)` → `http://locatairesdevilleray.com`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `housing-collective-real-estate`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Community', 'Help Society', 'Honesty and Integrity', 'Moral Fulfillment', 'Work with Others']`
- **mission**:
  - before: (none)
  - after: To defend tenants' rights and promote the right to housing through mutual aid, information, and community action to improve the living conditions of tenants in Villeray.
- **description**:
  - before: (none)
  - after: Association des locataires de Villeray (ALV) is a non-profit organization dedicated to defending tenants' rights, promoting housing rights, and improving the living conditions of tenants in the Viller… (+28 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: ALV is a non-profit tenant association operating on principles of mutual aid and collective action to defend housing rights and empower residents.
- **flags**: `(none)` → `['description via=inferred', 'mission via=inferred', 'values via=extracted', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 308 — Compagnons de Montréal

- **website**: `(none)` → `https://compagnonsdemontreal.com`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `care-health-social-services`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Community', 'Help Others', 'Help Society', 'Diversity', 'Honesty and Integrity']`
- **mission**:
  - before: (none)
  - after: Since 1960, Compagnons de Montréal has been providing a living, learning and inclusive environment that is stimulating for adults who live with an intellectual difference.
- **description**:
  - before: (none)
  - after: Compagnons de Montréal is an independent community group providing a living, learning, and inclusive environment for adults living with intellectual disabilities or autism spectrum disorder.
- **sse_reasoning**:
  - before: (none)
  - after: Registered community nonprofit providing inclusive living and learning environments for adults with intellectual disabilities. Demonstrates clear public-benefit mission and long-standing social impact.
- **flags**: `(none)` → `['description via=extracted', 'mission via=extracted', 'values via=inferred', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 309 — Auberge Madeleine

- **website**: `(none)` → `https://www.aubergemadeleine.org`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `care-health-social-services`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Community', 'Help Others', 'Help Society', 'Honesty and Integrity', 'Moral Fulfillment']`
- **mission**:
  - before: (none)
  - after: To keep women sheltered from hunger, violence, and solitude, offering a safe haven and short-term support to help them regain stability.
- **description**:
  - before: (none)
  - after: Auberge Madeleine is a registered charitable organization in Montreal providing a safe shelter, food, support, and referral services for women experiencing homelessness or domestic violence.
- **sse_reasoning**:
  - before: (none)
  - after: Auberge Madeleine is a registered nonprofit charity providing essential shelter and support for vulnerable women. Its mission prioritizes community care and social wellbeing over profit.
- **flags**: `(none)` → `['description via=inferred', 'mission via=inferred', 'values via=inferred', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 310 — Projet de prévention des toxicomanies Cumulus

- **website**: `(none)` → `https://www.projetcumulus.ca`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `care-health-social-services`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Help Others', 'Help Society', 'Community', 'Honesty and Integrity']`
- **mission**:
  - before: (none)
  - after: Cumulus's mission is to prevent substance abuse by adopting a comprehensive approach focused on the individual through actions that support people and communities.
- **description**:
  - before: (none)
  - after: Projet Cumulus is a community organization based in Lachine, Quebec, dedicated to substance abuse prevention and street work, supporting individuals and communities through global, person-centered app… (+8 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: Cumulus is a community-based nonprofit focused on substance abuse prevention and street work, operating with a clear public-benefit mission and non-distribution constraints.
- **flags**: `(none)` → `['description via=extracted', 'mission via=extracted', 'values via=inferred', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 311 — Action-Gardien, Corporation de développement communautaire de Pointe-Saint-Charles

- **website**: `(none)` → `https://www.actiongardien.org`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `community-civic-infrastructure`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Community', 'Help Society', 'Honesty and Integrity', 'Group & Team', 'Moral Fulfillment']`
- **mission**:
  - before: (none)
  - after: La Corporation de développement communautaire (CDC) Action-Gardien est le regroupement des organismes communautaires du quartier Pointe-Saint-Charles.
- **description**:
  - before: (none)
  - after: Action-Gardien is the community development corporation (CDC) of Pointe-Saint-Charles in Montreal, bringing together the neighborhood's community organizations to improve local living conditions and d… (+24 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: Action-Gardien is a community development corporation uniting local nonprofits in Pointe-Saint-Charles. It embodies solidarity economy principles through democratic community organizing and collective advocacy for social justice.
- **flags**: `(none)` → `['description via=inferred', 'mission via=extracted', 'values via=inferred', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 312 — Ecology Action Centre

- **website**: `(none)` → `https://ecologyaction.ca`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `bilingual`
- **values**: `(none)` → `['Environment', 'Community', 'Help Society', 'Honesty and Integrity']`
- **mission**:
  - before: (none)
  - after: To work at the local, regional, national, and international level to build a healthier and more sustainable world as a strong voice and watchdog for our environment.
- **description**:
  - before: (none)
  - after: The Ecology Action Centre is a member-based environmental charity in Nova Scotia taking leadership on critical issues from biodiversity protection to climate change and environmental justice since 197… (+2 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: Registered environmental charity with a clear public-benefit mission and non-distribution constraint. Works extensively on biodiversity, climate action, and community environmental justice.
- **flags**: `(none)` → `['description via=inferred', 'mission via=inferred', 'values via=inferred', 'language:bilingual via=public_language', 'language_reason:name_llm=en']`

## 313 — Ressources Jeunesse de Saint-Laurent

- **website**: `(none)` → `https://www.rjsl.ca`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `care-health-social-services`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Help Society', 'Community', 'Help Others']`
- **mission**:
  - before: (none)
  - after: To provide temporary housing with psychosocial support to homeless youth aged 16 to 22, helping them stabilize their situation and reintegrate into society.
- **description**:
  - before: (none)
  - after: Ressources Jeunesse de Saint-Laurent (RJSL) is a nonprofit organization founded in 1986 that provides temporary housing and psychosocial support to homeless youth aged 16 to 22, along with supervised… (+28 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: RJSL is a registered community nonprofit operating a shelter and housing support for at-risk youth. It clearly prioritizes social mission and community care over profit.
- **flags**: `(none)` → `['description via=inferred', 'mission via=inferred', 'values via=absent', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 314 — Ontario Land Trust Alliance

- **website**: `(none)` → `https://www.olta.ca`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `en`
- **values**: `(none)` → `['Environment', 'Community', 'Help Society', 'Knowledge', 'Group & Team']`
- **mission**:
  - before: (none)
  - after: To strengthen land conservation in Ontario by building and supporting a strong land trust movement that achieves lasting conservation results on the ground.
- **description**:
  - before: (none)
  - after: The Ontario Land Trust Alliance is a registered charity that empowers and supports land trusts across Ontario, building skills, connecting communities, and advancing local land conservation.
- **sse_reasoning**:
  - before: (none)
  - after: OLTA is a registered environmental charity with an independent non-distribution governance structure dedicated to supporting community-based land conservation across Ontario.
- **flags**: `(none)` → `['description via=inferred', 'mission via=extracted', 'values via=extracted', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 315 — Eppendorf Group

- **website**: `(none)` → `https://www.eppendorf.com`
- **sse**: `(none)` → `no`
- **type**: `(none)` → `other`
- **sector**: `(none)` → `manufacturing-production`
- **language**: `(none)` → `bilingual`
- **values**: `(none)` → `['Competence', 'Environment', 'Honesty and Integrity', 'Practicality']`
- **mission**:
  - before: (none)
  - after: To improve human living conditions significantly by developing innovative solutions and tools for life science research and clinical laboratories.
- **description**:
  - before: (none)
  - after: Eppendorf is a leading international life science company that develops, manufactures, and distributes instruments, consumables, and services for use in laboratories worldwide.
- **sse_reasoning**:
  - before: (none)
  - after: Eppendorf is a conventional multinational for-profit life science corporation. It does not meet the solidarity economy governance criteria.
- **flags**: `(none)` → `['conventional for-profit', 'description via=extracted', 'mission via=inferred', 'values via=inferred', 'language:bilingual via=public_language', 'language_reason:name_llm=en']`
- KEEP: is_sse=False

## 316 — The Canadian Conservation Photographers Collective

- **website**: `(none)` → `https://www.theccpc.ca`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `en`
- **values**: `(none)` → `['Environment', 'Help Society', 'Moral Fulfillment', 'Community']`
- **mission**:
  - before: (none)
  - after: To foster a deeper understanding of environmental issues, spark meaningful change, and support conservation efforts through impactful visual storytelling and environmental advocacy.
- **description**:
  - before: (none)
  - after: The Canadian Conservation Photographers Collective is a volunteer-run group of photographers and videographers using visual storytelling to shed light on pressing conservation issues, biodiversity los… (+27 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: The CCPC is a volunteer-led nonprofit dedicated to environmental conservation and public education through visual storytelling.
- **flags**: `(none)` → `['description via=inferred', 'mission via=inferred', 'values via=inferred', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 317 — Succès RH

- **website**: `(none)` → `https://succesrh.com`
- **sse**: `(none)` → `no`
- **type**: `(none)` → `other`
- **sector**: `(none)` → `community-civic-infrastructure`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `[]`
- **mission**:
  - before: (none)
  - after: To support businesses in optimizing their human resources management and organizational performance through expert consulting.
- **description**:
  - before: (none)
  - after: Succès RH is a business consulting and human resources firm providing strategic HR services and professional support to organizations.
- **sse_reasoning**:
  - before: (none)
  - after: Succès RH is a conventional private business consulting firm without cooperative, nonprofit, or solidarity economy governance.
- **flags**: `(none)` → `['conventional for-profit', 'description via=inferred', 'mission via=inferred', 'values via=absent', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`
- KEEP: is_sse=False

## 318 — Café-Jeunesse Multiculturel

- **website**: `(none)` → `http://www.cafejeunessemulticulturel.org`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `community-civic-infrastructure`
- **language**: `(none)` → `bilingual`
- **values**: `(none)` → `['Community', 'Diversity', 'Help Society', 'Honesty and Integrity']`
- **mission**:
  - before: (none)
  - after: To offer a permanent meeting and exchange space to youth of different cultures aged 13 to 30, creating a favorable space for personal development, integration, involvement, and citizen participation.
- **description**:
  - before: (none)
  - after: Café-Jeunesse Multiculturel is a non-profit organization in Montréal-Nord that has invested in youth for over 30 years, offering a permanent meeting and exchange space for multicultural youth aged 13… (+6 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: Café-Jeunesse Multiculturel is a registered non-profit organization dedicated to multicultural youth empowerment, social integration, and community solidarity in Montréal-Nord.
- **flags**: `(none)` → `['description via=extracted', 'mission via=extracted', 'values via=extracted', 'language:bilingual via=llm_name', 'language_reason:name_llm=bilingual']`

## 320 — CCSE Maisonneuve

- **website**: `(none)` → `https://ccse.ca`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `community-civic-infrastructure`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Community', 'Environment', 'Help Society', 'Diversity', 'Group & Team']`
- **mission**:
  - before: (none)
  - after: To provide inclusive, engaging, and eco-responsible community, cultural, social, and educational programs and services that serve and enrich residents of the Hochelaga-Maisonneuve neighborhood.
- **description**:
  - before: (none)
  - after: CCSE Maisonneuve is a community, cultural, social, and educational center in Montreal's Hochelaga-Maisonneuve borough, offering inclusive, engaging, innovative, and eco-responsible activities for loca… (+12 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: CCSE Maisonneuve is a community-based nonprofit organization in Montreal offering inclusive, eco-responsible recreational and social services with a clear public benefit.
- **flags**: `(none)` → `['description via=inferred', 'mission via=inferred', 'values via=extracted', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 321 — Bruce Trail Conservancy

- **website**: `(none)` → `https://brucetrail.org`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `en`
- **values**: `(none)` → `['Environment', 'Community', 'Help Society', 'Tradition', 'Honesty and Integrity']`
- **mission**:
  - before: (none)
  - after: Preserving a ribbon of wilderness, for everyone, forever.
- **description**:
  - before: (none)
  - after: The Bruce Trail Conservancy is a charitable land trust committed to preserving a ribbon of wilderness along the Niagara Escarpment and caring for Canada's oldest and longest marked footpath.
- **sse_reasoning**:
  - before: (none)
  - after: As a registered charitable land trust dedicated to environmental conservation and public access along the Niagara Escarpment, the Bruce Trail Conservancy meets all Solidarity Economy governance and purpose criteria.
- **flags**: `(none)` → `['description via=inferred', 'mission via=extracted', 'values via=absent', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 322 — Auberge et Bistro des Balcons

- **website**: `(none)` → `https://lesbalcons.ca`
- **sse**: `(none)` → `no`
- **type**: `(none)` → `other`
- **sector**: `(none)` → `arts-culture-information`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Community', 'Affiliation', 'Help Others']`
- **mission**:
  - before: (none)
  - after: To provide a welcoming, multigenerational space that connects travelers and locals through hospitality, local products, and a year-round cultural and artistic program in Baie-Saint-Paul.
- **description**:
  - before: (none)
  - after: Les Balcons is a cultural youth hostel and bistro located in Baie-Saint-Paul, Charlevoix. It offers lodging, a fully equipped kitchen, and a year-round cultural program featuring local products and co… (+20 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: Les Balcons operates as a cultural hostel and bistro. While it provides community gathering spaces and local products, it is a commercial hospitality and restaurant business without nonprofit or cooperative governance.
- **flags**: `(none)` → `['conventional business', 'description via=inferred', 'mission via=inferred', 'values via=inferred', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`
- KEEP: is_sse=False

## 323 — Foxhole Farm

- **website**: `(none)` → `https://foxholefarmohio.com`
- **sse**: `(none)` → `no`
- **type**: `(none)` → `other`
- **sector**: `(none)` → `agriculture-food-systems`
- **language**: `(none)` → `en`
- **values**: `(none)` → `['Environment', 'Community', 'Practicality']`
- **mission**:
  - before: (none)
  - after: To use regenerative practices to grow nourishing food for the local community while making sustainable farm management decisions that positively impact our region.
- **description**:
  - before: (none)
  - after: Foxhole Farm is a full-time family farm nestled in Brookville, Ohio, dedicated to growing a wide variety of fresh produce, herbs, and bakes using regenerative agriculture practices for the Miami Valle… (+18 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: Foxhole Farm is a family-run farm and private business using regenerative practices. Without a registered nonprofit, cooperative, or union governance structure, it falls under private enterprise.
- **flags**: `(none)` → `['private business', 'description via=extracted', 'mission via=inferred', 'values via=inferred', 'language:en via=llm_name', 'language_reason:name_llm=en']`
- KEEP: is_sse=False

## 325 — Centre communautaire Radisson

- **website**: `(none)` → `https://centreradisson.com`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `care-health-social-services`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Community', 'Help Others', 'Help Society', 'Honesty and Integrity', 'Diversity']`
- **mission**:
  - before: (none)
  - after: To develop the citizen participation of people with physical disabilities within an inclusive, stimulating, and engaged environment where difference is a strength and everyone can exercise their agenc… (+2 chars truncated from log)
- **description**:
  - before: (none)
  - after: Centre communautaire Radisson is a community centre in Montreal that offers an inclusive, stimulating environment for adults with physical disabilities, fostering citizen participation, social connect… (+18 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: As a registered community nonprofit supporting people with physical disabilities, Centre communautaire Radisson champions collective care, social inclusion, and citizen empowerment.
- **flags**: `(none)` → `['description via=inferred', 'mission via=inferred', 'values via=extracted', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 327 — Atelier habitation Montréal

- **website**: `(none)` → `https://atelierhabitationmontreal.org`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `housing-collective-real-estate`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Community', 'Help Society', 'Moral Fulfillment', 'Practicality']`
- **mission**:
  - before: (none)
  - after: To invest with passion in developing and preserving non-profit housing, placing clients' interests at the heart of our support to consolidate autonomy and build solidary, sustainable living environmen… (+3 chars truncated from log)
- **description**:
  - before: (none)
  - after: Atelier habitation Montréal is a nonprofit social economy organization dedicated to the development and preservation of non-profit housing and community real estate projects in Montréal.
- **sse_reasoning**:
  - before: (none)
  - after: As a registered social economy nonprofit supporting community housing and co-operatives, Atelier habitation Montréal clearly prioritizes public benefit over profit.
- **flags**: `(none)` → `['description via=extracted', 'mission via=extracted', 'values via=extracted', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 329 — Bikechain

- **website**: `(none)` → `https://bikechain.ca`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `en`
- **values**: `(none)` → `['Community', 'Environment', 'Help Others', 'Knowledge', 'Honesty and Integrity']`
- **mission**:
  - before: (none)
  - after: To promote safe cycling and sustainable transportation by providing accessible do-it-yourself bicycle repair education, free rentals, and community-focused workshops on campus.
- **description**:
  - before: (none)
  - after: Bikechain is a campus-based do-it-yourself bicycle repair shop serving the University of Toronto community and the public. It offers repair support, free bike rentals for students, workshops, and incl… (+18 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: Bikechain operates as a student levy-funded non-profit educational bicycle repair space, prioritizing community access, skill-sharing, and environmental sustainability over profit.
- **flags**: `(none)` → `['description via=extracted', 'mission via=inferred', 'values via=inferred', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 330 — L’Association Entre tes Mains

- **website**: `(none)` → `https://www.entretesmains.com`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `care-health-social-services`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Help Society', 'Community', 'Moral Fulfillment', 'Affiliation']`
- **mission**:
  - before: (none)
  - after: To support people in financial difficulty by offering accessible food aid, affordable thrift goods, and community mutual aid within Verdun.
- **description**:
  - before: (none)
  - after: L'Association Entre Tes Mains is a non-profit community organization based in Verdun, Montreal, that provides food assistance, affordable second-hand clothing, and mutual aid to individuals and famili… (+33 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: As a registered non-profit community organization offering food security and mutual aid, it operates entirely for public benefit with non-distribution constraints.
- **flags**: `(none)` → `['description via=inferred', 'mission via=inferred', 'values via=inferred', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 331 — Hearts Content Organic Farm

- **website**: `(none)` → `https://hcof.ca`
- **sse**: `(none)` → `no`
- **type**: `(none)` → `other`
- **sector**: `(none)` → `agriculture-food-systems`
- **language**: `(none)` → `en`
- **values**: `(none)` → `['Environment', 'Community', 'Moral Fulfillment', 'Practicality']`
- **mission**:
  - before: (none)
  - after: Our mission is to practice organic farming, wildcraft medicinal herbs, conserve the land, and host eco-farm stays that connect people with nature and sustainable agriculture.
- **description**:
  - before: (none)
  - after: Heart's Content Organic Farmstead is a 57-acre organic farm in Brant County, Ontario, specializing in growing and wildcrafting medicinal herbs, producing herbal goods, land conservation, and offering… (+15 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: Heart's Content Organic Farmstead is a privately operated organic farm and eco-tourism business. While it engages in sustainable agriculture and conservation, it lacks nonprofit, cooperative, or union governance.
- **flags**: `(none)` → `['private business', 'description via=extracted', 'mission via=inferred', 'values via=extracted', 'language:en via=llm_name', 'language_reason:name_llm=en']`
- KEEP: is_sse=False

## 332 — WCS Canada

- **website**: `(none)` → `https://wcscanada.org`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `en`
- **values**: `(none)` → `['Environment', 'Knowledge', 'Help Society', 'Community', 'Research and Development']`
- **mission**:
  - before: (none)
  - after: Protecting Canada's natural wonders and tackling the climate crisis through on-the-ground scientific research and policy action to ensure wildlife thrives.
- **description**:
  - before: (none)
  - after: Wildlife Conservation Society Canada (WCS Canada) is a conservation organization that uses a blend of scientific research and policy action to protect wildlife and wild ecosystems across Canada.
- **sse_reasoning**:
  - before: (none)
  - after: WCS Canada is a registered conservation charity dedicated to protecting ecosystems and wildlife through science. It meets all solidarity economy must-haves for environmental and public benefit.
- **flags**: `(none)` → `['description via=inferred', 'mission via=inferred', 'values via=inferred', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 333 — Enfant d’abord

- **website**: `(none)` → `https://enfantdabord.org`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `agriculture-food-systems`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Help Society', 'Community', 'Honesty and Integrity']`
- **mission**:
  - before: (none)
  - after: To help people in vulnerable situations in Laval access healthy food.
- **description**:
  - before: (none)
  - after: Enfant d'abord is a community organization based in Laval, Quebec, founded in 2000, dedicated to helping vulnerable individuals and families access healthy food.
- **sse_reasoning**:
  - before: (none)
  - after: Enfant d'abord is a registered community nonprofit tackling food security for vulnerable populations in Laval, fulfilling all core Solidarity Economy requirements.
- **flags**: `(none)` → `['description via=inferred', 'mission via=extracted', 'values via=absent', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 334 — Bois Urbain

- **website**: `(none)` → `https://www.boisurbain.org`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `community-civic-infrastructure`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Community', 'Help Society', 'Moral Fulfillment', 'Practicality', 'Knowledge']`
- **mission**:
  - before: (none)
  - after: To improve the lives of young people by offering real job experience and training in woodworking, finishing, and handling, while producing local solid wood furniture.
- **description**:
  - before: (none)
  - after: Bois Urbain is a Montreal-based woodworking enterprise and social economy organization that manufactures solid wood furniture while providing professional integration and training for young people.
- **sse_reasoning**:
  - before: (none)
  - after: Bois Urbain is a registered nonprofit social enterprise dedicated to workforce integration and local solid wood manufacturing. It meets must-haves through its clear social mission.
- **flags**: `(none)` → `['description via=extracted', 'mission via=extracted', 'values via=extracted', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 335 — Relay Education

- **website**: `(none)` → `https://relayeducation.on.ca`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `en`
- **values**: `(none)` → `['Environment', 'Help Society', 'Knowledge', 'Community', 'Moral Fulfillment']`
- **mission**:
  - before: (none)
  - after: To inspire the next generation of environmental leaders through hands-on education about renewable energy, climate change, and sustainability.
- **description**:
  - before: (none)
  - after: Relay Education is a Canadian environmental education charity that engages youth in renewable energy, climate action, and water conservation through hands-on learning programs across schools and commu… (+7 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: Relay Education is a registered environmental charity with a clear public-benefit mission focused on climate and renewable energy education for youth.
- **flags**: `(none)` → `['description via=inferred', 'mission via=inferred', 'values via=inferred', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 336 — Gbi

- **website**: `(none)` → `https://gbi.georgia.gov`
- **sse**: `(none)` → `no`
- **type**: `(none)` → `government`
- **sector**: `(none)` → `community-civic-infrastructure`
- **language**: `(none)` → `en`
- **values**: `(none)` → `[]`
- **mission**:
  - before: (none)
  - after: To provide state-of-the-art investigative, scientific, and information services and resources to the criminal justice community and the citizens of Georgia.
- **description**:
  - before: (none)
  - after: The Georgia Bureau of Investigation is an independent state law enforcement agency that provides investigative, forensic, and information services to local, state, and federal criminal justice partner… (+2 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: The Georgia Bureau of Investigation is a public government law enforcement agency. Government bodies are excluded from Solidarity Economy (SSE) alignment.
- **flags**: `(none)` → `['government body', 'description via=inferred', 'mission via=inferred', 'values via=absent', 'language:en via=public_language', 'language_reason:insufficient_signal']`
- KEEP: is_sse=False

## 337 — Centre de formation populaire

- **website**: `(none)` → `https://lecfp.qc.ca`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `education-knowledge`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Community', 'Help Society', 'Knowledge', 'Honesty and Integrity']`
- **mission**:
  - before: (none)
  - after: To support associative and democratic life, intervention practices, and concerted action among community organizations to help them better intervene in their communities through popular education.
- **description**:
  - before: (none)
  - after: Founded in 1971, the Centre de formation populaire contributes to the consolidation and development of community organizations in Quebec by supporting associative life, democratic governance, and coll… (+10 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: An autonomous community-based training organization operating since 1971. It directly strengthens the social economy and community sector through democratic governance and popular education.
- **flags**: `(none)` → `['description via=extracted', 'mission via=extracted', 'values via=extracted', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 338 — École de danse contemporaine de Montréal

- **website**: `(none)` → `https://www.edcm.ca/`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `arts-culture-information`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Artistic Creativity', 'Competence', 'Knowledge', 'Community', 'Research and Development']`
- **mission**:
  - before: (none)
  - after: To provide leading-edge, rigorous contemporary dance training as a fertile ground for artistic research, development, and the emergence of new trends in the performing arts.
- **description**:
  - before: (none)
  - after: Founded in 1981, the École de danse contemporaine de Montréal is a leading centre of excellence in Canadian performing arts, offering rigorous contemporary dance training, artistic research, and profe… (+20 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: As a registered nonprofit educational institution supporting the performing arts and cultural community, EDCM meets SSE governance standards with a clear public-benefit mission.
- **flags**: `(none)` → `['description via=inferred', 'mission via=inferred', 'values via=inferred', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 339 — Centre des Aînés de Villeray

- **website**: `(none)` → `https://ainesvilleray.com`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `care-health-social-services`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Community', 'Help Others', 'Help Society', 'Affiliation', 'Honesty and Integrity']`
- **mission**:
  - before: (none)
  - after: To break isolation among seniors in the Villeray neighborhood by offering diverse activities, services, and support that foster social ties, community participation, and a better quality of life.
- **description**:
  - before: (none)
  - after: Centre des aînés de Villeray is a community organization in Montreal dedicated to improving the quality of life for seniors by offering social, recreational, and support activities that promote autono… (+32 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: As a registered community nonprofit offering social and support services for seniors, it clearly prioritizes public benefit and community care over profit.
- **flags**: `(none)` → `['description via=inferred', 'mission via=inferred', 'values via=inferred', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 340 — EarthBites Society

- **website**: `(none)` → `https://www.earthbites.ca`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `education-knowledge`
- **language**: `(none)` → `en`
- **values**: `(none)` → `['Community', 'Environment', 'Help Society', 'Knowledge', 'Practicality']`
- **mission**:
  - before: (none)
  - after: Earthbites partners with schools to introduce and manage gardens, utilizing outdoor spaces as classrooms to help students engage in growing organic food.
- **description**:
  - before: (none)
  - after: Earthbites is a Vancouver-based school garden facilitator helping schools introduce and manage gardens as well as hosting hands-on workshops.
- **sse_reasoning**:
  - before: (none)
  - after: Earthbites is a registered nonprofit society operating school garden and nutrition education programs, demonstrating clear community and environmental benefit.
- **flags**: `(none)` → `['description via=extracted', 'mission via=inferred', 'values via=extracted', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 341 — StopGap Foundation

- **website**: `(none)` → `https://stopgap.ca`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `community-civic-infrastructure`
- **language**: `(none)` → `en`
- **values**: `(none)` → `['Community', 'Help Society', 'Diversity']`
- **mission**:
  - before: (none)
  - after: Raising awareness and removing barriers to create a world where every person can access every space.
- **description**:
  - before: (none)
  - after: StopGap Foundation helps communities discover the benefit of barrier-free spaces and provides support to create them. Through Community Ramp Projects, the foundation raises awareness and removes physi… (+73 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: StopGap Foundation is a registered Canadian charity dedicated to disability justice, community accessibility, and social inclusion through barrier-free infrastructure and awareness projects.
- **flags**: `(none)` → `['description via=extracted', 'mission via=extracted', 'values via=inferred', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 345 — Leadnow

- **website**: `(none)` → `https://www.leadnow.ca`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `community-civic-infrastructure`
- **language**: `(none)` → `bilingual`
- **values**: `(none)` → `['Help Society', 'Community', 'Influence People', 'Honesty and Integrity']`
- **mission**:
  - before: (none)
  - after: Fighting for a better Canada through people-powered campaigns, grassroots mobilization, and participatory democracy for a just, sustainable, and equitable society.
- **description**:
  - before: (none)
  - after: Leadnow is an independent advocacy organization that runs campaigns on the major issues of our time and engages people in participatory decision-making for a just and sustainable Canada.
- **sse_reasoning**:
  - before: (none)
  - after: Leadnow is an independent non-profit civic advocacy organization with a clear mission centred on social and environmental justice, democratic engagement, and people-powered campaigns.
- **flags**: `(none)` → `['description via=inferred', 'mission via=inferred', 'values via=absent', 'language:bilingual via=public_language', 'language_reason:name_llm=en']`

## 348 — Eat Pure Mountain Market

- **website**: `(none)` → `https://www.eatpuremarket.com`
- **sse**: `(none)` → `no`
- **type**: `(none)` → `other`
- **sector**: `(none)` → `retail-consumer-goods`
- **language**: `(none)` → `en`
- **values**: `(none)` → `['Community', 'Environment', 'Help Society', 'Honesty and Integrity']`
- **mission**:
  - before: (none)
  - after: At Eat Pure Mountain Market, we are committed to offering products that prioritize the well-being of people and nourishing our community with local, organic goodness.
- **description**:
  - before: (none)
  - after: Eat Pure Mountain Market is an organic, local, and specialty grocer in Golden, BC, offering local meat, BC produce, bulk food, and natural supplements with a commitment to community health and well-be… (+4 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: Eat Pure Mountain Market is a privately owned commercial retail grocery store. While it focuses on local and organic goods, it lacks cooperative or nonprofit governance.
- **flags**: `(none)` → `['conventional for-profit business', 'description via=inferred', 'mission via=extracted', 'values via=extracted', 'language:en via=llm_name', 'language_reason:name_llm=en']`
- KEEP: is_sse=False

## 354 — International Institute for Sustainable Development (IISD)

- **website**: `(none)` → `https://www.iisd.org`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `environment-circular-economy`
- **language**: `(none)` → `en`
- **values**: `(none)` → `['Environment', 'Help Society', 'Honesty and Integrity', 'Research and Development', 'Community']`
- **mission**:
  - before: (none)
  - after: To champion human development and environmental protection on a global scale through trusted research, policy advice, and decision-makers' capacity building.
- **description**:
  - before: (none)
  - after: The International Institute for Sustainable Development is an award-winning independent think tank working to solve today's greatest sustainable development challenges through research, advice, and co… (+12 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: IISD is a registered charitable think tank dedicated to sustainable development governance. It operates under a clear public-benefit mission without private profit distribution.
- **flags**: `(none)` → `['description via=extracted', 'mission via=extracted', 'values via=extracted', 'language:en via=llm_name', 'language_reason:name_llm=en']`

## 357 — Carrefour des Petits Soleils

- **website**: `(none)` → `https://petitssoleils.com`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `care-health-social-services`
- **language**: `(none)` → `fr`
- **values**: `(none)` → `['Community', 'Help Others', 'Help Society', 'Family', 'Honesty and Integrity']`
- **mission**:
  - before: (none)
  - after: To provide a welcoming, nurturing environment for young children and families through educational and community activities that foster holistic development and social inclusion.
- **description**:
  - before: (none)
  - after: Carrefour des Petits Soleils is a community-based childcare and family center located in Montreal, Quebec, offering developmental activities and support services for young children and their families.
- **sse_reasoning**:
  - before: (none)
  - after: Carrefour des Petits Soleils is a registered community nonprofit providing accessible childcare and family support services in Montreal, prioritizing children and community welfare over profit.
- **flags**: `(none)` → `['description via=inferred', 'mission via=inferred', 'values via=inferred', 'language:fr via=llm_name', 'language_reason:name_llm=fr']`

## 359 — Be the Change Earth Alliance

- **website**: `(none)` → `https://www.bethechangeearthalliance.org`
- **sse**: `(none)` → `strong_yes`
- **is_sse**: `False` → `True`
- **type**: `(none)` → `nonprofit`
- **sector**: `(none)` → `education-knowledge`
- **language**: `(none)` → `en`
- **values**: `(none)` → `['Environment', 'Help Society', 'Community', 'Knowledge']`
- **mission**:
  - before: (none)
  - after: To empower individual and collective change for a resilient, just, connected, and sustainable world through eco-social education.
- **description**:
  - before: (none)
  - after: Be The Change Earth Alliance is an eco-social education organization focused on engaging climate change curriculum in schools. Established in 2005, its vision is to empower individual and collective c… (+51 chars truncated from log)
- **sse_reasoning**:
  - before: (none)
  - after: Be The Change Earth Alliance is a registered educational nonprofit empowering youth and educators through eco-social programs, demonstrating a clear public-benefit mission and strong environmental and community values.
- **flags**: `(none)` → `['description via=inferred', 'mission via=extracted', 'values via=extracted', 'language:en via=llm_name', 'language_reason:name_llm=en']`
