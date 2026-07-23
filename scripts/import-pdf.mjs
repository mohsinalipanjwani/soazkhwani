/**
 * Bulk-import nohas parsed from "NOHA LYRICS.pdf" into the Noha Directory API.
 *
 * Reads a manifest.json (array of nohas) and an images directory, then for each:
 *   1. POST /api/nohas         (title + source, occasion left null = "Unfiled")
 *   2. POST /api/nohas/:id/images  for each page image (multipart) -> R2
 * Text-only nohas (no page image, e.g. lyrics_ro set) skip the image step.
 *
 * Every noha is tagged  source = "NOHA LYRICS.pdf p.N"  so imports are traceable
 * and re-runnable: pass --reset to delete previously-imported rows first.
 *
 * Usage:
 *   node scripts/import-pdf.mjs \
 *     --api http://127.0.0.1:8787 \
 *     --key <EDITOR_KEY> \
 *     --manifest /path/to/manifest.json \
 *     --images   /path/to/images \
 *     [--reset] [--dry]
 *
 * The editor key can also come from the EDITOR_KEY env var.
 */
import { readFile, readdir } from 'node:fs/promises'
import { basename } from 'node:path'

// ---- args ----
const args = process.argv.slice(2)
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`)
  if (i !== -1 && i + 1 < args.length) return args[i + 1]
  return fallback
}
const flag = (name) => args.includes(`--${name}`)

const API = (arg('api', 'http://127.0.0.1:8787')).replace(/\/$/, '')
const KEY = arg('key', process.env.EDITOR_KEY || '')
const MANIFEST = arg('manifest', '')
const IMAGES = arg('images', '')
const RESET = flag('reset')
const DRY = flag('dry')

if (!KEY) {
  console.error('Missing editor key. Pass --key <EDITOR_KEY> or set EDITOR_KEY env var.')
  process.exit(1)
}
if (!MANIFEST || !IMAGES) {
  console.error('Missing --manifest and/or --images path.')
  process.exit(1)
}

const SOURCE_PREFIX = 'NOHA LYRICS.pdf'
const headers = { 'X-Editor-Key': KEY }

async function api(method, path, { json, body } = {}) {
  const h = { ...headers }
  let payload = body
  if (json !== undefined) {
    h['Content-Type'] = 'application/json'
    payload = JSON.stringify(json)
  }
  const res = await fetch(API + path, { method, headers: h, body: payload })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`${method} ${path} -> ${res.status} ${txt}`)
  }
  return res.status === 204 ? null : res.json()
}

const EXT_MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

async function uploadImage(nohaId, filePath) {
  const buf = await readFile(filePath)
  const ext = filePath.split('.').pop().toLowerCase()
  const fd = new FormData()
  fd.append('file', new Blob([buf], { type: EXT_MIME[ext] || 'image/jpeg' }), basename(filePath))
  const res = await fetch(`${API}/api/nohas/${nohaId}/images`, {
    method: 'POST',
    headers, // do NOT set Content-Type; fetch sets the multipart boundary
    body: fd,
  })
  if (!res.ok) throw new Error(`upload ${filePath} -> ${res.status} ${await res.text()}`)
  return res.json()
}

async function resetPriorImport() {
  const all = await api('GET', '/api/nohas')
  const prior = all.filter((n) => (n.source || '').startsWith(SOURCE_PREFIX))
  console.log(`reset: deleting ${prior.length} previously-imported noha(s)…`)
  for (const n of prior) await api('DELETE', `/api/nohas/${n.id}`)
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'))
  const files = new Set(await readdir(IMAGES))
  console.log(`API=${API}  nohas=${manifest.length}  images-dir=${IMAGES}  ${DRY ? '(DRY RUN)' : ''}`)

  if (RESET && !DRY) await resetPriorImport()

  let created = 0
  let uploaded = 0
  let idx = 0
  for (const n of manifest) {
    idx++
    const pages = n.pages || []
    const source = `${SOURCE_PREFIX} p.${pages.join(',')}`
    const label = n.title_ur || n.title_ro || '(untitled)'

    if (DRY) {
      const imgs = pages.map((p) => `p${String(p).padStart(2, '0')}.jpg`).filter((f) => files.has(f))
      console.log(`[${idx}/${manifest.length}] ${source}  "${label}"  images=${imgs.length}${n.lyrics_ro ? ' +lyrics' : ''}`)
      continue
    }

    const noha = await api('POST', '/api/nohas', {
      json: {
        title_ur: n.title_ur || null,
        title_ro: n.title_ro || null,
        lyrics_ro: n.lyrics_ro || null,
        occasion_id: null, // Unfiled — editors assign occasions in-app
        source,
        themes: n.themes || [],
      },
    })
    created++

    for (const p of pages) {
      const fname = `p${String(p).padStart(2, '0')}.jpg`
      if (!files.has(fname)) continue // e.g. the text-only noha has no page image
      await uploadImage(noha.id, `${IMAGES}/${fname}`)
      uploaded++
    }
    console.log(`[${idx}/${manifest.length}] created "${label}"  (${source})`)
  }

  console.log(`\nDone. Created ${created} nohas, uploaded ${uploaded} images.`)
}

main().catch((e) => {
  console.error('IMPORT FAILED:', e.message)
  process.exit(1)
})
