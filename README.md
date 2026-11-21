# BreathEasy — Urban Air Quality Assistant

> **GenAI co-pilot that helps families beat severe winter smog** with live AQI tracking, personalised low-emission routines and room-by-room indoor air hacks.

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
| **Routines** | Generates a personalised **low-emission daily routine** (Morning / Midday / Evening / Before bed / Watch-outs) in three focus modes: *Protect my family*, *Cut our emissions*, or *Balance both*. Saved with history. |
| **Indoor Hacks** | Six proven zero/low-cost indoor interventions (CAZ box, ventilation timing, kitchen exhaust discipline…) plus an **AI-generated room-by-room indoor action plan** matched to your rooms, cooking fuel, purifier/AC and budget. |
| **Family** | Add members with age groups and health conditions (asthma, heart, COPD, pregnancy…). A transparent **0–100 sensitivity score** drives every verdict and routine. Data stays in the local database — no accounts. |

### Why it's genuinely "GenAI", not a chatbot bolted on

Every AI feature is **grounded in live context**: the server injects the current AQI, pollutant readings, the next 12-hour forecast, the computed best/worst windows, and the full family sensitivity profile into the system prompt before generation. Prompts enforce concrete output (exact times, ₹ costs, named members) and safety-first advice when air is severe.

---

## Tech stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind CSS 4** + **shadcn/ui** (New York)
- **GenAI**: `z-ai-web-dev-sdk` chat completions (server-side only, singleton + retry)
- **Live data**: [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api) (free, no key) → CPCB NAQI conversion, with a deterministic winter-smog simulation fallback if the network fails
- **Charts**: Recharts · **DB**: Prisma + SQLite · **State**: React hooks (city persisted to localStorage)

## Architecture

```
src/
├── app/
│   ├── page.tsx                  # single-page app (tab navigation)
│   └── api/
│       ├── air-quality/route.ts  # GET  live AQI snapshot (10-min cache + fallback)
│       ├── chat/route.ts         # POST context-grounded GenAI chat
│       ├── routine/route.ts      # GET history / POST generate routine
│       ├── indoor-plan/route.ts  # POST generate indoor action plan
│       └── family/[id]/route.ts  # GET/POST members, DELETE by id
├── lib/
│   ├── aqi.ts                    # pure domain logic: CPCB sub-index math,
│   │                             #   categories, advisories, sensitivity scoring,
│   │                             #   best-window finder, offline simulation
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
4. **Graceful degradation**: 10-minute in-memory cache per city (60s for fallback data so live retries happen fast); deterministic diurnal-pattern simulation keeps the app fully functional offline. A `net.setDefaultAutoSelectFamily(true)` startup fix re-enables Happy Eyeballs on Node ≥ 23, where dual-stack fetches would otherwise time out in IPv6-less containers.
5. **Privacy by design**: family health data never leaves the local SQLite DB; only derived sensitivity summaries enter prompts.

## API quick reference

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/air-quality?city=delhi` | GET | Live snapshot: current AQI, pollutants, 48h hourly, best windows |
| `/api/chat` | POST | `{ city, messages[] }` → context-grounded reply |
| `/api/routine` | GET / POST | History / `{ city, dayType, mode }` → generated + saved routine |
| `/api/indoor-plan` | POST | `{ city, rooms, hasPurifier, hasAC, budget, cooking, notes }` → plan |
| `/api/family` | GET / POST | List / add members (sensitivity computed server-side) |
| `/api/family/{id}` | DELETE | Remove a member |

## Running locally

```bash
bun install
bun run db:push        # create SQLite schema
bun run dev            # http://localhost:3000
bun run lint           # ESLint (clean)
bun test               # unit tests for the domain logic
```

No API keys required — Open-Meteo is keyless and the GenAI SDK is pre-configured.

## Testing

29 unit tests (`src/lib/aqi.test.ts`, `bun test`) cover the pure domain logic that everything else builds on:

- **CPCB sub-index math** — exact band-boundary values for every pollutant, linear interpolation inside bands, clamping at 500, negative/NaN guards, monotonicity sweeps
- **Category bands** — all six CPCB bands inclusive of upper bounds, complete colour/advice metadata
- **City catalogue** — unique ids, valid Indian coordinates, safe fallback for unknown ids
- **Best-window finder** — clean-stretch detection, ≥2-hour minimum, threshold fallback (≤100 → ≤200 → least-bad), best-first sorting, 3-window cap, midnight wrap
- **Sensitivity scoring** — age-group points, condition points, unknown-key tolerance, 100-point clamping, band mapping
- **Risk verdicts** — the band × air-category escalation matrix
- **Offline simulation** — determinism, diurnal winter-inversion shape (night > afternoon), plausible pollutant magnitudes

The strategy: everything that turns raw numbers into advice is a pure, tested function; API routes stay thin validation + orchestration layers around them.

## Limitations & next steps

- Model-based AQI (CPCB station interpolation would be more precise) — labelled in the UI.
- Routines/plans are English-only for v1; Hindi + Hinglish output is a natural next step.
- Planned: push notifications for severe-air mornings, school-run planner, wearable symptom logging.

---

*Health guidance is informational and not a substitute for medical advice.*
