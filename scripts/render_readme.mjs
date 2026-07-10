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
  ['DE', 'Germany', 'https://github.com/workopia/Germany-Graduate-Jobs'],
  ['CA', 'Canada', 'https://github.com/workopia/Canada-New-Grad-Internship-Jobs'],
  ['ES', 'Spain', 'https://github.com/workopia/Spain-Graduate-Internship-Jobs'],
  ['NL', 'Netherlands', 'https://github.com/workopia/Netherlands-Graduate-Jobs'],
  ['HK', 'Hong Kong', 'https://github.com/workopia/Hong-Kong-Graduate-Internship-Jobs'],
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
    ageToday: 'today', ageDay: 'd', ageWeek: 'w', ageMonth: 'mo',
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
    ageToday: "aujourd'hui", ageDay: ' j', ageWeek: ' sem', ageMonth: ' mois',
  },
  de: {
    updatedDaily: 'Täglich aktualisiert',
    intro: 'Verfolgen Sie die neuesten **Absolventenprogramme, Einstiegspositionen, Ausbildungen und Praktika** in Deutschland in Technik, Finanzen, Gesundheitswesen, Handwerk, Vertrieb & Einzelhandel und Verwaltung. {N} handverlesene Stellen unten — Teil von **{TOTAL} aktiven Stellenanzeigen direkt von Karriereseiten der Arbeitgeber, täglich aktualisiert, kein Scraping durch Dritte.**',
    maintainedBy: 'Gepflegt von [**Workopia**]({URL}) — die zweitgrößte Jobdatenbank der Welt, 94 Länder, 2.517 Städte.',
    reportIssue: '🙏 **Falsche oder geschlossene Stelle gefunden? [Melden Sie ein Problem](../../issues/new/choose) — siehe [Beitragsleitfaden](./CONTRIBUTING.md).** 🙏',
    browseByCategory: 'Stöbern Sie in {N} Stellen nach Kategorie',
    wantFullList: '🔎 Möchten Sie die komplette, immer aktuelle Liste?',
    handPickedSlice: 'Diese Seite ist eine Auswahl. Suchen und filtern Sie alle {TOTAL} Live-Jobs nach Rolle, Stadt, Gehalt und Datum auf Workopia.',
    tiredOfChecking: '🔔 Müde vom täglichen Durchsuchen?',
    getAlerted: 'Lassen Sie sich benachrichtigen, wenn neue deutsche Absolventenstellen und Einstiegspositionen veröffentlicht werden.',
    watchReleases: 'Oder <b>Watch → Custom → Releases</b> in diesem Repository für einen wöchentlichen E-Mail-Digest neuer Stellen.',
    legend: 'Legende',
    legendNew: 'In den letzten 2 Tagen veröffentlicht',
    legendSalary: 'Gehalt (reell oder **WORKOPIA ESTIMATE**) auf jeder Stellenseite bei Workopia angezeigt',
    legendVisaGB: 'Visa sponsorship available (UK Skilled Worker register)',
    legendHot: 'Bemerkenswert / schnell wachsender Arbeitgeber',
    legendClosed: 'Geschlossene Stellen wechseln zu [Inaktive Anzeigen](./README-Inactive.md)',
    lookingElse: '**Suchen Sie etwas anderes?**',
    closedOlder: 'Geschlossene/ältere Stellen → [Inaktive Anzeigen](./README-Inactive.md)',
    otherCountries: 'Andere Länder',
    fullLiveList: 'Die komplette aktuelle Liste → [alle deutschen Jobs auf Workopia]({URL})',
    faqTitle: 'FAQs',
    faq1q: 'Für welche Absolventenstellen und Praktika kann ich mich jetzt noch bewerben?',
    faq1a: 'Viele strukturierte Absolventenprogramme und Sommerpraktika laufen nach Jahreszyklen — aber ein großer Teil der Arbeitgeber rekrutiert **fortlaufend**, und Absolventenjobs, Ausbildungen, Handwerk, Vertrieb und Einstiegspositionen werden das ganze Jahr über besetzt. Diese Liste zeigt, was **heute live** ist, täglich aktualisiert.',
    faq2q: 'Was ist ein Assessment Centre und wie bereite ich mich vor?',
    faq2a: 'Eine Mischung aus Gruppen- und Präsentationsübungen, In-Tray-Aufgaben und Interviews über ein bis zwei Tage — meist die letzte Runde. Siehe [Interview- & Assessment-Tipps auf Workopia]({URL}).',
    faq3q: 'Wie erhalte ich Benachrichtigungen für neue Stellen?',
    faq3a: 'Richten Sie auf Workopia einen Job-Alert nach Rolle + Stadt ein und wir benachrichtigen Sie, wenn neue deutsche Stellen veröffentlicht werden — [hier starten]({URL}).',
    noteTiered: '💡 Keine "Absolventenstelle" hier gefunden? Schauen Sie sich **Berufseinstieg** unten an — auch ähnliche Rollen zählen (ein Software Engineer kann sich auf Backend / Full Stack / AI Engineer bewerben).',
    noteEntry: '💡 Dies sind Einstiegspositionen, die das ganze Jahr über besetzt werden — bewerben Sie sich direkt; kein Absolventenprogramm-Stichtag.',
    noteHealthcare: '🏥 Gesundheitswesen ist qualifikationsabhängig — neu qualifizierte Krankenpfleger, Apotheker, Pflege- und Fachkräfte bewerben sich direkt auf die Stelle.',
    browseAllCat: '🔎 **[Alle aktuellen {NAME}-Jobs in Deutschland durchsuchen und filtern →]({URL})**',
    allGradCat: '🎓 **[Alle deutschen Absolventenstellen & Einstiegspositionen im Bereich {NAME} →]({URL})**',
    backToTop: '⬆️ Nach oben',
    biggerPicture: '🌍 Das Gesamtbild sehen',
    monitorAlt: 'Workopia — Live Global Hiring Monitor über 94 Länder',
    exploreMonitor: '🌍 Erkunden Sie den Live Global Hiring Monitor →',
    footer: '📅 Täglich aktualisiert · Daten © Workopia, direkt von Karriereseiten · Stellen können vor Aktualisierung dieser Liste geschlossen sein — bestätigen Sie auf der Jobseite. Kostenlos alle {TOTAL} Jobs auf [workopia.io]({URL}) durchsuchen.',
    thCompany: 'Unternehmen', thRole: 'Stelle', thLocation: 'Standort', thSkills: 'Kernkompetenzen', thApply: 'Bewerbung', thAge: 'Online',
    applyArrow: 'Bewerben →',
    tierLabels: { Intern: 'Praktika', Graduate: 'Absolventen', 'Entry-level': 'Berufseinstieg', entryHealthcare: 'Berufsanfänger & Einstieg' },
    tierWord: { Intern: 'Praktika', Graduate: 'Absolventen', 'Entry-level': 'Berufseinstieg' },
    browseAlt: 'Alle Jobs in Deutschland auf Workopia',
    subscribeAlt: 'Job-Alerts abonnieren',
    ageToday: 'heute', ageDay: ' T', ageWeek: ' Wo', ageMonth: ' Mon',
  },
  es: {
    updatedDaily: 'Actualizado diariamente',
    intro: 'Explora los últimos **programas para recién graduados, puestos de entrada, aprendizajes y prácticas** en España en Tech, Finanzas, Sanidad, Oficios, Ventas & Retail y Administración & gestión. {N} puestos seleccionados a continuación — parte de **{TOTAL} anuncios de empleo activos extraídos directamente de las webs de carreras de empleadores, actualizados diariamente, sin scraping de terceros.**',
    maintainedBy: 'Mantenido por [**Workopia**]({URL}) — la 2ª mayor base de datos de empleo del mundo, 94 países, 2.517 ciudades.',
    reportIssue: '🙏 **¿Encontraste un puesto cerrado o incorrecto? [Abre una incidencia](../../issues/new/choose) — consulta la [guía de contribución](./CONTRIBUTING.md).** 🙏',
    browseByCategory: 'Explora {N} puestos por categoría',
    wantFullList: '🔎 ¿Quieres la lista completa y siempre fresca?',
    handPickedSlice: 'Esta página es una selección hecha a mano. Busca y filtra todos los {TOTAL} empleos activos por puesto, ciudad, salario y fecha en Workopia.',
    tiredOfChecking: '🔔 ¿Cansado de revisar cada día?',
    getAlerted: 'Recibe alertas cuando salgan nuevos puestos para recién graduados y de entrada en España.',
    watchReleases: 'O <b>Watch → Custom → Releases</b> en este repositorio para un resumen semanal por email de nuevos puestos.',
    legend: 'Leyenda',
    legendNew: 'Publicado en los últimos 2 días',
    legendSalary: 'Salario (real o **WORKOPIA ESTIMATE**) mostrado en la página de Workopia de cada puesto',
    legendVisaGB: 'Visa sponsorship available (UK Skilled Worker register)',
    legendHot: 'Empleador destacado / de alto crecimiento',
    legendClosed: 'Los puestos cerrados se trasladan a [Anuncios inactivos](./README-Inactive.md)',
    lookingElse: '**¿Buscas algo más?**',
    closedOlder: 'Puestos cerrados/antiguos → [Anuncios inactivos](./README-Inactive.md)',
    otherCountries: 'Otros países',
    fullLiveList: 'La lista completa activa → [todos los empleos en España en Workopia]({URL})',
    faqTitle: 'Preguntas frecuentes',
    faq1q: '¿Qué puestos para recién graduados y prácticas puedo solicitar ahora mismo?',
    faq1a: 'Muchos programas estructurados para recién graduados y prácticas de verano se ajustan a ciclos anuales — pero una gran parte de empleadores recluta en **base continuada**, y los empleos para recién graduados, aprendizajes, oficios, ventas y puestos de entrada se ofrecen todo el año. Esta lista muestra lo que está **activo hoy**, actualizada diariamente.',
    faq2q: '¿Qué es un centro de evaluación y cómo me preparo?',
    faq2a: 'Una mezcla de medio día a dos días de ejercicios grupales, presentaciones, tareas y entrevistas — generalmente la fase final. Consulta [consejos de entrevista y evaluación en Workopia]({URL}).',
    faq3q: '¿Cómo recibo alertas de nuevos puestos?',
    faq3a: 'Configura una alerta de empleo en Workopia por puesto + ciudad y te enviaremos un email cuando salgan nuevos puestos en España — [comienza aquí]({URL}).',
    noteTiered: '💡 ¿No encuentras un puesto para recién graduados aquí? Consulta **Junior / Sin experiencia** abajo — también cuentan puestos similares (un Ingeniero de Software puede optar a Backend / Full Stack / Ingeniero de IA).',
    noteEntry: '💡 Estos son puestos junior que contratan todo el año — solicita directamente; sin fecha límite de programa.',
    noteHealthcare: '🏥 Sanidad requiere cualificaciones — enfermeros recién cualificados, farmacéuticos, cuidadores y personal sanitario de apoyo solicitan directamente el puesto.',
    browseAllCat: '🔎 **[Explora y filtra todos los empleos de {NAME} activos en España en Workopia →]({URL})**',
    allGradCat: '🎓 **[Todos los puestos para recién graduados y de entrada en {NAME} en España →]({URL})**',
    backToTop: '⬆️ Volver arriba',
    biggerPicture: '🌍 Ver el panorama general',
    monitorAlt: 'Workopia — monitor de contratación global en 94 países',
    exploreMonitor: '🌍 Explora el monitor de contratación global →',
    footer: '📅 Actualizado diariamente · Datos © Workopia, extraídos de las webs de carreras de empleadores · Los puestos pueden cerrarse antes de que se actualice esta lista — confirma en la página del puesto. Explora {TOTAL} empleos gratis en [workopia.io]({URL}).',
    thCompany: 'Empresa', thRole: 'Puesto', thLocation: 'Ubicación', thSkills: 'Competencias clave', thApply: 'Solicitar', thAge: 'Fecha',
    applyArrow: 'Solicitar →',
    tierLabels: { Intern: 'Prácticas y becas', Graduate: 'Recién graduados', 'Entry-level': 'Junior / Sin experiencia', entryHealthcare: 'Recién cualificados y de entrada' },
    tierWord: { Intern: 'Prácticas', Graduate: 'Recién graduados', 'Entry-level': 'Junior' },
    browseAlt: 'Todos los empleos en España en Workopia',
    subscribeAlt: 'Suscríbete a alertas de nuevos empleos',
    ageToday: 'hoy', ageDay: ' d', ageWeek: ' sem', ageMonth: ' mes',
  },
  nl: {
    updatedDaily: 'Dagelijks bijgewerkt',
    intro: "Volg de nieuwste **starters- & traineeprogramma's, junior-functies en stages** in Nederland voor Tech, Financiën, Healthcare, Ambachten, Verkoop & Detailhandel en Bedrijf & Administratie. {N} handgeselecteerde functies hieronder — onderdeel van **{TOTAL} actieve vacatures rechtstreeks van werkgeverswebsites, dagelijks vernieuwd, geen externe scraping.**",
    maintainedBy: 'Ondersteund door [**Workopia**]({URL}) — de op één na grootste jobdatabase ter wereld, 94 landen, 2.517 steden.',
    reportIssue: '🙏 **Zag je een foutieve of gesloten functie? [Maak een issue aan](../../issues/new/choose) — zie de [contributieguide](./CONTRIBUTING.md).** 🙏',
    browseByCategory: 'Blader door {N} functies per categorie',
    wantFullList: '🔎 Wil je de volledige, altijd-actuele lijst?',
    handPickedSlice: 'Deze pagina toont een selectie. Zoek & filter alle {TOTAL} live vacatures op rol, plaats, salaris & datum op Workopia.',
    tiredOfChecking: '🔔 Beu van iedere dag checken?',
    getAlerted: 'Ontvang een melding als er nieuwe startersbanen in Nederland live gaan.',
    watchReleases: 'Of <b>Watch → Custom → Releases</b> in deze repo voor een wekelijks e-maildigest met nieuwe functies.',
    legend: 'Legenda',
    legendNew: 'Geplaatst in de afgelopen 2 dagen',
    legendSalary: 'Salaris (echt of **WORKOPIA ESTIMATE**) getoond op elke functie op Workopia',
    legendVisaGB: 'Visa sponsorship available (UK Skilled Worker register)',
    legendHot: 'Opmerkelijk / snelgroeiende werkgever',
    legendClosed: 'Gesloten functies gaan naar [Inactieve listings](./README-Inactive.md)',
    lookingElse: '**Op zoek naar iets anders?**',
    closedOlder: 'Gesloten/oudere functies → [Inactieve listings](./README-Inactive.md)',
    otherCountries: 'Andere landen',
    fullLiveList: 'De volledige live lijst → [alle Nederlandse banen op Workopia]({URL})',
    faqTitle: 'Veelgestelde vragen',
    faq1q: 'Op welke startersbanen & stages kan ik nu nog solliciteren?',
    faq1a: "Veel gestructureerde starters- & traineeprogramma's en zomerstages volgen een jaarlijkse cyclus — maar veel werkgevers werven **voortdurend**, en startersfuncties, traineeships, ambachten, verkoop en junior-functies draaien het hele jaar. Deze lijst toont wat **vandaag live is**, dagelijks vernieuwd.",
    faq2q: 'Wat is een assessment centre en hoe bereid ik me erop voor?',
    faq2a: 'Een halve tot twee dagen vol groepsoefeningen, presentaties, in-tray taken en interviews — meestal de laatste fase. Zie [interview & assessment tips op Workopia]({URL}).',
    faq3q: 'Hoe krijg ik meldingen voor nieuwe functies?',
    faq3a: 'Zet een jobalert op Workopia in op rol + plaats en wij sturen je een e-mail als nieuwe Nederlandse functies live gaan — [begin hier]({URL}).',
    noteTiered: '💡 Geen "starters" functie gevonden? Kijk onder **Junior** — aangrenzende functies tellen ook (een Software Engineer kan solliciteren naar Backend / Full Stack / AI Engineer).',
    noteEntry: '💡 Dit zijn junior-functies die het hele jaar door worden ingevuld — solliciteer rechtstreeks; geen deadline.',
    noteHealthcare: '🏥 Healthcare vereist gekwalificeerde beroepskrachten — pas aangestelde verpleegkundigen, apothekers, verzorg- en geallieerde zorgmedewerkers solliciteren rechtstreeks.',
    browseAllCat: '🔎 **[Browse & filter alle live {NAME} banen in Nederland op Workopia →]({URL})**',
    allGradCat: '🎓 **[Alle Nederlandse starters- & junior-{NAME} functies →]({URL})**',
    backToTop: '⬆️ Terug naar boven',
    biggerPicture: '🌍 Zie het grotere plaatje',
    monitorAlt: 'Workopia — live hiring monitor voor 94 landen',
    exploreMonitor: '🌍 Verken de live hiring monitor →',
    footer: '📅 Dagelijks bijgewerkt · Data © Workopia, afkomstig van werkgeverswebsites · Functies kunnen sluiten voor deze lijst vernieuwt — bevestig op de jobpagina. Browse {TOTAL} banen gratis op [workopia.io]({URL}).',
    thCompany: 'Bedrijf', thRole: 'Functie', thLocation: 'Locatie', thSkills: 'Vaardigheden', thApply: 'Solliciteren', thAge: 'Online',
    applyArrow: 'Solliciteren →',
    tierLabels: { Intern: 'Stages', Graduate: 'Starters & afgestudeerden', 'Entry-level': 'Junior', entryHealthcare: 'Pas gekwalificeerd & junior' },
    tierWord: { Intern: 'Stages', Graduate: 'Starters', 'Entry-level': 'Junior' },
    browseAlt: 'Alle banen in Nederland op Workopia',
    subscribeAlt: 'Abonneer je op jobalerts',
    ageToday: 'vandaag', ageDay: ' d', ageWeek: ' wk', ageMonth: ' mnd',
  },
};

// Localized category display names by key (fallback: the name in listings.json).
const CAT_NAME = {
  fr: { grad: 'Jeunes diplômés & Alternance', tech: 'Tech', data: 'Data, IA & ML', finance: 'Finance & Comptabilité', healthcare: 'Santé', trades: 'Métiers techniques & Alternance', sales: 'Vente & Retail', admin: 'Business & Admin' },
  de: { grad: 'Absolventenprogramme & Ausbildung', tech: 'Technik & IT', data: 'Daten, KI & ML', finance: 'Finanzen & Buchhaltung', healthcare: 'Gesundheitswesen', trades: 'Handwerk & Ausbildung', sales: 'Vertrieb & Einzelhandel', admin: 'Verwaltung & Business' },
  es: { grad: 'Programas para recién graduados y trainee', tech: 'Tech', data: 'Datos, IA y ML', finance: 'Finanzas y contabilidad', healthcare: 'Sanidad', trades: 'Oficios y aprendizajes', sales: 'Ventas y retail', admin: 'Administración y gestión' },
  nl: { grad: "Starters- & traineeprogramma's", tech: 'Tech', data: 'Data, AI & ML', finance: 'Financiën & Boekhouden', healthcare: 'Healthcare', trades: 'Ambachten & Leerwerkplekken', sales: 'Verkoop & Detailhandel', admin: 'Bedrijf & Administratie' },
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
  const age = (d) => { if (!d) return ''; const days = Math.floor((now - new Date(d).getTime()) / 864e5); if (Number.isNaN(days)) return ''; if (days <= 0) return t.ageToday; if (days < 14) return days + t.ageDay; if (days < 60) return Math.round(days / 7) + t.ageWeek; return Math.round(days / 30) + t.ageMonth; };

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
    // site_live:false = this country's /graduates pages are not deployed yet — render only the
    // browse-L4 link (already live) and skip the graduates deep link until the switch flips.
    const gradLink = meta.site_live === false
      ? ''
      : ` · ${fill(t.allGradCat, { ADJ: meta.adjective, NAME: catName(d), URL: `${W}/graduates/${meta.site_slug || meta.segment}/${d.key}?${U}` })}`;
    o += `\n${fill(t.browseAllCat, { ADJ: meta.adjective, NAME: catName(d), URL: `${W}/browsejobs/positions/${meta.segment}/${d.l4slug}?${U}` })}${gradLink}\n\n<sub>[${t.backToTop}](#${slugify(meta.title)})</sub>\n`;
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
