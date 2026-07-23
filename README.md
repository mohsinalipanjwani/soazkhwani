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

```
.
├── wrangler.toml          # Worker config: D1 + R2 bindings
├── schema.sql             # D1 schema + seed occasions & themes
├── worker/src/index.ts    # the entire API (/api/* and /img/*)
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

# 3. Create the D1 database, then paste the printed database_id into wrangler.toml
npx wrangler d1 create noha-directory
#   -> copy "database_id = ..." into wrangler.toml under [[d1_databases]]

# 4. Apply the schema + seed data to the REMOTE database
npx wrangler d1 execute noha-directory --remote --file=./schema.sql

# 5. Set the editor passcode (a Worker secret — never in the frontend)
npx wrangler secret put EDITOR_KEY
#   -> type the shared passcode when prompted

# 6. Deploy the Worker (the API)
npx wrangler deploy
#   -> note the printed URL, e.g. https://noha-directory-api.YOUR-SUBDOMAIN.workers.dev
```

### Lock down CORS (recommended)

`ALLOWED_ORIGINS` in `wrangler.toml` defaults to `*`. Once your Pages site has a URL, set it to
your real origins and redeploy the Worker, e.g.:

```toml
[vars]
ALLOWED_ORIGINS = "https://noha-directory.pages.dev,https://your-custom-domain"
```

## Deploy the frontend to Cloudflare Pages

1. Push this repo to GitHub/GitLab.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick the repo.
3. Build settings:
   - **Framework preset**: Vite
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. **Environment variable** → add:
   - `VITE_API_BASE` = your Worker URL from step 6 (e.g. `https://noha-directory-api.YOUR-SUBDOMAIN.workers.dev`)
5. Deploy. Cloudflare Pages serves over HTTPS, which is all the service worker/PWA needs.

The `public/_redirects` file gives the SPA its history-mode fallback so deep links like
`/noha/<id>` work on refresh.

---

## Local development

Two processes: the Worker (API) and the Vite dev server (frontend).

```bash
# --- Worker ---
cp .dev.vars.example .dev.vars          # set a local EDITOR_KEY (gitignored)
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
