/* ============================================================
   FinalAudit — SEO & Website Audit
   Demo dataset for the final report view.
   Replace this object with your real audit output to reuse the UI.
   ============================================================ */

window.AUDIT = {
  meta: {
    reportId: "SEO-2026-1024-07",
    siteName: "Northwind Store",
    url: "https://northwindstore.com",
    domain: "northwindstore.com",
    favicon: "NW",
    industry: "E-commerce · Outdoor gear",
    auditedOn: "24 Oct 2026",
    auditWindow: "20 – 24 Oct 2026",
    auditedBy: "Big Pickle",
    role: "Lead SEO Consultant",
    pagesCrawled: 248,
    crawlTime: "4m 12s",
    devices: "Desktop + Mobile",
    standard: "Google Search Essentials · WCAG 2.2 AA · Core Web Vitals",
    preparedFor: "Northwind Store growth team"
  },

  score: {
    overall: 74,
    previous: 68,
    grade: "C+",
    verdict: "Needs improvement",
    verdictTone: "warn",
    critical: 4,
    warnings: 8,
    passed: 4,
    checks: 16,
    summary:
      "A solid content foundation and a clean crawl profile are doing the heavy lifting. Performance on product templates is the main drag on revenue pages, and conflicting indexing rules are suppressing filtered category URLs. Fixing the four critical findings should lift the overall score into the high 80s."
  },

  categories: [
    { key: "technical",   name: "Technical SEO",   score: 82, delta: 6,  issues: 4, blurb: "Crawl, index & sitemaps",  note: "Mostly healthy; two conflicting rules." },
    { key: "onpage",      name: "On-Page SEO",     score: 71, delta: 4,  issues: 3, blurb: "Titles, meta & structure", note: "Duplicate templates limit relevance." },
    { key: "content",     name: "Content Quality", score: 78, delta: 9,  issues: 2, blurb: "Depth & readability",     note: "Strong editorial, thin product copy." },
    { key: "performance", name: "Performance",     score: 58, delta: -3, issues: 3, blurb: "Core Web Vitals & speed", note: "LCP is the biggest revenue risk." },
    { key: "mobile",      name: "Mobile",          score: 86, delta: 2,  issues: 1, blurb: "Responsive experience",   note: "Layout is solid; tap targets slip." },
    { key: "security",    name: "Security",        score: 67, delta: 0,  issues: 2, blurb: "HTTPS & headers",         note: "HSTS and CSP still missing." },
    { key: "accessibility", name: "Accessibility", score: 73, delta: 5,  issues: 1, blurb: "WCAG 2.2 AA checks",      note: "Contrast needs a token-level fix." },
    { key: "authority",   name: "Authority",       score: 62, delta: 4,  issues: 1, blurb: "Links & trust signals",   note: "Good growth; behind two rivals." }
  ],

  trend: [58, 61, 63, 62, 68, 71, 74],

  vitals: [
    { key: "LCP",  name: "Largest Contentful Paint", value: "4.1", unit: "s",  status: "bad",  target: "< 2.5 s", pct: 92, note: "Product hero images" },
    { key: "INP",  name: "Interaction to Next Paint", value: "212", unit: "ms", status: "warn", target: "< 200 ms", pct: 68, note: "Gallery + cart scripts" },
    { key: "CLS",  name: "Cumulative Layout Shift",  value: "0.04", unit: "",  status: "good", target: "< 0.1", pct: 22, note: "Stable across templates" },
    { key: "FCP",  name: "First Contentful Paint",   value: "2.3", unit: "s",  status: "warn", target: "< 1.8 s", pct: 74, note: "Render-blocking CSS" },
    { key: "TTFB", name: "Time to First Byte",       value: "0.38", unit: "s", status: "good", target: "< 0.8 s", pct: 30, note: "Edge cache is working" }
  ],

  issues: [
    {
      id: "ISS-01",
      severity: "critical",
      category: "performance",
      title: "Mobile LCP is 4.1 s on product templates",
      description:
        "Field data shows the LCP element on /products/* is a 1,480 px hero gallery image. It is served as an uncompressed 1.9 MB PNG, is not preloaded, and competes with four gallery thumbnails. 31 product URLs sit above the 2.5 s 'good' threshold.",
      affected: "31 URLs",
      impact: "High",
      effort: "Medium",
      why:
        "Product pages carry 62% of organic revenue. Every extra second of LCP correlates with a measurable drop in add-to-cart rate, and this template is also the weakest performer in the mobile index.",
      fix:
        "Serve the hero in AVIF/WebP at two sizes with srcset, add fetchpriority=\"high\" to the main image, preload the mobile variant, and move gallery JavaScript below the fold.",
      code:
        '<link rel="preload" as="image"\n      href="/media/trailforge-65-800.avif"\n      imagesrcset="/media/trailforge-65-400.avif 400w,\n                   /media/trailforge-65-800.avif 800w"\n      imagesizes="100vw" fetchpriority="high">'
    },
    {
      id: "ISS-02",
      severity: "critical",
      category: "technical",
      title: "1,284 filtered product URLs are blocked by robots.txt",
      description:
        "The rule Disallow: /*?filter= also matches crawlable category-filter combinations that generate 18% of organic product entrances. 74 of those URLs have external backlinks. Blocked pages cannot pass link equity, and sitemap entries now conflict with the block.",
      affected: "1,284 URLs",
      impact: "High",
      effort: "Low",
      why:
        "This is the largest source of lost crawl equity on the site. It also creates contradictory signals: the sitemap asks Google to index pages that robots.txt forbids it from fetching.",
      fix:
        "Remove the wildcard block for meaningful filter parameters. Keep only sort and session parameters blocked, resubmit robots.txt, then validate 20 sample URLs with URL Inspection.",
      code:
        '# robots.txt — before\nDisallow: /*?filter=\n\n# after\nDisallow: /*?sort=\nDisallow: /*?sessionid=\nAllow: /*?filter='
    },
    {
      id: "ISS-03",
      severity: "critical",
      category: "security",
      title: "HSTS is missing and the apex host is not fully redirected",
      description:
        "Three of 20 tested routes on the apex host respond over HTTP without a redirect to HTTPS. No Strict-Transport-Security header is returned on any response. This creates an interception window and a mixed-content risk for first-time visitors.",
      affected: "Apex domain",
      impact: "High",
      effort: "Low",
      why:
        "HSTS is a baseline trust signal. Without it, a single insecure request can expose session data, and browsers have no instruction to force HTTPS on repeat visits.",
      fix:
        "Add a 301 redirect from HTTP to HTTPS at the edge, then send the header below on every HTTPS response. Submit to the HSTS preload list only after the redirect chain is clean.",
      code:
        'Strict-Transport-Security: max-age=31536000; includeSubDomains; preload'
    },
    {
      id: "ISS-04",
      severity: "critical",
      category: "onpage",
      title: "18 category pages share near-duplicate titles and descriptions",
      description:
        "Collection pages use one template that only swaps the collection name. Paginated variants repeat page 1 tags, and Google is selecting a different canonical for 6 of them. Titles also exceed 65 characters on 11 pages.",
      affected: "18 URLs",
      impact: "High",
      effort: "Medium",
      why:
        "Category pages are the main entry point for commercial queries. Generic templates flatten relevance, reduce click-through, and make it harder for Google to pick the right landing page.",
      fix:
        "Write a unique title and description per collection using the category, season and a concrete differentiator. Self-canonicalise paginated pages and add descriptive page titles instead of canonicalising page 2 to page 1.",
      code:
        '<title>3-Season Backpacks (2026) | Ultralight & Waterproof — Northwind</title>\n<meta name="description" content="Shop 24 three-season backpacks tested from 40–65 L. Compare weight, waterproofing and fit, with free 60-day returns.">'
    },
    {
      id: "ISS-05",
      severity: "warning",
      category: "content",
      title: "42 product descriptions are under 120 words",
      description:
        "These pages average 78 unique words, most of it copied from manufacturer spec tables. They receive 11% of organic product traffic but convert 38% below the site average.",
      affected: "42 URLs",
      impact: "High",
      effort: "High",
      why:
        "Thin product copy gives Google little to rank and gives shoppers little reason to buy. The problem compounds on long-tail queries where no other page can compete.",
      fix:
        "Rewrite the top 15 pages by revenue first. Add use-case paragraphs, fit notes, care instructions and 2–3 FAQs, and keep at least 300 words of unique copy per page.",
      code: null
    },
    {
      id: "ISS-06",
      severity: "warning",
      category: "performance",
      title: "Render-blocking CSS and JavaScript delay first paint",
      description:
        "Two CSS bundles (312 KB) and four synchronous scripts block first paint on every template. The theme bundle includes 68 KB of unused icon CSS and a carousel library used on only three pages.",
      affected: "Site-wide",
      impact: "High",
      effort: "Medium",
      why:
        "FCP is 2.3 s on mobile. Blocking assets are the direct cause, and they also push LCP later on pages that already have heavy imagery.",
      fix:
        "Inline critical CSS, load the rest asynchronously, and defer scripts. Split the theme bundle and remove the carousel from templates that do not use it.",
      code:
        '<link rel="stylesheet" href="/app.css" media="print" onload="this.media=\'all\'">\n<script src="/theme.js" defer></script>'
    },
    {
      id: "ISS-07",
      severity: "warning",
      category: "onpage",
      title: "63 images are missing descriptive alt text",
      description:
        "Product gallery thumbnails and 12 blog hero images use empty alt attributes. 21 of those images are links with no adjacent text, so assistive technology has nothing to announce.",
      affected: "63 images",
      impact: "Medium",
      effort: "Low",
      why:
        "Alt text is used by screen readers, image search and the accessibility audit. Missing text also removes a small but useful relevance signal from product pages.",
      fix:
        "Describe the product, colour and angle — not the filename. Mark decorative images with alt=\"\" and add an alt-text check to the CMS publish workflow.",
      code:
        '<img src="/media/trailforge-65-front.avif"\n     alt="TrailForge 65 L backpack in moss green, front view"\n     width="800" height="800" loading="lazy">'
    },
    {
      id: "ISS-08",
      severity: "warning",
      category: "technical",
      title: "XML sitemap includes 21 noindex URLs",
      description:
        "The generated sitemap contains cart, account and 14 internal search pages that are all marked noindex. It is also missing 9 newly published product URLs.",
      affected: "21 URLs",
      impact: "Medium",
      effort: "Low",
      why:
        "A sitemap should only contain canonical, indexable, 200-status URLs. Mixed signals slow discovery of new products and waste crawl budget.",
      fix:
        "Filter noindex and non-200 URLs out of sitemap generation, include the 9 missing products, then resubmit and monitor Index coverage for 14 days.",
      code: null
    },
    {
      id: "ISS-09",
      severity: "warning",
      category: "mobile",
      title: "Footer links fall below the 24 px tap-target minimum",
      description:
        "Mobile emulation found 17 footer and breadcrumb links with a 16–20 px hit area and only 4 px of spacing. 9% of mobile sessions tap a footer link, mostly shipping and returns.",
      affected: "17 elements",
      impact: "Medium",
      effort: "Low",
      why:
        "Small targets cause mis-taps and back-button loops. WCAG 2.2 also requires a minimum 24 × 24 CSS px target size or equivalent spacing.",
      fix:
        "Increase padding to at least 44 × 44 CSS px, add 8 px spacing, and verify at 320 px width. Use a wrapper so the visual size can stay unchanged.",
      code:
        '.footer a {\n  display: inline-flex;\n  min-height: 44px;\n  min-width: 44px;\n  align-items: center;\n  padding: 0 8px;\n}'
    },
    {
      id: "ISS-10",
      severity: "warning",
      category: "accessibility",
      title: "“Add to cart” label fails WCAG AA contrast",
      description:
        "The mint label on the sand button background measures 2.9:1. WCAG AA needs 4.5:1 for normal text. Six templates share the same colour token.",
      affected: "6 templates",
      impact: "Medium",
      effort: "Low",
      why:
        "Low-contrast primary actions are hard to read in sunlight and for low-vision users. This is the only contrast failure across the 248 crawled pages.",
      fix:
        "Use a darker label or fill, then verify hover, focus and disabled states. Add a token-level contrast test to the design system CI so it cannot regress.",
      code:
        '.btn-buy {\n  background: #047857;\n  color: #ffffff; /* 6.4:1 */\n}'
    },
    {
      id: "ISS-11",
      severity: "warning",
      category: "authority",
      title: "41 internal links point to redirected URLs",
      description:
        "Navigation and blog CTAs still reference legacy /shop/* paths that 301 to /collections/*. Each click adds a round trip, and internal link signals are split between the old and new URLs.",
      affected: "41 links",
      impact: "Low",
      effort: "Low",
      why:
        "Internal redirects are not broken, but they waste crawl budget and dilute the link equity you are trying to consolidate on collection pages.",
      fix:
        "Update templates and the top 20 blog posts to final URLs, then add a crawl rule that flags 3xx internal links. Keep the redirects live for external traffic.",
      code: null
    },
    {
      id: "ISS-12",
      severity: "warning",
      category: "technical",
      title: "Canonical conflicts on paginated category pages",
      description:
        "Page 2 and beyond canonicalise to page 1 while also being listed in the sitemap. Nine paginated URLs are indexed but never appear in search results.",
      affected: "9 URLs",
      impact: "Medium",
      effort: "Low",
      why:
        "A canonical that points elsewhere tells Google the page is a duplicate. That removes paginated landing pages from consideration for long-tail queries.",
      fix:
        "Self-reference each paginated page, use descriptive page titles, and only exclude pages from the sitemap if they are not intended to rank.",
      code:
        '<link rel="canonical" href="https://northwindstore.com/collections/backpacks?page=2">'
    },
    {
      id: "ISS-13",
      severity: "passed",
      category: "technical",
      title: "HTTPS is enforced on all www pages",
      description:
        "All 248 crawled www URLs return 200 over HTTPS with a valid certificate chain. The mixed-content scan found 0 insecure resources.",
      affected: "248 URLs",
      impact: "None",
      effort: "None",
      why:
        "A clean HTTPS baseline means work can focus on the apex redirect and HSTS header rather than certificate issues.",
      fix:
        "No action needed on www. Re-test after the apex redirect change and confirm the certificate covers both hostnames.",
      code: null
    },
    {
      id: "ISS-14",
      severity: "passed",
      category: "onpage",
      title: "Every crawled page has exactly one descriptive H1",
      description:
        "Headings were validated across all 248 pages. No page is missing an H1 and no page uses more than one. 91% of H1s include the primary topic.",
      affected: "248 URLs",
      impact: "None",
      effort: "None",
      why:
        "A single, descriptive H1 gives both users and search engines an unambiguous page topic and keeps the outline clean.",
      fix:
        "Keep the CMS rule that blocks publishing without an H1. Spot-check new templates after the next theme release.",
      code: null
    },
    {
      id: "ISS-15",
      severity: "passed",
      category: "content",
      title: "Product structured data validates on 96% of PDPs",
      description:
        "Product, Offer, Breadcrumb and Organization markup passed the Rich Results test. The remaining 4% are variant pages missing an aggregateRating value.",
      affected: "238 / 248 URLs",
      impact: "None",
      effort: "None",
      why:
        "Valid product markup is what makes price, availability and review stars eligible in search results. A 96% pass rate is a strong base.",
      fix:
        "Backfill the 10 variant pages and add schema validation to the release checklist. Do not add ratings that are not visible on the page.",
      code: null
    },
    {
      id: "ISS-16",
      severity: "passed",
      category: "performance",
      title: "CLS stays below 0.1 on every key template",
      description:
        "Layout shift is 0.04 on product, collection, blog and checkout templates. Media placeholders and font loading are already handled correctly.",
      affected: "All templates",
      impact: "None",
      effort: "None",
      why:
        "Stable layout protects conversion and is one of the three Core Web Vitals. This is the strongest part of the performance profile.",
      fix:
        "Preserve explicit width/height attributes and the current font-display strategy during the LCP image work.",
      code: null
    }
  ],

  opportunities: [
    { label: "Eliminate render-blocking resources", detail: "2 CSS bundles · 4 sync scripts", saving: 1240 },
    { label: "Properly size hero images", detail: "31 product templates", saving: 890 },
    { label: "Serve images in AVIF / WebP", detail: "1.9 MB PNG → 210 KB AVIF", saving: 760 },
    { label: "Reduce unused JavaScript", detail: "68 KB icon CSS · carousel lib", saving: 520 },
    { label: "Enable text compression", detail: "Brotli on HTML, CSS & JS", saving: 310 },
    { label: "Preconnect to third-party origins", detail: "Reviews, analytics, fonts", saving: 180 }
  ],

  timeline: [
    { label: "DNS", value: 18, color: "#64748b" },
    { label: "TLS", value: 42, color: "#0ea5e9" },
    { label: "TTFB", value: 380, color: "#6366f1" },
    { label: "Download", value: 640, color: "#f59e0b" },
    { label: "Render & paint", value: 1120, color: "#ef4444" }
  ],

  metaTags: [
    { template: "Home", url: "/", title: 45, desc: 152, status: "good" },
    { template: "Collection", url: "/collections/backpacks", title: 72, desc: 168, status: "bad" },
    { template: "Product", url: "/products/trailforge-65", title: 46, desc: 118, status: "warn" },
    { template: "Blog post", url: "/blog/best-3-season-backpacks", title: 58, desc: 149, status: "good" },
    { template: "Search", url: "/search?q=backpack", title: 0, desc: 0, status: "bad" },
    { template: "Cart", url: "/cart", title: 34, desc: 0, status: "warn" }
  ],

  headings: [
    { level: 1, text: "TrailForge 65 L 3-Season Backpack" },
    { level: 2, text: "Built for the shoulder season" },
    { level: 2, text: "Materials & construction" },
    { level: 2, text: "Fit & sizing" },
    { level: 3, text: "How to measure your torso" },
    { level: 3, text: "Women's fit" },
    { level: 2, text: "Care & repair" },
    { level: 2, text: "Customer reviews" }
  ],

  serp: {
    title: "TrailForge 65 L 3-Season Backpack | Ultralight — Northwind",
    url: "northwindstore.com › products › trailforge-65",
    description:
      "A 1.28 kg three-season pack tested from 40–65 L. Waterproof ripstop, adjustable torso and free 60-day returns. 4.8 ★ from 312 reviews."
  },

  keywords: [
    { term: "3 season backpack", volume: "4,400", position: 6.2, change: 2.4, clicks: 680, ctr: "7.8%" },
    { term: "ultralight backpack", volume: "8,100", position: 9.8, change: 1.1, clicks: 420, ctr: "5.2%" },
    { term: "backpacking sleeping bag", volume: "12,100", position: 14.5, change: -0.6, clicks: 290, ctr: "3.1%" },
    { term: "alpine shell jacket", volume: "2,900", position: 7.4, change: 3.2, clicks: 310, ctr: "8.4%" },
    { term: "best tents for rain", volume: "1,600", position: 18.9, change: 5.1, clicks: 96, ctr: "2.8%" },
    { term: "trail running vest", volume: "5,900", position: 22.3, change: -2.8, clicks: 74, ctr: "1.9%" }
  ],

  crawl: [
    { label: "Indexed pages", value: "1,842", note: "+34 this month", tone: "good", icon: "check" },
    { label: "Excluded", value: "248", note: "94 noindex · 154 other", tone: "warn", icon: "info" },
    { label: "Blocked by robots", value: "1,284", note: "Needs removal", tone: "bad", icon: "alert" },
    { label: "Sitemap URLs", value: "2,090", note: "21 noindex included", tone: "warn", icon: "map" }
  ],

  security: [
    { header: "Strict-Transport-Security", value: "Not set", status: "critical" },
    { header: "Content-Security-Policy", value: "Not set", status: "warning" },
    { header: "X-Content-Type-Options", value: "nosniff", status: "passed" },
    { header: "Referrer-Policy", value: "strict-origin-when-cross-origin", status: "passed" },
    { header: "Permissions-Policy", value: "Not set", status: "warning" },
    { header: "X-Frame-Options", value: "SAMEORIGIN", status: "passed" }
  ],

  schema: [
    { name: "Product + Offer", coverage: 96 },
    { name: "BreadcrumbList", coverage: 100 },
    { name: "Organization", coverage: 100 },
    { name: "Review / AggregateRating", coverage: 78 },
    { name: "FAQPage", coverage: 42 }
  ],

  contentStats: [
    { label: "Avg. words / page", value: "684", note: "Target 800+", tone: "warn" },
    { label: "Thin pages", value: "42", note: "Under 120 words", tone: "bad" },
    { label: "Readability", value: "Grade 8", note: "Healthy for retail", tone: "good" },
    { label: "Duplicate content", value: "7%", note: "42 product URLs", tone: "warn" }
  ],

  pages: [
    { url: "/products/trailforge-65", clicks: "12,480", impr: "184k", ctr: "6.8%", pos: 4.2, score: 91 },
    { url: "/collections/backpacks", clicks: "8,930", impr: "121k", ctr: "7.4%", pos: 5.8, score: 84 },
    { url: "/blog/best-3-season-backpacks", clicks: "5,210", impr: "96k", ctr: "5.4%", pos: 6.9, score: 78 },
    { url: "/collections/sleeping-bags", clicks: "3,640", impr: "74k", ctr: "4.9%", pos: 8.1, score: 72 },
    { url: "/products/alpine-shell-jacket", clicks: "2,980", impr: "66k", ctr: "4.5%", pos: 9.4, score: 61 },
    { url: "/collections/tents", clicks: "1,920", impr: "41k", ctr: "4.7%", pos: 11.2, score: 54 }
  ],

  authority: {
    stats: [
      { label: "Backlinks", value: "4,280", note: "+118 this quarter", tone: "good" },
      { label: "Referring domains", value: "312", note: "+42 this quarter", tone: "good" },
      { label: "Dofollow share", value: "68%", note: "Healthy profile", tone: "good" },
      { label: "Authority score", value: "62", note: "Below 2 rivals", tone: "warn" }
    ],
    competitors: [
      { name: "Northwind Store", you: true, authority: 62, domains: "312", backlinks: "4,280", keywords: "1,840", traffic: "24.8k" },
      { name: "Summit & Pine", you: false, authority: 81, domains: "1,240", backlinks: "18.4k", keywords: "4,120", traffic: "62.4k" },
      { name: "Backcountry Lab", you: false, authority: 74, domains: "890", backlinks: "12.9k", keywords: "3,260", traffic: "48.1k" },
      { name: "Trailhead Co.", you: false, authority: 69, domains: "540", backlinks: "7,300", keywords: "2,410", traffic: "31.6k" }
    ]
  },

  roadmap: {
    now: {
      label: "Now",
      window: "0 – 30 days",
      tone: "bad",
      items: [
        { title: "Unblock filtered product URLs", meta: "Technical · 2 days", detail: "Remove the /*?filter= robots rule and resubmit." },
        { title: "Fix duplicate category titles", meta: "On-page · 3 days", detail: "Unique tags for 18 collections + paginated canonicals." },
        { title: "Compress and preload LCP hero", meta: "Performance · 4 days", detail: "AVIF srcset + fetchpriority on product templates." },
        { title: "Enforce HSTS on apex", meta: "Security · 1 day", detail: "Redirect HTTP at the edge, then send the header." }
      ]
    },
    next: {
      label: "Next",
      window: "30 – 90 days",
      tone: "warn",
      items: [
        { title: "Rewrite 42 thin product descriptions", meta: "Content · 3 weeks", detail: "Start with the top 15 pages by revenue." },
        { title: "Add alt text to 63 images", meta: "Accessibility · 1 week", detail: "Product galleries and blog hero images." },
        { title: "Fix contrast and mobile tap targets", meta: "Accessibility · 1 week", detail: "CTA token + footer hit areas." }
      ]
    },
    later: {
      label: "Later",
      window: "90+ days",
      tone: "good",
      items: [
        { title: "Launch a digital PR programme", meta: "Authority · quarterly", detail: "Target 20 editorial links from outdoor publications." },
        { title: "Split the JavaScript bundle", meta: "Performance · 3 weeks", detail: "Route-level loading for gallery and cart." },
        { title: "Roll out FAQ schema site-wide", meta: "Content · 2 weeks", detail: "42 pages already have FAQ copy ready." }
      ]
    }
  }
};
