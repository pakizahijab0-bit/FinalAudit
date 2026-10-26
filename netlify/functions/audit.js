/* ============================================================
   FinalAudit — Netlify Function
   Fetches a public page server-side so the browser can parse it
   without CORS problems. Also returns headers, timings and
   robots.txt so the audit engine can run real checks.
   ============================================================ */

"use strict";

const dns = require("node:dns").promises;
const net = require("node:net");

const MAX_BYTES = 2 * 1024 * 1024;
// Netlify's synchronous function limit is 10s on the free plan. Keep the
// page fetch and the optional robots.txt fetch inside that budget.
const FETCH_TIMEOUT_MS = 7000;
const ROBOTS_TIMEOUT_MS = 2000;
const MAX_REDIRECTS = 4;

const PRIVATE_V4 = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4]
];

function ipv4ToInt(ip) {
  return ip.split(".").reduce((sum, part) => (sum << 8) + Number(part), 0) >>> 0;
}

function isPrivateIpv4(ip) {
  const value = ipv4ToInt(ip);
  return PRIVATE_V4.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) === (ipv4ToInt(base) & mask);
  });
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) return isPrivateIpv4(ip);
  if (!net.isIPv6(ip)) return true;

  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
  if (lower.startsWith("fe80") || lower.startsWith("fe90") || lower.startsWith("fea0") || lower.startsWith("feb0")) return true; // link local
  if (lower.startsWith("ff")) return true; // multicast
  if (lower.startsWith("::ffff:")) {
    const mapped = lower.slice(7);
    if (net.isIPv4(mapped)) return isPrivateIpv4(mapped);
  }
  return false;
}

async function assertPublicUrl(url) {
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".home.arpa")
  ) {
    throw new Error("Private or local hostnames are not allowed.");
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("Private IP addresses are not allowed.");
    return;
  }

  let records;
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch (err) {
    throw new Error("Could not resolve the hostname.");
  }

  if (!records.length) throw new Error("Could not resolve the hostname.");
  if (records.some((record) => isPrivateIp(record.address))) {
    throw new Error("The hostname resolves to a private address.");
  }
}

async function fetchWithSafeRedirects(url, options) {
  const maxRedirects = options.maxRedirects == null ? MAX_REDIRECTS : options.maxRedirects;
  let current = url;

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    await assertPublicUrl(current);

    const response = await fetch(current.href, {
      redirect: "manual",
      signal: options.signal,
      headers: options.headers
    });

    if (response.status < 300 || response.status >= 400) {
      return { response, finalUrl: current.href, redirects };
    }

    const location = response.headers.get("location");
    if (!location) {
      return { response, finalUrl: current.href, redirects };
    }
    if (redirects === maxRedirects) {
      throw new Error("The page redirected too many times.");
    }

    let next;
    try {
      next = new URL(location, current);
    } catch (err) {
      throw new Error("The page redirected to an invalid address.");
    }
    if (next.protocol !== "http:" && next.protocol !== "https:") {
      throw new Error("The page redirected to an unsupported protocol.");
    }
    current = next;
  }

  throw new Error("The page redirected too many times.");
}

async function readLimitedBody(response, limit) {
  if (!response.body) return { buffer: Buffer.alloc(0), truncated: false };

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  let truncated = false;

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const value = chunk.value;
      if (!value || !value.length) continue;

      const remaining = limit - total;
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      if (value.length > remaining) {
        chunks.push(Buffer.from(value.subarray(0, remaining)));
        total += remaining;
        truncated = true;
        break;
      }
      chunks.push(Buffer.from(value));
      total += value.length;
    }
  } finally {
    if (truncated) {
      try { await reader.cancel(); } catch (err) {}
    }
  }

  return { buffer: Buffer.concat(chunks, total), truncated };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "content-type"
      },
      body: ""
    };
  }

  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed. Use GET." });
  }

  const raw = event.queryStringParameters && event.queryStringParameters.url;
  if (!raw) {
    return json(400, { error: "Missing ?url= parameter." });
  }

  let target;
  try {
    target = new URL(String(raw).trim());
  } catch (err) {
    return json(400, { error: "That URL is not valid." });
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return json(400, { error: "Only http:// and https:// URLs are supported." });
  }

  try {
    await assertPublicUrl(target);
  } catch (err) {
    return json(400, { error: err.message });
  }

  const started = Date.now();
  let fetched;
  try {
    fetched = await fetchWithSafeRedirects(target, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; FinalAuditBot/1.0; +https://finalaudit.netlify.app)",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9"
      }
    });
  } catch (err) {
    let message = "Could not fetch the page. Check the URL and try again.";
    if (err && err.name === "TimeoutError") {
      message = "The page took too long to respond. Try again or audit a faster URL.";
    } else if (err && /private|local|redirect|unsupported|resolve/i.test(err.message || "")) {
      message = "The page redirected to a blocked or invalid address.";
    }
    return json(502, { error: message });
  }

  const response = fetched.response;
  const ttfbMs = Date.now() - started;
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  const headers = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let bodyResult;
  try {
    bodyResult = await readLimitedBody(response, MAX_BYTES);
  } catch (err) {
    return json(502, { error: "The page was reachable but the response could not be read." });
  }

  const totalMs = Date.now() - started;
  const buffer = bodyResult.buffer;
  const truncated = bodyResult.truncated;
  const html = buffer.toString("utf8");
  const finalUrl = fetched.finalUrl || target.href;

  let robotsTxt = null;
  let robotsStatus = null;
  try {
    const robotsUrl = new URL("/robots.txt", finalUrl);
    const robotsFetched = await fetchWithSafeRedirects(robotsUrl, {
      signal: AbortSignal.timeout(ROBOTS_TIMEOUT_MS),
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; FinalAuditBot/1.0)",
        "accept": "text/plain,*/*;q=0.8"
      },
      maxRedirects: 2
    });
    const robotsResponse = robotsFetched.response;
    robotsStatus = robotsResponse.status;
    if (robotsResponse.ok) {
      const robotsBody = await readLimitedBody(robotsResponse, 100000);
      robotsTxt = robotsBody.buffer.toString("utf8");
    }
  } catch (err) {
    robotsStatus = null;
  }

  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    return json(415, {
      error: "That URL did not return an HTML page (content-type: " + (contentType || "unknown") + ")."
    });
  }

  return json(200, {
    requestedUrl: target.href,
    finalUrl,
    status: response.status,
    headers,
    contentType,
    html,
    contentEncoding: response.headers.get("content-encoding") || "",
    bytes: buffer.length,
    htmlBytes: Buffer.byteLength(html, "utf8"),
    truncated,
    ttfbMs,
    totalMs,
    redirects: fetched.redirects,
    robotsTxt,
    robotsStatus
  });
};
