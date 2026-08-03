# Cerebras minimal backfill REVERT summary

- Source log: `/tmp/backfill_org_websites_cerebras_minimal_20260801_113845.log`
- Revert log: `/tmp/backfill_cerebras_minimal_REVERT_20260802_113731.log`
- Timestamp: 2026-08-02T11:38:17.335549
- Orgs targeted (PATCH 200 in source): **280**
- Reverted successfully: **280**
- Failed: **0**
- Skipped (original non-200): [(622, 400, 'Maison de la Famille LeMoyne')]

## Root cause

Tavily import failed (`No module named 'tavily'`) for the entire Cerebras-only minimal backfill run → no web evidence → model hallucinated websites/descriptions. This revert restores pre-backfill nulls/values from the log's "old" side.

## Org ids reverted

292, 293, 294, 296, 297, 298, 299, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314, 315, 316, 317, 318, 320, 321, 322, 323, 324, 325, 326, 327, 329, 330, 331, 332, 333, 334, 335, 336, 337, 338, 339, 340, 341, 345, 347, 348, 354, 357, 359, 362, 363, 365, 366, 367, 368, 370, 378, 379, 380, 381, 382, 383, 384, 385, 389, 391, 395, 397, 398, 399, 400, 401, 402, 404, 405, 407, 408, 410, 412, 413, 414, 415, 416, 417, 418, 419, 420, 422, 428, 430, 431, 434, 437, 439, 440, 441, 442, 443, 445, 450, 451, 455, 457, 459, 460, 469, 470, 471, 472, 473, 479, 483, 489, 496, 497, 499, 500, 501, 503, 504, 505, 506, 507, 508, 515, 518, 519, 520, 522, 523, 525, 529, 533, 534, 537, 539, 541, 543, 545, 546, 547, 548, 549, 550, 551, 552, 553, 554, 556, 557, 558, 559, 561, 562, 563, 564, 565, 566, 567, 568, 569, 570, 572, 573, 574, 579, 580, 581, 586, 588, 589, 591, 592, 593, 594, 596, 597, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 615, 617, 618, 619, 620, 625, 627, 628, 629, 631, 633, 634, 635, 640, 643, 644, 648, 649, 653, 656, 657, 662, 663, 665, 666, 667, 670, 673, 679, 680, 681, 682, 686, 688, 689, 690, 691, 692, 698, 699, 709, 712, 714, 716, 717, 719, 720, 721, 722, 723, 724, 725, 726, 727, 729, 730, 731, 732, 733, 734, 736, 737, 738, 739, 740, 741, 742, 743, 744, 745, 746, 747, 748, 749, 750, 751, 752, 753, 754, 757, 758, 759, 760, 761, 767

## Verification samples (before → after)

- **292 Speaking of Wildlife**: website `https://speakingofwildlife.ca` → `None`; sse_rating `strong_yes` → `None`
- **297 Town of Aurora**: website `https://www.aurora.ca` → `None`; sse_rating `no` → `None`
- **307 Carrefour solidaire CCA**: website `None` → `None`; sse_rating `no` → `None`
- **324 L’ÉTAPE**: website `https://letape.org` → `None`; sse_rating `strong_yes` → `None`
- **326 Multi-Femmes**: website `https://multifemmes.org/` → `None`; sse_rating `strong_yes` → `None`
- **327 Atelier habitation Montréal**: website `https://atelierhabitation.org` → `None`; sse_rating `strong_yes` → `None`
- **329 Bikechain**: website `https://www.bikechain.org` → `None`; sse_rating `strong_yes` → `None`
