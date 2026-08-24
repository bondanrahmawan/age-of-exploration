# Age of Exploration — local base game

This repository contains the deterministic TypeScript simulation and the WP5
browser-local player application. The game uses no remote server, account,
telemetry, remote map, or runtime network service.

## Play on Windows

Install Node.js 22, then double-click:

```text
play.cmd
```

That single launcher installs or refreshes repository dependencies when needed,
builds the ordinary production game when its inputs change, starts its
app-identified local-only web server, and opens the game in the default browser.
Keep the launcher window open while playing; close it or press Ctrl+C to stop
the game. Campaign saves remain in that browser's local storage.

Repeated launches reuse the current build. An older Age of Exploration server
or another application on the fixed save-preserving port is reported without
opening the wrong page or starting a duplicate process.

The launcher uses an installed pnpm command when available and otherwise tries
the pnpm version supplied through Corepack.

## Developer server

Requirements: Node.js 22 and pnpm.

```powershell
pnpm install
pnpm dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). An
invalid or incompatible save is reported and retained until the player
explicitly starts fresh.

## Build and test

```powershell
pnpm typecheck
pnpm test
pnpm test:launcher
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
