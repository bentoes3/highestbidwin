# Highest Bid Wins! — Football & Basketball

The multi-sport update was approved for publication on September 21, 2026. Basketball uses original, unofficial ratings; see the [rating methodology](docs/BASKETBALL-RATINGS.md). Approval does not change the data's provenance or imply official licensing.


The local two-player game runs in the browser from `dist/`. Online friend rooms use the same game rules through a Cloudflare Pages Function and a D1 database. The server controls the player draw, bids and results, so neither device can advance the other player's turn. No framework or third-party JavaScript dependency is required.

## Local development

Use Node.js 22 or newer. No dependency installation is needed.

```sh
npm run dev
```

Open `http://127.0.0.1:4173`. Edit the files in `dist/` and refresh. This local server serves static files only; online rooms need the D1-backed Pages Function and will not work through `npm run dev` or `npm run preview` alone.

## Production build

```sh
npm run build
npm test
npm run preview
```

The build checks JavaScript syntax, required assets, local paths and online/offline player-pool parity. The static UI does not need compilation; `dist/` is its production output. Preview serves those exact files. `PORT=8080 npm run preview` selects another port. When either browser player dataset changes, run `npm run sync:online-pools` to regenerate `functions/_shared/player-pools.mjs`; build and tests fail until the copies match.

## Deploy with GitHub → Cloudflare Pages

1. Create a GitHub repository and upload this project's clean source files. A private repository is fine. Do not upload local archives, `.git/`, `work/`, `outputs/`, `.openai/` or any secrets.
2. In Cloudflare, open **Workers & Pages → Create application → Pages → Connect to Git**. Connect GitHub and select that repository.
3. Set production branch to `main`, framework preset to **None**, build command to `npm run build`, and build output directory to `dist`. Leave root directory blank. Node 22 is selected by `.node-version`.
4. For online rooms, create a D1 database in the Cloudflare dashboard. In the Pages project, open **Settings → Bindings → Add → D1 database**, select that database and name the binding exactly `ROOMS_DB`. Redeploy after adding the binding. The Pages Function creates its `rooms` table and expiry index on first use. Without this binding, the static local game still works, while the online API responds that rooms are unavailable.
5. Deploy using the free plan and the generated `*.pages.dev` URL. No paid domain or paid service is required. Future pushes to `main` deploy automatically.

The sport selector is at `/`, with static directory pages at `/football` and `/basketball`. Each edition's game screens and dialogs stay on its URL. Direct navigation and refresh work through directory index files; no SPA redirect is needed. A refresh starts a new local game; an online room can resume from that browser's session until it expires. `_headers` tells browsers to revalidate files after deployments.

## Online rooms

One player creates a six-character code and sends the code or invite link to a friend. The second player joins from another device. Each browser receives its own private player token, stored only in session storage. The room API in `functions/api/room.js` validates turns and applies the shared rules in `online/engine.mjs`; both devices poll for changes during play. D1 keeps the authoritative state with version checks so simultaneous actions cannot overwrite one another. Rooms expire three hours after creation or the last accepted move, and expired rooms are cleared when new ones are created.

For a local online-room preview, use Cloudflare's Wrangler Pages development server with a local D1 binding, for example `npx wrangler pages dev dist --d1 ROOMS_DB=YOUR_DATABASE_ID` (replace `YOUR_DATABASE_ID` with the database ID). The plain `npm run dev` server does not execute Pages Functions. The current Pages project must have its D1 binding configured before online play can run on the live site.

The page has title, description, favicon, viewport, theme color and text social metadata. There is no social preview image. Google Fonts is optional at runtime; local fallback fonts are specified. Commercial reuse rights for the existing player ratings have not been established by the deployment work.
