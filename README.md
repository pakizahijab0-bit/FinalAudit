# FinalAudit

**Live:** <https://finalaudit.netlify.app/>

FinalAudit is a live SEO and website audit app. Enter any public URL and it crawls the page, parses the HTML, calls PageSpeed Insights and builds a real report with scores, findings, Core Web Vitals, security headers, structured data and a prioritised roadmap.

## How it works

- `public/` — static report UI and browser-side audit engine
- `netlify/functions/audit.js` — serverless fetch proxy (HTML, headers, timing, robots.txt)
- `server.js` — dependency-free local server that runs the same function
- `netlify.toml` — Netlify publish, function and redirect configuration

The browser does the parsing and checks with `DOMParser`, so no Python or database is required.

## Run locally

```bash
node server.js
```

Open <http://127.0.0.1:8091>.

## Deploy to Netlify via GitHub

This project is already connected to GitHub and Netlify:

- Repository: <https://github.com/pakizahijab0-bit/FinalAudit>
- Netlify project: <https://app.netlify.com/projects/finalaudit>
- Production: <https://finalaudit.netlify.app/>

Every push to `main` triggers a production build automatically. Build command is empty; publish directory is `public`; functions are read from `netlify/functions`.

To recreate the setup from scratch:

1. Push this folder to a GitHub repository named `FinalAudit`.
2. In Netlify: **Add new project → Import an existing project → GitHub**.
3. Select the repository.
4. Build command: leave empty. Publish directory: `public`.
5. Deploy. The function is detected automatically from `netlify/functions`.

`/api/audit` is redirected to `/.netlify/functions/audit` by `netlify.toml`.

## Notes

- PageSpeed Insights is called directly from the browser and can be rate-limited. When it is unavailable, FinalAudit still runs all live crawl checks and reports server timing.
- Only public `http://` and `https://` URLs are accepted. Private and local addresses are blocked in the function.
- The sample Northwind report is shown until the first live audit runs.
