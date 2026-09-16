# Highest Bid Wins! — Football Edition

A static, client-side football auction game. The authored production files live in `dist/`; no framework, backend, environment variables or third-party JavaScript dependencies are required.

## Local development

Use Node.js 22 or newer. No dependency installation is needed.

```sh
npm run dev
```

Open `http://127.0.0.1:4173`. Edit the files in `dist/` and refresh.

## Production build

```sh
npm run build
npm run preview
```

The build checks JavaScript syntax, required assets and local paths. The site is already static, so it does not need compilation; `dist/` is the production output. Preview serves those exact files. `PORT=8080 npm run preview` selects another port.

## Deploy with GitHub → Cloudflare Pages

1. Create a GitHub repository and upload this project's clean source files. A private repository is fine. Do not upload local archives, `.git/`, `work/`, `outputs/`, `.openai/` or any secrets.
2. In Cloudflare, open **Workers & Pages → Create application → Pages → Connect to Git**. Connect GitHub and select that repository.
3. Set production branch to `main`, framework preset to **None**, build command to `npm run build`, and build output directory to `dist`. Leave root directory blank. Node 22 is selected by `.node-version`; no environment variables are needed.
4. Deploy using the free plan and the generated `*.pages.dev` URL. No paid domain or paid service is required. Future pushes to `main` deploy automatically.

There is one route (`/`). Game screens and dialogs do not change the URL, so no custom SPA redirect is needed. A refresh starts a new game by design. `_headers` tells browsers to revalidate files after deployments.

The page has title, description, favicon, viewport, theme color and text social metadata. There is no social preview image. Google Fonts is optional at runtime; local fallback fonts are specified. Commercial reuse rights for the existing player ratings have not been established by the deployment work.
