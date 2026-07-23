# Noha Directory · فہرستِ نوحہ

A dignified, manuscript-style web app for storing and reciting **noha** — replacing a
hard-to-maintain Word document. Readers browse, search, and recite; a small trusted team of
editors adds/edits nohas and manages occasions behind a shared passcode.

- **Urdu-first**: right-to-left Nastaliq rendering everywhere (Noto Nastaliq Urdu), optional Roman transliteration.
- **Text or image nohas**: typed lyrics, uploaded scan images, or both.
- **Installable PWA**: works offline for reading and reciting — built for majlis where signal is poor.

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | React + Vite (TypeScript) → **Cloudflare Pages** |
| API | Cloudflare **Worker** (TypeScript) |
| Database | Cloudflare **D1** (SQLite) |
| Image storage | Cloudflare **R2** |
| Styling | Plain CSS |
| PWA | `vite-plugin-pwa` (Workbox) |

No secrets ever live in the frontend — the editor passcode is a Worker secret.

## Consistent names (used across every file)

Keep these identical or things won't wire up:

| Thing | Value |
|-------|-------|
| Worker name | `noha-directory-api` |
| D1 database | `noha-directory` |
| R2 bucket | `noha-images` |
| Editor secret | `EDITOR_KEY` |
| Frontend API base env var | `VITE_API_BASE` |

## Repo layout

> **Two Workers, two configs.** The frontend and API deploy independently:
> - **`wrangler.jsonc`** (root) — the **site**: a Worker that serves the built `dist/` as static
>   assets. Deployed by the Git-connected project (`npx wrangler deploy`).
> - **`worker/wrangler.toml`** — the **API**: the D1/R2-bound Worker. Deployed on its own with
>   `npm run worker:deploy` (all `worker:*` / `db:*` scripts pass `-c worker/wrangler.toml`).
>
> They never interfere because each deploy targets its config explicitly.

```
.
├── wrangler.jsonc         # FRONTEND: serves dist/ as a Worker (Static Assets)
├── worker/
│   ├── wrangler.toml      # API: D1 + R2 bindings
│   ├── .dev.vars.example  # local EDITOR_KEY for `wrangler dev`
│   └── src/index.ts       # the entire API (/api/* and /img/*)
├── schema.sql             # D1 schema + seed occasions & themes
├── index.html             # PWA meta tags, fonts
├── vite.config.ts         # PWA manifest + Workbox caching strategy
├── src/                   # React frontend
│   ├── api.ts             # API client (attaches X-Editor-Key on writes)
│   ├── editor.ts          # the single "am I an editor?" module (swap point)
│   ├── pages/             # Fihrist, Recite, EditNoha, ManageOccasions, Backup
│   └── components/        # OfflineIndicator, InstallButton, Lightbox, states
├── scripts/gen-icons.mjs  # generates placeholder PWA icons into public/
└── public/                # icons, favicon, _redirects (SPA fallback)
```

---

## First-time setup (commands you run yourself)

You need a Cloudflare account. `npx wrangler ...` works without a global install.

```bash
# 0. Install dependencies
npm install

# 1. Log in to Cloudflare
npx wrangler login

# 2. Create the R2 bucket for images
npx wrangler r2 bucket create noha-images

# 3. Create the D1 database, then paste the printed database_id into worker/wrangler.toml
npx wrangler d1 create noha-directory
#   -> copy "database_id = ..." into worker/wrangler.toml under [[d1_databases]]

# 4. Apply the schema + seed data to the REMOTE database
npm run db:apply:remote

# 5. Set the editor passcode (a Worker secret — never in the frontend)
npm run worker:secret
#   -> type the shared passcode when prompted

# 6. Deploy the Worker (the API)
npm run worker:deploy
#   -> note the printed URL, e.g. https://noha-directory-api.YOUR-SUBDOMAIN.workers.dev
```

### Lock down CORS (recommended)

`ALLOWED_ORIGINS` in `worker/wrangler.toml` defaults to `*`. Once your Pages site has a URL, set
it to your real origins and redeploy the Worker (`npm run worker:deploy`), e.g.:

```toml
[vars]
ALLOWED_ORIGINS = "https://noha-directory.pages.dev,https://your-custom-domain"
```

## Deploy the frontend (Workers Static Assets, Git auto-deploy)

The frontend deploys as its own Worker that serves the built `dist/` folder (config in the root
`wrangler.jsonc`). A Git-connected **Workers** project builds and deploys it on every push.

1. Push this repo to GitHub/GitLab.
2. Cloudflare dashboard → **Workers & Pages → Create → Workers → Import a repository** → pick the repo.
3. In the project's **Settings → Builds**:
   - **Build command**: `npm run build`
   - **Deploy command**: `npx wrangler deploy` (the default — reads root `wrangler.jsonc`)
   - **Root directory**: `/`
4. **Settings → Variables and Secrets** (build/runtime) → add:
   - `VITE_API_BASE` = your API Worker URL (e.g. `https://noha-directory-api.YOUR-SUBDOMAIN.workers.dev`)
5. Save and trigger a deploy (push a commit, or **Deployments → Retry**). The site is served at
   the project's `*.workers.dev` URL (or attach a custom domain).

`VITE_API_BASE` is read at **build time**, so after changing it you must rebuild (push or retry).
The root `wrangler.jsonc` sets `not_found_handling: "single-page-application"`, so deep links like
`/noha/<id>` serve the app shell and client routing takes over.

> Prefer classic **Cloudflare Pages** instead? It also works: delete the root `wrangler.jsonc`,
> create a **Pages** project (Connect to Git), framework **Vite**, build `npm run build`, output
> `dist`, and set `VITE_API_BASE`. The `public/_redirects` file provides the SPA fallback there.

---

## Local development

Two processes: the Worker (API) and the Vite dev server (frontend).

```bash
# --- Worker ---
cp worker/.dev.vars.example worker/.dev.vars   # set a local EDITOR_KEY (gitignored)
npm run db:apply:local                  # apply schema to the LOCAL D1
npm run worker:dev                       # -> http://127.0.0.1:8787

# --- Frontend (new terminal) ---
cp .env.example .env                    # VITE_API_BASE=http://127.0.0.1:8787
npm run dev                              # -> http://localhost:5173
```

> The PWA service worker is disabled in dev (`devOptions.enabled: false`) so it never
> interferes with hot reload. Test PWA/offline behaviour against a production build:
> `npm run build && npm run preview`.

### Regenerate placeholder icons

`public/*.png` are generated, dependency-free placeholders (deep-green + gold emblem). Replace
them with real artwork any time, or regenerate:

```bash
npm run gen-icons
```

---

## Migrating from the prototype

The old prototype exports a JSON **array** of noha objects with a `category` field. Import it
directly:

1. Open the app → **Editor** (enter passcode) → **Backup**.
2. Choose **Merge**, then **Choose JSON file to import**, and pick the prototype export.

On import, each `category` becomes an occasion (created if missing), `themes[]` become theme rows,
and every noha is created. The same screen also imports full backups produced by this app.

---

## API reference

Base URL = the Worker (`VITE_API_BASE`). Reads are public; writes require the
`X-Editor-Key: <passcode>` header (else `401`).

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/occasions` | ordered by `sort_order` |
| POST | `/api/occasions` | `{name}` |
| PATCH | `/api/occasions/:id` | `{name?, sort_order?}` |
| DELETE | `/api/occasions/:id` | nohas keep `occasion_id = null` |
| GET | `/api/nohas` | filters: `?q=&occasion=&theme=` |
| GET | `/api/nohas/:id` | includes images + themes |
| POST | `/api/nohas` | body incl. `themes: string[]` (names) |
| PATCH | `/api/nohas/:id` | partial update; `themes` replaces links |
| DELETE | `/api/nohas/:id` | cascades images (R2 + rows) + theme links |
| GET | `/api/themes` | list |
| POST | `/api/themes` | `{name}` |
| POST | `/api/nohas/:id/images` | multipart `file`, `image/*`, ≤ 8 MB |
| PATCH | `/api/images/:id` | `{sort_order}` (reordering) |
| DELETE | `/api/images/:id` | removes from R2 + row |
| GET | `/img/:key` | public image proxy, long cache |
| GET | `/api/export` | full directory as JSON backup |
| POST | `/api/import` | restore/merge; `?mode=merge\|replace` |

**Search** (`?q=`) matches `title_ur`, `title_ro`, `poet`, `reciter`, `lyrics_ur`, `lyrics_ro`,
and theme names — case-insensitive.

### Swap points (for later)

- **Auth**: everything editor-related lives in `src/editor.ts` (frontend) and `isEditor()` in
  `worker/src/index.ts`. Replace with Cloudflare Access / real logins without touching any screen.
- **Image serving**: to move from the private `/img/:key` proxy to a public R2 custom domain,
  change how image URLs are built (see `imageUrl()` in the Worker) — it's isolated in one place.

## Data model

See [`schema.sql`](./schema.sql). Tables: `occasions`, `nohas`, `noha_images`, `themes`,
`noha_themes`. A noha with rows in `noha_images` is an image noha; it may also have typed lyrics.
Themes are shared and reusable across occasions.

## Offline behaviour (PWA)

- App shell + assets are **precached**.
- `GET /api/*` uses **NetworkFirst** → cache fallback, so the fihrist and search open offline after one online visit.
- `GET /img/*` uses **CacheFirst**, so any scan a reciter has already opened stays available offline.
- A small bar shows when offline; write actions (add/edit/upload/manage/import) are disabled with a clear message.
- Install: Android shows a custom **Install app** button; iOS Safari uses **Add to Home Screen** (clean standalone launch via the apple-touch-icon + meta tags).
