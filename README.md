# Age of Exploration — local base game

This repository contains the deterministic TypeScript simulation and the WP5
browser-local player application. The game uses no server, account, telemetry,
remote map, or runtime network service.

## Run locally

Requirements: Node.js 22 and pnpm.

```powershell
pnpm install
pnpm dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). Campaign
saves remain in that browser's local storage. An invalid or incompatible save
is reported and retained until the player explicitly starts fresh.

## Build and test

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm test:ui
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm build:engine` builds only the pure headless package. `pnpm build:app`
builds the local browser application to the ignored `app-dist/` directory.
The fixture and catalogue scripts build only the engine before running.

See `docs/wp5-player-facing-base-game.md` for architecture and
`docs/wp5-acceptance.md` for the honest §34.15 gate matrix.
