/**
 * End-to-end test: generate realistic CV text for sample profiles,
 * run the extraction pipeline (Groq → Jina → ESCO), and persist
 * skill_phrases back into the profiles table.
 *
 * Includes 60s delays between profiles to stay under Groq free-tier
 * rate limits (8000 TPM on openai/gpt-oss-120b).
 *
 * Usage:  npx tsx scratch/test_cv_batch.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '..', '.env') });

import { extractSkillsAndValuesFromCv } from '@/lib/cv';
import { createClient } from '@supabase/supabase-js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Sample CV texts keyed by profile full_name ──────────────────────────

const CV_TEXTS: Record<string, string> = {
  'Test · Accountant': `
Marie Tremblay, CPA
Montréal, QC | marie.t@courriel.ca

Sommaire
Comptable professionnelle agréée avec 8 ans d'expérience en comptabilité
financière, fiscalité et audit. Expérience en OBNL et PME.

Compétences
- Préparation d'états financiers (NCECF et IFRS)
- Déclarations de revenus (T1, T2, TP1)
- Audit et certification
- Gestion de la paie (ADP, Ceridian)
- QuickBooks, Sage 50, Excel avancé
- Analyse budgétaire et prévisions financières
- Gestion de trésorerie

Expérience
Comptable senior — Cabinet ABC (2019–présent)
- Préparation de missions d'examen et d'audit pour 40+ clients OBNL
- Supervision d'une équipe de 3 comptables juniors
- Implantation de QuickBooks Online pour 15 organismes

Comptable — Coopérative La Ruche (2016–2019)
- Tenue de livres complète et états financiers mensuels
- Gestion de la paie pour 25 employés
- Déclarations TPS/TVQ et remises gouvernementales

Formation
B.A.A. Comptabilité — HEC Montréal (2016)
Titre CPA obtenu en 2018
`,

  'Test · Nurse': `
Aisha Patel, RN, BScN
Ottawa, ON | aisha.p@mail.com

Summary
Registered Nurse with 5 years of clinical experience in community health,
mental health, and harm reduction. Committed to equity-based care.

Skills
- Patient assessment and triage
- Wound care and medication administration
- Mental health crisis intervention
- Harm reduction and naloxone training
- Health promotion and community outreach
- Electronic health records (EPIC, Meditech)
- Cultural safety and trauma-informed care
- Bilingual: English / French

Experience
Community Health Nurse — Ottawa Public Health (2021–present)
- Provide primary care at supervised injection sites
- Conduct immunization clinics and sexual health screenings
- Train peer workers in naloxone administration
- Document patient encounters in EPIC EHR

Staff Nurse — The Ottawa Hospital (2019–2021)
- Provided bedside nursing on a 30-bed medical unit
- Administered IV medications and monitored post-op patients
- Collaborated with interdisciplinary care teams

Education
BScN — University of Ottawa (2019)
CNO Registration #12345
`,

  'Test · Web developer': `
Jane Doe — Full-Stack Web Developer
Toronto, ON | jane.doe@email.com

Professional Summary
Creative web developer with 6 years of experience building responsive,
accessible web applications. Proficient in modern JavaScript frameworks
and cloud deployment. Passionate about open-source software.

Technical Skills
- Languages: JavaScript, TypeScript, Python, HTML5, CSS3
- Frameworks: React, Next.js, Node.js, Express, Django
- Databases: PostgreSQL, MongoDB, Redis
- DevOps: Docker, GitHub Actions, AWS (EC2, S3, Lambda), Vercel
- Testing: Jest, Playwright, React Testing Library

Experience
Senior Developer — GreenTech Solutions (2021–present)
- Architected a Next.js job board serving 50k monthly visitors
- Implemented server-side rendering and incremental static regeneration
- Built REST and GraphQL APIs with Node.js and PostgreSQL
- Set up CI/CD pipelines with GitHub Actions and Docker

Junior Developer — Startup XYZ (2018–2021)
- Developed React SPAs with Redux state management
- Created responsive CSS layouts using Flexbox and Grid
- Wrote unit and integration tests with Jest

Education
B.Sc. Computer Science — University of Toronto (2018)
`,

  'test Marketing': `
Carlos Rivera
Vancouver, BC | carlos.r@email.com

Professional Summary
Digital marketing specialist with 4 years of experience in social media
management, content strategy, SEO, and community engagement for social
enterprises and non-profits.

Skills
- Social media management (Instagram, LinkedIn, TikTok, Facebook)
- Content strategy and editorial calendars
- SEO and keyword research (Ahrefs, Google Search Console)
- Google Analytics and data-driven marketing
- Email marketing (Mailchimp, Brevo)
- Graphic design (Canva, Figma, Adobe Creative Suite)
- Copywriting in English and Spanish
- Event promotion and community partnerships

Experience
Marketing Manager — Fair Trade Collective (2022–present)
- Grew Instagram following from 2k to 18k in 18 months
- Managed $5k/month ad budget across Meta and Google Ads
- Produced monthly impact reports and donor newsletters

Marketing Coordinator — Local Food Hub (2020–2022)
- Created social media content calendars and blog posts
- Coordinated community events reaching 500+ attendees
- Managed email campaigns with 35% average open rate

Education
B.A. Communications — Simon Fraser University (2020)
Google Analytics Certified
`,

  'test Electrician': `
Marc-André Bouchard
Sherbrooke, QC | ma.bouchard@courriel.ca

Résumé professionnel
Électricien compagnon avec 10 ans d'expérience en installation et
maintenance électrique résidentielle, commerciale et industrielle.
Détenteur d'une licence C de la RBQ.

Compétences
- Installation et raccordement de systèmes électriques
- Lecture de plans et de schémas électriques
- Câblage résidentiel et commercial
- Automatisation et contrôles industriels (PLC, Allen-Bradley)
- Systèmes d'énergie solaire photovoltaïque
- Code de construction du Québec (CCQ)
- Diagnostic de pannes et entretien préventif
- Soudure de base

Expérience
Électricien — Constructions Éco-Soleil (2018–présent)
- Installation de panneaux solaires résidentiels et commerciaux
- Mise en service de systèmes domotiques (Loxone, KNX)
- Supervision d'apprentis sur chantier

Électricien — Services Électriques Duval (2014–2018)
- Câblage et raccordement pour projets résidentiels neufs
- Maintenance de systèmes d'éclairage commercial
- Réparation de moteurs et transformateurs

Formation
DEP Électricité — CFP de Sherbrooke (2014)
Licence C — RBQ #5678-9012
`,
};

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const groqKey = process.env.GROQ_API_KEY!;
  const jinaKey = process.env.JINA_API_KEY!;
  if (!groqKey || !jinaKey) {
    throw new Error('Missing GROQ_API_KEY or JINA_API_KEY in ../.env');
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );

  const { data: profiles, error: fetchErr } = await supabase
    .from('profiles')
    .select('id, full_name, skill_phrases, skills')
    .in('full_name', Object.keys(CV_TEXTS));

  if (fetchErr) throw fetchErr;
  if (!profiles || profiles.length === 0) {
    console.error('No matching profiles found.');
    return;
  }

  console.log(`Found ${profiles.length} profiles to process.`);
  console.log(`Using 65s delay between profiles to stay under Groq 8k TPM limit.\n`);

  const groqModel = 'openai/gpt-oss-120b';
  const results: Array<{
    name: string;
    esco_uris: string[];
    values: string[];
  }> = [];

  for (let i = 0; i < profiles.length; i++) {
    const profile = profiles[i];
    const cvText = CV_TEXTS[profile.full_name!];
    if (!cvText) continue;

    // Rate-limit delay (skip for first profile)
    if (i > 0) {
      console.log(`\n⏳ Waiting 65s for rate limit cooldown...`);
      await sleep(65_000);
    }

    console.log(`\n━━━ [${i + 1}/${profiles.length}] ${profile.full_name} ━━━`);
    console.log(`  Existing ESCO skills: ${(profile.skills ?? []).length}`);
    console.log(
      `  Current skill_phrases: ${profile.skill_phrases ? profile.skill_phrases.length + ' items' : 'null'}`,
    );

    try {
      const locale = cvText.includes('Sommaire') || cvText.includes('Résumé') ? 'fr' : 'en';
      const result = await extractSkillsAndValuesFromCv({
        cvText,
        userId: profile.id,
        groqKey,
        jinaKey,
        locale,
        groqModel,
      });

      console.log(`  ✅ ESCO skills matched: ${result.skills.length}`);

      console.log(`  ✅ ESCO skills matched: ${result.skills.length}`);
      result.skills.forEach((s) => {
        const label = s.preferredLabel?.en ?? '(no label)';
        console.log(`    ✓ ${label}  →  ${s.uri}`);
      });

      console.log(`  Values: ${result.values.join(', ') || '(none)'}`);

      // Save to DB
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({
          // skill_phrases will be inserted manually since they are now managed via relation
          // skill_phrases: result.skill_phrases,
          skills: result.skills.map((s) => s.uri),
          cv_import: {
            filename: `${profile.full_name!.replace(/\s+/g, '_')}_cv.docx`,
            imported_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);

      if (updateErr) {
        console.error(`  ❌ DB update failed:`, updateErr.message);
      } else {
        console.log(`  💾 Profile updated in DB`);
      }

      results.push({
        name: profile.full_name!,
        esco_uris: result.skills.map((s) => s.uri),
        values: result.values,
      });
    } catch (err: any) {
      console.error(`  ❌ Pipeline failed for ${profile.full_name}:`, err.message ?? err);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log('\n\n═══════════════════════════════════════════════');
  console.log('ESCO COVERAGE SUMMARY');
  console.log('═══════════════════════════════════════════════');
  let totalEsco = 0;
  for (const r of results) {
    totalEsco += r.esco_uris.length;
    console.log(`  ${r.name}: ${r.esco_uris.length} ESCO`);
  }
  console.log(`\n  TOTAL: ${totalEsco} ESCO`);
  console.log('═══════════════════════════════════════════════\n');

  // Verify DB state
  console.log('Verifying DB state...');
  const { data: verified } = await supabase
    .from('profiles')
    .select('full_name, skill_phrases')
    .not('skill_phrases', 'is', null);
  console.log(`Profiles with skill_phrases in DB: ${verified?.length ?? 0}`);
  verified?.forEach((p) =>
    console.log(`  ${p.full_name}: ${p.skill_phrases?.length ?? 0} raw phrases`),
  );
}

main().catch(console.error);
