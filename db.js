const { Pool } = require("pg");

const pgPool = new Pool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "figoai",
  // Hosted Postgres (Neon, Supabase, etc.) requires TLS; local dev Postgres
  // normally doesn't have it configured at all, so this stays opt-in via
  // DB_SSL rather than always-on.
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

// Without this, a dropped idle connection fires an 'error' event with no
// listener, which Node treats as an uncaught exception and kills the whole
// server. The pool recovers the connection on its own; this just stops the crash.
pgPool.on("error", (err) => {
  console.error("Postgres pool error (connection will be re-established automatically):", err.message);
});

const INSERT_RE = /^\s*INSERT\b/i;
const WRITE_RE = /^\s*(UPDATE|DELETE)\b/i;

// The rest of the app (auth.js, sessions.js, oauth.js, webauthn.js,
// advancedSecurity.js, family.js, server.js) is written against mysql2's
// `pool.query(sql, params)` API: `?` placeholders and a `[rows]` /
// `[{insertId, affectedRows}]` return tuple. This wrapper speaks that same
// shape over `pg`, so none of those call sites need to change.
const pool = {
  async query(sql, params = []) {
    let i = 0;
    let text = sql.replace(/\?/g, () => `$${++i}`);

    const isInsert = INSERT_RE.test(sql);
    if (isInsert && !/\bRETURNING\b/i.test(sql)) {
      text += " RETURNING id";
    }

    const result = await pgPool.query(text, params);

    if (isInsert) {
      return [{ insertId: result.rows[0]?.id, affectedRows: result.rowCount }];
    }
    if (WRITE_RE.test(sql)) {
      return [{ affectedRows: result.rowCount }];
    }
    return [result.rows];
  },
  on: (...args) => pgPool.on(...args),
};

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return rows[0].cnt > 0;
}

async function ensureColumn(table, column, definition) {
  if (await columnExists(table, column)) return;
  await pool.query(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(64) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NULL,
      display_name VARCHAR(120) NOT NULL,
      google_id VARCHAR(64) NULL UNIQUE,
      github_id VARCHAR(64) NULL UNIQUE,
      reset_token_hash VARCHAR(64) NULL,
      reset_token_expires TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migrate any pre-existing table (created before these features were added).
  await ensureColumn("users", "google_id", "google_id VARCHAR(64) NULL UNIQUE");
  await ensureColumn("users", "github_id", "github_id VARCHAR(64) NULL UNIQUE");
  await ensureColumn("users", "reset_token_hash", "reset_token_hash VARCHAR(64) NULL");
  await ensureColumn("users", "reset_token_expires", "reset_token_expires TIMESTAMP NULL");
  await ensureColumn("users", "advanced_security_enrolled", "advanced_security_enrolled BOOLEAN NOT NULL DEFAULT FALSE");
  await ensureColumn("users", "avatar_url", "avatar_url TEXT NULL");
  await pool.query("ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL");

  // Admin is a real per-user flag (not a hardcoded username) so the first
  // admin can promote other accounts later from the dashboard. The very
  // first time this column is created, seed it onto ADMIN_USERNAME (default
  // "figobiziman") so there's at least one admin to start from; after that,
  // who's admin is entirely managed through the dashboard.
  const hadIsAdminColumn = await columnExists("users", "is_admin");
  await ensureColumn("users", "is_admin", "is_admin BOOLEAN NOT NULL DEFAULT FALSE");
  if (!hadIsAdminColumn) {
    const seedAdminUsername = (process.env.ADMIN_USERNAME || "figobiziman").toLowerCase();
    await pool.query("UPDATE users SET is_admin = TRUE WHERE LOWER(username) = ?", [seedAdminUsername]);
  }

  // Super admin is a second tier above is_admin: a regular admin can see the
  // full admin/super-admin list but can't promote or demote anyone — only a
  // super admin can. Seeded onto ADMIN_USERNAME the first time this column is
  // created (same bootstrap as is_admin above); every other super admin has
  // to be granted directly in the database, there's no promote-to-super-admin
  // UI, to keep that escalation path deliberately out of band.
  const hadIsSuperAdminColumn = await columnExists("users", "is_super_admin");
  await ensureColumn("users", "is_super_admin", "is_super_admin BOOLEAN NOT NULL DEFAULT FALSE");
  if (!hadIsSuperAdminColumn) {
    const seedAdminUsername = (process.env.ADMIN_USERNAME || "figobiziman").toLowerCase();
    await pool.query("UPDATE users SET is_super_admin = TRUE, is_admin = TRUE WHERE LOWER(username) = ?", [seedAdminUsername]);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS passkeys (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      credential_id VARCHAR(512) NOT NULL UNIQUE,
      public_key TEXT NOT NULL,
      counter BIGINT NOT NULL DEFAULT 0,
      device_type VARCHAR(32) NULL,
      backed_up BOOLEAN NOT NULL DEFAULT FALSE,
      transports VARCHAR(255) NULL,
      nickname VARCHAR(120) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at TIMESTAMP NULL,
      CONSTRAINT fk_passkeys_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      jti VARCHAR(36) NOT NULL UNIQUE,
      device_type VARCHAR(20) NULL,
      os VARCHAR(40) NULL,
      browser VARCHAR(40) NULL,
      ip_address VARCHAR(64) NULL,
      city VARCHAR(120) NULL,
      region_code VARCHAR(20) NULL,
      user_agent VARCHAR(512) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      revoked_at TIMESTAMP NULL,
      CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS family_invites (
      id SERIAL PRIMARY KEY,
      inviter_id INT NOT NULL,
      method VARCHAR(10) NOT NULL CHECK (method IN ('email','phone')),
      contact VARCHAR(255) NOT NULL,
      relation VARCHAR(10) NOT NULL CHECK (relation IN ('parent','child')),
      token VARCHAR(64) NOT NULL UNIQUE,
      status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','canceled')),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NULL,
      CONSTRAINT fk_family_invites_inviter FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Short-lived CSRF tokens for the OAuth redirect round-trip (oauth.js).
  // Serverless hosts (Vercel) can route the initial /api/auth/:provider
  // request and its /callback to different, unrelated function instances,
  // so this can't live in an in-memory Map the way it could on a
  // persistent server — it needs to be visible to whichever instance
  // handles the callback.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oauth_states (
      state VARCHAR(64) PRIMARY KEY,
      expires_at TIMESTAMP NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS family_links (
      id SERIAL PRIMARY KEY,
      parent_user_id INT NOT NULL,
      child_user_id INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_family_links_parent FOREIGN KEY (parent_user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_family_links_child FOREIGN KEY (child_user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT uniq_family_pair UNIQUE (parent_user_id, child_user_id)
    )
  `);

  // Chat history used to live only in each browser's localStorage — this
  // mirrors it server-side so "Recents" follows the account across devices.
  // client_id is the id the client already generates for a chat (Date.now());
  // it's kept as-is rather than switching to a server-issued id so the
  // client's chat shape doesn't need to change at all.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chats (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      client_id BIGINT NOT NULL,
      title VARCHAR(255) NOT NULL DEFAULT 'New chat',
      messages JSONB NOT NULL DEFAULT '[]',
      archived BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_chats_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT uniq_chats_user_client UNIQUE (user_id, client_id)
    )
  `);
}

module.exports = { pool, initDb };
