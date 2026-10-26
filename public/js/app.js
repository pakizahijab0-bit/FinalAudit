/* ============================================================
   FinalAudit — SEO & Website Audit
   Renders the report, handles filters, navigation and export.
   ============================================================ */

(function () {
  "use strict";

  var A = window.AUDIT;
  if (!A) return;
  var resetIssueFilters = null;

  /* ------------------------------ helpers ------------------------------ */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var ESCAPE = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) { return ESCAPE[ch]; });
  }

  function formatMs(ms) {
    if (ms < 1000) return ms + " ms";
    return (ms / 1000).toFixed(2).replace(/0+$/, "").replace(/\.$/, "") + " s";
  }

  function scoreTone(n) {
    return n >= 80 ? "good" : n >= 60 ? "warn" : "bad";
  }

  function statusPill(status) {
    var map = {
      good: ["good", "Optimised"],
      warn: ["warn", "Review"],
      bad: ["bad", "Fix"],
      neutral: ["neutral", "Info"],
      passed: ["good", "Pass"],
      critical: ["bad", "Critical"],
      warning: ["warn", "Warning"]
    };
    var item = map[status] || ["neutral", status];
    return '<span class="pill ' + item[0] + '"><span class="dot"></span>' + item[1] + "</span>";
  }

  /* ------------------------------ icons ------------------------------ */
  var ICONS = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    alert: '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z"/>',
    alertOctagon: '<path d="M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9Z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    check: '<path d="m20 6-11 11-5-5"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/>',
    map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z"/><path d="M9 3v15M15 6v15"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    share: '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="m16 6-4-4-4 4"/><path d="M12 2v14"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
    printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
    shieldCheck: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 11 2 2 4-4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    chevrons: '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    arrowUp: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    layers: '<path d="m12 2 9 5-9 5-9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
    device: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M12 18h.01"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18Z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    gauge: '<path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="m13.4 12.6 4.6-4.6"/><path d="M3.5 17a9 9 0 1 1 17 0"/>',
    access: '<circle cx="12" cy="4" r="2"/><path d="M19 8h-5l-2 5-2-5H5"/><path d="M12 11v5l-3 6M12 16l3 6"/>',
    code: '<path d="m8 9-4 3 4 3"/><path d="m16 9 4 3-4 3"/><path d="m13 5-2 14"/>'
  };

  function icon(name) {
    var body = ICONS[name];
    if (!body) return "";
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + body + "</svg>";
  }

  var CATS = {
    technical:     { label: "Technical SEO", short: "Technical",     icon: "sliders",  color: "#6366f1" },
    onpage:        { label: "On-Page SEO",   short: "On-page",       icon: "file",     color: "#0ea5e9" },
    content:       { label: "Content",       short: "Content",       icon: "pen",      color: "#8b5cf6" },
    performance:   { label: "Performance",   short: "Performance",   icon: "zap",      color: "#f59e0b" },
    mobile:        { label: "Mobile",        short: "Mobile",        icon: "device",   color: "#14b8a6" },
    security:      { label: "Security",      short: "Security",      icon: "shield",   color: "#ef4444" },
    accessibility: { label: "Accessibility", short: "Accessibility", icon: "access",   color: "#ec4899" },
    authority:     { label: "Authority",     short: "Authority",     icon: "link",     color: "#0f766e" }
  };

  function hydateStaticIcons() {
    $$("[data-icon]").forEach(function (el) {
      var name = el.getAttribute("data-icon");
      if (ICONS[name]) el.innerHTML = icon(name);
    });
  }

  /* ------------------------------ meta / hero ------------------------------ */
  function renderMeta() {
    var m = A.meta;
    var s = A.score;

    document.title = m.live
      ? m.siteName + " — Live SEO Audit | FinalAudit"
      : "SEO & Website Audit — " + m.siteName + " | FinalAudit";

    $("#siteName").textContent = m.siteName;
    $("#siteAvatar").textContent = m.favicon;
    $("#crumbSite").textContent = m.siteName;
    $("#reportId").textContent = m.reportId;
    $("#sideDate").textContent = m.auditedOn;
    $("#topDate").textContent = "Audited " + m.auditedOn;
    $("#footSite").textContent = "Prepared for " + m.siteName;
    $("#signReportId").textContent = m.reportId;
    $("#signDate").textContent = m.auditedOn;
    $("#auditorName").textContent = m.auditedBy;
    $("#auditorRole").textContent = m.role;

    var siteUrl = $("#siteUrl");
    siteUrl.href = m.url;
    if (siteUrl.firstChild) siteUrl.firstChild.nodeValue = m.url;

    $("#heroSummary").textContent = s.summary;

    $("#sideScore").textContent = s.overall;
    $("#sideBar").style.width = s.overall + "%";

    var verdict = $("#verdictPill");
    verdict.textContent = s.verdict;
    verdict.className = "pill " + (s.verdictTone || "warn");

    var diff = s.overall - s.previous;
    if (m.live) {
      $("#scoreDelta").textContent = "Baseline live audit" + (m.psi === "available" ? " · PSI included" : " · PSI unavailable");
      $("#sideDelta").textContent = "Live";
      $("#sideDelta").className = "delta up";
      $("#sideDeltaText").textContent = "crawled just now";
      $("#reportLabel").textContent = "Live audit report";
      $("#verifiedLabel").textContent = "Live crawl";
      $("#sideMode").textContent = "Live report";
      $("#reportMode").innerHTML = "<i></i>Live report";
    } else {
      $("#scoreDelta").textContent =
        (diff > 0 ? "+" + diff : diff < 0 ? String(diff) : "No change") +
        " points vs. last audit";
      $("#sideDelta").textContent = (diff > 0 ? "+" + diff : diff < 0 ? String(diff) : "0") + " pts";
      $("#sideDelta").className = "delta " + (diff > 0 ? "up" : diff < 0 ? "down" : "flat");
      $("#sideDeltaText").textContent = "since last audit";
      $("#reportLabel").textContent = "Final audit report";
      $("#verifiedLabel").textContent = "Verified audit";
      $("#sideMode").textContent = "Final report";
      $("#reportMode").innerHTML = "<i></i>Sample report";
    }

    var metaChips = [
      { icon: "calendar", label: "Audited", value: m.auditedOn },
      { icon: "layers", label: "Pages", value: m.live ? "1 page" : m.pagesCrawled + " crawled" },
      { icon: "device", label: "Devices", value: m.devices },
      { icon: "clock", label: "Crawl time", value: m.crawlTime },
      { icon: "shieldCheck", label: "Scope", value: m.live ? (m.psi === "available" ? "Live crawl + PSI" : "Live crawl") : "WCAG 2.2 AA" }
    ];

    $("#heroMeta").innerHTML = metaChips.map(function (c) {
      return '<span class="meta-chip">' + icon(c.icon) + '<span>' + esc(c.label) + ' <b>' + esc(c.value) + "</b></span></span>";
    }).join("");

    var stats = [
      { value: s.critical, label: "Critical", dot: "bad", cls: "" },
      { value: s.warnings, label: "Warnings", dot: "warn", cls: "" },
      { value: s.passed, label: "Passed", dot: "good", cls: " passed" },
      { value: s.checks, label: "Checks run", dot: "", cls: "" }
    ];

    $("#heroStats").innerHTML = stats.map(function (st) {
      return '<div class="hero-stat' + st.cls + '"><b>' + st.value + "</b><span>" +
        (st.dot ? '<i class="dot ' + st.dot + '"></i>' : "") + esc(st.label) + "</span></div>";
    }).join("");

    var trend = A.trend && A.trend.length ? A.trend : [s.overall];
    var min = Math.min.apply(null, trend);
    var max = Math.max.apply(null, trend);
    $("#trendBars").innerHTML = trend.map(function (v, i) {
      var height = trend.length === 1 ? 100 : 25 + ((v - min) / Math.max(1, max - min)) * 75;
      return '<div class="trend-bar' + (i === trend.length - 1 ? " last" : "") + '" style="height:' + height.toFixed(1) + '%" title="Audit ' + (i + 1) + ": " + v + '/100">' +
        '<span class="tip">' + v + "/100</span></div>";
    }).join("");
    $("#trendLabel").textContent = m.live ? "Live audit" : trend.length + " audits";

    $("#navIssueBadge").textContent = s.critical + s.warnings;
    $("#navIssueBadge").style.display = s.critical + s.warnings === 0 ? "none" : "";
  }

  function renderGauge() {
    var score = A.score.overall;
    var radius = 88;
    var circumference = 2 * Math.PI * radius;
    var target = circumference * (1 - score / 100);

    var gauge = $("#gauge");
    gauge.innerHTML =
      '<svg viewBox="0 0 220 220" role="img" aria-label="Overall score ' + score + ' out of 100">' +
        "<defs>" +
          '<linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">' +
            '<stop offset="0%" stop-color="#34d399"/>' +
            '<stop offset="55%" stop-color="#22d3ee"/>' +
            '<stop offset="100%" stop-color="#818cf8"/>' +
          "</linearGradient>" +
        "</defs>" +
        '<circle class="gauge-track" cx="110" cy="110" r="' + radius + '"/>' +
        '<circle class="gauge-fill" cx="110" cy="110" r="' + radius + '" ' +
          'stroke-dasharray="' + circumference.toFixed(2) + '" ' +
          'stroke-dashoffset="' + circumference.toFixed(2) + '"/>' +
      "</svg>" +
      '<div class="gauge-center">' +
        '<span class="gauge-score">0</span>' +
        '<span class="gauge-denom">/ 100</span>' +
        '<span class="gauge-grade">Grade ' + esc(A.score.grade) + "</span>" +
      "</div>";

    var fill = gauge.querySelector(".gauge-fill");
    var number = gauge.querySelector(".gauge-score");

    window.setTimeout(function () {
      fill.style.strokeDashoffset = target.toFixed(2);
    }, 140);

    animateNumber(number, score, 1200);
  }

  function animateNumber(el, target, duration) {
    if (!el) return;
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { el.textContent = target; return; }
    var start = performance.now();
    function tick(now) {
      var t = Math.min(1, (now - start) / duration);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(eased * target);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ------------------------------ categories ------------------------------ */
  function renderCategories() {
    $("#catGrid").innerHTML = A.categories.map(function (cat) {
      var c = CATS[cat.key] || { label: cat.name, icon: "grid", color: "#6366f1" };
      var circ = 2 * Math.PI * 18;
      var offset = circ * (1 - cat.score / 100);
      var tone = scoreTone(cat.score);
      var deltaClass = cat.delta > 0 ? "up" : cat.delta < 0 ? "down" : "flat";
      var deltaText = cat.delta > 0 ? "+" + cat.delta : cat.delta < 0 ? String(cat.delta) : "—";

      return '<article class="cat-card">' +
        '<div class="cat-top">' +
          '<span class="cat-ico" style="background:' + c.color + '14;color:' + c.color + '">' + icon(c.icon) + "</span>" +
          '<span class="cat-name">' + esc(cat.name) + "</span>" +
          '<span class="cat-ring" style="color:' + (tone === "good" ? "#059669" : tone === "warn" ? "#d97706" : "#dc2626") + '">' +
            '<svg viewBox="0 0 44 44" aria-hidden="true">' +
              '<circle class="track" cx="22" cy="22" r="18"/>' +
              '<circle class="fill" cx="22" cy="22" r="18" stroke="currentColor" ' +
                'stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + offset.toFixed(1) + '"/>' +
            "</svg>" +
            "<span>" + cat.score + "</span>" +
          "</span>" +
        "</div>" +
        '<div class="cat-foot">' +
          '<span class="cat-issues"><b>' + cat.issues + "</b> open " + (cat.issues === 1 ? "issue" : "issues") + "</span>" +
          '<span class="cat-delta ' + deltaClass + '">' + deltaText + "</span>" +
        "</div>" +
      "</article>";
    }).join("");
  }

  /* ------------------------------ vitals ------------------------------ */
  function renderVitals() {
    $("#vitalsGrid").innerHTML = A.vitals.map(function (v) {
      return '<div class="vital-card">' +
        '<div class="vital-top">' +
          '<span class="vital-key">' + esc(v.key) + "</span>" +
          '<span class="vital-status ' + v.status + '" title="' + esc(v.status) + '"></span>' +
        "</div>" +
        '<div class="vital-value"><b>' + esc(v.value) + "</b>" + (v.unit ? "<span>" + esc(v.unit) + "</span>" : "") + "</div>" +
        '<div class="vital-note">' + esc(v.name) + "</div>" +
        '<div class="vital-meter"><span class="' + v.status + '" style="width:' + v.pct + '%"></span></div>' +
        '<div class="vital-target">Target ' + esc(v.target) + " · " + esc(v.note) + "</div>" +
      "</div>";
    }).join("");
  }

  /* ------------------------------ issues ------------------------------ */
  function renderIssues() {
    $("#issueList").innerHTML = A.issues.map(function (issue) {
      var c = CATS[issue.category] || { label: issue.category, color: "#64748b" };
      var sevIcon = issue.severity === "critical" ? "alertOctagon" : issue.severity === "warning" ? "alert" : "checkCircle";
      var tags = [
        '<span class="tag"><i class="tdot" style="background:' + c.color + '"></i>' + esc(c.label) + "</span>",
        '<span class="tag">' + esc(issue.affected) + "</span>"
      ];
      if (issue.severity === "passed") {
        tags.push('<span class="tag pass-tag">Verified</span>');
      } else {
        tags.push('<span class="tag">Impact: ' + esc(issue.impact) + "</span>");
        tags.push('<span class="tag">Effort: ' + esc(issue.effort) + "</span>");
      }

      var searchText = [
        issue.title, c.label, issue.affected, issue.severity, issue.description
      ].join(" ").toLowerCase();

      return '<article class="issue" data-severity="' + issue.severity + '" data-category="' + issue.category + '" data-text="' + esc(searchText) + '">' +
        '<button class="issue-head" type="button" aria-expanded="false" aria-controls="body-' + issue.id + '">' +
          '<span class="sev-ico ' + issue.severity + '">' + icon(sevIcon) + "</span>" +
          '<span class="issue-main">' +
            "<strong>" + esc(issue.title) + "</strong>" +
            '<span class="issue-tags">' + tags.join("") + "</span>" +
          "</span>" +
          '<span class="chev">' + icon("chevronDown") + "</span>" +
        "</button>" +
        '<div class="issue-body" id="body-' + issue.id + '">' +
          '<div class="issue-body-inner">' +
            '<div class="issue-grid">' +
              "<div>" +
                '<div class="issue-h">What we found</div>' +
                "<p>" + esc(issue.description) + "</p>" +
              "</div>" +
              "<div>" +
                '<div class="issue-h">Why it matters</div>' +
                "<p>" + esc(issue.why) + "</p>" +
              "</div>" +
            "</div>" +
            '<div class="fix-block">' +
              '<div class="issue-h">' + (issue.severity === "passed" ? "Keep it that way" : "How to fix it") + "</div>" +
              "<p>" + esc(issue.fix) + "</p>" +
              (issue.code ? '<pre class="code-block"><code>' + esc(issue.code) + "</code></pre>" : "") +
            "</div>" +
          "</div>" +
        "</div>" +
      "</article>";
    }).join("");
  }

  function renderIssueSummary() {
    var total = A.issues.length;
    var critical = A.issues.filter(function (i) { return i.severity === "critical"; });
    var warnings = A.issues.filter(function (i) { return i.severity === "warning"; });
    var passed = A.issues.filter(function (i) { return i.severity === "passed"; });
    var totalForPct = total || 1;

    var p1 = (critical.length / totalForPct) * 100;
    var p2 = (warnings.length / totalForPct) * 100;
    var p3 = (passed.length / totalForPct) * 100;

    var donut = $("#sevDonut");
    donut.style.background = "conic-gradient(" +
      "var(--bad) 0 " + p1.toFixed(2) + "%, " +
      "var(--warn) " + p1.toFixed(2) + "% " + (p1 + p2).toFixed(2) + "%, " +
      "var(--good) " + (p1 + p2).toFixed(2) + "% " + (p1 + p2 + p3).toFixed(2) + "%)";

    var hole = donut.querySelector(".donut-hole strong");
    if (hole) hole.textContent = total;

    $("#summaryNote").textContent = critical.length
      ? critical.length === 1
        ? "1 critical finding is blocking the next score jump."
        : critical.length + " critical findings are blocking the next score jump."
      : "No critical findings. Focus on the warnings to keep momentum.";

    $("#sevLegend").innerHTML = [
      { label: "Critical", dot: "bad", count: critical.length },
      { label: "Warnings", dot: "warn", count: warnings.length },
      { label: "Passed", dot: "good", count: passed.length }
    ].map(function (row) {
      return '<div class="legend-row"><span class="dot ' + row.dot + '"></span>' + row.label +
        "<b>" + row.count + "</b></div>";
    }).join("");

    $("#priorityList").innerHTML = (critical.length ? critical : warnings).slice(0, 4).map(function (issue) {
      return "<li><span>" + esc(issue.title) + "</span></li>";
    }).join("");
  }

  function setupIssueInteractions() {
    var list = $("#issueList");
    var chips = $$("#sevChips .chip");
    var search = $("#issueSearch");
    var catFilter = $("#catFilter");
    var expandAll = $("#expandAll");
    var state = { severity: "all", category: "all", query: "" };

    function applyFilters() {
      var shown = 0;
      $$(".issue", list).forEach(function (item) {
        var matchesSeverity = state.severity === "all" || item.getAttribute("data-severity") === state.severity;
        var matchesCategory = state.category === "all" || item.getAttribute("data-category") === state.category;
        var matchesQuery = !state.query || item.getAttribute("data-text").indexOf(state.query) !== -1;
        var visible = matchesSeverity && matchesCategory && matchesQuery;
        item.classList.toggle("hide", !visible);
        if (visible) shown++;
      });

      $("#issueCount").textContent = shown
        ? "Showing " + shown + " of " + A.issues.length + " findings"
        : "No findings match these filters — try clearing the search.";
    }

    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        chips.forEach(function (c) { c.classList.remove("is-active"); });
        chip.classList.add("is-active");
        state.severity = chip.getAttribute("data-filter");
        applyFilters();
      });
    });

    search.addEventListener("input", function () {
      state.query = search.value.trim().toLowerCase();
      applyFilters();
    });

    catFilter.addEventListener("change", function () {
      state.category = catFilter.value;
      applyFilters();
    });

    list.addEventListener("click", function (event) {
      var head = event.target.closest(".issue-head");
      if (!head) return;
      var item = head.closest(".issue");
      var isOpen = item.classList.toggle("is-open");
      head.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    var allOpen = false;
    expandAll.addEventListener("click", function () {
      allOpen = !allOpen;
      $$(".issue", list).forEach(function (item) {
        item.classList.toggle("is-open", allOpen);
        var head = item.querySelector(".issue-head");
        if (head) head.setAttribute("aria-expanded", allOpen ? "true" : "false");
      });
      expandAll.setAttribute("aria-expanded", allOpen ? "true" : "false");
      expandAll.innerHTML = icon("chevrons") + (allOpen ? " Collapse all" : " Expand all");
    });

    resetIssueFilters = function () {
      allOpen = false;
      state.severity = "all";
      state.category = "all";
      state.query = "";
      chips.forEach(function (chip) {
        chip.classList.toggle("is-active", chip.getAttribute("data-filter") === "all");
      });
      search.value = "";
      catFilter.value = "all";
      expandAll.setAttribute("aria-expanded", "false");
      expandAll.innerHTML = icon("chevrons") + " Expand all";
      $$(".issue", list).forEach(function (item) {
        item.classList.remove("is-open");
        var head = item.querySelector(".issue-head");
        if (head) head.setAttribute("aria-expanded", "false");
      });
      applyFilters();
    };
  }

  /* ------------------------------ performance ------------------------------ */
  function renderPerformance() {
    var total = A.timeline.reduce(function (sum, seg) { return sum + seg.value; }, 0) || 1;

    $("#timeline").innerHTML = A.timeline.map(function (seg) {
      var width = (seg.value / total) * 100;
      return '<span style="width:' + width.toFixed(2) + '%;background:' + seg.color + '" title="' +
        esc(seg.label) + ": " + formatMs(seg.value) + '"></span>';
    }).join("");

    $("#timelineLegend").innerHTML = A.timeline.map(function (seg) {
      return '<div class="tl-row"><span class="dot" style="background:' + seg.color + '"></span>' +
        esc(seg.label) + "<b>" + formatMs(seg.value) + "</b></div>";
    }).join("");

    $("#timelineTotal").textContent = formatMs(total);

    var opps = A.opportunities || [];
    if (!opps.length) {
      $("#opps").innerHTML = '<div class="opp-empty">No measured savings available. Run again when PageSpeed Insights is available for a full opportunity list.</div>';
      $("#oppsTotal").textContent = "—";
      return;
    }

    var max = Math.max.apply(null, opps.map(function (o) { return o.saving; }).concat([1]));
    var totalSaving = opps.reduce(function (sum, o) { return sum + o.saving; }, 0);

    $("#opps").innerHTML = opps.map(function (o) {
      return '<div class="opp">' +
        '<div class="opp-top">' +
          '<span class="opp-label">' + esc(o.label) + "</span>" +
          '<span class="opp-saving">-' + formatMs(o.saving) + "</span>" +
        "</div>" +
        '<div class="opp-track"><span style="width:' + ((o.saving / max) * 100).toFixed(1) + '%"></span></div>' +
        '<div class="opp-detail">' + esc(o.detail) + "</div>" +
      "</div>";
    }).join("");

    $("#oppsTotal").textContent = formatMs(totalSaving);
  }

  /* ------------------------------ on-page ------------------------------ */
  function renderOnPage() {
    $("#serpTitle").textContent = A.serp.title;
    $("#serpDesc").textContent = A.serp.description;
    $("#serpUrl").textContent = A.serp.url;

    $("#headings").innerHTML = A.headings.map(function (h) {
      if (!h.level) return '<div class="outline-row outline-empty">' + esc(h.text) + "</div>";
      return '<div class="outline-row h' + h.level + '">' +
        '<span class="lvl">H' + h.level + "</span>" +
        "<span>" + esc(h.text) + "</span>" +
      "</div>";
    }).join("");

    $("#metaBody").innerHTML = A.metaTags.map(function (row) {
      return "<tr>" +
        '<td class="strong">' + esc(row.template) + "</td>" +
        '<td class="mono trunc">' + esc(row.url) + "</td>" +
        '<td class="r">' + (row.title || "—") + "</td>" +
        '<td class="r">' + (row.desc || "—") + "</td>" +
        "<td>" + statusPill(row.status) + "</td>" +
      "</tr>";
    }).join("");

    $("#keywordBody").innerHTML = A.keywords.map(function (k) {
      var changeClass = k.change > 0 ? "up" : k.change < 0 ? "down" : "flat";
      var changeText = k.change > 0 ? "↑ " + k.change.toFixed(1) : k.change < 0 ? "↓ " + Math.abs(k.change).toFixed(1) : "—";
      return "<tr>" +
        '<td class="strong">' + esc(k.term) + "</td>" +
        '<td class="r">' + esc(k.volume) + "</td>" +
        '<td class="r">' + k.position.toFixed(1) + "</td>" +
        '<td class="r"><span class="change ' + changeClass + '">' + changeText + "</span></td>" +
        '<td class="r">' + esc(k.clicks) + "</td>" +
        '<td class="r">' + esc(k.ctr) + "</td>" +
      "</tr>";
    }).join("");
  }

  /* ------------------------------ technical ------------------------------ */
  function renderTechnical() {
    $("#crawlStats").innerHTML = A.crawl.map(function (stat) {
      return statCard(stat.label, stat.value, stat.note, stat.tone, stat.icon);
    }).join("");

    $("#securityBody").innerHTML = A.security.map(function (row) {
      return "<tr>" +
        '<td class="strong">' + esc(row.header) + "</td>" +
        '<td class="mono">' + esc(row.value) + "</td>" +
        "<td>" + statusPill(row.status) + "</td>" +
      "</tr>";
    }).join("");

    $("#schemaList").innerHTML = A.schema.map(function (row) {
      var low = row.coverage < 60 ? " low" : "";
      return '<div class="progress-row' + low + '">' +
        '<div class="progress-top"><span>' + esc(row.name) + "</span><b>" + row.coverage + "%</b></div>" +
        '<div class="progress-track"><span style="width:' + row.coverage + '%"></span></div>' +
      "</div>";
    }).join("");
  }

  function statCard(label, value, note, tone, iconName) {
    return '<div class="stat-card">' +
      '<span class="stat-ico ' + tone + '">' + icon(iconName || "file") + "</span>" +
      '<div class="stat-body">' +
        '<div class="stat-label">' + esc(label) + "</div>" +
        '<div class="stat-value">' + esc(value) + "</div>" +
        '<div class="stat-note">' + esc(note) + "</div>" +
      "</div>" +
    "</div>";
  }

  /* ------------------------------ content / authority ------------------------------ */
  function renderContent() {
    var icons = ["file", "alert", "pen", "copy"];
    $("#contentStats").innerHTML = A.contentStats.map(function (stat, i) {
      return statCard(stat.label, stat.value, stat.note, stat.tone, icons[i] || "file");
    }).join("");

    $("#pagesBody").innerHTML = A.pages.map(function (page) {
      var tone = scoreTone(page.score);
      return "<tr>" +
        '<td class="strong">' + esc(page.url) + "</td>" +
        '<td class="r">' + esc(page.clicks) + "</td>" +
        '<td class="r">' + esc(page.impr) + "</td>" +
        '<td class="r">' + esc(page.ctr) + "</td>" +
        '<td class="r">' + page.pos.toFixed(1) + "</td>" +
        '<td><span class="score-cell ' + tone + '"><span class="dot ' + tone + '"></span>' + page.score + "</span></td>" +
      "</tr>";
    }).join("");
  }

  function renderAuthority() {
    var icons = ["link", "globe", "checkCircle", "target"];
    $("#authorityStats").innerHTML = A.authority.stats.map(function (stat, i) {
      return statCard(stat.label, stat.value, stat.note, stat.tone, icons[i] || "link");
    }).join("");

    $("#competitorBody").innerHTML = A.authority.competitors.map(function (c) {
      return '<tr class="' + (c.you ? "you-row" : "") + '">' +
        '<td class="strong">' + esc(c.name) + (c.you ? '<span class="you-tag">You</span>' : "") + "</td>" +
        '<td><span class="auth-cell"><span class="auth-track' + (c.you ? " you" : "") + '"><span style="width:' + c.authority + '%"></span></span>' +
          '<span class="auth-num">' + c.authority + "</span></span></td>" +
        '<td class="r">' + esc(c.domains) + "</td>" +
        '<td class="r">' + esc(c.backlinks) + "</td>" +
        '<td class="r">' + esc(c.keywords) + "</td>" +
        '<td class="r">' + esc(c.traffic) + "</td>" +
      "</tr>";
    }).join("");
  }

  /* ------------------------------ roadmap ------------------------------ */
  function renderRoadmap() {
    var order = ["now", "next", "later"];
    $("#roadmapGrid").innerHTML = order.map(function (key) {
      var phase = A.roadmap[key];
      return '<div class="phase ' + phase.tone + '">' +
        '<div class="phase-head">' +
          '<div class="phase-title"><span class="pip"></span>' + esc(phase.label) + "</div>" +
          '<span class="phase-window">' + esc(phase.window) + "</span>" +
        "</div>" +
        '<div class="phase-items">' +
          phase.items.map(function (item) {
            return '<div class="phase-item">' +
              '<span class="phase-check">' + icon("check") + "</span>" +
              '<div class="phase-item-body">' +
                '<div class="phase-item-title">' + esc(item.title) + "</div>" +
                '<span class="phase-meta">' + esc(item.meta) + "</span>" +
                '<p class="phase-detail">' + esc(item.detail) + "</p>" +
              "</div>" +
            "</div>";
          }).join("") +
        "</div>" +
      "</div>";
    }).join("");
  }

  /* ------------------------------ export / toast ------------------------------ */
  var toastTimer;
  function toast(message) {
    var el = $("#toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { el.classList.remove("show"); }, 2800);
  }

  function exportCsv() {
    var rows = [["Severity", "Category", "Finding", "Affected", "Impact", "Effort", "Recommendation"]];
    A.issues.forEach(function (i) {
      rows.push([
        i.severity,
        (CATS[i.category] || {}).label || i.category,
        i.title,
        i.affected,
        i.impact,
        i.effort,
        i.fix
      ]);
    });

    var csv = rows.map(function (row) {
      return row.map(function (cell) {
        var value = String(cell == null ? "" : cell);
        if (/^[=+\-@\t\r]/.test(value)) value = "'" + value;
        return '"' + value.replace(/"/g, '""') + '"';
      }).join(",");
    }).join("\r\n");

    var blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    var link = document.createElement("a");
    var url = URL.createObjectURL(blob);
    link.href = url;
    link.download = "finalaudit-" + A.meta.domain.replace(/[^a-z0-9]+/gi, "-") + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast("Findings exported as CSV.");
  }

  function copyLink() {
    var url = window.location.href;
    function fallback() {
      var textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        toast("Report link copied to clipboard.");
      } catch (err) {
        toast("Copy this link: " + url);
      }
      textarea.remove();
    }

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(function () {
        toast("Report link copied to clipboard.");
      }).catch(fallback);
    } else {
      fallback();
    }
  }

  /* ------------------------------ navigation / scroll ------------------------------ */
  var navItems = $$(".nav-item[data-section]");
  var navSections = navItems.map(function (item) {
    return document.getElementById(item.getAttribute("data-section"));
  }).filter(Boolean);

  function setActive(sectionKey) {
    navItems.forEach(function (item) {
      item.classList.toggle("is-active", item.getAttribute("data-section") === sectionKey);
    });
  }

  function openNav() {
    document.body.classList.add("nav-open");
    $("#menuBtn").setAttribute("aria-expanded", "true");
  }
  function closeNav() {
    document.body.classList.remove("nav-open");
    $("#menuBtn").setAttribute("aria-expanded", "false");
  }

  var ticking = false;
  function updateScroll() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    var pct = max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0;
    $("#scrollProgress").style.width = pct + "%";
    $("#toTop").classList.toggle("show", window.scrollY > 600);

    var marker = window.scrollY + 130;
    var current = "overview";
    navSections.forEach(function (section) {
      if (section.offsetParent === null) return;
      var top = section.getBoundingClientRect().top + window.scrollY;
      if (top <= marker) current = section.id;
    });
    setActive(current);
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      updateScroll();
      ticking = false;
    });
  }

  function setupNavigation() {
    $("#menuBtn").addEventListener("click", openNav);
    $("#closeMenu").addEventListener("click", closeNav);
    $("#backdrop").addEventListener("click", closeNav);

    navItems.forEach(function (item) {
      item.addEventListener("click", function () {
        setActive(item.getAttribute("data-section"));
        closeNav();
      });
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeNav();
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 1140) closeNav();
    });

    $("#toTop").addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
  }

  /* ------------------------------ buttons ------------------------------ */
  function setupActions() {
    $$("[data-print]").forEach(function (btn) {
      btn.addEventListener("click", function () { window.print(); });
    });
    $$("[data-export]").forEach(function (btn) {
      btn.addEventListener("click", exportCsv);
    });

    $("#shareBtn").addEventListener("click", copyLink);
    $("#copyBtn").addEventListener("click", copyLink);

    $("#approveBtn").addEventListener("click", function () {
      var btn = $("#approveBtn");
      btn.innerHTML = icon("check") + " Approved";
      btn.style.background = "var(--good)";
      btn.style.boxShadow = "0 8px 18px -10px rgba(5,150,105,.8)";
      toast("Report approved. Share it with the client when ready.");
      copyLink();
    });
  }

  /* ------------------------------ live labels ------------------------------ */
  function setText(selector, value) {
    var el = $(selector);
    if (el) el.textContent = value;
  }

  function updateLiveLabels() {
    var m = A.meta;
    if (!m.live) return;

    var s = A.score;
    var row = A.metaTags[0] || { title: 0, desc: 0, status: "warn" };
    var h1Count = A.headings.filter(function (h) { return h.level === 1 && h.text !== "No headings found"; }).length;
    var h2Count = A.headings.filter(function (h) { return h.level === 2; }).length;
    var missingHeaders = A.security.filter(function (r) { return r.status !== "passed"; }).length;
    var schemaFound = A.schema.filter(function (r) { return r.coverage > 0; }).length;
    var psiPerformance = m.psiScores && m.psiScores.performance != null ? m.psiScores.performance : null;

    setText("#breakdownNote", A.categories.length + " categories");
    setText("#breakdownSub", "Weighted by impact across " + s.checks + " live checks.");
    setText("#vitalsNote", m.psi === "available" ? "PSI · field + lab" : "PSI unavailable");
    setText("#vitalsSub", m.psi === "available"
      ? "Real-user and lab data from PageSpeed Insights."
      : "PageSpeed Insights was unavailable; TTFB is measured live.");
    setText("#issuesNote", s.checks + " checks · " + s.critical + " critical");
    setText("#chipAll", s.checks);
    setText("#chipCritical", s.critical);
    setText("#chipWarning", s.warnings);
    setText("#chipPassed", s.passed);
    setText("#performanceNote", psiPerformance != null ? "Lighthouse " + psiPerformance + " · mobile" : "Server timing · live");
    setText("#performanceSub", psiPerformance != null
      ? "Lighthouse mobile run via PageSpeed Insights."
      : "Lighthouse data was unavailable; timings come from the live crawl.");
    setText("#timelineSub", "Measured request phases from the live crawl.");
    setText("#oppsPill", A.opportunities.length
      ? A.opportunities.length + " " + (A.opportunities.length === 1 ? "win" : "wins")
      : "No measured data");
    setText("#oppsSub", psiPerformance != null
      ? "Estimated mobile savings from Lighthouse."
      : A.opportunities.length
        ? "Estimated savings from live document signals."
        : "PageSpeed Insights unavailable; no savings estimates to report.");
    setText("#onpageNote", "1 page crawled");
    setText("#serpSub", m.domain + " · live preview");
    setText("#serpSite", A.serp.siteName || m.domain);
    setText("#serpFavicon", A.serp.favicon || "F");
    setText("#serpNote", "Title " + row.title + " / 60 characters · Description " + row.desc + " / 160 characters.");
    setText("#headingsPill", h1Count + " H1 · " + h2Count + " H2");
    setText("#metaPill", row.status === "good" ? "Title & description healthy" : "Needs adjustment");
    setText("#technicalNote", "Live crawl + headers");
    setText("#securitySub", "Checked on the live response.");
    setText("#securityPill", missingHeaders ? missingHeaders + " missing" : "All set");
    setText("#schemaSub", "JSON-LD types detected on this page.");
    setText("#schemaPill", schemaFound ? schemaFound + " types detected" : "No schema found");
    setText("#contentNote", A.contentStats.length ? A.contentStats[0].value + " words on page" : "1 page analysed");
    setText("#methodBody", "Live crawl of " + m.url + " on " + m.auditedOn + ". FinalAudit fetched the HTML, response headers, robots.txt and server timing directly. Lighthouse field and lab data came from PageSpeed Insights when available. Authority, keyword and Search Console panels are hidden because they require third-party account data.");

    var path = "/";
    try {
      var parsed = new URL(m.url);
      path = parsed.pathname + parsed.search;
    } catch (err) {
      path = m.url;
    }
    setText("#headingsPath", path);

    var serpPill = $("#serpPill");
    if (serpPill) serpPill.className = "pill neutral";
    setText("#serpPill", "Live preview");

    var headingsPill = $("#headingsPill");
    if (headingsPill) headingsPill.className = "pill " + (h1Count === 1 ? "good" : "warn");
    var metaPill = $("#metaPill");
    if (metaPill) metaPill.className = "pill " + (row.status === "good" ? "good" : "warn");
    var securityPill = $("#securityPill");
    if (securityPill) securityPill.className = "pill " + (missingHeaders ? "warn" : "good");
    var schemaPill = $("#schemaPill");
    if (schemaPill) schemaPill.className = "pill " + (schemaFound ? "good" : "warn");

    var authorityOption = $('#catFilter option[value="authority"]');
    if (authorityOption) authorityOption.disabled = true;
  }

  /* ------------------------------ render all ------------------------------ */
  function renderAll() {
    document.body.classList.toggle("is-live", !!A.meta.live);
    renderMeta();
    renderGauge();
    renderCategories();
    renderVitals();
    renderIssues();
    renderIssueSummary();
    renderPerformance();
    renderOnPage();
    renderTechnical();
    renderContent();
    renderAuthority();
    renderRoadmap();
    updateLiveLabels();
    if (resetIssueFilters) resetIssueFilters();
    updateScroll();
  }

  window.FinalAudit = window.FinalAudit || {};
  window.FinalAudit.render = function (data) {
    if (!data || !data.meta) return;
    A = data;
    renderAll();
  };
  window.FinalAudit.getAudit = function () { return A; };
  window.FinalAudit.toast = toast;

  /* ------------------------------ boot ------------------------------ */
  hydateStaticIcons();
  renderAll();
  setupIssueInteractions();
  setupNavigation();
  setupActions();
  updateScroll();
})();
