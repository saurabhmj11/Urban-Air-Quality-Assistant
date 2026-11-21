/**
 * BreathEasy — Challenge 06 Submission Guide: content assembly.
 * Run: bun run generate.js
 */
const {
  Document, Packer, Paragraph, TextRun, Header, Footer, PageNumber, NumberFormat,
  AlignmentType, SectionType, TableOfContents, PageBreak,
  PAL, EN, buildCoverR1, h1, h2, p, r, bullet, mono, check, caption, callout, tbl, spacer,
} = require("./lib.js");
const fs = require("fs");

const pgSize = { width: 11906, height: 16838 };
const pgMargin = { top: 1440, bottom: 1440, left: 1701, right: 1417 };

function pageFooter() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "888888", font: { ascii: EN } })],
    })],
  });
}
function pageHeader() {
  return new Header({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      border: { bottom: { style: "single", size: 2, color: PAL.table.innerLine } },
      children: [new TextRun({ text: "BreathEasy — Challenge 06 Submission Guide", size: 16, color: "999999", font: { ascii: EN } })],
    })],
  });
}

// ---------------------------------------------------------------------------
// BODY CONTENT
// ---------------------------------------------------------------------------
const body = [];

// ===== 1. Executive summary =====
body.push(h1("1. Executive Summary"));
body.push(p("BreathEasy is a complete GenAI web application for Challenge 06 (Urban Air Quality Assistant). It helps families survive severe winter smog by combining live CPCB-scale air quality data for 12 Indian cities with AI-generated, family-personalised low-emission routines and room-by-room indoor air action plans. The build is finished: five feature tabs, six API routes, a Prisma/SQLite data layer, 29 passing unit tests, a clean ESLint run, and an end-to-end browser verification of every user flow."));
body.push(p("What stands between the current state and a scored leaderboard entry is pure logistics, not code. There are exactly four steps left: publish the public GitHub repository, deploy a live instance, record an unlisted demo video, and submit the repository link on the platform. This guide walks through each one in detail, then explains how to spend the three submission attempts strategically and how the project answers each of the six AI evaluation criteria."));
body.push(caption("Table 1 — Submission snapshot (as of 21 November 2026)"));
body.push(tbl(
  ["Item", "Status"],
  [
    ["Module closes", "29 November 2026, 11:59 PM IST (about 8 days remaining)"],
    ["Submission attempts used", "0 of 3"],
    ["Current leaderboard rank", "#250 of 54,294 participants"],
    ["Application build", "Complete — 5 tabs, 6 API routes, 29 unit tests, ESLint clean"],
    ["Repository state", "Clean working tree, tidy commit history, ~1.9 MB source (limit 10 MB)"],
    ["Remaining work", "Publish repo, deploy, record video, submit"],
  ],
  [32, 68]
));
body.push(spacer());
body.push(callout(
  "The single most important move",
  "Submit Attempt 1 as soon as the repository and deployment are ready — ideally within 24 to 48 hours. The first submission places the entry on the leaderboard and triggers the AI evaluation, whose feedback then drives the remaining two attempts. Waiting until the last days wastes two of the three attempts."
));

// ===== 2. Submission rules decoded =====
body.push(h1("2. Submission Rules Decoded"));
body.push(p("The platform instructions look short but every sentence is a hard gate. A submission that violates any single rule is simply not evaluated, which burns one of only three attempts. This section translates each rule into exactly what must be true before pressing submit."));

body.push(h2("2.1 What you actually submit"));
body.push(p("The platform accepts the public GitHub repository link. That repository must be self-sufficient as documentation: the AI evaluator reads code and README, and any human reviewer will look for the live demo. The deployment link and the demo video link must therefore be discoverable from the repository — put both at the very top of the README in a clearly named section, and also paste them into the submission form fields if the form provides them."));

body.push(h2("2.2 Repository size must be under 10 MB"));
body.push(p("The platform rejects repositories larger than 10 MB. The BreathEasy repository is already shaped for this: .gitignore excludes node_modules, the .next build output, the SQLite database, logs, and all sandbox tooling, so what is tracked is source code and configuration only — about 1.9 MB, most of which is the lockfile. Before submitting, verify with git count-objects -vH (look at the size-pack line) or check the repo size shown on the GitHub settings page. Never commit the database file, build artefacts, or node_modules to fix a size problem — the opposite: remove them."));

body.push(h2("2.3 Public access is mandatory"));
body.push(p("Private or restricted links are not evaluated — no warnings, no grace period. After pushing, open the repository URL in a private/incognito browser window (or logged out). If the code is visible, the link is public. If GitHub shows a sign-in page, the repo is private: go to Settings, General, Danger Zone, Change visibility, and make it public. Do this before submitting, and re-check after any GitHub UI changes."));

body.push(h2("2.4 The video link"));
body.push(p("The demo video must be reachable either as an unlisted YouTube video or as a Google Drive link with access granted. Both have classic failure modes:"));
body.push(bullet("YouTube: upload, set visibility to Unlisted (anyone with the link can view, but it does not appear in search or your channel), then test the link in an incognito window. A Private video link fails evaluation."));
body.push(bullet("Google Drive: upload, click Share, change General access to Anyone with the link with the Viewer role, copy the link, and test it in an incognito window. A link left on Restricted fails evaluation."));
body.push(p("Keep the video between two and four minutes. Section 6 of this guide contains a complete timestamped recording script."));

body.push(h2("2.5 Three attempts, maximum"));
body.push(p("At most three submissions are allowed for this round, and each submission triggers a fresh AI evaluation. There is no reason to submit all three at once or early: the leaderboard entry is locked by the first submission, and each subsequent attempt should be driven by the feedback from the previous one. Section 7 lays out a concrete attempt strategy and timeline across the remaining eight days."));

// ===== 3. AI evaluation mapping =====
body.push(h1("3. How the Project Answers the Six AI Criteria"));
body.push(p("The submission is scored by AI on six criteria: Code Quality, Security, Efficiency, Testing, Accessibility, and Problem Statement Alignment. The table below summarises where the evidence lives; the subsections that follow give the details an evaluator will find in the repository."));
body.push(caption("Table 2 — Criteria-to-evidence map"));
body.push(tbl(
  ["Criterion", "Primary evidence in the repository"],
  [
    ["Code Quality", "Strict TypeScript throughout, layered architecture (pure domain lib / thin API routes / presentational components), documented engineering decisions in README"],
    ["Security", "Server-only GenAI SDK, input validation and clamping on every route, secrets gitignored, health data kept in local SQLite"],
    ["Efficiency", "10-minute per-city cache, singleton AI client with retry, trimmed chat context, deterministic offline fallback"],
    ["Testing", "29 unit tests (bun test) covering the CPCB sub-index math, window finder, sensitivity scoring, verdicts and simulation"],
    ["Accessibility", "Semantic landmarks, ARIA labels and live regions, keyboard-operable controls, 44 px touch targets, dark mode, mobile-first responsive layout"],
    ["Alignment", "Family-centric winter-smog focus, personalised low-emission routines, indoor air hacks, live-data grounding of every AI answer"],
  ],
  [22, 78]
));
body.push(spacer());

body.push(h2("3.1 Code quality"));
body.push(p("The codebase is TypeScript with no any escape hatches in domain code, organised in three layers. src/lib/aqi.ts holds pure, framework-free domain logic (index math, category bands, window finding, sensitivity scoring) with a comment block explaining the CPCB scale. src/app/api/* routes stay thin: validate, orchestrate, respond — every route fits on one screen. src/components/air/* maps one component per feature tab, sharing typed DTOs defined once in types.ts. ESLint runs clean, and the README documents not just what the app does but why specific engineering choices were made (for example, why the overall AQI excludes instantaneous O3/CO readings)."));

body.push(h2("3.2 Security"));
body.push(bullet("The GenAI SDK (z-ai-web-dev-sdk) is imported only in server modules; no key material or SDK call ever reaches the client bundle."));
body.push(bullet("Every API route validates its inputs against allow-lists: city ids are checked against the catalogue, enum-like fields (dayType, mode, budget, cooking) against literal lists, numeric fields are clamped (rooms between 1 and 10), and free-text fields are length-capped (name 40, notes 300, chat messages 2000 characters)."));
body.push(bullet("Secrets are excluded from version control: .env and .z-ai-config are gitignored, while .env.example documents the expected shape. The repository ships with neither the database nor credentials."));
body.push(bullet("Privacy by design: family health profiles stay in the local SQLite database; only derived, non-identifying sensitivity summaries (a score and labels) are injected into AI prompts."));

body.push(h2("3.3 Efficiency"));
body.push(bullet("Air-quality responses are cached per city for 10 minutes in memory (60 seconds when serving the offline fallback), so repeated dashboard loads and AI generations reuse one upstream call."));
body.push(bullet("The AI client is a singleton stored on globalThis (surviving hot reloads) with one retry and exponential backoff, so transient LLM failures do not surface as user errors."));
body.push(bullet("Chat context is trimmed to the last 12 turns and each message to 2000 characters, keeping prompts small; routine and indoor-plan prompts embed a compact, pre-serialised context instead of raw JSON."));
body.push(bullet("The best-window finder is a single linear scan with descending thresholds — no nested loops over the forecast."));
body.push(bullet("If the upstream air-quality API is unreachable, a deterministic winter-smog simulation keeps the entire app functional instead of showing an error state."));

body.push(h2("3.4 Testing"));
body.push(p("29 unit tests in src/lib/aqi.test.ts run with bun test and cover the exact logic that turns numbers into advice: CPCB sub-index boundary values for every pollutant, in-band interpolation, clamping and non-finite guards, monotonicity sweeps, all six category bands, city catalogue integrity, best-window detection (minimum length, threshold fallback, sorting, midnight wrap), sensitivity scoring (age and condition points, clamping, band mapping), the risk-verdict escalation matrix, and the determinism plus diurnal winter-inversion shape of the offline simulation. The testing strategy is stated in the README: everything that converts data into advice is a pure, tested function; routes are thin wrappers around them."));

body.push(h2("3.5 Accessibility"));
body.push(bullet("Semantic HTML landmarks (header, main, footer, section, nav-grade tablist) and one h1-equivalent per view region."));
body.push(bullet("ARIA labels on every icon-only control (refresh, theme toggle, remove member, send), an aria-live polite log for the chat stream, and labelled form groups via the Label/RadioGroup/Switch components."));
body.push(bullet("Full keyboard operation: tabs, radio cards, toggles, selects and the chat composer all work without a mouse; Enter sends a chat message, Shift+Enter adds a newline."));
body.push(bullet("Touch targets of at least 44 px, a mobile-first responsive layout verified at 390 px width with no horizontal scroll, and a dark mode that respects the system preference."));
body.push(bullet("AQI categories never rely on colour alone — every band also carries its numeric value and a text label."));

body.push(h2("3.6 Problem statement alignment"));
body.push(p("The challenge asks for an urban air quality assistant that helps families deal with severe winter smog through personalised low-emission routines and indoor air quality optimisation. The application delivers exactly that, end to end: a live dashboard on the Indian CPCB scale with a 48-hour PM2.5 history and forecast and computed best-outdoor windows; a family model with a transparent 0-100 sensitivity score per member; a context-grounded AI coach whose answers quote the live forecast and name the user's family members; routine generation in three focus modes that explicitly trade off exposure protection against low-emission living; and an indoor section that pairs six proven zero/low-cost hacks with AI room-by-room plans matched to the home, cooking fuel and budget. Every AI feature is grounded in live data rather than generic advice — the system prompt receives the current readings, the 12-hour forecast, the best/worst windows and the family profile before generating."));

// ===== 4. Step 1: GitHub =====
body.push(h1("4. Step 1 — Publish the GitHub Repository"));
body.push(h2("4.1 Create the repository"));
body.push(p("On github.com/new, create a new repository named breatheasy (or any name you prefer). Set visibility to Public from the start. Do not initialise it with a README, .gitignore or license — the project already has all three, and duplicate files create merge conflicts on the first push."));
body.push(h2("4.2 Push the prepared project"));
body.push(p("The project folder is already a clean git repository with a tidy commit history on the main branch (application, test suite and repository hygiene, health-check endpoint). Connect it to GitHub with:"));
body.push(p([mono("git remote add origin https://github.com/<your-username>/breatheasy.git")]));
body.push(p([mono("git push -u origin main")]));
body.push(p("If your local branch is not named main, rename it first with git branch -M main. After pushing, run git status — the working tree should be clean. If anything appears modified, commit it before submitting so the published repository exactly matches the verified state."));
body.push(h2("4.3 What the repository contains"));
body.push(caption("Table 3 — Tracked contents (89 files, about 1.9 MB)"));
body.push(tbl(
  ["Included", "Deliberately excluded"],
  [
    ["Full Next.js source: app routes, API routes, components, hooks, lib", "node_modules (rebuilt from bun.lock by the evaluator or deploy host)"],
    ["Prisma schema (prisma/schema.prisma)", "The SQLite database file (created by bun run db:push)"],
    ["README with architecture, API reference and testing documentation", ".env (contains only the local database path; .env.example documents it)"],
    [".env.example, .gitignore, ESLint/TypeScript/Tailwind configs", ".z-ai-config GenAI credentials (never leave the machine)"],
    ["29-test unit suite (src/lib/aqi.test.ts) and bun.lock", "Build output, logs, sandbox tooling (Caddyfile, .zscripts, examples)"],
  ],
  [50, 50]
));
body.push(spacer());
body.push(h2("4.4 Verify before moving on"));
body.push(check("git count-objects -vH reports size-pack well under 10 MB (expected: under 3 MB)."));
body.push(check("The repository URL opens the code in an incognito browser window (public access confirmed)."));
body.push(check("No file named .env, custom.db or .z-ai-config appears in the tracked file list (git ls-files)."));
body.push(check("The README renders correctly on GitHub, including the architecture tree and all tables."));

// ===== 5. Step 2: Deploy =====
body.push(h1("5. Step 2 — Deploy a Live Instance"));
body.push(p("The evaluation flow expects a working deployment link. Because the app uses SQLite through Prisma, the hosting choice matters: the database file needs a writable disk. Two paths are recommended below — pick one; both take under 15 minutes."));
body.push(h2("5.1 Recommended: Railway (bun-native, persistent volume)"));
body.push(bullet("Create a project on railway.app from the GitHub repo. Railway detects bun automatically."));
body.push(bullet("Add a Volume mounted at /data so the SQLite database survives restarts and redeploys."));
body.push(bullet("Set the environment variable DATABASE_URL to file:/data/custom.db."));
body.push(bullet("Set the start command to run the schema push before the server: bun run db:push && bun run start. The build command can stay bun install && bun run build."));
body.push(bullet("Deploy, then open the public domain Railway assigns and run the smoke test in section 5.3."));
body.push(h2("5.2 Free alternative: Render web service"));
body.push(bullet("On render.com, create a new Web Service from the same GitHub repository."));
body.push(bullet("Build command: bun install && bun run build. Start command: bun run db:push && bun run start."));
body.push(bullet("Set DATABASE_URL to file:./db/custom.db. On the free tier the disk is ephemeral — the app always boots with a valid schema, but saved family members and routines are lost on restart. Acceptable for a demo; if you want persistence without cost pressure, use the Railway path."));
body.push(bullet("Note the free-tier cold start: the first request after idle can take up to a minute. Warm the instance before recording the video or sharing the link."));
body.push(callout(
  "Why not Vercel for this build",
  "Vercel runs serverless functions without a writable filesystem, so the SQLite writes behind the family, routines and indoor-plans features would not persist (the dashboard and AI chat would still work). Swapping Prisma to Turso or Neon is a clean future upgrade — the schema stays identical — but it is not worth the risk in the days before the deadline."
));
body.push(h2("5.3 GenAI provider configuration"));
body.push(p("The application calls the language model through z-ai-web-dev-sdk, which reads a JSON config file named .z-ai-config (containing baseUrl and apiKey) from the project root, the home directory, or /etc. On your deployment host, provide that file with your own ZAI-compatible endpoint credentials — never commit it. If you prefer a standard provider, the integration is isolated to a single wrapper: chatComplete() in src/lib/ai.ts is the only place that talks to the SDK, so pointing it at any OpenAI-compatible client driven by an environment variable is a contained, 15-line change that touches nothing else. Without a working LLM endpoint, the dashboard, forecast, windows and family features still function; the three AI-generation features return a friendly retry message."));
body.push(h2("5.4 Post-deployment smoke test"));
body.push(check("The root page loads and the AQI gauge shows a number with a Live badge."));
body.push(check("GET /api returns status ok (the health-check endpoint added for exactly this purpose)."));
body.push(check("Switching cities updates the dashboard within a few seconds."));
body.push(check("The AI Coach answers a quick prompt, quoting the current AQI."));
body.push(check("Generate today's routine and an indoor plan — both render markdown sections."));
body.push(check("Add a family member, reload the page, and confirm the member persists."));

// ===== 6. Step 3: Video =====
body.push(h1("6. Step 3 — Record the Demo Video"));
body.push(p("Record a two-and-a-half to three-and-a-half minute screen capture at 1080p. Zoom the browser to 110-125% so text stays readable after YouTube compression, rehearse once (the AI generations take 10-30 seconds each — leave them running on screen rather than cutting), and keep the mouse deliberate. Narrate the problem, not the code: the evaluator wants to see the challenge statement solved. The script below is timed for a 3-minute recording."));
body.push(caption("Table 4 — Timestamped recording script"));
body.push(tbl(
  ["Time", "On screen", "What to say"],
  [
    ["0:00-0:20", "Dashboard, Delhi", "Every winter, families in Delhi face weeks of hazardous smog. BreathEasy turns a scary AQI number into a personal action plan — live data plus GenAI."],
    ["0:20-0:50", "Gauge, pollutant cards, best windows", "The dashboard shows the live CPCB-scale AQI for twelve Indian cities, all six pollutants, a 48-hour forecast, and computes the best outdoor windows from that forecast."],
    ["0:50-1:20", "Family tab: add a child with asthma", "I add my son — a child with asthma. BreathEasy scores his sensitivity 65 out of 100 and immediately adapts every verdict and routine to him."],
    ["1:20-2:00", "AI Coach: tap a quick prompt", "The coach is grounded in live data and my family profile. Ask: can my kids play outside this evening? The answer quotes tonight's forecast spike and names my asthmatic son."],
    ["2:00-2:40", "Routines tab: generate, then Indoor tab: generate", "One tap generates today's routine — morning to bedtime, with mask and commute timing around the forecast windows, in a low-emission focus mode. Indoors, I get a room-by-room plan matched to my home, cooking fuel and budget, alongside six proven zero-cost hacks."],
    ["2:40-3:00", "Footer, then repo README", "Fully typed Next.js codebase, 29 unit tests, privacy-first local database. Repo, live demo and this video are linked in the README. BreathEasy — breathe easier this winter."],
  ],
  [12, 26, 62]
));
body.push(spacer());
body.push(h2("6.1 Upload and set access"));
body.push(bullet("YouTube: upload, set visibility to Unlisted, copy the link, verify in an incognito window."));
body.push(bullet("Drive: upload, Share, General access Anyone with the link (Viewer), copy the link, verify in an incognito window."));
body.push(bullet("Add both the deployment link and the video link to a Links section at the top of the README, then commit and push."));

// ===== 7. Step 4: Submit =====
body.push(h1("7. Step 4 — Submit and Spend the Three Attempts Wisely"));
body.push(p("On the Submission Dashboard, paste the public GitHub repository URL. If the form has dedicated fields for the deployment and video links, fill them as well — they are also in the README, so both the form and the evaluator find them. Press submit only after the section 8 checklist passes completely: a failed gate (private repo, oversized repo, dead video link) consumes an attempt and returns nothing."));body.push(caption("Table 5 — Attempt strategy across the remaining days"));
body.push(tbl(
  ["Attempt", "When", "Goal"],
  [
    ["1 of 3", "22-23 November", "Lock the leaderboard entry and get the baseline AI evaluation. Submit as soon as repo + deployment + video are ready."],
    ["2 of 3", "26-27 November", "Act on the evaluation feedback: fix the weakest one or two criteria, polish the README, redeploy, resubmit."],
    ["3 of 3", "Reserve — 28-29 November", "Only if a concrete, material improvement landed after Attempt 2. Never spend it just to re-check the same state."],
  ],
  [12, 22, 66]
));
body.push(spacer());
body.push(p("Between attempts, rank movement comes from the evaluation deltas, so treat the AI feedback as the backlog. If the feedback praises code quality but flags testing, add integration-level tests for the API validation logic; if it flags accessibility, run the deployed site through an axe or Lighthouse pass and fix the findings. Small, targeted changes beat rewrites."));
body.push(caption("Table 6 — Suggested day-by-day timeline"));
body.push(tbl(
  ["Date", "Milestone"],
  [
    ["21 November (today)", "Verify final state; push the repository to GitHub"],
    ["22 November", "Deploy (Railway or Render); smoke test; add Links section to README"],
    ["23 November", "Record and upload the video; verify access in incognito; submit Attempt 1"],
    ["24-25 November", "Read the AI evaluation; list concrete fixes; implement them"],
    ["26-27 November", "Retest, redeploy, update video only if flows changed; submit Attempt 2"],
    ["28 November", "Buffer for surprises; final regression pass"],
    ["29 November", "Deadline day (11:59 PM IST). No risky changes; keep Attempt 3 only for a proven fix"],
  ],
  [28, 72]
));

// ===== 8. Checklist =====
body.push(h1("8. Final Pre-Submission Checklist"));
body.push(p("Run this list top to bottom before every submission attempt. Each item maps to a hard platform rule or an evaluation criterion."));
body.push(h2("Repository"));
body.push(check("Repository is Public — verified in an incognito browser window."));
body.push(check("Repository size is under 10 MB (git count-objects -vH, size-pack line)."));
body.push(check("Working tree is clean; git status shows nothing uncommitted."));
body.push(check("No .env, .z-ai-config, or custom.db in git ls-files output."));
body.push(check("README renders on GitHub and includes the architecture, API reference and testing sections."));
body.push(h2("Deployment"));
body.push(check("Live URL loads and shows the AQI dashboard with current data."));
body.push(check("GET /api health endpoint returns status ok."));
body.push(check("AI Coach, routine generation and indoor plan all return generated content."));
body.push(check("GenAI credentials are configured on the host and absent from the repository."));
body.push(h2("Video"));
body.push(check("Video is 2-4 minutes, 1080p, and demonstrates all five tabs."));
body.push(check("Video link is Unlisted YouTube or Drive with Anyone-with-the-link access."));
body.push(check("Video link verified in an incognito window."));
body.push(h2("README links and platform"));
body.push(check("Deployment link and video link appear in a Links section at the top of the README."));
body.push(check("Submission form fields filled with the repository URL (and media links if fields exist)."));
body.push(check("Submission is made well before 29 November 2026, 11:59 PM IST."));
body.push(spacer(60));
body.push(p([r("A final note on honesty: ", { bold: true, color: PAL.h2 }), r("the README documents the app's limitations (model-based AQI rather than station data, English-only output for v1) alongside the roadmap. Stating limitations explicitly reads as engineering maturity, not weakness — keep that section intact. Good luck with the submission.")]));

module.exports = body;
