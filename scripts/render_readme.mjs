/**
 * render_readme — self-contained README renderer for a Workopia graduate jobs repo.
 *
 * Consumes ONLY `.github/scripts/listings.json` (the structured source of truth the
 * Workopia pipeline pushes daily) — no DB, no registry files, no deps. The same module
 * runs in two places:
 *   1. locally, invoked by `build_graduate_country.mjs` right after it writes listings.json;
 *   2. on GitHub, via `.github/workflows/update-readme.yml` → `scripts/update_readme.mjs`,
 *      whenever listings.json changes on the remote (Simplify's architecture: the bot pushes
 *      data, the repo renders itself).
 *
 * listings.json shape:
 *   meta:       { repo, title, country_iso, country_name, adjective, segment, site_slug,
 *                 lang ('en'|'fr'), as_of, window_days, total_site_jobs_str, generated_at }
 *   categories: [{ key, name, icon, mode: 'tiered'|'entry', l4slug }]   (render order)
 *   listings:   [{ id, company_name, company_hi_slug, title, location, skills,
 *                  sponsorship, hot, date_posted, url, category, tier, active }]
 *                (array order inside each category+tier is the table row order)
 *
 * `skills` arrives as a final display string ('—' when unknown). No salary on GitHub —
 * salary + WORKOPIA ESTIMATE are main-site-only, on each role's Workopia page.
 * Time-relative cells (Age, 🆕) are computed at render time.
 * All human-facing copy lives in L10N (en/fr); category display names in CAT_NAME.
 */

const W = 'https://workopia.io';
const TIER_ORDER = ['Intern', 'Graduate', 'Entry-level'];

// The series — used for the cross-repo "Other countries" links (self excluded at render).
const SERIES = [
  ['GB', 'UK', 'https://github.com/workopia/UK-Graduate-Jobs'],
  ['US', 'US', 'https://github.com/workopia/US-New-Grad-Internship-Jobs'],
  ['AU', 'Australia', 'https://github.com/workopia/Australia-Graduate-Jobs'],
  ['SG', 'Singapore', 'https://github.com/workopia/Singapore-Graduate-Internship-Jobs'],
  ['FR', 'France', 'https://github.com/workopia/France-Graduate-Apprenticeship-Jobs'],
];

const L10N = {
  en: {
    updatedDaily: 'Updated Daily',
    intro: 'Track the latest {ADJ} **graduate schemes, entry-level roles, apprenticeships and internships** across Tech, Finance, Healthcare, Trades, Sales & Retail and Business & Admin. {N} hand-picked roles below — part of **{TOTAL} active job ads sourced straight from employer career pages, refreshed daily, zero third-party scraping.**',
    maintainedBy: "Maintained by [**Workopia**]({URL}) — the world's 2nd largest job database, 94 countries, 2,517 cities.",
    reportIssue: '🙏 **Spotted a wrong or closed role? [Open an issue](../../issues/new/choose) — see the [contribution guide](./CONTRIBUTING.md).** 🙏',
    browseByCategory: 'Browse {N} Roles by Category',
    wantFullList: '🔎 Want the full, always-fresh list?',
    handPickedSlice: 'This page is a hand-picked slice. Search & filter all {TOTAL} live jobs by role, city, salary & date on Workopia.',
    tiredOfChecking: '🔔 Tired of checking every day?',
    getAlerted: 'Get alerted when new {ADJ} graduate & entry-level roles go live.',
    watchReleases: 'Or <b>Watch → Custom → Releases</b> on this repo for a weekly email digest of new roles.',
    legend: 'Legend',
    legendNew: 'Posted in the last 2 days',
    legendSalary: "Salary (real or **WORKOPIA ESTIMATE**) shown on every role's Workopia page",
    legendVisaGB: 'Visa sponsorship available (UK Skilled Worker register)',
    legendHot: 'Notable / high-growth employer',
    legendClosed: 'Closed roles move to [Inactive Listings](./README-Inactive.md)',
    lookingElse: '**Looking for something else?**',
    closedOlder: 'Closed/older roles → [Inactive Listings](./README-Inactive.md)',
    otherCountries: 'Other countries',
    fullLiveList: 'The full live list → [all {ADJ} jobs on Workopia]({URL})',
    faqTitle: 'FAQs',
    faq1q: 'Which graduate jobs & internships can I still apply for right now?',
    faq1a: "Many structured graduate schemes and summer internships run on annual cycles — but a large share of employers recruit on a **rolling basis**, and graduate *jobs*, apprenticeships, trades, sales and entry-level roles run year-round. This list shows what's **live today**, refreshed daily.",
    faq2q: "What's an assessment centre and how do I prepare?",
    faq2a: 'A half- to two-day mix of group exercises, presentations, in-tray tasks and interviews — usually the final stage. See [interview & assessment tips on Workopia]({URL}).',
    faq3q: 'How do I get alerts for new roles?',
    faq3a: "Set a job alert on Workopia by role + city and we'll email you when new {ADJ} roles go live — [start here]({URL}).",
    noteTiered: '💡 Can\'t find a "graduate" role here? Check **Entry-level** below — adjacent roles count too (a Software Engineer can apply to Backend / Full Stack / AI Engineer).',
    noteEntry: '💡 These are entry-level, hire-year-round roles — apply directly; no graduate-scheme deadline.',
    noteHealthcare: '🏥 Healthcare is qualification-gated — newly-qualified nurses, pharmacists, care & allied-health staff apply directly to the role.',
    browseAllCat: '🔎 **[Browse & filter all live {ADJ} {NAME} jobs on Workopia →]({URL})**',
    allGradCat: '🎓 **[All {ADJ} graduate & entry-level {NAME} roles →]({URL})**',
    backToTop: '⬆️ Back to top',
    biggerPicture: '🌍 See the bigger picture',
    monitorAlt: 'Workopia — live global hiring monitor across 94 countries',
    exploreMonitor: '🌍 Explore the live global hiring monitor →',
    footer: '📅 Updated daily · Data © Workopia, sourced from employer career pages · Roles may close before this list refreshes — confirm on the job page. Browse {TOTAL} jobs free at [workopia.io]({URL}).',
    thCompany: 'Company', thRole: 'Role', thLocation: 'Location', thSkills: 'Key skills', thApply: 'Apply', thAge: 'Age',
    applyArrow: 'Apply →',
    tierLabels: { Intern: 'Internships', Graduate: 'Graduate', 'Entry-level': 'Entry-level', entryHealthcare: 'Newly-qualified & entry-level' },
    tierWord: { Intern: 'Internships', Graduate: 'Graduate', 'Entry-level': 'Entry-level' },
    browseAlt: 'Browse all {ADJ} jobs on Workopia',
    subscribeAlt: 'Subscribe for new-job alerts',
  },
  fr: {
    updatedDaily: 'Mis à jour quotidiennement',
    intro: "Retrouvez les derniers **programmes jeunes diplômés, postes de débutant, contrats en alternance et stages** en France — Tech, Finance, Santé, Métiers techniques, Vente & Retail et Business & Admin. {N} postes sélectionnés ci-dessous — faisant partie de **{TOTAL} offres d'emploi actives provenant directement des pages carrière des employeurs, mises à jour quotidiennement, zéro scraping tiers.**",
    maintainedBy: "Maintenu par [**Workopia**]({URL}) — la 2e plus grande base de données d'emploi au monde, 94 pays, 2 517 villes.",
    reportIssue: '🙏 **Vu une offre fermée ou incorrecte ? [Ouvrir un signalement](../../issues/new/choose) — consultez le [guide de contribution](./CONTRIBUTING.md).** 🙏',
    browseByCategory: 'Parcourir {N} postes par catégorie',
    wantFullList: '🔎 Vous voulez la liste complète, toujours à jour ?',
    handPickedSlice: 'Cette page est une sélection. Recherchez et filtrez tous les {TOTAL} postes actifs par rôle, ville, salaire et date sur Workopia.',
    tiredOfChecking: '🔔 Fatigué de vérifier chaque jour ?',
    getAlerted: 'Recevez une alerte quand de nouveaux postes jeunes diplômés & débutant paraissent en France.',
    watchReleases: 'Ou <b>Watch → Custom → Releases</b> sur ce repo pour un récap hebdomadaire des nouveaux postes par email.',
    legend: 'Légende',
    legendNew: 'Posté il y a moins de 2 jours',
    legendSalary: "Salaire (réel ou **WORKOPIA ESTIMATE**) affiché sur la page Workopia de chaque offre",
    legendVisaGB: 'Visa sponsorship available (UK Skilled Worker register)',
    legendHot: 'Employeur notable / en forte croissance',
    legendClosed: 'Les offres fermées sont archivées dans [Listings inactifs](./README-Inactive.md)',
    lookingElse: "**À la recherche d'autre chose ?**",
    closedOlder: 'Offres fermées/anciennes → [Listings inactifs](./README-Inactive.md)',
    otherCountries: 'Autres pays',
    fullLiveList: 'La liste complète → [tous les postes en France sur Workopia]({URL})',
    faqTitle: 'FAQs',
    faq1q: 'Quels postes de jeunes diplômés & stages puis-je encore candidater dès maintenant ?',
    faq1a: "De nombreux programmes jeunes diplômés et stages d'été fonctionnent sur des cycles annuels — mais une majorité d'employeurs recrutent au **fil de l'eau**, et les postes de jeunes diplômés, contrats en alternance, métiers techniques, vente et postes de débutant se font toute l'année. Cette liste affiche ce qui est **actif aujourd'hui**, mise à jour quotidiennement.",
    faq2q: "Qu'est-ce qu'un assessment centre et comment m'y préparer ?",
    faq2a: "Un événement d'une demi-journée à deux jours comprenant des exercices collectifs, des présentations, des exercices d'organisation et des entretiens — généralement l'étape finale. Voir [conseils d'entretien & assessment sur Workopia]({URL}).",
    faq3q: 'Comment recevoir des alertes pour les nouveaux postes ?',
    faq3a: 'Créez une alerte emploi sur Workopia par poste + ville et nous vous enverrons un email quand de nouveaux postes paraissent — [commencez ici]({URL}).',
    noteTiered: '💡 Vous ne trouvez pas un poste de « jeunes diplômés » ici ? Consultez les **Débutant** ci-dessous — les postes proches comptent aussi (un ingénieur logiciel peut postuler à Backend / Full Stack / Ingénieur IA).',
    noteEntry: "💡 Ce sont des postes de débutant, recrutement toute l'année — postulez directement ; pas de date limite de programme jeunes diplômés.",
    noteHealthcare: '🏥 Le secteur de la santé est basé sur les qualifications — infirmiers fraîchement diplômés, pharmaciens, aides-soignants et professionnels de la santé : postulez directement au poste.',
    browseAllCat: '🔎 **[Parcourez et filtrez tous les postes {NAME} actifs sur Workopia →]({URL})**',
    allGradCat: '🎓 **[Tous les postes de jeunes diplômés & débutant {NAME} →]({URL})**',
    backToTop: '⬆️ Retour en haut',
    biggerPicture: '🌍 Voir le contexte plus large',
    monitorAlt: 'Workopia — observatoire global du recrutement, 94 pays',
    exploreMonitor: "🌍 Découvrez l'observatoire global du recrutement →",
    footer: "📅 Mis à jour quotidiennement · Données © Workopia, provenant des pages carrière des employeurs · Les offres peuvent fermer avant le prochain rafraîchissement — confirmez sur la page de l'offre. Parcourez {TOTAL} postes gratuitement sur [workopia.io]({URL}).",
    thCompany: 'Entreprise', thRole: 'Poste', thLocation: 'Localisation', thSkills: 'Compétences clés', thApply: 'Postuler', thAge: 'Ancienneté',
    applyArrow: 'Postuler →',
    tierLabels: { Intern: 'Stages', Graduate: 'Jeunes diplômés', 'Entry-level': 'Débutant', entryHealthcare: 'Fraîchement diplômé & débutant' },
    tierWord: { Intern: 'Stages', Graduate: 'Jeunes diplômés', 'Entry-level': 'Débutant' },
    browseAlt: 'Parcourez tous les postes en France sur Workopia',
    subscribeAlt: 'Abonnez-vous aux alertes de nouveaux postes',
  },
};

// Localized category display names by key (fallback: the name in listings.json).
const CAT_NAME = {
  fr: { grad: 'Jeunes diplômés & Alternance', tech: 'Tech', finance: 'Finance & Comptabilité', healthcare: 'Santé', trades: 'Métiers techniques & Alternance', sales: 'Vente & Retail', admin: 'Business & Admin' },
};

const slugify = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-') || 'job';
const anc = (icon, name) => (icon + ' ' + name).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, '').replace(/[^a-z0-9 ]/g, '').trim().replace(/ +/g, '-');
const role = (t) => (t.length > 52 ? t.slice(0, 49).replace(/[\s\-–,(]+$/, '') + '…' : t);
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

export function renderReadme(data, now = Date.now()) {
  const { meta, categories, listings } = data;
  const lang = meta.lang && L10N[meta.lang] ? meta.lang : 'en';
  const t = L10N[lang];
  const catName = (d) => (CAT_NAME[lang] && CAT_NAME[lang][d.key]) || d.name;
  const age = (d) => { if (!d) return ''; const days = Math.floor((now - new Date(d).getTime()) / 864e5); if (Number.isNaN(days)) return ''; if (days <= 0) return lang === 'fr' ? "aujourd'hui" : 'today'; if (days < 14) return days + (lang === 'fr' ? ' j' : 'd'); if (days < 60) return Math.round(days / 7) + (lang === 'fr' ? ' sem' : 'w'); return Math.round(days / 30) + (lang === 'fr' ? ' mois' : 'mo'); };

  const U = 'utm_source=github&utm_medium=repo&utm_campaign=' + meta.repo.toLowerCase();
  const BJ = `${W}/browsejobs/${meta.segment}?${U}`;
  const BJG = `${W}/browsejobs/positions/${meta.segment}/graduate-program?${U}`;
  const active = listings.filter((r) => r.active !== false);
  const repoTotal = active.length;
  const byCatTier = new Map();
  for (const r of active) {
    const k = r.category + '|' + r.tier;
    if (!byCatTier.has(k)) byCatTier.set(k, []);
    byCatTier.get(k).push(r);
  }
  const tiersOf = (d) => Object.fromEntries(TIER_ORDER.map((tk) => [tk, byCatTier.get(d.key + '|' + tk) || []]));

  const flags = (r) => { let f = ''; if (r.date_posted && (now - new Date(r.date_posted).getTime()) <= 2 * 864e5) f += ' 🆕'; if (r.sponsorship) f += ' 🛂'; if (r.hot) f += ' 🔥'; return f; };
  // width attrs (GitHub's sanitizer keeps them) pin identical column geometry across every tier
  // table in the README — without them each table auto-sizes to its own content and nothing aligns.
  const TH = `<thead><tr><th width="18%">${t.thCompany}</th><th width="30%">${t.thRole}</th><th width="13%">${t.thLocation}</th><th width="25%">${t.thSkills}</th><th width="8%">${t.thApply}</th><th width="6%">${t.thAge}</th></tr></thead>`;
  function table(rows) {
    let last = '', b = '';
    for (const r of rows) {
      const nm = r.company_name;
      const co = nm === last ? '↳' : (r.company_hi_slug ? `<strong><a href="${W}/hi/companies/${r.company_hi_slug}?${U}">${nm}</a></strong>` : `<strong>${nm}</strong>`);
      if (nm !== last) last = nm;
      b += `<tr><td>${co}</td><td>${role(r.title)}${flags(r)}</td><td>${r.location}</td><td>${r.skills || '—'}</td><td><a href="${r.url}?${U}">${t.applyArrow}</a></td><td>${age(r.date_posted)}</td></tr>\n`;
    }
    return `<table>\n${TH}\n<tbody>\n${b}</tbody>\n</table>`;
  }

  const browse = categories.map((d) => {
    const tt = tiersOf(d);
    const cc = tt.Intern.length + tt.Graduate.length + tt['Entry-level'].length; if (!cc) return null;
    const ti = d.mode === 'entry'
      ? `${t.tierWord['Entry-level']} ${tt['Entry-level'].length}`
      : `${t.tierWord.Intern} ${tt.Intern.length} · ${t.tierWord.Graduate} ${tt.Graduate.length} · ${t.tierWord['Entry-level']} ${tt['Entry-level'].length}`;
    return `- ${d.icon} **[${catName(d)}](#${anc(d.icon, catName(d))})** (${cc}) — ${ti}`;
  }).filter(Boolean).join('\n');

  function renderCat(d) {
    const tt = tiersOf(d);
    const cc = tt.Intern.length + tt.Graduate.length + tt['Entry-level'].length; if (!cc) return '';
    let o = `\n## ${d.icon} ${catName(d)}\n`;
    if (d.key === 'healthcare') o += `\n> ${t.noteHealthcare}\n`;
    else if (d.mode === 'entry') o += `\n> ${t.noteEntry}\n`;
    else o += `\n> ${t.noteTiered}\n`;
    const order = d.mode === 'entry'
      ? [[d.key === 'healthcare' ? t.tierLabels.entryHealthcare : t.tierLabels['Entry-level'], 'Entry-level']]
      : [[t.tierLabels.Intern, 'Intern'], [t.tierLabels.Graduate, 'Graduate'], [t.tierLabels['Entry-level'], 'Entry-level']];
    for (const [lbl, key] of order) { const r = tt[key]; if (r.length) o += `\n### ${lbl} (${r.length})\n\n${table(r)}\n`; }
    o += `\n${fill(t.browseAllCat, { ADJ: meta.adjective, NAME: catName(d), URL: `${W}/browsejobs/positions/${meta.segment}/${d.l4slug}?${U}` })} · ${fill(t.allGradCat, { ADJ: meta.adjective, NAME: catName(d), URL: `${W}/graduates/${meta.site_slug || meta.segment}/${d.key}?${U}` })}\n\n<sub>[${t.backToTop}](#${slugify(meta.title)})</sub>\n`;
    return o;
  }

  const others = SERIES.filter(([iso]) => iso !== meta.country_iso).map(([, label, url]) => `[${label}](${url})`).join(' · ');
  const visaLegend = meta.country_iso === 'GB' ? `\n- 🛂 ${t.legendVisaGB}` : '';
  const md = `# ${meta.title} — ${t.updatedDaily}

${fill(t.intro, { ADJ: meta.adjective, N: repoTotal, TOTAL: meta.total_site_jobs_str })}

${fill(t.maintainedBy, { URL: BJ })}

${t.reportIssue}

---

### ${fill(t.browseByCategory, { N: repoTotal })}

${browse}

---

<div align="center">
  <h3>${t.wantFullList}</h3>
  <a href="${BJG}"><img src="./static/btn-browse.svg" alt="${fill(t.browseAlt, { ADJ: meta.adjective })}" width="460"></a>
  <p><sub><i>${fill(t.handPickedSlice, { TOTAL: meta.total_site_jobs_str })}</i></sub></p>
</div>

---

<div align="center">
  <h3>${t.tiredOfChecking}</h3>
  <a href="${BJG}"><img src="./static/btn-subscribe.svg" alt="${t.subscribeAlt}" width="360"></a>
  <p><sub><i>${fill(t.getAlerted, { ADJ: meta.adjective })}</i></sub></p>
  <p><sub>${t.watchReleases}</sub></p>
</div>

---

## ${t.legend}
- 🆕 ${t.legendNew}
- 💷 ${t.legendSalary}${visaLegend}
- 🔥 ${t.legendHot}
- 🔒 ${t.legendClosed}

> ${t.lookingElse}
> 🔒 ${t.closedOlder}
> 🌍 ${t.otherCountries} → ${others}
> 🔎 ${fill(t.fullLiveList, { ADJ: meta.adjective, URL: BJ })}

## ${t.faqTitle}

**${t.faq1q}**
${t.faq1a}

**${t.faq2q}**
${fill(t.faq2a, { URL: `${W}/resources/interview-tips?${U}` })}

**${t.faq3q}**
${fill(t.faq3a, { ADJ: meta.adjective, URL: BJG })}

---
${categories.map(renderCat).join('\n')}

---

## ${t.biggerPicture}
<div align="center">
  <a href="${W}/hi/monitor?${U}"><img src="./static/workopia-banner.png" alt="${t.monitorAlt}" width="80%"></a>
  <p><b><a href="${W}/hi/monitor?${U}">${t.exploreMonitor}</a></b></p>
</div>

<sub>${fill(t.footer, { TOTAL: meta.total_site_jobs_str, URL: `${W}/?${U}` })}</sub>
`;
  return { md, repoTotal };
}

export function renderPreview(md) {
  const safe = md.replace(/<\/script>/g, '<\\/script>');
  return `<!doctype html><meta charset=utf-8><link rel=stylesheet href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.1/github-markdown.min.css"><script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script><style>body{box-sizing:border-box;max-width:1012px;margin:0 auto;padding:45px}img{max-width:100%}table{display:table;width:100%}</style><article class=markdown-body id=o></article><script id=md type=text/plain>${safe}</script><script>o.innerHTML=marked.parse(md.textContent)</script>`;
}
