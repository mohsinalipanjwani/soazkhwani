/**
 * Non-destructive migration: add/refresh the Roman title (title_ro) on nohas
 * that were bulk-imported from "NOHA LYRICS.pdf".
 *
 * Matches existing nohas by their `source` tag ("NOHA LYRICS.pdf p.N") and PATCHes
 * ONLY title_ro. It never touches occasion_id, themes, images, or title_ur — so any
 * re-filing / tagging you've done in the app is preserved.
 *
 * Usage:
 *   node scripts/update-roman-titles.mjs \
 *     --api https://noha-directory-api.nohalyrics.workers.dev \
 *     --key '<EDITOR_KEY>' \
 *     --manifest scripts/noha-import/manifest.json \
 *     [--dry]
 */
import { readFile } from 'node:fs/promises'

const args = process.argv.slice(2)
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i !== -1 && i + 1 < args.length ? args[i + 1] : d
}
const flag = (n) => args.includes(`--${n}`)

const API = arg('api', 'http://127.0.0.1:8787').replace(/\/$/, '')
const KEY = arg('key', process.env.EDITOR_KEY || '')
const MANIFEST = arg('manifest', 'scripts/noha-import/manifest.json')
const DRY = flag('dry')
const SOURCE_PREFIX = 'NOHA LYRICS.pdf'

if (!KEY) {
  console.error('Missing editor key. Pass --key <EDITOR_KEY> or set EDITOR_KEY.')
  process.exit(1)
}

const headers = { 'X-Editor-Key': KEY }
async function api(method, path, json) {
  const h = { ...headers }
  let body
  if (json !== undefined) {
    h['Content-Type'] = 'application/json'
    body = JSON.stringify(json)
  }
  const res = await fetch(API + path, { method, headers: h, body })
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'))
  // map source-tag -> desired title_ro
  const wanted = new Map()
  for (const n of manifest) {
    if (n.title_ro) wanted.set(`${SOURCE_PREFIX} p.${n.pages.join(',')}`, n.title_ro)
  }

  const all = await api('GET', '/api/nohas')
  const imported = all.filter((n) => (n.source || '').startsWith(SOURCE_PREFIX))
  console.log(`API=${API}  imported nohas found=${imported.length}  ${DRY ? '(DRY RUN)' : ''}`)

  let updated = 0
  let unchanged = 0
  let unmatched = 0
  for (const n of imported) {
    const ro = wanted.get(n.source)
    if (!ro) {
      unmatched++
      console.log(`  ? no manifest match for source="${n.source}" (title_ur="${n.title_ur || ''}")`)
      continue
    }
    if (n.title_ro === ro) {
      unchanged++
      continue
    }
    console.log(`  ${DRY ? 'would set' : 'set'} title_ro="${ro}"  <-  "${n.title_ur || n.title_ro || ''}"`)
    if (!DRY) await api('PATCH', `/api/nohas/${n.id}`, { title_ro: ro })
    updated++
  }
  console.log(`\nDone. Updated ${updated}, already-correct ${unchanged}, unmatched ${unmatched}.`)
}

main().catch((e) => {
  console.error('MIGRATION FAILED:', e.message)
  process.exit(1)
})
