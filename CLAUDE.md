# iCondo Tennis Court Auto-Booker — Project Memory

This file is auto-loaded at the start of every session. It survives context
resets. If the user says "reset context window," a fresh session will read this
and have the full picture. Keep it updated when architecture changes.

## What this is
A bot that auto-books a tennis court (Sky@eleven condo) via iCondo's
reverse-engineered mobile API. A booking window opens at **midnight SGT exactly
7 days before** the target play date. The bot queues a booking, then a cron
fires at midnight SGT and burst-books the instant the window opens.

## Repo / deploy
- GitHub: `icondbot/swiawdwa13123` (private, intentionally random name).
- Hosted on Render, config in `render.yaml`. Three services + one DB:
  1. `icondo-booker` (web) — Express API + React UI. Start: `dist/index.mjs`.
  2. `keep-alive-ping` (cron, */10 min) — pings `/api/healthz` so web doesn't hibernate.
  3. `icondo-midnight-booker` (cron, `57 15 * * *` = **23:57 SGT daily**) — Start: `dist/cron-entry.mjs`.
     Starts 3 min early on purpose: it cold-starts + connects to the DB, then
     `cron-entry.ts` waits until exactly 16:00:00 UTC (00:00 SGT) and fires the
     burst at that instant — avoids the ~25s cold-start delay that made it miss slots.
  4. `icondo-db` — Postgres.
- Monorepo, pnpm workspaces: `@workspace/api-server`, `@workspace/icondo-booker`,
  `@workspace/db`, `@workspace/api-zod`, `@workspace/api-client-react`.

## CRITICAL build gotchas (these caused real outages)
- **api-server is built by esbuild (`build.mjs`), NOT tsc.** Types are stripped,
  never type-checked. `noEmitOnError` does nothing here. A wrong function-arg
  count will NOT fail the build.
- **Every server entry point MUST be listed in `build.mjs` `entryPoints`.**
  `src/index.ts` AND `src/cron-entry.ts` are both required. If cron-entry isn't
  an entry point, `dist/cron-entry.mjs` is never emitted and the cron crashes at
  startup → no bookings. (This was THE bug that stopped nightly booking.)
- **Frontend is built by `vite build`, NOT tsc.** No type-check at deploy. Vite
  tree-shakes, so unrouted files (not imported from App.tsx) are excluded.
- **`pnpm install --frozen-lockfile`** is used. Do NOT edit any `package.json`
  `dependencies` without regenerating `pnpm-lock.yaml`, or the install fails.
  (`node-cron` is an unused leftover dep — leave it; removing it needs a lockfile update.)

## Timezone rules (Singapore, UTC+8) — get these right
- Cron `57 15 * * *` = 15:57 UTC = 23:57 SGT. Starts 3 min early to pre-warm,
  then cron-entry.ts sleeps until 16:00:00 UTC (00:00 SGT) and fires. Runs every
  night (must be daily — the 7-day window can open on any weekday).
- `burstBook(..., { keepRetryingOnUnavailable })`: cron passes `true` so a
  momentary "not available" at the boundary (iCondo clock skew) keeps retrying;
  the UI's on-demand book passes `false` (window already open → "not available"
  means taken → stop fast). Don't flip these.
- Server date math uses `sgtParts()` in `scheduler.ts` — always derive "today"
  in SGT, never server local time.
- Window-open check: window opens 7 days before target at midnight SGT. The
  comparison in `isWindowOpen()` works because both sides use UTC-midnight and
  the cron fires at the SGT day boundary.
- Frontend date inputs must use SGT for `min`: `new Date().toLocaleDateString("sv", { timeZone: "Asia/Singapore" })` — NOT `toISOString()` (that's UTC and shows yesterday for 8 h/night).

## Auth layers
- `APP_PASSWORD` — UI login (SHA-256 hashed session cookie; cleared on browser close). `/api/healthz` stays public for keep-alive.
- `API_SECRET` — bearer token for `/api/*`, injected into the page as `window.__API_SECRET__`.
- `ICONDO_TOKEN` — long-lived bearer for iCondo's API (expires ~2028).

## Required env vars (set in Render, `sync: false`)
Web: `API_SECRET`, `APP_PASSWORD`, `ICONDO_TOKEN`, `DATABASE_URL`, `PORT=10000`.
Cron: `ICONDO_TOKEN`, `DATABASE_URL`, `NODE_ENV=production`.
- **DATABASE_URL region caveat:** `fromDatabase` gives the INTERNAL URL, which
  only works if the service and DB are in the SAME Render region/account. If the
  real DB lives in a different region/account than the cron, set DATABASE_URL
  manually to the **External** URL instead. (This bit us before.)
- DB pool (`lib/db/src/index.ts`) enables SSL when NODE_ENV=production or URL
  contains render.com, with `rejectUnauthorized:false`.

## How booking works (code: `artifacts/api-server/src/lib/scheduler.ts`)
- `attemptBooking()` — if window open, burst-book now; else insert a `pending` row.
- `checkAndBookOpenSlots()` — cron entry calls this; processes every `pending`
  row whose window is now open: deletes the pending row, then `burstBook()`.
- `burstBook()` — retries every 300 ms for 30 s, writes exactly ONE result row
  (`success`/`failed`). Auto-booking was removed — only user-queued bookings run.
- iCondo flow: GET slots-available → POST booking/validate → POST booking.

## UI (frontend)
- Only two routes: `/` (dashboard = book + history + delete) and `/settings`.
- Dashboard: pick date + time slot → "Book / Queue". History has
  All/Queued/Booked/Failed filters and per-row delete (with confirm dialog).

## Working agreements with the user
- The user deploys via GitHub → Render; I make code changes and push.
- I can't run node/pnpm/tsc on their Windows machine (not installed), so I can't
  do a live compile — verify by careful review + reasoning about esbuild/vite.
- Confirm before any destructive or irreversible action.
