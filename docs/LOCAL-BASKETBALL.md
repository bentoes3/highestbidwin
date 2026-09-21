# Local multi-sport preview

Historical local-development notes. The user explicitly approved publishing this update on September 21, 2026. The earlier local-only restriction is superseded by that approval.

## Architecture

Existing site: authored static HTML/CSS/JS in `dist`, one URL `/` with in-page mode selection, auctions and results. No backend, router library or package dependencies. Budgets, three solo skips, shuffled candidate decks, weighted goalkeeper draws, random unclaimed free signings and maximum-rating lineup search were inspected before changes.

New root `/` is a static sport selector. `/football` and `/basketball` each load their own HTML page. The local server accepts both slash variants and normal `.html` paths; absolute asset paths make direct navigation and refresh work. Game refresh intentionally starts over.

Football's `game.js`, `players.js` and `style.css` are byte-for-byte unchanged from this task's baseline; hashes are tested. The prior Football HTML moved to `dist/football/index.html`, with absolute asset paths, an edition-local home link and a new Choose game link. Its existing goalkeeper-weighted random selection is deliberately preserved despite the request's description of Football as “equal randomness.” Basketball alone uses equal draws.

Basketball has its own `game.js` adapted from the proven auction flow, and its own `players.js`. This intentional small duplication avoids changing the working Football engine. Shared presentation uses `/style.css` and the new navigation styles. Basketball overrides semantic CSS variables through `/basketball/theme.css`; Football keeps its lime/olive, blue and coral identity, Basketball uses burnt orange/burgundy/cream/charcoal. The root selector shows both identities with original CSS pitch/court lines.

Both editions retain $20 per manager, five final signings, alternating auction openers after a fair toss, unlimited competitive passes and three solo skips once the opponent is broke/full. Free picks wait until paid bidding ends and are individually revealed. Basketball scoring uses PG/SG/SF/PF/C and position-distance penalties. There is no account system, payment, multiplayer service or new external runtime dependency.

## Run locally

Use Node 22+; no dependency installation is required.

```
npm run build
npm test
PORT=4174 npm run preview
```

Open http://127.0.0.1:4174. Port 4174 avoids interfering with an already-running earlier preview. Only loopback is bound; this does not host the site publicly.

## Files and data

- Root selector: `dist/index.html`, `dist/selector.css`.
- Football integration: `dist/football/index.html` only; original engine, data and theme untouched.
- Shared cross-sport navigation: `dist/navigation.css`.
- Basketball: `dist/basketball/index.html`, `game.js`, `players.js`, `theme.css`.
- Local server/build updated for nested static routes; test suite under `tests`.
- 100 Current and 100 All-Time basketball players; see `BASKETBALL-RATINGS.md` for per-record source and exact synthetic rating formula.

No photographs, generated player likenesses, team/league logos, uniforms or scraped artwork were added. New decoration is CSS geometry. Basketball source and commercial branding review remain required before release.

No GitHub write, production merge, hosting operation or DNS change is part of this work. Existing `.openai/hosting.json` and production hosting settings are not modified.
