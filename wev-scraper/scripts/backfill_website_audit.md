# Website audit — post-revert standing assessments

Generated: 2026-08-02 18:30 UTC; reprocess notes 2026-08-02 ~19:06 UTC; clears 323/336 2026-08-02 ~19:10 UTC

## Scope

- **Gemini 3-org test:** 307, 324, 326
- **Minimal last50 batch:** 49 orgs from `scripts/backfill_review_batch_last50.md` / `/tmp/backfill_org_minimal_50_20260802_132734.log`
- **Excluded:** next50 (0 writes); Cerebras 280-org run (fully reverted)
- **Union size:** 52 org ids fetched from PROD
- **Live check:** direct DNS + HTTP (no proxies); 2xx/3xx/401/403/(other HTTP incl. 404) = domain exists; NXDOMAIN/timeout/no response = FAIL
- **Known clears already applied:** 330, 335 → website null; **304** restored to ecofairtoronto.org via reprocess; **323**, **336** cleared (wrong US hosts) 2026-08-02

## Summary counts

| verdict | count |
|---|---:|
| OK | 46 |
| FAIL | 0 |
| CLEARED | 5 |
| SUSPECT | 0 |
| no website | 3 |
| **total** | **52** |

## FAIL

_None — no NXDOMAIN/timeout/dead hosts among currently set websites._

## SUSPECT

_None — 323/336 wrong-US associations cleared 2026-08-02._

## CLEARED / reprocessed (2026-08-02)

- **304** EcoFair Toronto: **FIXED** — reprocess set `https://ecofairtoronto.org` (live). Was cleared hyphen NXDOMAIN.
- **330** L’Association Entre tes Mains: website still **null** after reprocess (gate rejected invented host). OK.
- **335** Relay Education: website still **null** after reprocess. OK.
- **323** Foxhole Farm: **CLEARED** — was `foxholefarmohio.com` (Brookville OH farm, wrong entity for Rockwood ON). Set website/description*/mission*/values*/sse_rating/sse_details/type/sector_id null; `is_sse=false`. Kept name/location/municipality/province/language. **Needs redo** (minimal backfill with location bias).
- **336** Gbi: **CLEARED** — was `gbi.georgia.gov` (Georgia Bureau of Investigation, wrong for Montreal QC). Same field clear as 323. **Needs redo**.

### Reprocess results (ids 336, 323, 304, 330, 335)

| id | name | old website → new | live? | sse |
|---:|------|-------------------|-------|-----|
| 336 | Gbi | gbi.georgia.gov → **CLEARED (null)** | n/a | null (needs redo) |
| 323 | Foxhole Farm | foxholefarmohio.com → **CLEARED (null)** | n/a | null (needs redo) |
| 304 | EcoFair Toronto | (null) → **ecofairtoronto.org** | live | strong_yes |
| 330 | Entre tes Mains | (null) → (null) | n/a | strong_yes |
| 335 | Relay Education | (null) → (null) | n/a | strong_yes |

Still-null websites: **323**, **330**, **335**, **336**. 323/336 intentionally cleared for wrong US hosts (needs redo).

## Full table

| id | name | website | live | verdict | notes |
|---:|------|---------|------|---------|-------|
| 292 | Speaking of Wildlife | http://speakingofwildlife.ca | OK | OK | HTTP 200; sld_in_name; tokens=2; Speaking of Wildlife; title=Home |
| 293 | Community University Television Montreal | https://www.cutvmontreal.org | OK | OK | HTTP 200; CUTV; title=Home - CUTV Montreal |
| 294 | Reimagine Agriculture | https://www.reimagineagriculture.org | OK | OK | HTTP 200; sld_in_name; tokcat; tokens=2; Reimagine Agriculture |
| 296 | Groupe S.M. International |  | n/a | no website | no website in prod |
| 297 | Town of Aurora | https://www.aurora.ca | OK | OK | HTTP 200; sld_in_name; tokcat; tokens=1; municipal town site; title=Home \| Town of Aurora |
| 298 | Valleyfield Farm | https://www.valleyfieldfarmltd.com | OK | OK | HTTP 403; sld_in_name; tokcat; tokens=2; Valleyfield Farm |
| 299 | Six Shooter Records | https://www.sixshooterrecords.com | OK | OK | HTTP 200; sld_in_name; tokcat; tokens=2; Six Shooter; title=Six Shooter Records |
| 300 | Le Groupe l’Entre-Gens | https://groupeentre-gens.ca | OK | OK | HTTP 403; tokcat; tokens=3; Entre-Gens |
| 301 | Alimenter Saint-Léonard | https://alimentersaintleonard.com | OK | OK | HTTP 200; sld_in_name; tokcat; tokens=3; Alimenter Saint-Leonard; title=Accueil - Alimenter Saint-Léonard |
| 302 | Aids Community Care Montreal | https://accmontreal.org | OK | OK | HTTP 403; ACCM |
| 303 | Centre de prévention et d’intervention pour victimes d’agression sexuelle | https://cpivas.com | OK | OK | HTTP 200; acronym=pivas; CPIVAS; title=CPIVAS |
| 304 | EcoFair Toronto | https://ecofairtoronto.org | OK | OK | REPROCESSED 2026-08-02: was CLEARED (hyphen NXDOMAIN); gate set https://ecofairtoronto.org (live HTTP OK); sse=strong_yes type=nonprofit |
| 305 | Langford Conservancy | https://lconserv.ca/ | OK | OK | HTTP 200; Langford Conservancy; title=Langford Conservancy &#8211; Not-for-profit in the County of Brant ON |
| 306 | Association des locataires de Villeray | http://locatairesdevilleray.com | OK | OK | HTTP 200; sld_in_name; tokens=2; locataires Villeray; title=Association des locataires de Villeray - L’Association des locataires de Villera |
| 307 | Carrefour solidaire CCA | https://carrefoursolidaire.org | OK | OK | HTTP 200; sld_in_name; tokcat; tokens=2; Carrefour solidaire; title=Carrefour solidaire centre communautaire d’alimentation |
| 308 | Compagnons de Montréal | https://compagnonsdemontreal.com | OK | OK | HTTP 200; sld_in_name; tokcat; tokens=1; Compagnons Montreal; title=Accueil - Compagnons de Montréal |
| 309 | Auberge Madeleine | https://www.aubergemadeleine.org | OK | OK | HTTP 200; sld_in_name; tokcat; tokens=2; Auberge Madeleine; title=Auberge Madeleine \| Plus fortes ensemble |
| 310 | Projet de prévention des toxicomanies Cumulus | https://www.projetcumulus.ca | OK | OK | HTTP 200; tokens=1; Projet Cumulus; title=Notre approche - Projet Cumulus |
| 311 | Action-Gardien, Corporation de développement communautaire de Pointe-Saint-Charles | https://www.actiongardien.org | OK | OK | HTTP 200; sld_in_name; tokcat; tokens=2; Action-Gardien; title=Action-Gardien |
| 312 | Ecology Action Centre | https://ecologyaction.ca | OK | OK | HTTP 200; sld_in_name; tokcat; tokens=2; Ecology Action Centre; title=Welcome \| Bienvenue \| Pjila&#039;si \| Ecology Action Centre |
| 313 | Ressources Jeunesse de Saint-Laurent | https://www.rjsl.ca | OK | OK | HTTP 200; acronym=rjsl; RJSL; title=Accueil - RJSL - Ressources Jeunesse de Saint-Laurent |
| 314 | Ontario Land Trust Alliance | https://www.olta.ca | OK | OK | HTTP 200; acronym=lta; full_acr=olta; OLTA; title=Home - OLTA |
| 315 | Eppendorf Group | https://www.eppendorf.com | OK | OK | HTTP 200; sld_in_name; tokcat; tokens=1; corporate brand match; title=Premium Laboratory Supplies & Scientific Equipment - Eppendorf Canada |
| 316 | The Canadian Conservation Photographers Collective | https://www.theccpc.ca | OK | OK | HTTP 200; acronym=cpc; CCPC |
| 317 | Succès RH | https://succesrh.com | OK | OK | HTTP 200; sld_in_name; tokcat; tokens=1; Succès RH; title=Accueil - Succès RH |
| 318 | Café-Jeunesse Multiculturel | http://www.cafejeunessemulticulturel.org | OK | OK | HTTP 200; sld_in_name; tokcat; tokens=3; Café-Jeunesse; title=Café-Jeunesse Multiculturel |
| 320 | CCSE Maisonneuve | https://ccse.ca | OK | OK | HTTP 200; sld_in_name; tokcat; tokens=1; CCSE; title=Accueil - CCSE Maisonneuve |
| 321 | Bruce Trail Conservancy | https://brucetrail.org | OK | OK | HTTP 403; sld_in_name; tokcat; tokens=2; Bruce Trail |
| 322 | Auberge et Bistro des Balcons | https://lesbalcons.ca | OK | OK | HTTP 200; tokens=1; Balcons; title=Accueil \| Les Balcons - Auberge &amp; BIstro culturel à Baie-Saint-Paul, Charlev |
| 323 | Foxhole Farm |  | n/a | CLEARED | CLEARED 2026-08-02: was foxholefarmohio.com (OH wrong entity); website+derived+sse/type/sector null; needs redo |
| 324 | L’ÉTAPE | https://letape.org | OK | OK | HTTP 200; sld_in_name; tokcat; tokens=1; L'ÉTAPE; title=L&#039;ÉTAPE |
| 325 | Centre communautaire Radisson | https://centreradisson.com | OK | OK | HTTP 200; tokens=1; Centre Radisson; title=Centre communautaire Radisson - Accueil |
| 326 | Multi-Femmes | https://multifemmes.com | OK | OK | HTTP 200; sld_in_name; tokcat; tokens=2; Multi-Femmes; title=Multi-Femmes \| Hébergement pour femmes victimes de violence conjugale |
| 327 | Atelier habitation Montréal | https://atelierhabitationmontreal.org | OK | OK | HTTP 200; sld_in_name; tokcat; tokens=2; Atelier habitation; title=Ressources (immobilier communautaire) \| Atelier Habitation Montréal - Atelier Ha |
| 329 | Bikechain | https://bikechain.ca | OK | OK | HTTP 200; sld_in_name; tokcat; tokens=1; Bikechain; title=Bikechain &#8211; A Do-It-Yourself bike shop in Toronto. |
| 330 | L’Association Entre tes Mains |  | n/a | CLEARED | REPROCESSED 2026-08-02: website still null (model proposed entretesmains.com — gate rejected, not in Tavily). sse=strong_yes type=nonprofit |
| 331 | Hearts Content Organic Farm | https://hcof.ca | OK | OK | HTTP 200; acronym=hcof; full_acr=hcof; Hearts Content Organic Farm acronym?; title=Home - Heart&#039;s Content Organic Farmstead |
| 332 | WCS Canada | https://wcscanada.org | OK | OK | HTTP 403; sld_in_name; tokcat; WCS Canada |
| 333 | Enfant d’abord | https://enfantdabord.org | OK | OK | HTTP 200; sld_in_name; tokens=2; Enfant d'abord; title=Enfant d&#039;abord |
| 334 | Bois Urbain | https://www.boisurbain.org | OK | OK | HTTP 200; sld_in_name; tokcat; tokens=2; Bois Urbain |
| 335 | Relay Education |  | n/a | CLEARED | REPROCESSED 2026-08-02: website still null (no evidence-grade host). sse=strong_yes type=nonprofit |
| 336 | Gbi |  | n/a | CLEARED | CLEARED 2026-08-02: was gbi.georgia.gov (GA Bureau wrong entity); website+derived+sse/type/sector null; needs redo |
| 337 | Centre de formation populaire | https://lecfp.qc.ca | OK | OK | HTTP 200; CFP; title=Le CFP \| Centre de Formation Populaire à Montréal |
| 338 | École de danse contemporaine de Montréal | https://www.edcm.ca/ | OK | OK | HTTP 200; EDCM; title=Accueil \| École de danse contemporaine de Montréal |
| 339 | Centre des Aînés de Villeray | https://ainesvilleray.com | OK | OK | HTTP 200; tokcat; tokens=2; Aînés Villeray; title=Centre des Aînés de Villeray \| Site du centre des Aînés de Villeray |
| 340 | EarthBites Society | https://www.earthbites.ca | OK | OK | HTTP 200; sld_in_name; tokcat; tokens=1; EarthBites; title=Earthbites Vancouver based School Gardens \| Eat Grow Learn |
| 341 | StopGap Foundation | https://stopgap.ca | OK | OK | HTTP 200; sld_in_name; tokcat; tokens=1; StopGap; title=StopGap Foundation &#8211; Helping communities discover the benefit of barrier f |
| 345 | Leadnow | https://www.leadnow.ca | OK | OK | HTTP 200; sld_in_name; tokcat; tokens=1; Leadnow |
| 348 | Eat Pure Mountain Market | https://www.eatpuremarket.com | OK | OK | HTTP 200; tokens=2; Eat Pure Market; host eatpuremarket.com omits 'Mountain' but is plausible brand domain |
| 354 | International Institute for Sustainable Development (IISD) | https://www.iisd.org | OK | OK | HTTP 200; sld_in_name; tokcat; tokens=1; IISD; title=International Institute for Sustainable Development |
| 357 | Carrefour des Petits Soleils | https://petitssoleils.com | OK | OK | HTTP 200; sld_in_name; tokcat; tokens=2; Petits Soleils; title=Carrefour des Petits Soleils &#8211; Un petit soleil dans ma vie |
| 359 | Be the Change Earth Alliance | https://www.bethechangeearthalliance.org | OK | OK | HTTP 403; sld_in_name; tokcat; tokens=3; BTCEA |

## Method notes

- Prod fetch: `CONFIRM_PROD_RUN=YES` + `--prod` bootstrap via `utils.prod_env` / `utils.db.supabase`.
- Plausibility: host/SLD vs org name tokens, acronyms, and known brand patterns; title sampled when HTTP 200.
- Gemini ids 307/324/326 all **OK** (carrefoursolidaire.org, letape.org, multifemmes.com).

