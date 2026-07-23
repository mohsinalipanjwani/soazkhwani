/**
 * Noha Directory API — a single Cloudflare Worker.
 *
 * Serves:
 *   /api/*   JSON REST API (reads public, writes require the editor passcode)
 *   /img/*   image proxy that streams private R2 objects with long cache headers
 *
 * Bindings (see wrangler.toml):
 *   DB      D1Database   — SQLite
 *   BUCKET  R2Bucket     — image storage ("noha-images")
 *   EDITOR_KEY  secret   — shared editor passcode
 *   ALLOWED_ORIGINS var  — comma-separated CORS allow-list ("*" = any)
 */

export interface Env {
  DB: D1Database
  BUCKET: R2Bucket
  EDITOR_KEY: string
  ALLOWED_ORIGINS?: string
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // 8 MB

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
function corsHeaders(req: Request, env: Env): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim())
  const origin = req.headers.get('Origin') ?? ''
  let allowOrigin = '*'
  if (!allowed.includes('*')) {
    allowOrigin = allowed.includes(origin) ? origin : allowed[0] ?? ''
  } else if (origin) {
    // Reflect the origin so credentials/preflight behave predictably.
    allowOrigin = origin
  }
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Editor-Key',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(data: unknown, init: ResponseInit, req: Request, env: Env): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(req, env),
      ...(init.headers ?? {}),
    },
  })
}

const ok = (data: unknown, req: Request, env: Env, status = 200) =>
  json(data, { status }, req, env)
const err = (message: string, status: number, req: Request, env: Env) =>
  json({ error: message }, { status }, req, env)

// ---------------------------------------------------------------------------
// Auth — the one place that decides "is this request an editor?".
// Swap this out for Cloudflare Access / real logins later without touching
// the route handlers.
// ---------------------------------------------------------------------------
function isEditor(req: Request, env: Env): boolean {
  const provided = req.headers.get('X-Editor-Key')
  return !!provided && !!env.EDITOR_KEY && provided === env.EDITOR_KEY
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const now = () => Date.now()
const uuid = () => crypto.randomUUID()

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'occasion'
}

async function uniqueSlug(env: Env, desired: string): Promise<string> {
  let slug = desired
  let n = 1
  // Keep trying suffixes until the slug is free.
  while (true) {
    const row = await env.DB.prepare('SELECT 1 FROM occasions WHERE slug = ?')
      .bind(slug)
      .first()
    if (!row) return slug
    n += 1
    slug = `${desired}-${n}`
  }
}

function imageUrl(req: Request, key: string): string {
  const origin = new URL(req.url).origin
  return `${origin}/img/${key}`
}

const IMAGE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/heic': 'heic',
}

// ---------------------------------------------------------------------------
// Noha enrichment (themes + images)
// ---------------------------------------------------------------------------
interface NohaRow {
  id: string
  occasion_id: string | null
  title_ur: string | null
  title_ro: string | null
  poet: string | null
  reciter: string | null
  soz: string | null
  party: string | null
  lyrics_ur: string | null
  lyrics_ro: string | null
  source: string | null
  sort_order: number
  created_at: number
  updated_at: number
}

async function themesForNohas(env: Env, ids: string[]) {
  const map = new Map<string, { id: string; name: string }[]>()
  if (ids.length === 0) return map
  const placeholders = ids.map(() => '?').join(',')
  const { results } = await env.DB.prepare(
    `SELECT nt.noha_id AS noha_id, t.id AS id, t.name AS name
     FROM noha_themes nt JOIN themes t ON t.id = nt.theme_id
     WHERE nt.noha_id IN (${placeholders})
     ORDER BY t.name`,
  )
    .bind(...ids)
    .all<{ noha_id: string; id: string; name: string }>()
  for (const r of results ?? []) {
    const arr = map.get(r.noha_id) ?? []
    arr.push({ id: r.id, name: r.name })
    map.set(r.noha_id, arr)
  }
  return map
}

async function imagesForNohas(env: Env, req: Request, ids: string[]) {
  const map = new Map<
    string,
    { id: string; r2_key: string; url: string; sort_order: number }[]
  >()
  if (ids.length === 0) return map
  const placeholders = ids.map(() => '?').join(',')
  const { results } = await env.DB.prepare(
    `SELECT id, noha_id, r2_key, sort_order FROM noha_images
     WHERE noha_id IN (${placeholders}) ORDER BY sort_order, id`,
  )
    .bind(...ids)
    .all<{ id: string; noha_id: string; r2_key: string; sort_order: number }>()
  for (const r of results ?? []) {
    const arr = map.get(r.noha_id) ?? []
    arr.push({ id: r.id, r2_key: r.r2_key, url: imageUrl(req, r.r2_key), sort_order: r.sort_order })
    map.set(r.noha_id, arr)
  }
  return map
}

async function enrich(env: Env, req: Request, rows: NohaRow[]) {
  const ids = rows.map((r) => r.id)
  const [themeMap, imageMap] = await Promise.all([
    themesForNohas(env, ids),
    imagesForNohas(env, req, ids),
  ])
  return rows.map((r) => ({
    ...r,
    themes: themeMap.get(r.id) ?? [],
    images: imageMap.get(r.id) ?? [],
  }))
}

// Ensure themes exist (by name), return their ids. Case-insensitive match.
async function ensureThemes(env: Env, names: string[]): Promise<string[]> {
  const ids: string[] = []
  for (const raw of names) {
    const name = raw.trim()
    if (!name) continue
    const existing = await env.DB.prepare(
      'SELECT id FROM themes WHERE lower(name) = lower(?)',
    )
      .bind(name)
      .first<{ id: string }>()
    if (existing) {
      ids.push(existing.id)
    } else {
      const id = `thm_${uuid()}`
      await env.DB.prepare('INSERT INTO themes (id, name) VALUES (?, ?)')
        .bind(id, name)
        .run()
      ids.push(id)
    }
  }
  return ids
}

async function setNohaThemes(env: Env, nohaId: string, themeIds: string[]) {
  await env.DB.prepare('DELETE FROM noha_themes WHERE noha_id = ?').bind(nohaId).run()
  for (const tid of themeIds) {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO noha_themes (noha_id, theme_id) VALUES (?, ?)',
    )
      .bind(nohaId, tid)
      .run()
  }
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

// ---- Occasions ----
async function listOccasions(req: Request, env: Env) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM occasions ORDER BY sort_order, name',
  ).all()
  return ok(results ?? [], req, env)
}

async function createOccasion(req: Request, env: Env) {
  const body = (await req.json().catch(() => ({}))) as { name?: string; sort_order?: number }
  const name = (body.name ?? '').trim()
  if (!name) return err('name is required', 400, req, env)
  const id = `occ_${uuid()}`
  const slug = await uniqueSlug(env, slugify(name))
  // Default sort_order: append to the end.
  let sort = body.sort_order
  if (sort == null) {
    const max = await env.DB.prepare(
      'SELECT COALESCE(MAX(sort_order), 0) AS m FROM occasions',
    ).first<{ m: number }>()
    sort = (max?.m ?? 0) + 10
  }
  await env.DB.prepare(
    'INSERT INTO occasions (id, name, slug, sort_order, created_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(id, name, slug, sort, now())
    .run()
  const row = await env.DB.prepare('SELECT * FROM occasions WHERE id = ?').bind(id).first()
  return ok(row, req, env, 201)
}

async function updateOccasion(req: Request, env: Env, id: string) {
  const body = (await req.json().catch(() => ({}))) as { name?: string; sort_order?: number }
  const existing = await env.DB.prepare('SELECT * FROM occasions WHERE id = ?')
    .bind(id)
    .first()
  if (!existing) return err('occasion not found', 404, req, env)
  const sets: string[] = []
  const binds: unknown[] = []
  if (typeof body.name === 'string' && body.name.trim()) {
    sets.push('name = ?')
    binds.push(body.name.trim())
  }
  if (typeof body.sort_order === 'number') {
    sets.push('sort_order = ?')
    binds.push(body.sort_order)
  }
  if (sets.length === 0) return err('nothing to update', 400, req, env)
  binds.push(id)
  await env.DB.prepare(`UPDATE occasions SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run()
  const row = await env.DB.prepare('SELECT * FROM occasions WHERE id = ?').bind(id).first()
  return ok(row, req, env)
}

async function deleteOccasion(req: Request, env: Env, id: string) {
  // nohas.occasion_id has ON DELETE SET NULL, so nohas keep occasion_id = null.
  await env.DB.prepare('DELETE FROM occasions WHERE id = ?').bind(id).run()
  return ok({ deleted: id }, req, env)
}

// ---- Themes ----
async function listThemes(req: Request, env: Env) {
  const { results } = await env.DB.prepare('SELECT * FROM themes ORDER BY name').all()
  return ok(results ?? [], req, env)
}

async function createTheme(req: Request, env: Env) {
  const body = (await req.json().catch(() => ({}))) as { name?: string }
  const name = (body.name ?? '').trim()
  if (!name) return err('name is required', 400, req, env)
  const [id] = await ensureThemes(env, [name])
  const row = await env.DB.prepare('SELECT * FROM themes WHERE id = ?').bind(id).first()
  return ok(row, req, env, 201)
}

// ---- Nohas ----
async function listNohas(req: Request, env: Env) {
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
  const occasion = url.searchParams.get('occasion')
  const theme = url.searchParams.get('theme')

  const where: string[] = ['1=1']
  const binds: unknown[] = []

  if (occasion) {
    where.push('n.occasion_id = ?')
    binds.push(occasion)
  }
  if (theme) {
    // theme may be an id or a name — match either.
    where.push(
      'n.id IN (SELECT nt.noha_id FROM noha_themes nt JOIN themes t ON t.id = nt.theme_id WHERE t.id = ? OR lower(t.name) = lower(?))',
    )
    binds.push(theme, theme)
  }
  if (q) {
    const like = `%${q}%`
    where.push(
      `(lower(COALESCE(n.title_ur,'')) LIKE ?
        OR lower(COALESCE(n.title_ro,'')) LIKE ?
        OR lower(COALESCE(n.poet,'')) LIKE ?
        OR lower(COALESCE(n.reciter,'')) LIKE ?
        OR lower(COALESCE(n.lyrics_ur,'')) LIKE ?
        OR lower(COALESCE(n.lyrics_ro,'')) LIKE ?
        OR n.id IN (SELECT nt.noha_id FROM noha_themes nt JOIN themes t ON t.id = nt.theme_id WHERE lower(t.name) LIKE ?))`,
    )
    binds.push(like, like, like, like, like, like, like)
  }

  const { results } = await env.DB.prepare(
    `SELECT n.* FROM nohas n WHERE ${where.join(' AND ')}
     ORDER BY n.sort_order, n.created_at`,
  )
    .bind(...binds)
    .all<NohaRow>()

  const enriched = await enrich(env, req, results ?? [])
  return ok(enriched, req, env)
}

async function getNoha(req: Request, env: Env, id: string) {
  const row = await env.DB.prepare('SELECT * FROM nohas WHERE id = ?')
    .bind(id)
    .first<NohaRow>()
  if (!row) return err('noha not found', 404, req, env)
  const [enriched] = await enrich(env, req, [row])
  return ok(enriched, req, env)
}

interface NohaInput {
  occasion_id?: string | null
  title_ur?: string | null
  title_ro?: string | null
  poet?: string | null
  reciter?: string | null
  soz?: string | null
  party?: string | null
  lyrics_ur?: string | null
  lyrics_ro?: string | null
  source?: string | null
  sort_order?: number
  themes?: string[] // theme NAMES (created if missing)
}

async function createNoha(req: Request, env: Env) {
  const body = (await req.json().catch(() => ({}))) as NohaInput
  const id = `noha_${uuid()}`
  const ts = now()
  await env.DB.prepare(
    `INSERT INTO nohas
       (id, occasion_id, title_ur, title_ro, poet, reciter, soz, party,
        lyrics_ur, lyrics_ro, source, sort_order, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      id,
      body.occasion_id ?? null,
      body.title_ur ?? null,
      body.title_ro ?? null,
      body.poet ?? null,
      body.reciter ?? null,
      body.soz ?? null,
      body.party ?? null,
      body.lyrics_ur ?? null,
      body.lyrics_ro ?? null,
      body.source ?? null,
      body.sort_order ?? 0,
      ts,
      ts,
    )
    .run()

  if (Array.isArray(body.themes)) {
    const themeIds = await ensureThemes(env, body.themes)
    await setNohaThemes(env, id, themeIds)
  }
  return getNoha(req, env, id)
}

async function updateNoha(req: Request, env: Env, id: string) {
  const existing = await env.DB.prepare('SELECT id FROM nohas WHERE id = ?').bind(id).first()
  if (!existing) return err('noha not found', 404, req, env)
  const body = (await req.json().catch(() => ({}))) as NohaInput

  const fields: (keyof NohaInput)[] = [
    'occasion_id',
    'title_ur',
    'title_ro',
    'poet',
    'reciter',
    'soz',
    'party',
    'lyrics_ur',
    'lyrics_ro',
    'source',
    'sort_order',
  ]
  const sets: string[] = []
  const binds: unknown[] = []
  for (const f of fields) {
    if (f in body) {
      sets.push(`${f} = ?`)
      binds.push((body as Record<string, unknown>)[f] ?? null)
    }
  }
  sets.push('updated_at = ?')
  binds.push(now())
  binds.push(id)
  await env.DB.prepare(`UPDATE nohas SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run()

  if (Array.isArray(body.themes)) {
    const themeIds = await ensureThemes(env, body.themes)
    await setNohaThemes(env, id, themeIds)
  }
  return getNoha(req, env, id)
}

async function deleteNoha(req: Request, env: Env, id: string) {
  // Remove R2 objects first, then the row (cascades images + theme links).
  const { results } = await env.DB.prepare('SELECT r2_key FROM noha_images WHERE noha_id = ?')
    .bind(id)
    .all<{ r2_key: string }>()
  for (const r of results ?? []) {
    await env.BUCKET.delete(r.r2_key).catch(() => {})
  }
  await env.DB.prepare('DELETE FROM nohas WHERE id = ?').bind(id).run()
  return ok({ deleted: id }, req, env)
}

// ---- Images ----
async function uploadImage(req: Request, env: Env, nohaId: string) {
  const noha = await env.DB.prepare('SELECT id FROM nohas WHERE id = ?').bind(nohaId).first()
  if (!noha) return err('noha not found', 404, req, env)

  const form = await req.formData().catch(() => null)
  const entry = form?.get('file') as unknown
  // A file entry is a Blob/File (has a stream()); a plain text field is a string.
  if (!entry || typeof entry === 'string' || typeof (entry as Blob).stream !== 'function')
    return err('file field is required (multipart)', 400, req, env)
  const file = entry as File

  const type = file.type || 'application/octet-stream'
  if (!type.startsWith('image/')) return err('only image/* files are allowed', 415, req, env)
  if (file.size > MAX_IMAGE_BYTES)
    return err(`file too large (max ${MAX_IMAGE_BYTES / (1024 * 1024)} MB)`, 413, req, env)

  const ext = IMAGE_EXT[type] ?? 'bin'
  const key = `nohas/${nohaId}/${uuid()}.${ext}`

  await env.BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: type },
  })

  const max = await env.DB.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) AS m FROM noha_images WHERE noha_id = ?',
  )
    .bind(nohaId)
    .first<{ m: number }>()
  const sort = (max?.m ?? -1) + 1
  const id = `img_${uuid()}`
  await env.DB.prepare(
    'INSERT INTO noha_images (id, noha_id, r2_key, sort_order) VALUES (?, ?, ?, ?)',
  )
    .bind(id, nohaId, key, sort)
    .run()

  return ok(
    { id, noha_id: nohaId, r2_key: key, url: imageUrl(req, key), sort_order: sort },
    req,
    env,
    201,
  )
}

async function updateImage(req: Request, env: Env, imageId: string) {
  const body = (await req.json().catch(() => ({}))) as { sort_order?: number }
  if (typeof body.sort_order !== 'number') return err('sort_order (number) required', 400, req, env)
  const row = await env.DB.prepare('SELECT id FROM noha_images WHERE id = ?').bind(imageId).first()
  if (!row) return err('image not found', 404, req, env)
  await env.DB.prepare('UPDATE noha_images SET sort_order = ? WHERE id = ?')
    .bind(body.sort_order, imageId)
    .run()
  return ok({ id: imageId, sort_order: body.sort_order }, req, env)
}

async function deleteImage(req: Request, env: Env, imageId: string) {
  const row = await env.DB.prepare('SELECT r2_key FROM noha_images WHERE id = ?')
    .bind(imageId)
    .first<{ r2_key: string }>()
  if (!row) return err('image not found', 404, req, env)
  await env.BUCKET.delete(row.r2_key).catch(() => {})
  await env.DB.prepare('DELETE FROM noha_images WHERE id = ?').bind(imageId).run()
  return ok({ deleted: imageId }, req, env)
}

// ---- Image proxy ----
// GET /img/<key> — streams a private R2 object with long cache headers.
// Swap point: to move to a public R2 custom domain, change how the frontend
// builds image URLs (see src/api.ts) and this handler can be retired.
async function serveImage(req: Request, env: Env, key: string) {
  if (!key) return new Response('missing key', { status: 400 })
  const object = await env.BUCKET.get(key)
  if (!object) return new Response('not found', { status: 404 })
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('Access-Control-Allow-Origin', corsHeaders(req, env)['Access-Control-Allow-Origin'])
  return new Response(object.body, { headers })
}

// ---- Backup / import ----
async function exportAll(req: Request, env: Env) {
  const occasions = (await env.DB.prepare('SELECT * FROM occasions ORDER BY sort_order').all())
    .results
  const themes = (await env.DB.prepare('SELECT * FROM themes ORDER BY name').all()).results
  const nohaRows = (await env.DB.prepare('SELECT * FROM nohas ORDER BY sort_order, created_at').all<NohaRow>())
    .results
  const enriched = await enrich(env, req, nohaRows ?? [])
  const nohas = enriched.map((n) => ({
    ...n,
    themes: n.themes.map((t) => t.name),
    images: n.images.map((i) => ({ r2_key: i.r2_key, sort_order: i.sort_order })),
  }))
  return ok(
    { version: 1, exported_at: now(), occasions, themes, nohas },
    req,
    env,
  )
}

// Prototype record shape (see spec §8).
interface ProtoNoha {
  id?: string
  title_ur?: string
  title_ro?: string
  category?: string
  themes?: string[]
  poet?: string
  reciter?: string
  soz?: string
  party?: string
  lyrics_ur?: string
  lyrics_ro?: string
  source?: string
}

async function ensureOccasionByName(env: Env, name: string): Promise<string> {
  const trimmed = name.trim()
  const existing = await env.DB.prepare('SELECT id FROM occasions WHERE lower(name) = lower(?)')
    .bind(trimmed)
    .first<{ id: string }>()
  if (existing) return existing.id
  const id = `occ_${uuid()}`
  const slug = await uniqueSlug(env, slugify(trimmed))
  const max = await env.DB.prepare('SELECT COALESCE(MAX(sort_order),0) AS m FROM occasions').first<{
    m: number
  }>()
  await env.DB.prepare(
    'INSERT INTO occasions (id, name, slug, sort_order, created_at) VALUES (?,?,?,?,?)',
  )
    .bind(id, trimmed, slug, (max?.m ?? 0) + 10, now())
    .run()
  return id
}

async function importData(req: Request, env: Env) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('mode') === 'replace' ? 'replace' : 'merge'
  const payload = await req.json().catch(() => null)
  if (payload == null) return err('invalid JSON body', 400, req, env)

  // Two accepted shapes: a full backup object, or a bare array of prototype nohas.
  const isArray = Array.isArray(payload)
  const protoList: ProtoNoha[] | null = isArray
    ? (payload as ProtoNoha[])
    : null
  const backup = !isArray ? (payload as { occasions?: any[]; themes?: any[]; nohas?: any[] }) : null

  if (mode === 'replace') {
    // Clear everything (nohas cascade to images + theme links). Keep R2 as-is
    // for full backups since keys are restored; for a true reset delete via R2.
    await env.DB.prepare('DELETE FROM noha_themes').run()
    await env.DB.prepare('DELETE FROM noha_images').run()
    await env.DB.prepare('DELETE FROM nohas').run()
    await env.DB.prepare('DELETE FROM themes').run()
    await env.DB.prepare('DELETE FROM occasions').run()
  }

  let occasionsAdded = 0
  let themesAdded = 0
  let nohasAdded = 0

  const nohaList: ProtoNoha[] = protoList ?? (backup?.nohas as ProtoNoha[]) ?? []

  // Restore explicit occasions/themes from a full backup first.
  if (backup) {
    for (const o of backup.occasions ?? []) {
      if (!o?.name) continue
      const id = o.id ?? `occ_${uuid()}`
      const slug = o.slug ?? (await uniqueSlug(env, slugify(o.name)))
      await env.DB.prepare(
        'INSERT OR IGNORE INTO occasions (id, name, slug, sort_order, created_at) VALUES (?,?,?,?,?)',
      )
        .bind(id, o.name, slug, o.sort_order ?? 0, o.created_at ?? now())
        .run()
      occasionsAdded++
    }
    for (const t of backup.themes ?? []) {
      if (!t?.name) continue
      await ensureThemes(env, [t.name])
      themesAdded++
    }
  }

  for (const p of nohaList) {
    // Map category -> occasion (backup nohas use occasion_id directly).
    let occasionId: string | null = null
    const asBackup = p as ProtoNoha & { occasion_id?: string | null }
    if (asBackup.occasion_id) {
      occasionId = asBackup.occasion_id
    } else if (p.category && p.category.trim()) {
      occasionId = await ensureOccasionByName(env, p.category)
    }

    const id = `noha_${uuid()}`
    const ts = now()
    await env.DB.prepare(
      `INSERT INTO nohas
         (id, occasion_id, title_ur, title_ro, poet, reciter, soz, party,
          lyrics_ur, lyrics_ro, source, sort_order, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
      .bind(
        id,
        occasionId,
        p.title_ur ?? null,
        p.title_ro ?? null,
        p.poet ?? null,
        p.reciter ?? null,
        p.soz ?? null,
        p.party ?? null,
        p.lyrics_ur ?? null,
        p.lyrics_ro ?? null,
        p.source ?? null,
        0,
        ts,
        ts,
      )
      .run()

    if (Array.isArray(p.themes) && p.themes.length) {
      const themeIds = await ensureThemes(env, p.themes)
      await setNohaThemes(env, id, themeIds)
    }

    // Restore image references from a full backup (R2 objects assumed present).
    const imgs = (p as any).images as { r2_key: string; sort_order?: number }[] | undefined
    if (Array.isArray(imgs)) {
      for (const im of imgs) {
        if (!im?.r2_key) continue
        await env.DB.prepare(
          'INSERT INTO noha_images (id, noha_id, r2_key, sort_order) VALUES (?,?,?,?)',
        )
          .bind(`img_${uuid()}`, id, im.r2_key, im.sort_order ?? 0)
          .run()
      }
    }
    nohasAdded++
  }

  return ok({ mode, occasionsAdded, themesAdded, nohasAdded }, req, env)
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
const RE = {
  occasionId: /^\/api\/occasions\/([^/]+)$/,
  nohaImages: /^\/api\/nohas\/([^/]+)\/images$/,
  nohaId: /^\/api\/nohas\/([^/]+)$/,
  imageId: /^\/api\/images\/([^/]+)$/,
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const { pathname } = url
    const method = req.method

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(req, env) })
    }

    try {
      // Image proxy (public, key may contain slashes).
      if (pathname.startsWith('/img/') && method === 'GET') {
        return serveImage(req, env, decodeURIComponent(pathname.slice('/img/'.length)))
      }

      // Guard all writes behind the editor passcode.
      const isWrite = method === 'POST' || method === 'PATCH' || method === 'DELETE'
      if (isWrite && pathname.startsWith('/api/') && !isEditor(req, env)) {
        return err('unauthorized', 401, req, env)
      }

      // --- Occasions ---
      if (pathname === '/api/occasions') {
        if (method === 'GET') return listOccasions(req, env)
        if (method === 'POST') return createOccasion(req, env)
      }
      let m = pathname.match(RE.occasionId)
      if (m) {
        if (method === 'PATCH') return updateOccasion(req, env, m[1])
        if (method === 'DELETE') return deleteOccasion(req, env, m[1])
      }

      // --- Themes ---
      if (pathname === '/api/themes') {
        if (method === 'GET') return listThemes(req, env)
        if (method === 'POST') return createTheme(req, env)
      }

      // --- Nohas ---
      if (pathname === '/api/nohas') {
        if (method === 'GET') return listNohas(req, env)
        if (method === 'POST') return createNoha(req, env)
      }
      m = pathname.match(RE.nohaImages)
      if (m && method === 'POST') return uploadImage(req, env, m[1])
      m = pathname.match(RE.nohaId)
      if (m) {
        if (method === 'GET') return getNoha(req, env, m[1])
        if (method === 'PATCH') return updateNoha(req, env, m[1])
        if (method === 'DELETE') return deleteNoha(req, env, m[1])
      }
      m = pathname.match(RE.imageId)
      if (m) {
        if (method === 'PATCH') return updateImage(req, env, m[1])
        if (method === 'DELETE') return deleteImage(req, env, m[1])
      }

      // --- Backup / import ---
      if (pathname === '/api/export' && method === 'GET') return exportAll(req, env)
      if (pathname === '/api/import' && method === 'POST') return importData(req, env)

      return err('not found', 404, req, env)
    } catch (e) {
      return err(`server error: ${(e as Error).message}`, 500, req, env)
    }
  },
}
