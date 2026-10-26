/* ============================================================
   FinalAudit — live analyzer UI
   Handles URL input, server fetch, PageSpeed Insights, progress
   and error states, then hands the report to app.js.
   ============================================================ */

(function () {
  "use strict";

  var form = document.getElementById("auditForm");
  if (!form || !window.FinalAudit || !window.FinalAuditEngine) return;

  var input = document.getElementById("auditUrl");
  var submitBtn = document.getElementById("auditBtn");
  var statusEl = document.getElementById("auditStatus");
  var overlay = document.getElementById("auditOverlay");
  var overlayUrl = document.getElementById("auditOverlayUrl");
  var stageEl = document.getElementById("auditStage");
  var progressEl = document.getElementById("auditProgress");
  var cancelBtn = document.getElementById("auditCancel");

  var activeController = null;
  var progressTimer = null;
  var progressValue = 0;

  function delay(ms) {
    return new Promise(function (resolve) { window.setTimeout(resolve, ms); });
  }

  function normalizeUrl(raw) {
    var value = String(raw || "").trim();
    if (!value) throw new Error("Enter a website URL first.");
    if (!/^https?:\/\//i.test(value)) value = "https://" + value;

    var url;
    try {
      url = new URL(value);
    } catch (err) {
      throw new Error("That URL is not valid. Try https://example.com.");
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Only http:// and https:// URLs are supported.");
    }
    if (!url.hostname || (url.hostname.indexOf(".") === -1 && url.hostname !== "localhost")) {
      throw new Error("Enter a full domain, for example https://example.com.");
    }
    return url.href;
  }

  function setStatus(message, tone) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = "analyzer-status" + (tone ? " is-" + tone : "");
  }

  function setStage(message) {
    if (stageEl) stageEl.textContent = message;
  }

  function setProgress(value) {
    progressValue = Math.max(0, Math.min(100, value));
    if (progressEl) progressEl.style.width = progressValue + "%";
  }

  function startProgress(from) {
    stopProgress();
    setProgress(from);
    progressTimer = window.setInterval(function () {
      if (progressValue >= 92) return;
      var step = Math.max(0.4, (94 - progressValue) * 0.045);
      setProgress(progressValue + step);
    }, 420);
  }

  function stopProgress() {
    if (progressTimer) {
      window.clearInterval(progressTimer);
      progressTimer = null;
    }
  }

  function showOverlay(url) {
    if (!overlay) return;
    overlay.hidden = false;
    if (overlayUrl) overlayUrl.textContent = url;
    setStage("Preparing request…");
    setProgress(4);
    window.requestAnimationFrame(function () {
      overlay.classList.add("show");
    });
    document.body.classList.add("audit-busy");
  }

  function hideOverlay() {
    if (!overlay) return;
    overlay.classList.remove("show");
    document.body.classList.remove("audit-busy");
    window.setTimeout(function () {
      overlay.hidden = true;
    }, 180);
  }

  function fetchPsi(targetUrl, parentSignal) {
    var endpoint = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed" +
      "?url=" + encodeURIComponent(targetUrl) +
      "&strategy=mobile" +
      "&category=performance" +
      "&category=accessibility" +
      "&category=best-practices" +
      "&category=seo";

    var controller = new AbortController();
    var timedOut = false;
    var timeout = window.setTimeout(function () {
      timedOut = true;
      controller.abort();
    }, 45000);

    function forwardAbort() {
      controller.abort();
    }
    if (parentSignal) {
      if (parentSignal.aborted) controller.abort();
      else parentSignal.addEventListener("abort", forwardAbort, { once: true });
    }

    return fetch(endpoint, {
      signal: controller.signal,
      headers: { "accept": "application/json" }
    }).then(function (response) {
      if (!response.ok) {
        if (response.status === 429) throw new Error("PageSpeed Insights rate limit reached.");
        throw new Error("PageSpeed Insights returned HTTP " + response.status + ".");
      }
      return response.json();
    }).then(function (data) {
      if (data && data.error) {
        throw new Error(data.error.message || "PageSpeed Insights returned an error.");
      }
      return data;
    }).catch(function (err) {
      if (parentSignal && parentSignal.aborted) throw err;
      if (timedOut) throw new Error("PageSpeed Insights timed out.");
      throw err;
    }).finally(function () {
      window.clearTimeout(timeout);
      if (parentSignal) parentSignal.removeEventListener("abort", forwardAbort);
    });
  }

  async function runAudit(rawUrl, options) {
    options = options || {};
    var target;
    try {
      target = normalizeUrl(rawUrl);
    } catch (err) {
      setStatus(err.message, "bad");
      input.focus();
      return;
    }

    if (activeController) activeController.abort();
    activeController = new AbortController();
    var signal = activeController.signal;

    setStatus("Auditing " + target + "…", "warn");
    showOverlay(target);
    startProgress(8);
    if (submitBtn) submitBtn.disabled = true;

    var psiError = null;
    try {
      setStage("Fetching HTML, headers and robots.txt…");
      startProgress(16);

      var response = await fetch("/api/audit?url=" + encodeURIComponent(target), {
        signal: signal,
        headers: { "accept": "application/json" }
      });

      var payload = null;
      try {
        payload = await response.json();
      } catch (err) {
        throw new Error("The audit service returned an unreadable response.");
      }

      if (!response.ok || (payload && payload.error)) {
        throw new Error((payload && payload.error) || "The audit service returned HTTP " + response.status + ".");
      }

      setStage("Parsing HTML and running SEO checks…");
      startProgress(44);

      var psi = null;
      if (!options.skipPsi) {
        setStage("Running Lighthouse via PageSpeed Insights…");
        startProgress(62);
        try {
          psi = await fetchPsi(payload.finalUrl || target, signal);
        } catch (err) {
          if (signal.aborted) throw err;
          psiError = err.message || "PageSpeed Insights unavailable.";
        }
      }

      setStage("Scoring findings and building the report…");
      startProgress(86);
      await delay(220);

      var report = window.FinalAuditEngine.buildReport(payload, psi);
      window.FinalAudit.render(report);

      stopProgress();
      setProgress(100);
      setStage("Audit complete");

      var tone = report.score.overall >= 80 ? "good" : report.score.overall >= 60 ? "warn" : "bad";
      setStatus(
        "Live audit complete · " + report.meta.domain + " · " + report.score.overall + "/100" +
        (psiError ? " · Lighthouse unavailable (" + psiError + ")" : " · Lighthouse included"),
        tone
      );

      if (input) input.value = report.meta.url;
      try {
        window.history.replaceState(null, "", "?url=" + encodeURIComponent(report.meta.url));
      } catch (err) {
        // History updates can fail in embedded or file contexts; the report still works.
      }

      await delay(420);
      hideOverlay();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      stopProgress();
      hideOverlay();
      if (err && err.name === "AbortError") {
        setStatus("Audit cancelled.", "warn");
      } else {
        setStatus("Audit failed: " + (err && err.message ? err.message : "Unknown error."), "bad");
      }
    } finally {
      if (activeController === signal) activeController = null;
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    runAudit(input ? input.value : "");
  });

  if (cancelBtn) {
    cancelBtn.addEventListener("click", function () {
      if (activeController) activeController.abort();
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && activeController) activeController.abort();
  });

  var initialUrl = new URLSearchParams(window.location.search).get("url");
  if (initialUrl) {
    if (input) input.value = initialUrl;
    window.setTimeout(function () {
      runAudit(initialUrl);
    }, 350);
  }
})();
