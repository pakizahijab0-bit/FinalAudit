/* ============================================================
   FinalAudit — browser-side audit engine
   Parses fetched HTML + PageSpeed Insights data and produces
   the exact report schema used by app.js.
   ============================================================ */

(function () {
  "use strict";

  var CATEGORY_META = {
    technical:     { name: "Technical SEO",   blurb: "Crawl, index & sitemaps" },
    onpage:        { name: "On-Page SEO",     blurb: "Titles, meta & structure" },
    content:       { name: "Content Quality", blurb: "Depth & readability" },
    performance:   { name: "Performance",     blurb: "Core Web Vitals & speed" },
    mobile:        { name: "Mobile",          blurb: "Responsive experience" },
    security:      { name: "Security",        blurb: "HTTPS & headers" },
    accessibility: { name: "Accessibility",   blurb: "WCAG 2.2 AA checks" }
  };

  var CATEGORY_ORDER = ["technical", "onpage", "content", "performance", "mobile", "security", "accessibility"];
  var SEVERITY_WEIGHT = { critical: 22, warning: 9, passed: 0 };

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function round(n) {
    return Math.round(Number(n) || 0);
  }

  function formatBytes(bytes) {
    if (!bytes) return "0 KB";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  function formatMs(ms) {
    if (!ms) return "0 ms";
    if (ms < 1000) return round(ms) + " ms";
    return (ms / 1000).toFixed(2).replace(/0+$/, "").replace(/\.$/, "") + " s";
  }

  function normalizeForCompare(value) {
    try {
      var u = new URL(value);
      u.hash = "";
      return u.href.replace(/\/$/, "").toLowerCase();
    } catch (err) {
      return String(value || "").replace(/\/$/, "").toLowerCase();
    }
  }

  function countWords(text) {
    if (!text) return 0;
    var matches = text.match(/[A-Za-z0-9\u00C0-\u024F]+(?:['\u2019-][A-Za-z0-9\u00C0-\u024F]+)*/g);
    return matches ? matches.length : 0;
  }

  function countSyllables(word) {
    word = String(word || "").toLowerCase().replace(/[^a-z]/g, "");
    if (!word) return 0;
    if (word.length <= 3) return 1;
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
    var groups = word.match(/[aeiouy]{1,2}/g);
    return groups ? groups.length : 1;
  }

  function readabilityOf(text) {
    var words = countWords(text);
    if (!words) return { words: 0, grade: 0, ease: 0, label: "No readable copy" };

    var sentences = (String(text).match(/[.!?]+(?=\s|$)/g) || []).length || 1;
    var syllableTotal = 0;
    String(text).replace(/[A-Za-z\u00C0-\u024F]+/g, function (word) {
      syllableTotal += countSyllables(word);
      return word;
    });

    var wordsPerSentence = words / sentences;
    var syllablesPerWord = syllableTotal / words;
    var ease = 206.835 - (1.015 * wordsPerSentence) - (84.6 * syllablesPerWord);
    var grade = (0.39 * wordsPerSentence) + (11.8 * syllablesPerWord) - 15.59;

    ease = clamp(ease, 0, 100);
    grade = clamp(grade, 0, 18);

    var label = ease >= 70 ? "Easy to read" : ease >= 50 ? "Moderately readable" : "Hard to read";
    return { words: words, grade: grade, ease: ease, label: label };
  }

  function collectSchemaTypes(value, out) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(function (item) { collectSchemaTypes(item, out); });
      return;
    }
    if (value["@type"]) {
      var types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
      types.forEach(function (type) { out.add(String(type)); });
    }
    if (value["@graph"]) collectSchemaTypes(value["@graph"], out);
  }

  function parseRobots(text) {
    var groups = [];
    var current = null;
    String(text || "").split(/\r?\n/).forEach(function (rawLine) {
      var line = rawLine.replace(/#.*$/, "").trim();
      if (!line) return;
      var match = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
      if (!match) return;
      var key = match[1].toLowerCase();
      var value = match[2].trim();

      if (key === "user-agent") {
        if (!current || current.directives.length) {
          current = { agents: [], directives: [] };
          groups.push(current);
        }
        current.agents.push(value.toLowerCase());
        return;
      }

      if (!current) {
        current = { agents: ["*"], directives: [] };
        groups.push(current);
      }
      if (key === "disallow" || key === "allow") {
        current.directives.push({ key: key, value: value });
      }
    });

    var googlebotGroups = groups.filter(function (group) {
      return group.agents.some(function (agent) { return agent.indexOf("googlebot") === 0; });
    });
    var wildcardGroups = groups.filter(function (group) {
      return group.agents.some(function (agent) { return agent === "*"; });
    });
    var effectiveGroups = googlebotGroups.length ? googlebotGroups : wildcardGroups;
    var blocksAll = effectiveGroups.some(function (group) {
      var hasGlobalAllow = group.directives.some(function (directive) {
        return directive.key === "allow" && (!directive.value || directive.value === "/");
      });
      if (hasGlobalAllow) return false;
      return group.directives.some(function (directive) {
        return directive.key === "disallow" && directive.value === "/";
      });
    });

    return {
      blocksAll: blocksAll,
      hasSitemap: /(^|\n)\s*sitemap\s*:\s*\S+/i.test(String(text || ""))
    };
  }

  function extractPage(html, finalUrl) {
    var doc = new DOMParser().parseFromString(html || "", "text/html");
    var pageUrl = new URL(finalUrl);
    var pageSiteHost = pageUrl.hostname.replace(/^www\./i, "");

    function metaContent(selector) {
      var el = doc.querySelector(selector);
      return el ? String(el.getAttribute("content") || "").trim() : "";
    }

    function all(selector) {
      return Array.prototype.slice.call(doc.querySelectorAll(selector));
    }

    var title = (doc.querySelector("title") ? doc.querySelector("title").textContent : "").trim();
    var description = metaContent('meta[name="description"]');
    var robotsMeta = [metaContent('meta[name="robots"]'), metaContent('meta[name="googlebot"]')]
      .filter(Boolean)
      .join(", ");
    var viewport = metaContent('meta[name="viewport"]');
    var canonicalEl = doc.querySelector('link[rel="canonical"]');
    var canonical = canonicalEl ? String(canonicalEl.getAttribute("href") || "").trim() : "";
    var lang = String(doc.documentElement.getAttribute("lang") || "").trim();

    var h1s = all("h1");
    var headings = all("h1,h2,h3,h4,h5,h6")
      .map(function (el) { return { level: Number(el.tagName.charAt(1)), text: String(el.textContent || "").trim() }; })
      .filter(function (h) { return h.text; })
      .slice(0, 18);

    var headingSkip = false;
    var previousLevel = 0;
    headings.forEach(function (h) {
      if (previousLevel && h.level > previousLevel + 1) headingSkip = true;
      previousLevel = h.level;
    });

    var images = all("img").map(function (img) {
      return {
        src: String(img.getAttribute("src") || ""),
        alt: img.getAttribute("alt"),
        hasAlt: img.hasAttribute("alt"),
        width: img.getAttribute("width"),
        height: img.getAttribute("height"),
        loading: String(img.getAttribute("loading") || "").toLowerCase()
      };
    });

    var links = all("a[href]").map(function (a) {
      var href = String(a.getAttribute("href") || "").trim();
      if (!href || href.charAt(0) === "#" || /^(mailto:|tel:|javascript:)/i.test(href)) return null;
      var resolved = null;
      try { resolved = new URL(href, finalUrl); } catch (err) { return null; }
      var linkHost = resolved.hostname.replace(/^www\./i, "");
      return {
        href: resolved.href,
        internal: linkHost === pageSiteHost || linkHost.endsWith("." + pageSiteHost) || pageSiteHost.endsWith("." + linkHost),
        text: String(a.textContent || "").trim(),
        ariaLabel: String(a.getAttribute("aria-label") || "").trim(),
        title: String(a.getAttribute("title") || "").trim()
      };
    }).filter(Boolean);

    var controls = all("a[href],button").map(function (el) {
      var name = String(el.textContent || "").trim() ||
        String(el.getAttribute("aria-label") || "").trim() ||
        String(el.getAttribute("title") || "").trim();
      if (!name) {
        var img = el.querySelector("img[alt]");
        if (img) name = String(img.getAttribute("alt") || "").trim();
      }
      return { name: name, tag: el.tagName.toLowerCase() };
    });

    var formFields = all("input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='reset']):not([type='image']),select,textarea").map(function (field) {
      var id = String(field.getAttribute("id") || "");
      var labelled = false;
      if (id) {
        try {
          labelled = !!doc.querySelector('label[for="' + id.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"]');
        } catch (err) {
          labelled = false;
        }
      }
      if (!labelled) labelled = !!field.closest("label");
      if (!labelled) labelled = !!(field.getAttribute("aria-label") || field.getAttribute("aria-labelledby") || field.getAttribute("title"));
      return { labelled: labelled };
    });

    var stylesheets = all('link[rel="stylesheet"]');
    var scripts = all("script[src]").map(function (script) {
      return {
        src: String(script.getAttribute("src") || ""),
        async: script.hasAttribute("async"),
        defer: script.hasAttribute("defer")
      };
    });
    var blockingScripts = scripts.filter(function (s) { return !s.async && !s.defer; });
    var renderBlocking = stylesheets.length + blockingScripts.length;

    var schemaSet = new Set();
    var jsonLdCount = 0;
    all('script[type="application/ld+json"]').forEach(function (script) {
      jsonLdCount += 1;
      try {
        collectSchemaTypes(JSON.parse(script.textContent || ""), schemaSet);
      } catch (err) {
        // Invalid JSON-LD is reported as a content/technical finding elsewhere.
      }
    });

    var clone = doc.body ? doc.body.cloneNode(true) : null;
    if (clone) {
      clone.querySelectorAll("script,style,noscript,template,svg,iframe,canvas").forEach(function (node) {
        node.remove();
      });
    }
    var text = (clone ? clone.textContent : "").replace(/\s+/g, " ").trim();
    var wordCount = countWords(text);
    var histogram = readabilityOf(text);
    var textHtmlRatio = html.length ? Math.round((text.length / html.length) * 100) : 0;

    var imagesMissingAlt = images.filter(function (img) { return !img.hasAlt; }).length;
    var imagesEmptyAlt = images.filter(function (img) { return img.hasAlt && !String(img.alt || "").trim(); }).length;
    var imagesNoDimensions = images.filter(function (img) { return !img.width || !img.height; }).length;

    return {
      doc: doc,
      title: title,
      description: description,
      robotsMeta: robotsMeta,
      viewport: viewport,
      canonical: canonical,
      lang: lang,
      h1Count: h1s.length,
      h1Text: h1s.length ? String(h1s[0].textContent || "").trim() : "",
      headings: headings,
      headingSkip: headingSkip,
      images: images,
      imagesMissingAlt: imagesMissingAlt,
      imagesEmptyAlt: imagesEmptyAlt,
      imagesNoDimensions: imagesNoDimensions,
      links: links,
      internalLinks: links.filter(function (l) { return l.internal; }).length,
      controls: controls,
      formFields: formFields,
      stylesheets: stylesheets.length,
      scripts: scripts.length,
      blockingScripts: blockingScripts.length,
      renderBlocking: renderBlocking,
      schemaTypes: Array.from(schemaSet),
      jsonLdCount: jsonLdCount,
      text: text,
      wordCount: wordCount,
      readability: histogram,
      textHtmlRatio: textHtmlRatio,
      ogTitle: metaContent('meta[property="og:title"]'),
      ogDescription: metaContent('meta[property="og:description"]'),
      ogImage: metaContent('meta[property="og:image"]')
    };
  }

  function parsePsi(psi) {
    if (!psi || !psi.lighthouseResult) return null;
    var lh = psi.lighthouseResult;
    var categories = lh.categories || {};
    var audits = lh.audits || {};
    var field = (psi.loadingExperience && psi.loadingExperience.metrics) || {};

    function fieldMetric(key) {
      var metric = field[key];
      return metric && typeof metric.percentile === "number" ? metric.percentile : null;
    }
    function labMetric(key) {
      var audit = audits[key];
      return audit && typeof audit.numericValue === "number" ? audit.numericValue : null;
    }
    function categoryScore(key) {
      var cat = categories[key];
      return cat && typeof cat.score === "number" ? Math.round(cat.score * 100) : null;
    }

    var lcp = fieldMetric("LARGEST_CONTENTFUL_PAINT_MS");
    if (lcp === null) lcp = labMetric("largest-contentful-paint");
    var inp = fieldMetric("INTERACTION_TO_NEXT_PAINT");
    var inpIsProxy = false;
    if (inp === null) {
      inp = labMetric("total-blocking-time");
      inpIsProxy = inp !== null;
    }
    var cls = fieldMetric("CUMULATIVE_LAYOUT_SHIFT_SCORE");
    if (cls === null) cls = labMetric("cumulative-layout-shift");
    else if (cls > 1) cls = cls / 100;
    var fcp = fieldMetric("FIRST_CONTENTFUL_PAINT_MS");
    if (fcp === null) fcp = labMetric("first-contentful-paint");
    var ttfb = fieldMetric("EXPERIMENTAL_TIME_TO_FIRST_BYTE");
    if (ttfb === null) ttfb = fieldMetric("SERVER_RESPONSE_TIME");
    if (ttfb === null) ttfb = labMetric("server-response-time");

    var metricsItem = audits.metrics && audits.metrics.details && audits.metrics.details.items
      ? audits.metrics.details.items[0] : null;
    if (ttfb === null && metricsItem) ttfb = metricsItem.observedFirstByte;

    var opportunities = [];
    Object.keys(audits).forEach(function (key) {
      var audit = audits[key];
      if (!audit || !audit.details || audit.details.type !== "opportunity") return;
      var saving = Number(audit.details.overallSavingsMs);
      if (!saving || saving < 40) return;
      opportunities.push({
        label: String(audit.title || key),
        detail: String(audit.displayValue || audit.description || "Lighthouse opportunity").replace(/\s+/g, " ").slice(0, 110),
        saving: Math.round(saving)
      });
    });
    opportunities.sort(function (a, b) { return b.saving - a.saving; });

    function auditFailures(key) {
      var audit = audits[key];
      if (!audit) return null;
      if (audit.score === null || audit.score >= 1) return 0;
      var items = audit.details && audit.details.items;
      return items && items.length ? items.length : 1;
    }

    return {
      performance: categoryScore("performance"),
      accessibility: categoryScore("accessibility"),
      seo: categoryScore("seo"),
      bestPractices: categoryScore("best-practices"),
      lcp: lcp,
      inp: inp,
      inpIsProxy: inpIsProxy,
      cls: cls,
      fcp: fcp,
      ttfb: ttfb,
      opportunities: opportunities.slice(0, 6),
      tapTargetFailures: auditFailures("tap-targets"),
      fontSizeFailures: auditFailures("font-size"),
      imageAltFailures: auditFailures("image-alt"),
      observedFirstByte: metricsItem ? metricsItem.observedFirstByte : null,
      observedDomContentLoaded: metricsItem ? metricsItem.observedDomContentLoaded : null,
      observedLoad: metricsItem ? metricsItem.observedLoad : null
    };
  }

  function buildReport(payload, rawPsi) {
    var finalUrl = payload.finalUrl || payload.requestedUrl;
    var pageUrl = new URL(finalUrl);
    var page = extractPage(payload.html || "", finalUrl);
    var psi = parsePsi(rawPsi);
    var checks = [];

    function add(category, severity, title, description, affected, impact, effort, why, fix, code) {
      checks.push({
        category: category,
        severity: severity,
        title: title,
        description: description,
        affected: affected || "This page",
        impact: impact || (severity === "critical" ? "High" : severity === "warning" ? "Medium" : "None"),
        effort: effort || (severity === "critical" ? "Medium" : "Low"),
        why: why,
        fix: fix,
        code: code || null
      });
    }

    function passed(category, title, description, why, fix, affected) {
      add(category, "passed", title, description, affected || "This page", "None", "None", why, fix);
    }

    var status = Number(payload.status) || 0;
    var isHttps = pageUrl.protocol === "https:";
    var rawHeaders = payload.headers || {};
    var xRobotsKey = Object.keys(rawHeaders).find(function (key) { return key.toLowerCase() === "x-robots-tag"; });
    var xRobotsValue = xRobotsKey ? String(rawHeaders[xRobotsKey] || "").trim() : "";
    var noindexPattern = /noindex|\bnone\b/i;
    var noindexMeta = noindexPattern.test(page.robotsMeta || "");
    var noindexHeader = noindexPattern.test(xRobotsValue);
    var noindex = noindexMeta || noindexHeader;
    var robotsTxt = payload.robotsTxt;
    var robotsFound = typeof robotsTxt === "string";
    var robotsInfo = robotsFound ? parseRobots(robotsTxt) : { blocksAll: false, hasSitemap: false };
    var robotsBlocksAll = robotsFound && robotsInfo.blocksAll;
    var robotsHasSitemap = robotsFound && robotsInfo.hasSitemap;

    /* ------------------------------ technical ------------------------------ */
    if (status >= 200 && status < 300) {
      passed("technical", "Page returns HTTP " + status,
        "The server returned a successful " + status + " response for the submitted URL.",
        "A 2xx response is required for search engines to crawl and index the page.",
        "Keep the current server configuration and monitor uptime.");
    } else {
      add("technical", status >= 400 ? "critical" : "warning", "Page returns HTTP " + status,
        "The server responded with HTTP " + status + " instead of a successful 2xx status.",
        "Submitted URL", "High", "Medium",
        "Search engines cannot reliably index a page that returns an error or an unresolved redirect.",
        "Fix the server or application error, then request validation in Search Console.");
    }

    if (isHttps) {
      passed("technical", "HTTPS is enabled",
        "The page is served over HTTPS with the submitted hostname.",
        "HTTPS protects visitor data and is a confirmed lightweight ranking signal.",
        "Keep the certificate valid and redirect every HTTP request to HTTPS.");
    } else {
      add("technical", "critical", "Page is served over insecure HTTP",
        "The final URL uses http:// instead of https://.",
        "All visitors", "High", "Low",
        "Browsers mark HTTP pages as not secure and search engines prefer HTTPS.",
        "Install a valid TLS certificate and add a permanent 301 redirect from HTTP to HTTPS.");
    }

    if (noindex) {
      var noindexDirective = noindexMeta ? (page.robotsMeta || "noindex") : "X-Robots-Tag: " + xRobotsValue;
      add("technical", "critical", "Page is marked noindex",
        "The " + (noindexMeta ? "robots meta tag" : "X-Robots-Tag response header") + " contains \"" + noindexDirective + "\", which removes the page from search results.",
        "This page", "High", "Low",
        "A noindex directive makes every on-page improvement irrelevant because the page cannot appear in search.",
        "Remove noindex from the " + (noindexMeta ? "meta robots tag" : "X-Robots-Tag header") + " unless this URL is intentionally excluded from search.");
    } else {
      passed("technical", "No noindex directive",
        "Neither the robots meta tag nor the X-Robots-Tag response header blocks indexing.",
        "Indexability is the first requirement for organic visibility.",
        "Keep the current robots meta and header configuration when deploying template changes.");
    }

    if (page.canonical) {
      var resolvedCanonical = page.canonical;
      try { resolvedCanonical = new URL(page.canonical, finalUrl).href; } catch (err) {
        resolvedCanonical = page.canonical;
      }
      if (normalizeForCompare(resolvedCanonical) === normalizeForCompare(finalUrl)) {
        passed("technical", "Canonical URL matches the page",
          "The canonical tag points to the submitted URL: " + resolvedCanonical,
          "A self-referencing canonical consolidates signals on the correct URL.",
          "Keep canonical tags self-referencing when you change URL structure.");
      } else {
        add("technical", "warning", "Canonical points to a different URL",
          "The canonical tag points to " + resolvedCanonical + " instead of the submitted URL.",
          "This page", "Medium", "Low",
          "A cross-page canonical tells Google to index a different URL and can suppress this page from search.",
          "Self-reference the canonical on this URL, or confirm the alternate URL is the intended version.");
      }
    } else {
      add("technical", "warning", "Canonical tag is missing",
        "No link rel=\"canonical\" tag was found in the page head.",
        "This page", "Medium", "Low",
        "Without a canonical, duplicate or parameterised versions can compete with this URL.",
        "Add a self-referencing absolute canonical URL in the page head.");
    }

    if (!robotsFound) {
      add("technical", "warning", "robots.txt could not be checked",
        "The crawler could not retrieve a robots.txt file from the target host.",
        "Host", "Medium", "Low",
        "A missing or blocked robots.txt removes crawl guidance and sitemap discovery.",
        "Publish a valid robots.txt at the domain root and reference the XML sitemap.");
    } else if (robotsBlocksAll) {
      add("technical", "critical", "robots.txt blocks the entire site",
        "The robots.txt file contains a blanket \"Disallow: /\" rule.",
        "Host", "High", "Low",
        "A blanket block prevents search engines from crawling any page on the site.",
        "Remove or narrow the blanket rule, then resubmit robots.txt and validate key URLs.");
    } else if (robotsHasSitemap) {
      passed("technical", "robots.txt references a sitemap",
        "The robots.txt file declares an XML sitemap for discovery.",
        "A sitemap reference helps search engines find new and updated URLs.",
        "Keep the sitemap reference current when the site structure changes.");
    } else {
      add("technical", "warning", "No sitemap declared in robots.txt",
        "robots.txt was found, but it does not contain a Sitemap: directive.",
        "Host", "Medium", "Low",
        "Sitemap discovery is slower when the location is not declared explicitly.",
        "Add a Sitemap: line with the absolute XML sitemap URL.");
    }

    if (page.lang) {
      passed("technical", "HTML language attribute is set",
        "The html element declares lang=\"" + page.lang + "\".",
        "The language attribute helps search engines and assistive technology understand the page.",
        "Keep the language attribute accurate when publishing localised pages.");
    } else {
      add("technical", "warning", "HTML language attribute is missing",
        "The html element does not include a lang attribute.",
        "This page", "Medium", "Low",
        "Missing language metadata weakens accessibility and international targeting.",
        "Add the correct ISO language code, for example <html lang=\"en\">.");
    }

    if (page.schemaTypes.length) {
      passed("technical", "Structured data found",
        "JSON-LD markup was detected with these types: " + page.schemaTypes.join(", ") + ".",
        "Structured data helps search engines understand entities and enables rich results.",
        "Validate the markup after template changes and keep it consistent with visible content.");
    } else {
      add("technical", "warning", "No structured data found",
        "No JSON-LD structured data was detected in the page HTML.",
        "This page", "Medium", "Medium",
        "Schema markup is required for eligible rich results such as breadcrumbs, products and FAQs.",
        "Add JSON-LD for the most relevant entity on the page, starting with Organization and WebPage.");
    }

    /* ------------------------------ on-page ------------------------------ */
    var titleLength = page.title.length;
    if (!page.title) {
      add("onpage", "critical", "Title tag is missing",
        "The page has no title element, so search results have no headline to display.",
        "This page", "High", "Low",
        "The title is the strongest on-page relevance signal and the clickable headline in search results.",
        "Add a unique 30–60 character title that describes the page and includes the primary topic.");
    } else if (titleLength < 30) {
      add("onpage", "warning", "Title tag is too short",
        "The title is " + titleLength + " characters long: \"" + page.title + "\".",
        "This page", "Medium", "Low",
        "Short titles leave valuable relevance and click-through space unused.",
        "Expand the title to 30–60 characters with a clear value proposition.");
    } else if (titleLength > 60) {
      add("onpage", "warning", "Title tag may be truncated in search",
        "The title is " + titleLength + " characters long; Google usually displays about 60.",
        "This page", "Medium", "Low",
        "Truncated titles hide the differentiating part of the message and can reduce click-through.",
        "Shorten the title to 60 characters or fewer while keeping the primary keyword near the front.");
    } else {
      passed("onpage", "Title tag length is healthy",
        "The title is " + titleLength + " characters long: \"" + page.title + "\".",
        "A concise title fits search results and communicates the page topic clearly.",
        "Keep the title unique when new templates are published.");
    }

    var descLength = page.description.length;
    if (!page.description) {
      add("onpage", "warning", "Meta description is missing",
        "No meta description was found in the page head.",
        "This page", "Medium", "Low",
        "Search engines often write their own snippet when the description is absent, reducing message control.",
        "Add a unique 70–160 character description with a concrete reason to click.");
    } else if (descLength < 70 || descLength > 160) {
      add("onpage", "warning", "Meta description length needs adjustment",
        "The description is " + descLength + " characters long; aim for 70–160.",
        "This page", "Low", "Low",
        "Descriptions that are too short or too long are less persuasive and may be truncated.",
        "Rewrite the description to 70–160 characters with the page benefit and a call to action.");
    } else {
      passed("onpage", "Meta description length is healthy",
        "The description is " + descLength + " characters long.",
        "A complete description gives search engines a useful, clickable snippet.",
        "Keep descriptions unique for every indexable template.");
    }

    if (page.h1Count === 1) {
      passed("onpage", "Exactly one H1 heading",
        "The page has one H1: \"" + page.h1Text + "\".",
        "A single descriptive H1 gives users and search engines an unambiguous page topic.",
        "Keep the H1 unique and aligned with the title.");
    } else if (page.h1Count === 0) {
      add("onpage", "critical", "H1 heading is missing",
        "No H1 element was found on the page.",
        "This page", "High", "Low",
        "The H1 is the main on-page heading and helps search engines understand the page topic.",
        "Add one visible H1 that describes the page and includes the primary topic.");
    } else {
      add("onpage", "warning", "Multiple H1 headings found",
        "The page contains " + page.h1Count + " H1 elements.",
        "This page", "Medium", "Low",
        "Multiple H1s can flatten the outline and make the primary topic less clear.",
        "Keep one H1 and move secondary section headings to H2 or H3.");
    }

    if (page.headingSkip) {
      add("onpage", "warning", "Heading levels skip a level",
        "The heading outline jumps past a level (for example H2 directly to H4).",
        "This page", "Medium", "Low",
        "A logical heading order improves navigation for screen readers and content parsing.",
        "Use heading levels in sequence and style them with CSS rather than choosing levels for appearance.");
    } else if (page.headings.length > 1) {
      passed("onpage", "Heading hierarchy is logical",
        "The page uses heading levels in sequence across " + page.headings.length + " headings.",
        "A clean outline makes the content easier to scan and parse.",
        "Preserve the heading order when adding new sections.");
    }

    if (page.ogTitle && page.ogDescription && page.ogImage) {
      passed("onpage", "Open Graph tags are complete",
        "og:title, og:description and og:image are all present.",
        "Complete Open Graph tags control how the page appears when shared on social platforms.",
        "Keep the image at least 1200 × 630 px and refresh it with major campaigns.");
    } else {
      add("onpage", "warning", "Open Graph tags are incomplete",
        "Missing: " + [
          !page.ogTitle ? "og:title" : null,
          !page.ogDescription ? "og:description" : null,
          !page.ogImage ? "og:image" : null
        ].filter(Boolean).join(", ") + ".",
        "This page", "Low", "Low",
        "Incomplete metadata produces generic social previews and lowers shared-link click-through.",
        "Add the missing Open Graph tags and test the preview with a social debugger.");
    }

    /* ------------------------------ content ------------------------------ */
    if (page.wordCount < 300) {
      add("content", "warning", "Page copy is thin",
        "The page contains about " + page.wordCount + " words of readable copy.",
        "This page", "Medium", "High",
        "Thin pages give search engines little context and rarely satisfy informational intent.",
        "Expand the copy with use cases, proof points and answers to common questions, aiming for 600+ words where relevant.");
    } else {
      passed("content", "Page copy has useful depth",
        "The page contains about " + page.wordCount + " words of readable copy.",
        "Substantive copy improves relevance and gives search engines more context.",
        "Keep the copy specific and update it as products or services change.");
    }

    if (page.textHtmlRatio < 10) {
      add("content", "warning", "Low text-to-HTML ratio",
        "Readable text is only " + page.textHtmlRatio + "% of the HTML payload.",
        "This page", "Low", "Medium",
        "A very low text ratio suggests heavy markup or embedded code where crawlable copy should be.",
        "Reduce inline scripts and unnecessary markup, and move presentational code to external files.");
    } else {
      passed("content", "Text-to-HTML ratio is healthy",
        "Readable text makes up " + page.textHtmlRatio + "% of the HTML payload.",
        "A healthy ratio makes the page easier to parse and keeps the payload focused.",
        "Maintain the current balance between content and markup.");
    }

    if (page.internalLinks < 3) {
      add("content", "warning", "Very few internal links",
        "Only " + page.internalLinks + " internal links were found on the page.",
        "This page", "Medium", "Medium",
        "Internal links spread authority, improve discovery and keep visitors moving through the site.",
        "Add contextual links to relevant services, guides or product pages using descriptive anchor text.");
    } else {
      passed("content", "Internal linking is present",
        "The page contains " + page.internalLinks + " internal links.",
        "Internal links help crawlers discover related pages and pass context.",
        "Keep anchors descriptive and avoid linking every paragraph.");
    }

    if (page.readability.words > 40 && page.readability.grade > 12) {
      add("content", "warning", "Copy is difficult to read",
        "The copy scores around grade " + Math.round(page.readability.grade) + " on the Flesch-Kincaid scale.",
        "This page", "Low", "Medium",
        "Long sentences and complex words make the page harder to scan, especially on mobile.",
        "Shorten sentences, use simpler words and break long paragraphs into scannable sections.");
    } else if (page.readability.words > 40) {
      passed("content", "Readability is appropriate",
        "The copy scores around grade " + Math.round(page.readability.grade) + " and reads " + page.readability.label.toLowerCase() + ".",
        "Accessible copy improves engagement and comprehension.",
        "Keep sentences short when adding new sections.");
    }

    if (page.jsonLdCount && page.schemaTypes.length === 0) {
      add("content", "warning", "JSON-LD block could not be parsed",
        "The page contains " + page.jsonLdCount + " JSON-LD block(s), but no valid @type was extracted.",
        "This page", "Medium", "Low",
        "Invalid JSON-LD is ignored by search engines and can hide eligible rich-result data.",
        "Validate the JSON-LD with the Rich Results Test and fix syntax or @type errors.");
    }

    /* ------------------------------ performance ------------------------------ */
    var ttfb = Number(payload.ttfbMs) || 0;
    if (ttfb > 1800) {
      add("performance", "critical", "Server response time is very slow",
        "The initial HTML response took " + formatMs(ttfb) + ".",
        "This page", "High", "High",
        "TTFB delays every subsequent request and directly hurts LCP on mobile connections.",
        "Add edge caching, reduce origin work and move dynamic rendering behind a fast cache where possible.");
    } else if (ttfb > 800) {
      add("performance", "warning", "Server response time needs work",
        "The initial HTML response took " + formatMs(ttfb) + " (target under 800 ms).",
        "This page", "Medium", "Medium",
        "A slow first byte delays first paint and can be especially costly on mobile networks.",
        "Profile the origin, enable full-page caching and move static assets to a CDN.");
    } else {
      passed("performance", "Server response time is healthy",
        "The initial HTML response took " + formatMs(ttfb) + ".",
        "A fast first byte gives the browser a head start on rendering.",
        "Keep the current caching and origin configuration.");
    }

    var htmlBytes = Number(payload.bytes) || 0;
    if (htmlBytes > 1024 * 1024) {
      add("performance", "critical", "HTML document is unusually large",
        "The HTML payload is " + formatBytes(htmlBytes) + ".",
        "This page", "High", "Medium",
        "Large documents take longer to transfer and parse, especially on mobile.",
        "Remove unused inline data, paginate very long content and move embedded assets to external files.");
    } else if (htmlBytes > 500 * 1024) {
      add("performance", "warning", "HTML document is large",
        "The HTML payload is " + formatBytes(htmlBytes) + " (target under 500 KB).",
        "This page", "Medium", "Medium",
        "A heavy HTML payload delays parsing and pushes useful content later in the load.",
        "Trim inline scripts and styles, and render only the markup needed for the first view.");
    } else {
      passed("performance", "HTML payload size is reasonable",
        "The HTML payload is " + formatBytes(htmlBytes) + ".",
        "A lean document parses faster and leaves bandwidth for critical assets.",
        "Monitor page weight as new components are added.");
    }

    if (page.renderBlocking > 4) {
      add("performance", "warning", "Render-blocking resources delay first paint",
        "The page loads " + page.stylesheets + " stylesheet(s) and " + page.blockingScripts + " synchronous script(s).",
        "This page", "High", "Medium",
        "CSS and synchronous JavaScript in the head block the browser from painting useful content.",
        "Inline critical CSS, load non-critical CSS asynchronously and add defer to non-essential scripts.");
    } else if (page.renderBlocking > 0) {
      add("performance", "warning", "Some render-blocking requests remain",
        "The page has " + page.renderBlocking + " render-blocking request(s) in the document head.",
        "This page", "Medium", "Medium",
        "Even a few blocking requests can delay first contentful paint on mobile.",
        "Audit each head resource and defer anything that is not required for the first view.");
    } else {
      passed("performance", "No render-blocking head resources",
        "No blocking stylesheets or synchronous scripts were detected in the document head.",
        "Fewer blocking requests let the browser paint sooner.",
        "Keep scripts deferred when adding new features.");
    }

    if (page.images.length && page.imagesNoDimensions > 0) {
      add("performance", "warning", "Images are missing width or height",
        page.imagesNoDimensions + " image(s) do not declare explicit width and height attributes.",
        page.imagesNoDimensions + " image(s)", "Medium", "Low",
        "Images without reserved space can cause layout shift and hurt CLS.",
        "Add width and height attributes, or use CSS aspect-ratio containers, to reserve space before media loads.");
    } else if (page.images.length) {
      passed("performance", "Images reserve their space",
        "All " + page.images.length + " image(s) declare explicit dimensions.",
        "Explicit dimensions prevent layout shift while images load.",
        "Keep dimensions when swapping media in the CMS.");
    }

    if (psi && psi.performance !== null) {
      if (psi.performance < 50) {
        add("performance", "critical", "Lighthouse mobile performance is low",
          "PageSpeed Insights reports a mobile performance score of " + psi.performance + "/100.",
          "Mobile run", "High", "High",
          "A low lab score usually reflects slow LCP, heavy JavaScript or render-blocking resources.",
          "Work through the Lighthouse opportunities below, starting with the largest estimated savings.");
      } else if (psi.performance < 90) {
        add("performance", "warning", "Lighthouse mobile performance needs improvement",
          "PageSpeed Insights reports a mobile performance score of " + psi.performance + "/100.",
          "Mobile run", "Medium", "Medium",
          "Scores below 90 leave measurable speed gains on the table, especially on mid-range phones.",
          "Fix the highest-saving Lighthouse opportunities and retest after each deployment.");
      } else {
        passed("performance", "Lighthouse mobile performance is strong",
          "PageSpeed Insights reports a mobile performance score of " + psi.performance + "/100.",
          "Strong lab performance supports a fast experience on mid-range devices.",
          "Recheck after adding scripts or third-party tags.");
      }
    }

    /* ------------------------------ mobile ------------------------------ */
    if (!page.viewport) {
      add("mobile", "critical", "Viewport meta tag is missing",
        "No meta viewport tag was found, so mobile browsers cannot scale the layout correctly.",
        "This page", "High", "Low",
        "Without a viewport tag, the page renders as a desktop layout and becomes hard to use on phones.",
        "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> to the document head.");
    } else if (!/width\s*=\s*device-width/i.test(page.viewport)) {
      add("mobile", "warning", "Viewport is missing width=device-width",
        "The viewport meta tag is \"" + page.viewport + "\".",
        "This page", "Medium", "Low",
        "Fixed-width viewports force zooming and create a poor mobile experience.",
        "Set the viewport width to device-width and avoid fixed pixel widths on the root layout.");
    } else {
      passed("mobile", "Mobile viewport is configured",
        "The viewport meta tag is \"" + page.viewport + "\".",
        "A device-width viewport is the baseline for a responsive mobile layout.",
        "Test key templates at 360 px and 320 px after layout changes.");
    }

    if (psi && psi.tapTargetFailures !== null) {
      if (psi.tapTargetFailures > 0) {
        add("mobile", "warning", "Tap targets are too small or too close",
          "Lighthouse found " + psi.tapTargetFailures + " tap-target issue(s) on the mobile run.",
          psi.tapTargetFailures + " element(s)", "Medium", "Low",
          "Small targets cause mis-taps and make navigation frustrating on phones.",
          "Increase interactive areas to at least 44 × 44 CSS px and add spacing between adjacent links.");
      } else {
        passed("mobile", "Tap targets pass the mobile check",
          "Lighthouse found no tap-target issues on the mobile run.",
          "Comfortable touch targets reduce mis-taps and support WCAG 2.2.",
          "Keep at least 44 px of touch area when adding compact navigation.");
      }
    }

    if (psi && psi.fontSizeFailures !== null) {
      if (psi.fontSizeFailures > 0) {
        add("mobile", "warning", "Text is too small on mobile",
          "Lighthouse found " + psi.fontSizeFailures + " font-size issue(s) on the mobile run.",
          psi.fontSizeFailures + " element(s)", "Medium", "Low",
          "Small text forces zooming and is difficult to read for low-vision users.",
          "Use a base font size of at least 16 px and test the densest templates on a real phone.");
      } else {
        passed("mobile", "Mobile font sizes are legible",
          "Lighthouse found no font-size issues on the mobile run.",
          "Legible text without zooming is a core mobile usability requirement.",
          "Preserve the base font size when redesigning templates.");
      }
    }

    /* ------------------------------ accessibility ------------------------------ */
    if (page.imagesMissingAlt > 0) {
      add("accessibility", "warning", "Images are missing alt attributes",
        page.imagesMissingAlt + " image(s) do not have an alt attribute.",
        page.imagesMissingAlt + " image(s)", "Medium", "Low",
        "Screen readers cannot describe images without alt text, and image search loses context.",
        "Describe informative images, and use alt=\"\" for purely decorative images.");
    } else if (page.images.length) {
      passed("accessibility", "All images have alt attributes",
        "All " + page.images.length + " image(s) include an alt attribute (" + page.imagesEmptyAlt + " marked decorative).",
        "Alt text is essential for screen-reader users and image search.",
        "Keep alt text descriptive when new media is uploaded.");
    }

    var unlabelledFields = page.formFields.filter(function (field) { return !field.labelled; }).length;
    if (unlabelledFields > 0) {
      add("accessibility", "warning", "Form fields are missing labels",
        unlabelledFields + " form field(s) have no associated label, aria-label or title.",
        unlabelledFields + " field(s)", "Medium", "Low",
        "Unlabelled fields are difficult to understand with a screen reader and can block form completion.",
        "Associate every field with a visible label, or add an aria-label when a visible label is not possible.");
    } else if (page.formFields.length) {
      passed("accessibility", "Form fields are labelled",
        "All " + page.formFields.length + " form field(s) have an accessible label.",
        "Labels make forms usable with assistive technology and improve completion rates.",
        "Keep labels visible and programmatically associated.");
    }

    var unnamedControls = page.controls.filter(function (control) { return !control.name; }).length;
    if (unnamedControls > 0) {
      add("accessibility", "warning", "Links or buttons have no accessible name",
        unnamedControls + " interactive element(s) have no text, aria-label or title.",
        unnamedControls + " element(s)", "Medium", "Low",
        "Icon-only controls without a name cannot be understood by screen-reader users.",
        "Add visible text or an aria-label that describes the action, such as \"Open menu\".");
    } else if (page.controls.length) {
      passed("accessibility", "Interactive elements have accessible names",
        "All " + page.controls.length + " links and buttons expose a name.",
        "Accessible names let assistive technology announce the purpose of each control.",
        "Keep icon-only buttons labelled when adding new components.");
    }

    if (psi && psi.accessibility !== null) {
      if (psi.accessibility < 50) {
        add("accessibility", "critical", "Lighthouse accessibility score is low",
          "PageSpeed Insights reports an accessibility score of " + psi.accessibility + "/100.",
          "Mobile run", "High", "Medium",
          "A low accessibility score signals barriers for keyboard and screen-reader users.",
          "Fix the failing Lighthouse accessibility audits and retest with a keyboard-only pass.");
      } else if (psi.accessibility < 90) {
        add("accessibility", "warning", "Lighthouse accessibility needs improvement",
          "PageSpeed Insights reports an accessibility score of " + psi.accessibility + "/100.",
          "Mobile run", "Medium", "Medium",
          "Scores below 90 usually point to contrast, labelling or landmark problems.",
          "Review the failing accessibility audits and fix the highest-impact issues first.");
      } else {
        passed("accessibility", "Lighthouse accessibility score is strong",
          "PageSpeed Insights reports an accessibility score of " + psi.accessibility + "/100.",
          "A strong automated score is a useful baseline for WCAG 2.2 conformance.",
          "Pair automated checks with manual keyboard and screen-reader testing.");
      }
    }

    /* ------------------------------ security ------------------------------ */
    var headers = payload.headers || {};
    function headerValue(name) {
      var lower = name.toLowerCase();
      var key = Object.keys(headers).find(function (k) { return k.toLowerCase() === lower; });
      return key ? String(headers[key] || "").trim() : "";
    }

    var securityDefinitions = [
      { header: "Strict-Transport-Security", severity: "warning", why: "HSTS forces browsers to use HTTPS on repeat visits and blocks downgrade attacks.", fix: "Send max-age=31536000; includeSubDomains after confirming HTTPS works on every subdomain." },
      { header: "Content-Security-Policy", severity: "warning", why: "CSP limits which scripts and resources can execute, reducing injection risk.", fix: "Start with a report-only policy, fix violations, then enforce a strict allowlist." },
      { header: "X-Content-Type-Options", severity: "warning", why: "MIME sniffing can turn a harmless upload into executable content.", fix: "Send X-Content-Type-Options: nosniff on every response." },
      { header: "Referrer-Policy", severity: "warning", why: "A referrer policy controls how much URL data leaks to third parties.", fix: "Send Referrer-Policy: strict-origin-when-cross-origin or stricter." },
      { header: "Permissions-Policy", severity: "warning", why: "Permissions-Policy disables powerful browser features the page does not need.", fix: "Disable camera, microphone and geolocation unless a feature explicitly requires them." },
      { header: "X-Frame-Options", severity: "warning", why: "Frame protection prevents clickjacking through embedded overlays.", fix: "Send X-Frame-Options: SAMEORIGIN, or use CSP frame-ancestors." }
    ];

    var security = securityDefinitions.map(function (definition) {
      var value = headerValue(definition.header);
      if (value) {
        passed("security", definition.header + " is set",
          "The response sends " + definition.header + ": " + value.slice(0, 160) + (value.length > 160 ? "…" : ""),
          definition.why,
          "Keep the header when changing CDN or server configuration.");
      } else {
        add("security", definition.severity, definition.header + " is missing",
          "The response does not include the " + definition.header + " header.",
          "All responses", "Medium", "Low", definition.why, definition.fix);
      }
      return {
        header: definition.header,
        value: value ? value.slice(0, 120) + (value.length > 120 ? "…" : "") : "Not set",
        status: value ? "passed" : "warning"
      };
    });

    /* ------------------------------ issues + categories ------------------------------ */
    var order = { critical: 0, warning: 1, passed: 2 };
    checks.sort(function (a, b) {
      return (order[a.severity] - order[b.severity]) || CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    });
    checks.forEach(function (issue, index) {
      issue.id = "ISS-" + String(index + 1).padStart(2, "0");
    });

    var staticScores = {};
    CATEGORY_ORDER.forEach(function (key) {
      var penalty = 0;
      checks.forEach(function (issue) {
        if (issue.category === key) penalty += SEVERITY_WEIGHT[issue.severity] || 0;
      });
      staticScores[key] = clamp(100 - penalty, 0, 100);
    });

    if (psi && psi.performance !== null) {
      staticScores.performance = round(staticScores.performance * 0.35 + psi.performance * 0.65);
    }
    if (psi && psi.accessibility !== null) {
      staticScores.accessibility = round(staticScores.accessibility * 0.4 + psi.accessibility * 0.6);
    }
    if (psi && psi.seo !== null) {
      staticScores.onpage = round(staticScores.onpage * 0.8 + psi.seo * 0.2);
    }

    var categories = CATEGORY_ORDER.map(function (key) {
      var meta = CATEGORY_META[key];
      var catIssues = checks.filter(function (issue) { return issue.category === key; });
      var open = catIssues.filter(function (issue) { return issue.severity !== "passed"; });
      var critical = open.filter(function (issue) { return issue.severity === "critical"; }).length;
      var warnings = open.filter(function (issue) { return issue.severity === "warning"; }).length;
      var note = critical
        ? critical + " critical " + (critical === 1 ? "issue" : "issues") + " to fix."
        : warnings
          ? warnings + " " + (warnings === 1 ? "warning" : "warnings") + " to review."
          : "All checks passed.";
      return {
        key: key,
        name: meta.name,
        score: staticScores[key],
        delta: 0,
        issues: open.length,
        blurb: meta.blurb,
        note: note
      };
    });

    var weights = { technical: 0.2, onpage: 0.18, content: 0.14, performance: 0.2, mobile: 0.08, security: 0.1, accessibility: 0.1 };
    var weighted = 0;
    var weightTotal = 0;
    categories.forEach(function (cat) {
      weighted += cat.score * weights[cat.key];
      weightTotal += weights[cat.key];
    });
    var overall = clamp(round(weighted / weightTotal), 0, 100);

    var criticalCount = checks.filter(function (i) { return i.severity === "critical"; }).length;
    var warningCount = checks.filter(function (i) { return i.severity === "warning"; }).length;
    var passedCount = checks.filter(function (i) { return i.severity === "passed"; }).length;
    var weakest = categories.slice().sort(function (a, b) { return a.score - b.score; })[0];

    var grade = overall >= 90 ? "A" : overall >= 80 ? "B" : overall >= 70 ? "C" : overall >= 60 ? "D" : "F";
    var verdict = overall >= 90 ? "Excellent" : overall >= 80 ? "Good" : overall >= 70 ? "Needs improvement" : overall >= 60 ? "At risk" : "Critical";
    var verdictTone = overall >= 80 ? "good" : overall >= 60 ? "warn" : "bad";

    var summary = "Live crawl of " + pageUrl.hostname.replace(/^www\./, "") + " scored " + overall + "/100. " +
      (criticalCount
        ? criticalCount + " critical " + (criticalCount === 1 ? "finding is" : "findings are") + " blocking progress."
        : "No critical findings were detected.") +
      " " + weakest.name + " is the weakest area at " + weakest.score + "/100." +
      (psi && psi.performance !== null
        ? " Lighthouse mobile performance is " + psi.performance + "/100."
        : " Lighthouse data was unavailable, so speed scoring uses server timing and document signals.");

    /* ------------------------------ vitals ------------------------------ */
    function statusFor(raw, good, bad) {
      if (raw === null || raw === undefined) return "warn";
      return raw <= good ? "good" : raw <= bad ? "warn" : "bad";
    }
    function pctFor(raw, bad) {
      if (raw === null || raw === undefined) return 0;
      return clamp(round((raw / bad) * 100), 3, 100);
    }

    var vitals = [
      {
        key: "LCP", name: "Largest Contentful Paint",
        value: psi && psi.lcp != null ? (psi.lcp / 1000).toFixed(1) : "—",
        unit: psi && psi.lcp != null ? "s" : "",
        status: statusFor(psi ? psi.lcp : null, 2500, 4000),
        target: "< 2.5 s",
        pct: pctFor(psi ? psi.lcp : null, 4000),
        note: psi && psi.lcp != null ? "Field / lab data" : "PSI unavailable"
      },
      {
        key: "INP", name: "Interaction to Next Paint",
        value: psi && psi.inp != null ? String(round(psi.inp)) : "—",
        unit: psi && psi.inp != null ? "ms" : "",
        status: statusFor(psi ? psi.inp : null, 200, 500),
        target: "< 200 ms",
        pct: pctFor(psi ? psi.inp : null, 500),
        note: psi && psi.inp != null ? (psi.inpIsProxy ? "Lab TBT proxy" : "Field data") : "PSI unavailable"
      },
      {
        key: "CLS", name: "Cumulative Layout Shift",
        value: psi && psi.cls != null ? psi.cls.toFixed(2) : "—",
        unit: "",
        status: statusFor(psi ? psi.cls : null, 0.1, 0.25),
        target: "< 0.1",
        pct: pctFor(psi ? psi.cls : null, 0.25),
        note: psi && psi.cls != null ? "Field / lab data" : "PSI unavailable"
      },
      {
        key: "FCP", name: "First Contentful Paint",
        value: psi && psi.fcp != null ? (psi.fcp / 1000).toFixed(1) : "—",
        unit: psi && psi.fcp != null ? "s" : "",
        status: statusFor(psi ? psi.fcp : null, 1800, 3000),
        target: "< 1.8 s",
        pct: pctFor(psi ? psi.fcp : null, 3000),
        note: psi && psi.fcp != null ? "Field / lab data" : "PSI unavailable"
      },
      {
        key: "TTFB", name: "Time to First Byte",
        value: (psi && psi.ttfb != null ? psi.ttfb : ttfb) / 1000 > 0
          ? ((psi && psi.ttfb != null ? psi.ttfb : ttfb) / 1000).toFixed(2) : "—",
        unit: (psi && psi.ttfb != null) || ttfb ? "s" : "",
        status: statusFor(psi && psi.ttfb != null ? psi.ttfb : (ttfb || null), 800, 1800),
        target: "< 0.8 s",
        pct: pctFor(psi && psi.ttfb != null ? psi.ttfb : (ttfb || null), 1800),
        note: psi && psi.ttfb != null ? "Field / lab data" : (ttfb ? "Measured live" : "PSI unavailable")
      }
    ];

    /* ------------------------------ opportunities ------------------------------ */
    var opportunities = psi && psi.opportunities.length ? psi.opportunities.slice() : [];

    if (!opportunities.length) {
      if (page.renderBlocking > 0) {
        opportunities.push({ label: "Reduce render-blocking resources", detail: page.renderBlocking + " blocking request(s) in the head", saving: 400 + page.renderBlocking * 120 });
      }
      if (page.imagesNoDimensions > 0) {
        opportunities.push({ label: "Reserve space for images", detail: page.imagesNoDimensions + " image(s) without dimensions", saving: 180 + page.imagesNoDimensions * 20 });
      }
      if (!/gzip|br|brotli|deflate/i.test(String(payload.contentEncoding || ""))) {
        opportunities.push({ label: "Enable text compression", detail: "No Brotli or gzip encoding on the HTML response", saving: 280 });
      }
      if (htmlBytes > 100 * 1024) {
        opportunities.push({ label: "Trim HTML payload", detail: formatBytes(htmlBytes) + " document", saving: Math.max(120, round(htmlBytes / 1024)) });
      }
    }
    opportunities = opportunities.slice(0, 6);

    /* ------------------------------ timeline ------------------------------ */
    var timeline;
    if (psi && psi.observedLoad) {
      var firstByte = psi.observedFirstByte || ttfb || 1;
      var domReady = psi.observedDomContentLoaded || firstByte;
      var load = psi.observedLoad || domReady;
      timeline = [
        { label: "TTFB", value: Math.max(1, round(firstByte)), color: "#6366f1" },
        { label: "HTML + DOM", value: Math.max(1, round(domReady - firstByte)), color: "#f59e0b" },
        { label: "Load & paint", value: Math.max(1, round(load - domReady)), color: "#ef4444" }
      ];
    } else {
      var total = Number(payload.totalMs) || ttfb || 1;
      var download = Math.max(1, total - ttfb);
      timeline = [
        { label: "TTFB", value: Math.max(1, round(ttfb || total * 0.4)), color: "#6366f1" },
        { label: "HTML download", value: Math.max(1, round(download)), color: "#f59e0b" },
        { label: "Parse & render", value: Math.max(80, round(total * 0.25)), color: "#ef4444" }
      ];
    }

    /* ------------------------------ meta / crawl / schema / content ------------------------------ */
    var hostname = pageUrl.hostname.replace(/^www\./, "");
    var now = new Date();
    var dateLabel = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(now);
    var dateKey = now.toISOString().slice(0, 10).replace(/-/g, "");
    var urlHash = 0;
    for (var i = 0; i < finalUrl.length; i++) urlHash = ((urlHash << 5) - urlHash + finalUrl.charCodeAt(i)) | 0;
    var reportId = "FA-" + dateKey + "-" + Math.abs(urlHash).toString(36).toUpperCase().slice(0, 4).padStart(4, "0");

    var path = pageUrl.pathname || "/";
    var serpUrl = hostname + (path === "/" ? "" : path.split("/").filter(Boolean).map(function (part) { return " › " + part; }).join(""));
    var titleStatus = page.title && titleLength <= 60 ? "good" : page.title ? "warn" : "bad";
    var descStatus = page.description && descLength >= 70 && descLength <= 160 ? "good" : page.description ? "warn" : "bad";

    var knownSchema = ["Organization", "WebSite", "WebPage", "BreadcrumbList", "Product", "Article", "FAQPage", "LocalBusiness"];
    var schemaRows = [];
    knownSchema.forEach(function (name) {
      var found = page.schemaTypes.some(function (type) { return type.toLowerCase() === name.toLowerCase(); });
      schemaRows.push({ name: name, coverage: found ? 100 : 0 });
    });
    page.schemaTypes.forEach(function (type) {
      if (!knownSchema.some(function (name) { return name.toLowerCase() === type.toLowerCase(); })) {
        schemaRows.push({ name: type, coverage: 100 });
      }
    });
    if (!page.schemaTypes.length) schemaRows = [{ name: "No structured data found", coverage: 0 }];

    var crawl = [
      {
        label: "HTTP status",
        value: String(status || "Unknown"),
        note: status >= 200 && status < 300 ? "Page reachable" : "Needs attention",
        tone: status >= 200 && status < 300 ? "good" : "bad",
        icon: status >= 200 && status < 300 ? "check" : "alert"
      },
      {
        label: "HTML size",
        value: formatBytes(htmlBytes),
        note: payload.truncated ? "Truncated at 2 MB" : "Fetched over the wire",
        tone: htmlBytes > 500 * 1024 ? "warn" : "good",
        icon: "file"
      },
      {
        label: "robots.txt",
        value: robotsFound ? "Found" : "Missing",
        note: robotsBlocksAll ? "Blocks all crawling" : robotsHasSitemap ? "Sitemap declared" : "No sitemap directive",
        tone: robotsBlocksAll ? "bad" : robotsFound ? (robotsHasSitemap ? "good" : "warn") : "warn",
        icon: "map"
      },
      {
        label: "Indexability",
        value: noindex ? "Noindex" : "Indexable",
        note: noindexMeta ? page.robotsMeta : noindexHeader ? "X-Robots-Tag header" : "No robots meta",
        tone: noindex ? "bad" : "good",
        icon: "search"
      }
    ];

    var contentStats = [
      {
        label: "Word count",
        value: String(page.wordCount),
        note: page.wordCount < 300 ? "Thin content" : page.wordCount < 600 ? "Could be deeper" : "Healthy depth",
        tone: page.wordCount < 300 ? "bad" : page.wordCount < 600 ? "warn" : "good"
      },
      {
        label: "Readability",
        value: page.readability.words ? "Grade " + Math.round(page.readability.grade) : "—",
        note: page.readability.words ? page.readability.label : "No readable copy",
        tone: page.readability.words && page.readability.grade > 12 ? "warn" : "good"
      },
      {
        label: "Internal links",
        value: String(page.internalLinks),
        note: page.internalLinks < 3 ? "Add contextual links" : "Healthy discovery path",
        tone: page.internalLinks < 3 ? "warn" : "good"
      },
      {
        label: "Image alt coverage",
        value: page.images.length ? Math.round(((page.images.length - page.imagesMissingAlt) / page.images.length) * 100) + "%" : "—",
        note: !page.images.length ? "No images on page" : page.imagesMissingAlt ? page.imagesMissingAlt + " missing alt" : "All images covered",
        tone: page.imagesMissingAlt ? "warn" : "good"
      }
    ];

    var issues = checks.map(function (issue) {
      return {
        id: issue.id,
        severity: issue.severity,
        category: issue.category,
        title: issue.title,
        description: issue.description,
        affected: issue.affected,
        impact: issue.impact,
        effort: issue.effort,
        why: issue.why,
        fix: issue.fix,
        code: issue.code
      };
    });

    var nowWarnings = issues.filter(function (i) { return i.severity === "warning"; });
    var nowCritical = issues.filter(function (i) { return i.severity === "critical"; });
    var roadmap = {
      now: {
        label: "Now",
        window: "0 – 30 days",
        tone: nowCritical.length ? "bad" : "warn",
        items: (nowCritical.length ? nowCritical : nowWarnings).slice(0, 4).map(function (issue) {
          return { title: issue.title, meta: CATEGORY_META[issue.category].name + " · " + issue.effort + " effort", detail: issue.fix };
        })
      },
      next: {
        label: "Next",
        window: "30 – 90 days",
        tone: "warn",
        items: nowWarnings.slice(nowCritical.length ? 0 : 4, (nowCritical.length ? 0 : 4) + 4).map(function (issue) {
          return { title: issue.title, meta: CATEGORY_META[issue.category].name + " · " + issue.effort + " effort", detail: issue.fix };
        })
      },
      later: {
        label: "Later",
        window: "90+ days",
        tone: "good",
        items: [
          { title: "Re-audit after fixes", meta: "Measurement · monthly", detail: "Run FinalAudit again and compare the score, findings and Core Web Vitals." },
          { title: "Monitor Core Web Vitals", meta: "Performance · ongoing", detail: "Watch LCP, INP and CLS in Search Console as templates and third-party scripts change." },
          { title: "Schedule a crawl regression check", meta: "Technical · monthly", detail: "Automate robots.txt, canonical and indexability checks after each release." }
        ]
      }
    };
    if (!roadmap.next.items.length) {
      roadmap.next.items = [{ title: "Resolve remaining warnings", meta: "SEO · ongoing", detail: "Work through the warning findings and retest the affected templates." }];
    }

    return {
      meta: {
        reportId: reportId,
        siteName: hostname,
        url: finalUrl,
        domain: hostname,
        favicon: hostname.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "FA",
        industry: "Live website audit",
        auditedOn: dateLabel,
        auditWindow: "Live crawl · " + dateLabel,
        auditedBy: "FinalAudit Engine",
        role: "Automated SEO analysis",
        pagesCrawled: 1,
        crawlTime: formatMs(payload.totalMs || ttfb),
        devices: psi ? "Desktop + Mobile (PSI)" : "Desktop crawl",
        standard: "Google Search Essentials · Core Web Vitals",
        preparedFor: hostname + " team",
        live: true,
        source: "FinalAudit live crawler",
        psi: psi ? "available" : "unavailable",
        psiScores: psi ? { performance: psi.performance, accessibility: psi.accessibility, seo: psi.seo, bestPractices: psi.bestPractices } : null,
        finalUrl: finalUrl,
        requestedUrl: payload.requestedUrl || finalUrl,
        status: status,
        ttfbMs: ttfb,
        totalMs: payload.totalMs || 0,
        htmlBytes: htmlBytes,
        truncated: !!payload.truncated,
        robotsTxt: robotsFound,
        robotsBlocksAll: robotsBlocksAll,
        robotsHasSitemap: robotsHasSitemap,
        contentEncoding: payload.contentEncoding || ""
      },
      score: {
        overall: overall,
        previous: overall,
        grade: grade,
        verdict: verdict,
        verdictTone: verdictTone,
        critical: criticalCount,
        warnings: warningCount,
        passed: passedCount,
        checks: checks.length,
        summary: summary
      },
      categories: categories,
      trend: [overall],
      vitals: vitals,
      issues: issues,
      opportunities: opportunities,
      timeline: timeline,
      metaTags: [{
        template: "Submitted page",
        url: path + (pageUrl.search || ""),
        title: titleLength,
        desc: descLength,
        status: titleStatus === "good" && descStatus === "good" ? "good" : titleStatus === "bad" && descStatus === "bad" ? "bad" : "warn"
      }],
      headings: page.headings.length ? page.headings.slice(0, 12) : [{ level: 0, text: "No headings found" }],
      serp: {
        title: page.title || "(missing title)",
        url: serpUrl || hostname,
        description: page.description || "(missing meta description)",
        siteName: hostname,
        favicon: hostname.replace(/[^a-z0-9]/gi, "").slice(0, 1).toUpperCase() || "F"
      },
      keywords: [],
      crawl: crawl,
      security: security,
      schema: schemaRows,
      contentStats: contentStats,
      pages: [],
      authority: { stats: [], competitors: [] },
      roadmap: roadmap
    };
  }

  window.FinalAuditEngine = {
    buildReport: buildReport,
    normalizeForCompare: normalizeForCompare
  };
})();
