# FestFlow

A frontend-only campus event layout and queue simulator. Built with React, Vite, TypeScript, Tailwind CSS v4, and an interactive SVG venue map. Everything runs locally in the browser; no backend, AI API, account, analytics, or API keys are needed.

## Run locally

Use Node.js 22.12+ (Node 24 recommended) and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite (normally http://127.0.0.1:5173). To check the production bundle:

```sh
npm test
npm run build
npm run preview
```

After installing dependencies, development and simulation work without internet. All fonts and icons are local/system assets; the app makes no runtime API calls.

The delivered `FestFlow.html` file beside the project is a self-contained offline build. Open it in a modern browser directly, with no installation or server. Recreate it with `npm run build:offline`. Some browsers restrict storage on `file:` URLs; if saving is blocked, use the local server or a static deployment for reliable persistence.

## Explore the app

- The ready-to-run **Campus Fest Rush** scenario has Taco Town, Slice Society, The Cool Club, and a registration desk on a sample North Lawn venue.
- Drag stalls or the main entrance/exit. Select a stall to change its parallel counters (1–5). Keyboard users can Tab to a map item and use arrow keys to move it by 5 map units, or Shift + arrows for 20 units.
- Adjust visitor arrival rate (6–60/min), simulation duration (5–30 min), and service speed (0.5–2×).
- Start, pause, resume, reset, replay, or scrub the timeline. Playback speed (1, 5, 10, 30, 60×) changes wall-clock playback only, not event calculations. The default is 10×.
- Visitors walk to a destination, wait in an actual FIFO queue, receive service, and leave through the entrance. The legend identifies each animated state. Queue badges and statistics reflect the simulation clock.
- Changes to geometry, counters, or simulation conditions reset the current run. Pausing, scrubbing, zooming, and selecting do not modify the scenario.
- Save the current geometry and counters into slot A or B. The two defaults are preloaded even before saving. **A little more flow**, the alternate, adds a counter at the taco and pizza stalls and changes their positions.
- Open **Saved layouts** to load either configuration back into the workspace. Saving replaces only the selected slot. Geometry, name, and counters are persisted in browser `localStorage` under `festflow.configurations.v1`. Shared demand settings are intentionally session settings, applied equally to both layouts. Playback state is not persisted.
- **Compare layouts** computes both complete runs immediately, using one shared visitor schedule. Changes to shared conditions refresh both results together. Editing an unsaved layout does not change comparison slots until it is saved.
- **Export report** opens a detailed comparison, including conditions, layout maps, positions, counters, calculated metrics, and assumptions. Download a standalone HTML report or use **Print / Save PDF**. In the browser print dialog, select a printer or Save as PDF. The HTML report is also printable offline.

Storage failures show a message and keep layouts usable for the session. Invalid saved data falls back to the sample layouts. Storage is per browser/origin and can be cleared by the browser; the app does not sync across devices.

## Simulation assumptions

This is a **simplified simulation using sample data**, intended for student planning and experimentation.

### Demand and fair comparison

A seeded Mulberry32 pseudorandom generator (seed 2026) generates exponentially distributed interarrival times: `-ln(1-u) × 60 / arrivalRate`. Arrivals continue until the specified cutoff. The selected rate is an expected Poisson rate, not an exact visitor count. Changing duration preserves the initial arrival sequence; changing speed or geometry never changes demand.

Each visitor chooses exactly one destination, independently: Taco Town 32%, Slice Society 30%, The Cool Club 22%, Registration 16%. Registration is an optional destination rather than a compulsory first stop. A uniform service factor in [0.8, 1.2) is generated for each visitor in the same arrival stream. Both compared configurations receive **the exact same arrival records**, including destination and service factor. No dashboard metric is randomly generated.

### Walking and service

- The 920 × 550 map uses 0.2 meters per SVG unit. Distances are Euclidean, from the entrance to the destination center. Walk speed is 1.25 m/s. Each visitor exits by walking the same distance back.
- Paths are straight lines and do not avoid buildings, grass, people, or other stalls. Animated bodies, queue spacing, and service positions are illustrative; endpoint scheduling uses the calculated center-to-center distances.
- Baseline service times are Taco Town 18s, Slice Society 24s, Cool Club 20s, Registration 12s. Actual service time is `base × seeded factor / shared service speed`.
- Visitors enter a first-in, first-out queue on reaching a destination. The next available counter serves the next visitor; ties choose the lower counter index. Counters work independently with no breaks.
- The engine precomputes exact queue-arrival, service-start, service-end, and exit timestamps. Playback only samples those events. Adding counters changes actual service capacity. Moving stalls or the entrance changes walking distance, queue arrival, and completion times.
- Arrivals and measurement stop at the chosen simulation duration. **There is no drain period.** Visitors still walking, waiting, or in service at that moment remain unserved in the report.

### Metric definitions

| Metric | Calculation |
| --- | --- |
| Visitors served | Number with service-end time at or before the sampled clock/cutoff |
| Average waiting time | Mean `service start − queue arrival` for completed visitors only; excludes walking and service |
| Longest queue | Maximum waiting visitors at any single destination, measured over its queue-entry/exit event history up to the clock |
| Busiest stall | Highest counter utilization: busy counter-seconds / (counter count × elapsed seconds) |
| In queue | Visitors whose queue-arrival time has passed but service has not started |
| Average walk | Mean one-way entrance-to-destination distance among entered visitors |
| On site | Visitors entered but not yet returned to the exit; includes service-complete visitors walking out |
| Not yet served | Entered visitors whose service is not yet completed |

An empty run shows zero metrics and no busiest stall. Peak queue excludes visitors already being served. At simultaneous queue events, departures are processed before arrivals. Wait averages can be biased toward completed, faster visits when many visitors remain unserved; compare served and unfinished counts alongside the mean. Adding counters can change which visitors complete by cutoff, so aggregate mean waits need not improve for every arbitrary setup.

The model excludes group behavior, arrival surges, mandatory registration, congestion, route barriers, queue abandonment, equipment failures, and crowd-safety constraints. It is not an operational forecast or a safety assessment.

## Verification

`npm test` runs ten deterministic Node tests through `tsx`. They cover exact FIFO timing and wait calculations; parallel-counter capacity and absence of double booking; geometry and entrance movement; service-speed effects; identical demand in comparisons; reproducibility; historical queue peaks and cutoff accounting; visitor animation states; empty demand; and persistence, corruption, and storage failure recovery. A React DOM integration test also exercises map pointer/keyboard movement, counters, all three conditions, playback/pause/reset/scrubbing/speed, save/load across remounts, comparison, report HTML export, and the print action. DOM tests use Happy DOM; SVG coordinate transforms and browser printing are mocked. They do not replace a real browser rendering check.

The event engine is in `src/simulation.ts`, separate from React playback. Persistence is in `src/storage.ts`; the UI is in `src/main.tsx`. CSS includes mobile layouts, keyboard focus states, reduced-motion support, and report print styling. No server is part of the app.

## Deploy to Vercel from GitHub

```sh
npm ci
npm test
npm run build
```

GitHub stores the source; **Vercel hosts the live website**. This project does not use GitHub Pages.

1. Push the project root (the directory with `package.json` and `vercel.json`) to a GitHub repository. Exclude `node_modules`, `dist`, `.vercel`, and local credentials.
2. Sign in to Vercel, choose **Add New → Project**, and import that GitHub repository. Grant Vercel access to this repository if prompted.
3. Use the **Vite** preset and the repository root as the root directory. Use Node **24.x**, as declared in `package.json`.
4. `vercel.json` sets installation to `npm ci`, production build to `npm test && npm run build`, and output to `dist`. Leave these settings intact so deployment fails if tests or TypeScript fail.
5. Deploy, then open the production `*.vercel.app` URL. Future pushes to the production branch trigger Vercel deployments through the GitHub integration.

Keep Vite's default `/` base. There are no environment variables, backend services, or server/API routes. All views use React state, so no SPA rewrite is required. `.vercel` contains local project linkage and is ignored. Any `.openai/hosting.json` file is historical local metadata, ignored by this deployment; do not publish it to the GitHub repository.

For CLI deployment after signing in with the official Vercel CLI, run `vercel --prod` from the project root. Select the same Vercel project rather than creating a second one. Prefer GitHub import for automatic deployments on future pushes.

Browser storage remains tied to the deployed origin. Moving from localhost to a deployed host starts with the sample configurations; local saved configurations are not transferred automatically. Never commit `node_modules/` or credentials.
