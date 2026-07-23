-- Noha Directory — D1 (SQLite) schema + seed data.
-- Apply with:  wrangler d1 execute noha-directory --remote --file=./schema.sql
-- (or --local for local dev). Safe to re-run: uses IF NOT EXISTS / INSERT OR IGNORE.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS occasions (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,          -- e.g. "1–10 Muharram"
  slug        TEXT UNIQUE NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS nohas (
  id          TEXT PRIMARY KEY,
  occasion_id TEXT REFERENCES occasions(id) ON DELETE SET NULL,
  title_ur    TEXT,                   -- matla / opening line (Urdu)
  title_ro    TEXT,                   -- Roman title
  poet        TEXT,                   -- shayar
  reciter     TEXT,                   -- noha khuwan
  soz         TEXT,                   -- tune (optional)
  party       TEXT,                   -- optional
  lyrics_ur   TEXT,                   -- full Urdu text (optional)
  lyrics_ro   TEXT,                   -- Roman transliteration (optional)
  source      TEXT,                   -- book/page/website (optional)
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS noha_images (
  id          TEXT PRIMARY KEY,
  noha_id     TEXT NOT NULL REFERENCES nohas(id) ON DELETE CASCADE,
  r2_key      TEXT NOT NULL,          -- object key in R2
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS themes (
  id    TEXT PRIMARY KEY,
  name  TEXT UNIQUE NOT NULL          -- e.g. "Bibi Sakina", "Hazrat Abbas"
);

CREATE TABLE IF NOT EXISTS noha_themes (
  noha_id  TEXT NOT NULL REFERENCES nohas(id) ON DELETE CASCADE,
  theme_id TEXT NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  PRIMARY KEY (noha_id, theme_id)
);

-- Helpful indexes for filtering / joins.
CREATE INDEX IF NOT EXISTS idx_nohas_occasion   ON nohas(occasion_id);
CREATE INDEX IF NOT EXISTS idx_images_noha       ON noha_images(noha_id);
CREATE INDEX IF NOT EXISTS idx_noha_themes_theme ON noha_themes(theme_id);

-- ---------------------------------------------------------------------------
-- Seed occasions (editable later via the Manage Occasions screen).
-- created_at uses a fixed timestamp so re-running the seed is deterministic.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO occasions (id, name, slug, sort_order, created_at) VALUES
  ('occ_muharram_1_10',    '1–10 Muharram',          'muharram-1-10',        10, 1704067200000),
  ('occ_shaam_ghariban',   'Shaam-e-Ghariban',       'shaam-e-ghariban',     20, 1704067200000),
  ('occ_muh11_saf20',      '11 Muharram – 20 Safar', 'muharram11-safar20',   30, 1704067200000),
  ('occ_safar_21_30',      '21 Safar – 30 Safar',    'safar-21-30',          40, 1704067200000),
  ('occ_rabi_1_8',         '1–8 Rabi ul Awwal',      'rabi-ul-awwal-1-8',    50, 1704067200000),
  ('occ_general',          'General',                'general',              60, 1704067200000);

-- Seed starter themes.
INSERT OR IGNORE INTO themes (id, name) VALUES
  ('thm_imam_hussain', 'Imam Hussain'),
  ('thm_hazrat_abbas', 'Hazrat Abbas'),
  ('thm_ali_akbar',    'Ali Akbar'),
  ('thm_ali_asghar',   'Ali Asghar'),
  ('thm_bibi_sakina',  'Bibi Sakina'),
  ('thm_bibi_zainab',  'Bibi Zainab'),
  ('thm_imam_sajjad',  'Imam Sajjad'),
  ('thm_qasim',        'Qasim'),
  ('thm_imam_hasan',   'Imam Hasan'),
  ('thm_bibi_sughra',  'Bibi Sughra'),
  ('thm_sayyida_zahra','Sayyida Zahra');
