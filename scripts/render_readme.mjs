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
 *   meta:       { repo, title, country_iso, country_name, adjective, segment,
 *                 as_of, window_days, total_site_jobs_str, generated_at }
 *   categories: [{ key, name, icon, mode: 'tiered'|'entry', l4slug }]   (render order)
 *   listings:   [{ id, company_name, company_hi_slug, title, location, skills,
 *                  sponsorship, hot, date_posted, url, category, tier, active }]
 *                (array order inside each category+tier is the table row order)
 *
 * `skills` arrives as a final display string ('—' when unknown). No salary on GitHub —
 * salary + WORKOPIA ESTIMATE are main-site-only, on each role's Workopia page.
 * Time-relative cells (Age, 🆕) are computed at render time.
 */

const W = 'https://workopia.io';
const TIER_ORDER = ['Intern', 'Graduate', 'Entry-level'];

const slugify = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-') || 'job';
const anc = (icon, name) => (icon + ' ' + name).toLowerCase().replace(/&/g, '').replace(/[^a-z0-9 ]/g, '').trim().replace(/ +/g, '-');
const role = (t) => (t.length > 52 ? t.slice(0, 49).replace(/[\s\-–,(]+$/, '') + '…' : t);
const age = (d, now) => { if (!d) return ''; const days = Math.floor((now - new Date(d).getTime()) / 864e5); if (Number.isNaN(days)) return ''; if (days <= 0) return 'today'; if (days < 14) return days + 'd'; if (days < 60) return Math.round(days / 7) + 'w'; return Math.round(days / 30) + 'mo'; };

export function renderReadme(data, now = Date.now()) {
  const { meta, categories, listings } = data;
  const U = 'utm_source=github&utm_medium=repo&utm_campaign=' + meta.repo.toLowerCase();
  const BJ = `${W}/browsejobs/${meta.segment}?${U}`;
  const BJG = `${W}/browsejobs/positions/${meta.segment}/graduate-program?${U}`;
  const active = listings.filter((r) => r.active !== false);
  const repoTotal = active.length;
  const byCatTier = new Map(); // `${category}|${tier}` -> rows (array order preserved)
  for (const r of active) {
    const k = r.category + '|' + r.tier;
    if (!byCatTier.has(k)) byCatTier.set(k, []);
    byCatTier.get(k).push(r);
  }
  const tiersOf = (d) => Object.fromEntries(TIER_ORDER.map((tk) => [tk, byCatTier.get(d.key + '|' + tk) || []]));

  const flags = (r) => { let f = ''; if (r.date_posted && (now - new Date(r.date_posted).getTime()) <= 2 * 864e5) f += ' 🆕'; if (r.sponsorship) f += ' 🛂'; if (r.hot) f += ' 🔥'; return f; };
  // width attrs (GitHub's sanitizer keeps them) pin identical column geometry across every tier
  // table in the README — without them each table auto-sizes to its own content and nothing aligns.
  // No salary column on GitHub — salary + WORKOPIA ESTIMATE live on each role's Workopia page.
  const TH = '<thead><tr><th width="18%">Company</th><th width="30%">Role</th><th width="13%">Location</th><th width="25%">Key skills</th><th width="8%">Apply</th><th width="6%">Age</th></tr></thead>';
  function table(rows) {
    let last = '', b = '';
    for (const r of rows) {
      const nm = r.company_name;
      const co = nm === last ? '↳' : (r.company_hi_slug ? `<strong><a href="${W}/hi/companies/${r.company_hi_slug}?${U}">${nm}</a></strong>` : `<strong>${nm}</strong>`);
      if (nm !== last) last = nm;
      b += `<tr><td>${co}</td><td>${role(r.title)}${flags(r)}</td><td>${r.location}</td><td>${r.skills || '—'}</td><td><a href="${r.url}?${U}">Apply →</a></td><td>${age(r.date_posted, now)}</td></tr>\n`;
    }
    return `<table>\n${TH}\n<tbody>\n${b}</tbody>\n</table>`;
  }

  const browse = categories.map((d) => {
    const t = tiersOf(d);
    const cc = t.Intern.length + t.Graduate.length + t['Entry-level'].length; if (!cc) return null;
    const ti = d.mode === 'entry' ? `Entry-level ${t['Entry-level'].length}` : `Internships ${t.Intern.length} · Graduate ${t.Graduate.length} · Entry-level ${t['Entry-level'].length}`;
    return `- ${d.icon} **[${d.name}](#${anc(d.icon, d.name)})** (${cc}) — ${ti}`;
  }).filter(Boolean).join('\n');

  function renderCat(d) {
    const t = tiersOf(d);
    const cc = t.Intern.length + t.Graduate.length + t['Entry-level'].length; if (!cc) return '';
    let o = `\n## ${d.icon} ${d.name}\n`;
    if (d.key === 'healthcare') o += `\n> 🏥 Healthcare is qualification-gated — newly-qualified nurses, pharmacists, care & allied-health staff apply directly to the role.\n`;
    else if (d.mode === 'entry') o += `\n> 💡 These are entry-level, hire-year-round roles — apply directly; no graduate-scheme deadline.\n`;
    else o += `\n> 💡 Can't find a "graduate" role here? Check **Entry-level** below — adjacent roles count too (a Software Engineer can apply to Backend / Full Stack / AI Engineer).\n`;
    const order = d.mode === 'entry'
      ? [[d.key === 'healthcare' ? 'Newly-qualified & entry-level' : 'Entry-level', 'Entry-level']]
      : [['Internships', 'Intern'], ['Graduate', 'Graduate'], ['Entry-level', 'Entry-level']];
    for (const [lbl, key] of order) { const r = t[key]; if (r.length) o += `\n### ${lbl} (${r.length})\n\n${table(r)}\n`; }
    o += `\n🔎 **[Browse & filter all live ${meta.adjective} ${d.name} jobs on Workopia →](${W}/browsejobs/positions/${meta.segment}/${d.l4slug}?${U})** · 🎓 **[All ${meta.adjective} graduate & entry-level ${d.name} roles →](${W}/graduates/${meta.site_slug || meta.segment}/${d.key}?${U})**\n\n<sub>[⬆️ Back to top](#${slugify(meta.title)})</sub>\n`;
    return o;
  }

  const visaLegend = meta.country_iso === 'GB' ? '\n- 🛂 Visa sponsorship available (UK Skilled Worker register)' : '';
  const md = `# ${meta.title} — Updated Daily

Track the latest ${meta.adjective} **graduate schemes, entry-level roles, apprenticeships and internships** across Tech, Finance, Healthcare, Trades, Sales & Retail and Business & Admin. ${repoTotal} hand-picked roles below — part of **${meta.total_site_jobs_str} active job ads sourced straight from employer career pages, refreshed daily, zero third-party scraping.**

Maintained by [**Workopia**](${BJ}) — the world's 2nd largest job database, 94 countries, 2,517 cities.

🙏 **Spotted a wrong or closed role? [Open an issue](../../issues/new/choose) — see the [contribution guide](./CONTRIBUTING.md).** 🙏

---

### Browse ${repoTotal} Roles by Category

${browse}

---

<div align="center">
  <h3>🔎 Want the full, always-fresh list?</h3>
  <a href="${BJG}"><img src="./static/btn-browse.svg" alt="Browse all ${meta.adjective} jobs on Workopia" width="460"></a>
  <p><sub><i>This page is a hand-picked slice. Search & filter all ${meta.total_site_jobs_str} live jobs by role, city, salary & date on Workopia.</i></sub></p>
</div>

---

<div align="center">
  <h3>🔔 Tired of checking every day?</h3>
  <a href="${BJG}"><img src="./static/btn-subscribe.svg" alt="Subscribe for new-job alerts" width="360"></a>
  <p><sub><i>Get alerted when new ${meta.adjective} graduate & entry-level roles go live.</i></sub></p>
</div>

---

## Legend
- 🆕 Posted in the last 2 days
- 💷 Salary (real or **WORKOPIA ESTIMATE**) shown on every role's Workopia page${visaLegend}
- 🔥 Notable / high-growth employer
- 🔒 Closed roles move to [Inactive Listings](./README-Inactive.md)

> **Looking for something else?**
> 🔒 Closed/older roles → [Inactive Listings](./README-Inactive.md)
> 🌍 Other countries → UK · US · Australia · Singapore · France
> 🔎 The full live list → [all ${meta.adjective} jobs on Workopia](${BJ})

## FAQs

**Which graduate jobs & internships can I still apply for right now?**
Many structured graduate schemes and summer internships run on annual cycles — but a large share of employers recruit on a **rolling basis**, and graduate *jobs*, apprenticeships, trades, sales and entry-level roles run year-round. This list shows what's **live today**, refreshed daily.

**What's an assessment centre and how do I prepare?**
A half- to two-day mix of group exercises, presentations, in-tray tasks and interviews — usually the final stage. See [interview & assessment tips on Workopia](${W}/resources/interview-tips?${U}).

**How do I get alerts for new roles?**
Set a job alert on Workopia by role + city and we'll email you when new ${meta.adjective} roles go live — [start here](${BJG}).

---
${categories.map(renderCat).join('\n')}

---

## 🌍 See the bigger picture
<div align="center">
  <a href="${W}/hi/monitor?${U}"><img src="./static/workopia-banner.png" alt="Workopia — live global hiring monitor across 94 countries" width="80%"></a>
  <p><b><a href="${W}/hi/monitor?${U}">🌍 Explore the live global hiring monitor →</a></b></p>
</div>

<sub>📅 Updated daily · Data © Workopia, sourced from employer career pages · Roles may close before this list refreshes — confirm on the job page. Browse ${meta.total_site_jobs_str} jobs free at [workopia.io](${W}/?${U}).</sub>
`;
  return { md, repoTotal };
}

export function renderPreview(md) {
  const safe = md.replace(/<\/script>/g, '<\\/script>');
  return `<!doctype html><meta charset=utf-8><link rel=stylesheet href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.1/github-markdown.min.css"><script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script><style>body{box-sizing:border-box;max-width:1012px;margin:0 auto;padding:45px}img{max-width:100%}table{display:table;width:100%}</style><article class=markdown-body id=o></article><script id=md type=text/plain>${safe}</script><script>o.innerHTML=marked.parse(md.textContent)</script>`;
}
