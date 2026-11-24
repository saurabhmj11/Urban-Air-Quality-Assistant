# BreathEasy — Urban Air Quality Assistant

> **GenAI co-pilot that helps families beat severe winter smog** with live AQI tracking, personalised low-emission commute planning, daily routines and room-by-room indoor air hacks.

Built for **Challenge 06 — Urban Air Quality Assistant**.

---

## The problem

Every winter, North Indian cities disappear under hazardous smog (AQI 300–500 for weeks). Existing AQI apps stop at a number. Families are left googling "is it safe to send my asthmatic kid to school?" at 7 AM with no personalised, actionable answer — and no help making their own routines *part of the solution* rather than the problem.

## The solution

BreathEasy combines **live air-quality data** with **GenAI** to turn a scary number into a family-specific action plan:

| Tab | What it does |
| --- | --- |
| **Dashboard** | Live AQI on the CPCB National scale for 12 Indian cities, animated gauge, 6-pollutant breakdown, 48-hour past+forecast PM2.5 chart, **best outdoor windows** computed from the forecast, and per-member risk verdicts. |
| **AI Coach** | Context-aware chat that sees the live AQI, the 24h forecast **and your saved family profile** — so "can my kids play outside?" gets an answer about *your* kids (e.g. it factors in Aarav's asthma). |
| **Commute** | **Personalised low-emission route planner.** Pick two areas in your city and every travel mode (walk / cycle / metro / bus / auto / scooter / car / carpool) is ranked by **inhaled PM2.5 dose** and **CO2e per passenger**, with best-window departure timing, sensitive-member warnings and an AI explanation of the trade-offs. |
| **Routines** | Generates a personalised **low-emission daily routine** (Morning / Midday / Evening / Before bed / Watch-outs) in three focus modes: *Protect my family*, *Cut our emissions*, or *Balance both*. Saved with history. |
| **Indoor Hacks** | Six proven zero/low-cost indoor interventions (CAZ box, ventilation timing, kitchen exhaust discipline…) plus an **AI-generated room-by-room indoor action plan** matched to your rooms, cooking fuel, purifier/AC and budget. |
| **Family** | Add members with age groups and health conditions (asthma, heart, COPD, pregnancy…). A transparent **0–100 sensitivity score** drives every verdict, commute warning and routine. Data stays in the local database — no accounts. |

### Why it's genuinely "GenAI", not a chatbot bolted on

Every AI feature is **grounded in live context**: the server injects the current AQI, pollutant readings, the next 12-hour forecast, the computed best/worst windows and the full family sensitivity profile into the system prompt before generation. The Commute planner goes further: **all numbers (dose, CO2, duration, ranking) are computed deterministically by tested domain code first**, and the LLM only narrates those exact figures — it is never asked to invent data. Prompts enforce concrete output (exact times, ₹ costs, named members) and safety-first advice when air is severe.

---

## Tech stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind CSS 4** + **shadcn/ui** (New York)
- **GenAI**: `z-ai-web-dev-sdk` chat completions (server-side only, typed singleton + retry)
- **Live data**: [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api) (free, no key) → CPCB NAQI conversion, with a deterministic winter-smog simulation fallback if the network fails
- **Validation**: zod schemas on every POST body · **Rate limiting**: in-memory fixed-window per IP
- **Charts**: Recharts · **DB**: Prisma + SQLite · **State**: React hooks (city persisted to localStorage)

## Architecture

```
src/
├── app/
│   ├── page.tsx                  # single-page app (tab navigation)
│   └── api/
│       ├── air-quality/route.ts  # GET  live AQI snapshot (10-min cache + fallback)
│       ├── chat/route.ts         # POST context-grounded GenAI chat   [rate-limited]
│       ├── commute/route.ts      # POST deterministic route ranking + AI narration [rate-limited]
│       ├── routine/route.ts      # GET history / POST generate routine [rate-limited]
│       ├── indoor-plan/route.ts  # POST generate indoor action plan    [rate-limited]
│       └── family/[id]/route.ts  # GET/POST members, DELETE by id      [rate-limited]
├── lib/
│   ├── aqi.ts                    # pure domain logic: CPCB sub-index math,
│   │                              #   categories, advisories, sensitivity scoring,
│   │                              #   best-window finder, offline simulation
│   ├── commute.ts                # pure domain logic: zone catalogue, haversine,
│   │                              #   mode profiles, inhaled-dose + CO2 models,
│   │                              #   preference-weighted ranking
│   ├── validation.ts             # zod request schemas (single source of truth)
│   ├── rate-limit.ts             # per-IP fixed-window limiter + sweeper
│   ├── air-quality-server.ts     # Open-Meteo fetch + cache + snapshot builder
│   └── ai.ts                     # SDK singleton, prompt templates, context builders
└── components/air/               # one component per tab + gauge/markdown/types
```

### Data model (Prisma / SQLite)

- `FamilyMember` — name, ageGroup (child/teen/adult/senior), conditions
- `Routine` — generated routine with the AQI it was generated at
- `IndoorPlan` — generated plan with the home profile

## Key engineering decisions

1. **CPCB National AQI (India)** rather than US EPA — matches what users see on Indian news, with the official 6-band colour scale and advisories.
2. **Overall AQI is PM-driven**: O₃/CO use 8-hour CPCB standards but the live feed provides instantaneous model values, so they are shown *informationally* instead of letting a momentary ozone spike brand a city "Very Poor" on a smog day.
3. **Best-window finder** scans the 24h forecast for ≥2-hour stretches under descending AQI thresholds (≤100 → ≤200 → least-bad), so advice is data-driven, not generic.
4. **Deterministic-first GenAI**: commute scores, doses and emissions come from pure functions (`src/lib/commute.ts`) with published micro-environment and per-passenger-km factors; the LLM narrates but never computes. If the LLM is down, the ranking still ships.
5. **Graceful degradation**: 10-minute in-memory cache per city (60s for fallback data so live retries happen fast); deterministic diurnal-pattern simulation keeps the app fully functional offline. A `net.setDefaultAutoSelectFamily(true)` startup fix re-enables Happy Eyeballs on Node ≥ 23, where dual-stack fetches would otherwise time out in IPv6-less containers.
6. **Privacy by design**: family health data never leaves the local SQLite DB; only derived sensitivity summaries enter prompts.
7. **Defensive APIs, mirrored client and server**: every JSON POST route shares one guard (`src/lib/api.ts`) — rate limit → JSON parse → zod schema, returning a typed body or a ready error response, so routes hold only domain logic; unknown city ids get a 400 listing valid ids instead of silently serving Delhi data; all AI endpoints are rate-limited per IP (429 + `Retry-After`); upstream/LLM failures map to 502 and local failures to 500 via a single `routeError` helper; Prisma not-found errors map to 404; security headers (HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy and a full Content-Security-Policy) are set in `next.config.ts`. On the client, `src/lib/client.ts` (`postJson`/`getJson`/`deleteJson`/`userMessage`) is the single typed fetch layer every tab uses — the server's human-readable error envelope flows straight into the UI. Guard, client layer, animation math, the route handlers themselves and the full live-data pipeline (Open-Meteo fetch with retry, CPCB unit conversion, hourly trimming, per-city caching, offline fallback) all have direct tests (148 total).
8. **Lean, audited dependency tree**: the scaffold's 84 dependencies were audited against the actual import closure and cut to 33 — 33 unused shadcn/ui primitives and a dead Tailwind v3 config were deleted, every remaining Radix version is pinned, and `bun run verify` gates lint (strict first-party rules: no `any`, no unused vars, no empty blocks), a fully-strict `tsc --noEmit` and the test suite in one command.

## API quick reference

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api` | GET | Health check (service status + upstream reachability) |
| `/api/air-quality?city=delhi` | GET | Live snapshot: current AQI, pollutants, 48h hourly, best windows |
| `/api/chat` | POST | `{ city, messages[] }` → context-grounded reply |
| `/api/commute` | POST | `{ city, origin, destination, departure, preference }` → ranked options + AI narration |
| `/api/routine` | GET / POST | History / `{ city, dayType, mode }` → generated + saved routine |
| `/api/indoor-plan` | POST | `{ city, rooms, hasPurifier, hasAC, budget, cooking, notes }` → plan |
| `/api/family` | GET / POST | List / add members (sensitivity computed server-side) |
| `/api/family/{id}` | DELETE | Remove a member |

## Running locally

```bash
bun install
bun run db:push        # create SQLite schema
bun run dev            # http://localhost:3000
bun run lint           # ESLint — first-party rules enforced (0 warnings)
bun run typecheck      # tsc --noEmit (strict, no suppressed checks)
bun test              # unit tests for the domain logic
bun run test:coverage  # test suite with a line/function coverage report
bun run verify         # lint + typecheck + tests in one gate
```

No API keys required — Open-Meteo is keyless and the GenAI SDK is pre-configured.

`.github/workflows/ci.yml` runs the same gate on every push/PR — lint (with the full jsx-a11y recommended preset enforced on first-party code), strict typecheck, the test suite with coverage, and a clean-machine production build.

### Deploying

1. Push this repo to a **public** GitHub repository (keep it under 10 MB — `node_modules`, `.next`, logs and the SQLite DB are all git-ignored).
2. Deploy to any Node host (Vercel recommended): `bun run build`, then `bun run start`. Set `DATABASE_URL` to a writable SQLite path and run `bun run db:push` once.
3. Record the demo video as an unlisted YouTube video (or Drive link with open access).

## Testing

**148 tests** (`bun test`, 91.8% line / 96.4% function coverage over the tested modules — `bun run test:coverage`) cover the pure domain logic, the shared request plumbing and the route handlers end-to-end:

- **CPCB sub-index math** — exact band-boundary values for every pollutant, linear interpolation inside bands, clamping at 500, negative/NaN guards, monotonicity sweeps
- **Category bands** — all six CPCB bands inclusive of upper bounds, complete colour/advice metadata
- **City & zone catalogues** — unique ids, valid Indian coordinates, safe fallbacks, every city has zones
- **Best-window finder** — clean-stretch detection, ≥2-hour minimum, threshold fallback (≤100 → ≤200 → least-bad), best-first sorting, 3-window cap, midnight wrap
- **Sensitivity scoring** — age-group points, condition points, unknown-key tolerance, 100-point clamping, band mapping
- **Risk verdicts** — the band × air-category escalation matrix
- **Offline simulation** — determinism, diurnal winter-inversion shape (night > afternoon), plausible pollutant magnitudes
- **Commute planner** — haversine accuracy (known distances, symmetry), zone availability, mode feasibility caps (long trips exclude walk/cycle; metro needs stations at both ends), dose linearity and plausibility, CO2 factors, min-max scoring behaviour (single option scores 100; preference shifts promote zero-carbon modes over the solo car), badge assignment, sensitive-member warnings above 60 µg/m³
- **Request validation** — zod schemas reject unknown cities/enums, oversized strings, bad roles, >12-turn history; schema city list proven in sync with the app catalogue
- **Rate limiter** — allow-then-block windows, countdown, simulated-clock window reset, independent buckets, sweeper expiry, proxy-header IP extraction
- **Prompt serializers** — the snapshot→context builders that ground every GenAI prompt: what is included, 12h-vs-8h forecast truncation, and the honest fallback wording when no breathable window exists
- **Shared request plumbing** — the route guard (429 + `Retry-After`, per-IP isolation, JSON/schema rejections) and the typed client fetch layer (error-envelope propagation, non-JSON fallbacks, network wrapping) plus the count-up easing math
- **Route handlers (integration)** — every API endpoint is invoked with real `NextRequest`s against a mocked db/LLM layer: happy paths assert response shape (sensitivity computed, conditions joined, homeInfo built), guard rejections (bad enums, out-of-bounds rooms, same-zone trips), 502 LLM-failure mapping, routine history served newest-first, and the deterministic commute ranking still shipping with `narration: null` when the LLM is down
- **Live-data pipeline** — `getAirQuality` with a stubbed Open-Meteo: endpoint/parameter contract, the µg/m³→mg/m³ CO conversion, overall-AQI derivation from the in-overall drivers, null-hour skipping and 24+24 hourly trimming, the current-hour boundary case, per-city caching (no refetch, same snapshot object), one-retry-then-fallback on HTTP 500, incomplete-payload and network-failure fallbacks, and retry recovery

The strategy: everything that turns raw numbers into advice is a pure, tested function; API routes stay thin validation + orchestration layers around them.

## Accessibility

Semantic landmarks (`header`/`main`/`footer`/`nav`-style tabs), a skip-to-content link, labelled form controls, `aria-live` regions for async commute results, `role="alert"` errors, `aria-busy` loading states, visible focus rings, keyboard-operable radio/select/toggle groups (the selectable cards are real radio inputs — screen readers announce them as radios with their labels), 44px touch targets, colour-independent status (text + colour always pair), and full light/dark themes. The entire jsx-a11y "recommended" rule preset is enforced as ESLint errors in CI, so every first-party component is machine-checked against the full rule list on each build.

## Limitations & next steps

- Model-based AQI (CPCB station interpolation would be more precise) — labelled in the UI.
- Routines/plans are English-only for v1; Hindi + Hinglish output is a natural next step.
- Commute distances use straight-line × mode detour factors, not turn-by-turn routing — right for comparing modes, not for navigation.
- Planned: push notifications for severe-air mornings, wearable symptom logging.

---

*Health guidance is informational and not a substitute for medical advice.*
