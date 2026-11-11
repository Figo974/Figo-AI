require("dotenv").config({ quiet: true });

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const { PDFParse } = require("pdf-parse");
const mammoth = require("mammoth");
const WordExtractor = require("word-extractor");
const { pool, initDb } = require("./db");
const { hashPassword, verifyPassword, signToken, authenticate } = require("./auth");
const { registerOAuthRoutes } = require("./oauth");
const { registerWebauthnRoutes } = require("./webauthn");
const { createSession, registerSessionRoutes } = require("./sessions");
const { registerAdvancedSecurityRoutes } = require("./advancedSecurity");
const { registerFamilyRoutes } = require("./family");
const { registerAdminRoutes } = require("./admin");
const { registerChatRoutes } = require("./chats");
const { sendPasswordResetEmail, sendPasswordChangedEmail, isEmailConfigured } = require("./mailer");

console.log("Starting FigoAI server...");

const app = express();
app.set("trust proxy", 1);

app.use(cors());
// Default express.json() limit (100kb) is way too small for base64 voice
// recordings — bump it so /api/voice/transcribe can actually receive one.
app.use(express.json({ limit: "30mb" }));
// The sandboxed Workspace feature runs a WebContainer (a real, isolated
// Node.js filesystem + shell) entirely in the browser tab via WASM, which
// needs SharedArrayBuffer — browsers only grant that to a "cross-origin
// isolated" page. COOP is safe site-wide (OAuth here is redirect-based, not
// window.opener popups). COEP uses "credentialless" rather than the stricter
// "require-corp": this is a single-page app, so these headers apply to every
// route, and require-corp would silently break any cross-origin image that
// doesn't send its own Cross-Origin-Resource-Policy header — which includes
// Pollinations-generated images and arbitrary custom avatar URLs. Not
// supported in Safari, so Workspace just won't be available there.
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
  next();
});

// Shared between the direct-run path (start(), below) and the Vercel
// serverless path (api/index.js) — a serverless cold start has no explicit
// boot step of its own, so the DB gets initialized lazily on that first
// request instead, via the middleware right after this. Memoized so a warm
// instance (or this same process, locally) only ever runs it once.
let dbReadyPromise = null;
function ensureDbReady() {
  if (!dbReadyPromise) {
    dbReadyPromise = initDb()
      .then(() => console.log("Database ready"))
      .catch((error) => {
        console.error("Could not initialize the database:", error.message);
        console.error("Auth endpoints will return errors until the database is reachable (check DB_HOST/DB_USER/DB_PASSWORD/DB_NAME).");
      });
  }
  return dbReadyPromise;
}
app.use((req, res, next) => { ensureDbReady().then(() => next()); });

const PORT = process.env.PORT || 3000;
const ZIP_LINK_TTL_MS = 2 * 60 * 60 * 1000;
const ZIP_ARCHIVE_DIR = path.join(os.tmpdir(), "figoai-zip-archives");
const zipArchives = new Map();
fs.mkdirSync(ZIP_ARCHIVE_DIR, { recursive: true });
// A process restart invalidates in-memory download tokens, so remove any
// orphaned temporary archives left behind by the previous process.
for (const filename of fs.readdirSync(ZIP_ARCHIVE_DIR)) {
  if (/^[a-f0-9]{48}\.zip$/.test(filename)) {
    try { fs.rmSync(path.join(ZIP_ARCHIVE_DIR, filename), { force: true }); } catch { /* best-effort cleanup */ }
  }
}

function removeExpiredZipArchives() {
  const now = Date.now();
  for (const [id, archive] of zipArchives) {
    if (archive.expiresAt <= now) {
      try { fs.rmSync(archive.filePath, { force: true }); } catch { /* best-effort cleanup */ }
      zipArchives.delete(id);
    }
  }
}
const zipCleanupTimer = setInterval(removeExpiredZipArchives, 5 * 60 * 1000);
zipCleanupTimer.unref?.();

const AI_URL = "https://openrouter.ai/api/v1/chat/completions";
const VOICE_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const AI_API_KEY = process.env.OPENROUTER_API_KEY;
// groq/compound gives real web-search-grounded answers, but its free-tier token
// budget is small and shared across all compound calls, so it's opt-in rather
// than the default — the default model always answers reliably, if not live.
// A separate key for it (falling back to the main one) keeps that shared,
// easily-exhausted budget from competing with normal chat traffic.
const SEARCH_API_KEY = AI_API_KEY;
const VOICE_API_KEY = process.env.GROQ_VOICE_API_KEY || process.env.GROQ_API_KEY;
const TTS_API_KEY = process.env.GROQ_TTS_API_KEY || process.env.GROQ_API_KEY || VOICE_API_KEY;
const MODEL = process.env.OPENROUTER_GENERAL_MODEL || "google/gemini-2.5-flash";
const CODING_MODEL = process.env.OPENROUTER_CODING_MODEL || "anthropic/claude-sonnet-4";
const OPENROUTER_TITLE_MODEL = process.env.OPENROUTER_TITLE_MODEL || MODEL;
const ALLOWED_MODELS = [MODEL, CODING_MODEL];
// The gpt-oss/compound models are all text-only (per Groq's own model
// metadata) — this is the one model in Groq's lineup that actually accepts
// image input, so any message with an image attachment gets routed here
// automatically instead of whatever text model was otherwise selected.
const VISION_MODEL = MODEL;
// "auto" (or anything unset/unrecognized) means no override — the model replies in whatever
// language the user wrote in, which is its normal default behavior. Keys must
// match client/src/App.jsx's LANGUAGE_OPTIONS.
const LANGUAGE_NAMES = {
  en: "English", fr: "French", es: "Spanish", rw: "Kinyarwanda",
};

if (!AI_API_KEY) {
  console.error("Missing OPENROUTER_API_KEY. Set it in your .env file.");
  // Only actually kill the process for a direct run (local/Render) — this
  // file also gets required as a module by api/index.js on Vercel, where
  // process.exit() would kill the whole serverless function invocation
  // (reported as "Serverless Function has crashed") instead of just this
  // one missing-config case. There, just log it and let requests that
  // actually need the key fail on their own with a real error message.
  if (require.main === module) {
    process.exit(1);
  }
}

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
// Data URL string length, not decoded bytes — comfortably covers a
// reasonably-sized photo without letting the users table bloat unbounded.
const MAX_AVATAR_DATA_URL_LENGTH = 2_000_000;

// groq/compound runs its own web searches and reports raw results in
// executed_tools; pull out clean {title, url} citations for the client to show.
function extractSources(executedTools) {
  if (!Array.isArray(executedTools)) return [];
  const seen = new Set();
  const sources = [];
  for (const tool of executedTools) {
    if (typeof tool?.output !== "string") continue;
    const re = /Title:\s*(.+?)\r?\nURL:\s*(\S+)/g;
    let match;
    while ((match = re.exec(tool.output)) !== null) {
      const url = match[2].trim();
      if (seen.has(url)) continue;
      seen.add(url);
      sources.push({ title: match[1].trim(), url });
    }
  }
  return sources.slice(0, 6);
}

const MAX_ATTACHMENT_TEXT_CHARS = 8000;

// The Workspace feature gives the assistant a real (but sandboxed) Node.js
// filesystem + shell — a WebContainer running entirely in the user's own
// browser tab, not on this server. This server never executes any of these
// itself; it only forwards the tool schema to Groq and relays whatever tool
// calls come back to the client, which actually runs them (see WORKSPACE_MAX_TOOL_ROUNDS
// below and the /api/chat handler for the relay loop).
const WORKSPACE_TOOLS = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the full text contents of a file in the user's sandboxed workspace.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path relative to the workspace root, e.g. 'src/index.js'." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or overwrite a file in the user's sandboxed workspace, creating parent directories as needed.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path relative to the workspace root, e.g. 'src/index.js'." },
          content: { type: "string", description: "The full new contents of the file." },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List files and folders in the user's sandboxed workspace, recursively.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory to list, relative to the workspace root. Defaults to the root." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "zip_folder",
      description: "Create a ZIP archive of a folder in the user's sandboxed workspace. The archive appears as a download link in the Workspace panel for two hours. Do not include .env files, private keys, or credentials.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Folder path relative to the workspace root. Use '/' for the complete project." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Run a shell command in the user's sandboxed workspace (a real but isolated Node.js environment: npm, node, and standard POSIX utilities are available) and return its output.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The full command line to run, e.g. 'npm install' or 'node index.js'." },
        },
        required: ["command"],
      },
    },
  },
];
// Groq's own compound tool-use budget aside, this bounds how many times a
// single chat turn can bounce between "assistant asks for a tool" and "client
// runs it" before we just stop and return whatever the model has said so far
// — protects against a model stuck in a tool-call loop burning the user's
// Groq quota and the client's WebContainer indefinitely.
const WORKSPACE_MAX_TOOL_ROUNDS = 8;
const MAX_TOOL_RESULT_CHARS = 4000;

// Attachments arrive as {name, type, url} where url is a data: URI (same
// shape the client already builds for its own preview). Pull real text out
// of documents so the model actually has something to answer questions
// about — before this, an attached file was invisible to the AI entirely.
async function extractAttachmentText(att) {
  const match = typeof att?.url === "string" && att.url.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;

  const mimeType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  const name = (att.name || "").toLowerCase();

  try {
    if (name.endsWith(".pdf") || mimeType === "application/pdf") {
      const parser = new PDFParse({ data: buffer });
      try {
        const { text } = await parser.getText();
        return text;
      } finally {
        await parser.destroy();
      }
    }
    if (name.endsWith(".docx")) {
      const { value } = await mammoth.extractRawText({ buffer });
      return value;
    }
    if (name.endsWith(".doc")) {
      const doc = await new WordExtractor().extract(buffer);
      return doc.getBody();
    }
    if (name.endsWith(".txt") || name.endsWith(".csv") || mimeType.startsWith("text/")) {
      return buffer.toString("utf8");
    }
    return null; // unsupported format
  } catch (error) {
    console.error(`Could not extract text from attachment "${att.name}":`, error.message);
    return null;
  }
}

const TONE_TEXT = {
  professional: "Keep your tone professional and businesslike.",
  friendly: "Keep your tone especially warm, casual, and friendly, like a helpful friend.",
  concise: "Keep answers as short and to the point as possible — brevity over completeness.",
  witty: "Feel free to be a little witty and playful in your tone, while staying helpful.",
};

// Settings > Personalization — turns the user's saved preferences into system-prompt
// instructions. "memoryEnabled" gates identity info (name/occupation/notes) only;
// custom instructions and tone/trait preferences always apply, same as real ChatGPT.
function buildPersonalizationPrompt(personalization) {
  if (!personalization || typeof personalization !== "object") return "";
  const parts = [];

  if (TONE_TEXT[personalization.tone]) parts.push(TONE_TEXT[personalization.tone]);

  const traits = personalization.traits || {};
  if (traits.warmth === "more") parts.push("Be extra warm and encouraging.");
  if (traits.warmth === "less") parts.push("Keep warmth minimal — stay neutral and matter-of-fact.");
  if (traits.enthusiasm === "more") parts.push("Show more enthusiasm and energy in your replies.");
  if (traits.enthusiasm === "less") parts.push("Keep enthusiasm low-key and measured.");
  if (traits.formatting === "more") parts.push("Use headings and bullet lists more liberally to structure answers.");
  if (traits.formatting === "less") parts.push("Avoid headings and bullet lists — prefer flowing prose.");
  if (traits.emoji === "more") parts.push("Use emojis more often than your usual default.");
  if (traits.emoji === "less") parts.push("Use little to no emoji.");

  if (personalization.memoryEnabled !== false) {
    if (personalization.nickname) parts.push(`Address the user as "${personalization.nickname}" when it's natural to do so.`);
    if (personalization.occupation) parts.push(`The user's occupation/background: ${personalization.occupation}. Tailor examples and depth accordingly when relevant.`);
    if (personalization.aboutMore) parts.push(`Other things to keep in mind about the user: ${personalization.aboutMore}`);
  }

  if (personalization.customInstructions) parts.push(`Additional user instructions: ${personalization.customInstructions}`);

  return parts.length ? " " + parts.join(" ") : "";
}

/*
|--------------------------------------------------------------------------
| Health Route (public)
|--------------------------------------------------------------------------
*/
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    model: MODEL,
  });
});


/*
|--------------------------------------------------------------------------
| Temporary ZIP downloads — links expire after two hours
|--------------------------------------------------------------------------
*/
app.post("/api/workspace/zip", authenticate, express.raw({ type: "application/zip", limit: "105mb" }), (req, res) => {
  try {
    if (!Buffer.isBuffer(req.body) || req.body.length < 22) {
      return res.status(400).json({ success: false, error: "Upload a valid ZIP archive." });
    }
    // Validate the ZIP end-of-central-directory signature before storing it.
    const signature = req.body.readUInt32LE(req.body.length - 22);
    if (signature !== 0x06054b50) {
      return res.status(400).json({ success: false, error: "The uploaded archive is not a valid ZIP file." });
    }
    removeExpiredZipArchives();
    const userArchives = [...zipArchives.entries()]
      .filter(([, item]) => item.userId === req.user.id)
      .sort((a, b) => a[1].createdAt - b[1].createdAt);
    while (userArchives.length >= 5) {
      const [oldId, oldest] = userArchives.shift();
      try { fs.rmSync(oldest.filePath, { force: true }); } catch { /* best-effort cleanup */ }
      zipArchives.delete(oldId);
    }
    if (zipArchives.size >= 1000) {
      return res.status(429).json({ success: false, error: "The temporary download service is busy. Try again later." });
    }
    const id = crypto.randomBytes(24).toString("hex");
    const filePath = path.join(ZIP_ARCHIVE_DIR, `${id}.zip`);
    const rawName = decodeURIComponent(String(req.headers["x-archive-name"] || "figoai-project.zip")).slice(0, 160);
    const fileName = `${path.basename(rawName).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/\.zip$/i, "") || "figoai-project"}.zip`;
    fs.writeFileSync(filePath, req.body, { flag: "wx" });
    const expiresAt = Date.now() + ZIP_LINK_TTL_MS;
    zipArchives.set(id, { filePath, fileName, expiresAt, createdAt: Date.now(), userId: req.user.id });
    const baseUrl = (process.env.SERVER_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
    return res.status(201).json({ success: true, downloadUrl: `${baseUrl}/download/${id}`, expiresAt });
  } catch (error) {
    console.error("ZIP upload error:", error.message);
    return res.status(500).json({ success: false, error: "Could not store the ZIP archive." });
  }
});

app.get("/download/:id", (req, res) => {
  const id = String(req.params.id || "");
  if (!/^[a-f0-9]{48}$/.test(id)) return res.status(404).send("Download not found.");
  const archive = zipArchives.get(id);
  if (!archive) return res.status(410).send("This download link has expired or is no longer available.");
  if (archive.expiresAt <= Date.now() || !fs.existsSync(archive.filePath)) {
    try { fs.rmSync(archive.filePath, { force: true }); } catch { /* best-effort cleanup */ }
    zipArchives.delete(id);
    return res.status(410).send("This download link has expired or is no longer available.");
  }
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.download(archive.filePath, archive.fileName);
});

/*
|--------------------------------------------------------------------------
| Auth Routes
|--------------------------------------------------------------------------
*/
app.post("/api/auth/guest", (req, res) => {
  try {
    const id = `guest-${crypto.randomUUID()}`;
    const user = { id, username: "guest", displayName: "Guest", isGuest: true };
    const token = signToken(user, null, process.env.GUEST_JWT_EXPIRES_IN || "7d");
    return res.json({ success: true, token, user });
  } catch (error) {
    console.error("Guest session error:", error.message);
    return res.status(500).json({ success: false, error: "Could not start a guest session" });
  }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password } = req.body || {};

    if (typeof username !== "string" || !USERNAME_RE.test(username)) {
      return res.status(400).json({
        success: false,
        error: "Username must be 3-32 characters (letters, numbers, . _ -)",
      });
    }
    if (typeof email !== "string" || !EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, error: "Enter a valid email address" });
    }
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [existing] = await pool.query(
      "SELECT id, username, email FROM users WHERE username = ? OR email = ?",
      [username, normalizedEmail]
    );
    if (existing.length > 0) {
      const taken = existing[0].username === username ? "Username" : "Email";
      return res.status(409).json({ success: false, error: `${taken} is already taken` });
    }

    const passwordHash = await hashPassword(password);
    const [result] = await pool.query(
      "INSERT INTO users (username, email, password_hash, display_name) VALUES (?, ?, ?, ?)",
      [username, normalizedEmail, passwordHash, username]
    );

    const user = { id: result.insertId, username, email: normalizedEmail, displayName: username, avatarUrl: null, advancedSecurityEnrolled: false, hasPassword: true, isAdmin: false, isSuperAdmin: false };
    const { jti, expiresIn } = await createSession(pool, user.id, req);
    const token = signToken(user, jti, expiresIn);

    return res.status(201).json({ success: true, token, user });
  } catch (error) {
    console.error("Register error:", error.message);
    return res.status(500).json({ success: false, error: "Could not create account. Try again later." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (typeof username !== "string" || typeof password !== "string") {
      return res.status(400).json({ success: false, error: "Username and password are required" });
    }

    const identifier = username.trim();
    const [rows] = await pool.query(
      "SELECT id, username, email, password_hash, display_name, avatar_url, advanced_security_enrolled, is_admin, is_super_admin FROM users WHERE username = ? OR email = ?",
      [identifier, identifier.toLowerCase()]
    );
    const row = rows[0];
    const passwordOk = await verifyPassword(password, row?.password_hash);

    if (!row || !passwordOk) {
      return res.status(401).json({ success: false, error: "Invalid username/email or password" });
    }
    if (row.advanced_security_enrolled) {
      return res.status(403).json({
        success: false,
        error: "Password sign-in is disabled for this account. Sign in with a passkey instead.",
      });
    }

    const user = { id: row.id, username: row.username, email: row.email, displayName: row.display_name, avatarUrl: row.avatar_url, advancedSecurityEnrolled: false, hasPassword: true, isAdmin: !!row.is_admin, isSuperAdmin: !!row.is_super_admin };
    const { jti, expiresIn } = await createSession(pool, user.id, req);
    const token = signToken(user, jti, expiresIn);

    return res.json({ success: true, token, user });
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({ success: false, error: "Could not sign in. Try again later." });
  }
});

app.get("/api/auth/me", authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, username, email, display_name, avatar_url, advanced_security_enrolled, password_hash, is_admin, is_super_admin FROM users WHERE id = ?",
      [req.user.id]
    );
    const row = rows[0];
    if (!row) {
      return res.status(401).json({ success: false, error: "User no longer exists" });
    }
    return res.json({
      success: true,
      user: {
        id: row.id,
        username: row.username,
        email: row.email,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        advancedSecurityEnrolled: !!row.advanced_security_enrolled,
        hasPassword: !!row.password_hash,
        isAdmin: !!row.is_admin,
        isSuperAdmin: !!row.is_super_admin,
      },
    });
  } catch (error) {
    console.error("Session check error:", error.message);
    return res.status(500).json({ success: false, error: "Could not load session" });
  }
});

app.patch("/api/auth/username", authenticate, async (req, res) => {
  try {
    const { username } = req.body || {};
    if (typeof username !== "string" || !USERNAME_RE.test(username)) {
      return res.status(400).json({
        success: false,
        error: "Username must be 3-32 characters (letters, numbers, . _ -)",
      });
    }

    const [existing] = await pool.query("SELECT id FROM users WHERE username = ? AND id != ?", [username, req.user.id]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, error: "That username is already taken" });
    }

    await pool.query("UPDATE users SET username = ? WHERE id = ?", [username, req.user.id]);
    return res.json({ success: true, username });
  } catch (error) {
    console.error("Update username error:", error.message);
    return res.status(500).json({ success: false, error: "Could not update username. Try again later." });
  }
});

app.patch("/api/auth/display-name", authenticate, async (req, res) => {
  try {
    const { displayName } = req.body || {};
    const trimmed = typeof displayName === "string" ? displayName.trim() : "";
    if (!trimmed || trimmed.length > 120) {
      return res.status(400).json({ success: false, error: "Enter a display name (up to 120 characters)" });
    }

    await pool.query("UPDATE users SET display_name = ? WHERE id = ?", [trimmed, req.user.id]);
    return res.json({ success: true, displayName: trimmed });
  } catch (error) {
    console.error("Update display name error:", error.message);
    return res.status(500).json({ success: false, error: "Could not update display name. Try again later." });
  }
});

app.patch("/api/auth/avatar", authenticate, async (req, res) => {
  try {
    const { avatarUrl } = req.body || {};
    if (avatarUrl !== null && (typeof avatarUrl !== "string" || !avatarUrl.startsWith("data:image/"))) {
      return res.status(400).json({ success: false, error: "Avatar must be an image, or null to remove it" });
    }
    if (typeof avatarUrl === "string" && avatarUrl.length > MAX_AVATAR_DATA_URL_LENGTH) {
      return res.status(400).json({ success: false, error: "That image is too large — try a smaller photo" });
    }

    await pool.query("UPDATE users SET avatar_url = ? WHERE id = ?", [avatarUrl, req.user.id]);
    return res.json({ success: true, avatarUrl });
  } catch (error) {
    console.error("Update avatar error:", error.message);
    return res.status(500).json({ success: false, error: "Could not update profile photo. Try again later." });
  }
});

app.patch("/api/auth/email", authenticate, async (req, res) => {
  try {
    const { email, currentPassword } = req.body || {};
    if (typeof email !== "string" || !EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, error: "Enter a valid email address" });
    }

    const [rows] = await pool.query("SELECT password_hash FROM users WHERE id = ?", [req.user.id]);
    const row = rows[0];
    if (!row?.password_hash) {
      return res.status(400).json({ success: false, error: "Add a password to your account before changing your email" });
    }
    if (typeof currentPassword !== "string" || !(await verifyPassword(currentPassword, row.password_hash))) {
      return res.status(401).json({ success: false, error: "Current password is incorrect" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const [existing] = await pool.query("SELECT id FROM users WHERE email = ? AND id != ?", [normalizedEmail, req.user.id]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, error: "That email is already in use" });
    }

    await pool.query("UPDATE users SET email = ? WHERE id = ?", [normalizedEmail, req.user.id]);
    return res.json({ success: true, email: normalizedEmail });
  } catch (error) {
    console.error("Update email error:", error.message);
    return res.status(500).json({ success: false, error: "Could not update email. Try again later." });
  }
});

app.delete("/api/auth/account", authenticate, async (req, res) => {
  try {
    const { password } = req.body || {};
    const [rows] = await pool.query("SELECT password_hash FROM users WHERE id = ?", [req.user.id]);
    const row = rows[0];
    if (!row) {
      return res.status(401).json({ success: false, error: "User no longer exists" });
    }
    if (row.password_hash) {
      if (typeof password !== "string" || !(await verifyPassword(password, row.password_hash))) {
        return res.status(401).json({ success: false, error: "Password is incorrect" });
      }
    }

    await pool.query("DELETE FROM users WHERE id = ?", [req.user.id]);
    return res.json({ success: true });
  } catch (error) {
    console.error("Delete account error:", error.message);
    return res.status(500).json({ success: false, error: "Could not delete account. Try again later." });
  }
});

app.post("/api/auth/change-password", authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword, notifyEmail } = req.body || {};

    if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
      return res.status(400).json({ success: false, error: "Current and new password are required" });
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }

    const [rows] = await pool.query("SELECT password_hash, email FROM users WHERE id = ?", [req.user.id]);
    const row = rows[0];
    const currentOk = row && (await verifyPassword(currentPassword, row.password_hash));
    if (!currentOk) {
      return res.status(401).json({ success: false, error: "Current password is incorrect" });
    }

    const newHash = await hashPassword(newPassword);
    await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [newHash, req.user.id]);

    // Fire-and-forget: a delivery failure shouldn't fail a password change that already succeeded.
    if (notifyEmail === true && isEmailConfigured && row.email) {
      sendPasswordChangedEmail(row.email).catch((err) => {
        console.error("Failed to send password-changed email:", err.message);
      });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("Change password error:", error.message);
    return res.status(500).json({ success: false, error: "Could not update password. Try again later." });
  }
});

// For accounts created via Google/Microsoft/Apple that have no password
// yet — unlike /change-password, there's no current password to verify.
app.post("/api/auth/add-password", authenticate, async (req, res) => {
  try {
    const { newPassword } = req.body || {};
    if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }

    const [rows] = await pool.query("SELECT password_hash FROM users WHERE id = ?", [req.user.id]);
    const row = rows[0];
    if (row?.password_hash) {
      return res.status(400).json({ success: false, error: "This account already has a password. Use Change Password instead." });
    }

    const newHash = await hashPassword(newPassword);
    await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [newHash, req.user.id]);

    return res.json({ success: true });
  } catch (error) {
    console.error("Add password error:", error.message);
    return res.status(500).json({ success: false, error: "Could not add a password. Try again later." });
  }
});

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (typeof email !== "string" || !EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, error: "Enter a valid email address" });
    }
    if (!isEmailConfigured) {
      return res.status(503).json({ success: false, error: "Password reset emails are not configured on this server yet" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const [rows] = await pool.query("SELECT id, advanced_security_enrolled FROM users WHERE email = ?", [normalizedEmail]);

    // Always respond the same way whether or not the account exists (or has
    // email recovery disabled via Advanced Account Security), so this
    // endpoint can't be used to discover which emails have accounts.
    if (rows.length && !rows[0].advanced_security_enrolled) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
      await pool.query(
        "UPDATE users SET reset_token_hash = ?, reset_token_expires = ? WHERE id = ?",
        [tokenHash, expires, rows[0].id]
      );

      const resetUrl = `${CLIENT_URL}/#reset_token=${rawToken}`;
      sendPasswordResetEmail(normalizedEmail, resetUrl).catch((err) => {
        console.error("Failed to send password reset email:", err.message);
      });
    }

    return res.json({ success: true, message: "If that email has an account, a reset link has been sent." });
  } catch (error) {
    console.error("Forgot password error:", error.message);
    return res.status(500).json({ success: false, error: "Could not process request. Try again later." });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};
    if (typeof token !== "string" || typeof newPassword !== "string") {
      return res.status(400).json({ success: false, error: "Reset token and new password are required" });
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ success: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const [rows] = await pool.query(
      "SELECT id FROM users WHERE reset_token_hash = ? AND reset_token_expires > NOW()",
      [tokenHash]
    );
    if (!rows.length) {
      return res.status(400).json({ success: false, error: "This reset link is invalid or has expired. Request a new one." });
    }

    const newHash = await hashPassword(newPassword);
    await pool.query(
      "UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_token_expires = NULL WHERE id = ?",
      [newHash, rows[0].id]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error("Reset password error:", error.message);
    return res.status(500).json({ success: false, error: "Could not reset password. Try again later." });
  }
});

registerOAuthRoutes(app, { signToken, createSession });
registerWebauthnRoutes(app, { pool, authenticate, signToken, createSession });
registerSessionRoutes(app, { pool, authenticate });
registerAdvancedSecurityRoutes(app, { pool, authenticate });
registerFamilyRoutes(app, { pool, authenticate });
registerAdminRoutes(app, { pool, authenticate, isEmailConfigured, model: MODEL, allowedModels: ALLOWED_MODELS });
registerChatRoutes(app, { pool, authenticate });

/*
|--------------------------------------------------------------------------
| Chat Route (requires a valid session)
|--------------------------------------------------------------------------
*/
app.post("/api/chat", authenticate, async (req, res) => {
  try {
    const userMessage = req.body.message;
    const temperature = typeof req.body.temperature === "number" ? req.body.temperature : 0.7;
    const userTextForRouting = String(req.body.message || "");
    const codingIntent = /\b(code|coding|program|programming|debug|bug|function|class|javascript|typescript|python|php|html|css|sql|react|node\.js|api|database|algorithm|compiler|refactor|stack trace)\b/i.test(userTextForRouting);
    const requestedModel = codingIntent
      ? CODING_MODEL
      : (req.body.model === CODING_MODEL ? CODING_MODEL : MODEL);
    const deepResearch = req.body.deepResearch === true;
    const replyLanguage = LANGUAGE_NAMES[req.body.language];
    const personalizationPrompt = buildPersonalizationPrompt(req.body.personalization);

    // Validate input
    if (!userMessage || typeof userMessage !== "string") {
      return res.status(400).json({
        success: false,
        error: "Request body must contain a message string",
      });
    }

    // Attachments used to be a client-only preview — the AI never actually
    // saw them. Images need a vision-capable model (none of the gpt-oss /
    // compound models accept image input), so any image attachment forces a
    // switch to one regardless of what was otherwise selected. Document text
    // gets extracted and folded straight into the message.
    const attachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];
    const imageAttachments = attachments.filter(a => a?.type === "image" && typeof a?.url === "string");
    const fileAttachments = attachments.filter(a => a?.type === "file" && typeof a?.url === "string");

    const requestedModelForCompletion = imageAttachments.length > 0 ? VISION_MODEL : requestedModel;

    // "Higher intelligence" (the Brain toggle) used to just re-select
    // openai/gpt-oss-120b — which is already the default model everyone
    // gets, so it silently did nothing for most users. The GPT-OSS models
    // actually support a reasoning_effort dial; that's the real lever for
    // visibly smarter (if slower) answers, so wire the toggle to that instead.
    const smartMode = req.body.smart === true;
    const supportsReasoningEffort = false;

    // Workspace: the client sends workspaceEnabled once it has a booted
    // WebContainer to run tools against, plus (on continuation calls within
    // the same turn) the toolTurn messages accumulated so far — the
    // assistant's tool_calls message and the matching tool-result messages
    // the client got back from actually running them. The vision model
    // doesn't support tool calling, so image attachments disable it too.
    const workspaceEnabled = req.body.workspaceEnabled === true
      && imageAttachments.length === 0
      && requestedModelForCompletion === CODING_MODEL;
    const rawToolTurn = Array.isArray(req.body.toolTurn) ? req.body.toolTurn : [];
    // Each round is one assistant tool_calls message; cap it server-side so a
    // model stuck calling tools can't loop forever on the user's Groq quota.
    const toolRounds = rawToolTurn.filter(m => m?.role === "assistant" && Array.isArray(m.tool_calls)).length;
    if (workspaceEnabled && toolRounds > WORKSPACE_MAX_TOOL_ROUNDS) {
      return res.status(400).json({ success: false, error: "Too many tool calls in one turn — ask a narrower question." });
    }
    const toolTurn = workspaceEnabled
      ? rawToolTurn
          .filter(m => m && (m.role === "assistant" || m.role === "tool"))
          .map(m => m.role === "assistant"
            ? { role: "assistant", content: m.content ?? null, tool_calls: Array.isArray(m.tool_calls) ? m.tool_calls : undefined }
            : { role: "tool", tool_call_id: String(m.tool_call_id || ""), content: String(m.content ?? "").slice(0, MAX_TOOL_RESULT_CHARS) })
      : [];

    let messageText = userMessage;
    if (fileAttachments.length > 0) {
      const extracted = await Promise.all(fileAttachments.map(async (att) => {
        const text = await extractAttachmentText(att);
        return text
          ? `\n\n[Attached file "${att.name}"]\n${text.slice(0, MAX_ATTACHMENT_TEXT_CHARS)}`
          : `\n\n[Attached file "${att.name}" — couldn't read this file format.]`;
      }));
      messageText += extracted.join("");
    }
    const userContent = imageAttachments.length > 0
      ? [
          { type: "text", text: messageText },
          ...imageAttachments.map(a => ({ type: "image_url", image_url: { url: a.url } })),
        ]
      : messageText;

    // Conversation history lives on the client, scoped to the specific chat
    // it belongs to (each chat thread keeps its own ordered message list from
    // the moment it started). It's sent with every request instead of kept in
    // server memory, so replies never leak context between unrelated chats,
    // survive a server restart, and stay correct across devices/sessions.
    const clientHistory = Array.isArray(req.body.history) ? req.body.history : [];
    const sanitizedHistory = clientHistory
      .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
    const trimmed = [...sanitizedHistory.slice(-19), { role: "user", content: userContent }];

    // Build conversation
    const messages = [
      {
        role: "system",
        content:
          "You are FigoAI, a warm, professional AI assistant with a consistently polished, high-quality voice. Answer exactly what the user asked, leading with the direct answer, then add one or two sentences of useful context or explanation (the key 'why' or 'how') — not a full essay, and no unrequested caveats or tangents. Only go deeper — alternatives, step-by-step reasoning, longer background — if the user explicitly asks for more detail. Stay composed and put-together in every reply — friendly and approachable, never sloppy or overly casual. " +
          "Be truthful above all: if a name, acronym, or term could refer to more than one distinct real-world thing (e.g. an abbreviation shared by unrelated organizations in different countries), don't silently pick one and ignore the rest — briefly cover each distinct thing it commonly refers to, so the user gets the full picture instead of a guess. Get official names exactly right rather than guessing a similar-sounding variant (e.g. 'Agency' vs 'Authority' vs 'Bureau' are not interchangeable) — for example, Rwanda's national broadcaster is the Rwanda Broadcasting Agency (RBA), not 'Rwanda Broadcasting Authority'. If you're not confident about a fact, a lesser-known entity, or anything that may have changed after your training, say so plainly instead of presenting a guess as certain — never invent details to sound authoritative. " +
          "When a specific real resource would genuinely help — an official site, documentation, a product page, a source you found via web search — weave it in inline as a markdown link, e.g. [its name](https://example.com), right where you mention it, rather than dumping bare URLs. Only ever link to a URL you actually know or found via search; never invent, guess, or complete a plausible-looking one. Skip links entirely when nothing concrete and real is worth pointing to. " +
          "Emojis are fine used sparingly to add a little warmth (e.g. one fitting emoji next to a greeting or a key point) — never more than that, and never in code blocks, technical explanations, or formal answers, where they read as unprofessional. Format responses with markdown (headings, bold, lists, code blocks) only when it improves readability. " +
          "Default to natural prose: short paragraphs, **bold** on key terms, and bullet or numbered lists when something is genuinely a list of items or steps — the way a knowledgeable person would explain it conversationally, not a report. Reach for a markdown table only when the content is truly tabular (e.g. comparing several items across the same set of attributes side by side); never use a table to structure a single description, a self-introduction, or an open-ended explanation. " +
          "You can show a real generated photo alongside your reply to add contextual visual value. Use this only when it's genuinely necessary — the user explicitly asked for a picture/photo/image of something, or a visual would make a concrete, visualizable thing (a place, an object, an animal, a scene, a design) far clearer than words alone. Don't use it for abstract, conversational, or purely informational questions. When you do want to show one, end your entire reply with a final line in exactly this format, with nothing after it: [IMAGE: a short, vivid, English description of exactly what the photo should show] " +
          "When you write code, always wrap it in a fenced code block tagged with its language (e.g. ```python, ```javascript) — never leave a code block untagged. Write clean, idiomatic, working code: sensible names, correct edge-case handling, and the standard formatting conventions for that language. Add a comment only where the logic genuinely isn't obvious from reading it — don't narrate every line, and don't pad the answer with unrequested tests, alternatives, or explanation unless asked." +
          "If a user message contains a block like [Attached file \"name\"] followed by text, that text is the real, verbatim extracted content of a file they actually uploaded — not something they typed or that you're guessing at. Treat it as ground truth and answer directly from it; don't hedge about being unable to view the file or unsure where the information came from. If that block instead says the file couldn't be read, say so plainly rather than guessing at its contents. Photos attached directly to the message (not as an extracted-text block) are visible to you as real images — describe or answer questions about them directly, the same way." +
          (deepResearch
            ? " The user turned on Deep Research: this overrides your usual brevity rule. Run multiple searches to cover the topic from several angles, then write a genuinely thorough report — background/context, the current state of the topic, key facts with their sources, differing perspectives where they exist, and a short synthesis at the end. Organize it with headings and don't pad it — every section should carry real information, not restate the question."
            : "") +
          (replyLanguage
            ? ` Always reply in ${replyLanguage}, regardless of what language the user writes in.`
            : " Reply in the same language the user's most recent message is written in. If that message is too short or ambiguous to tell, use the language the conversation has been in so far, or default to English. Never switch languages on your own — only switch if the user explicitly writes in, or asks for, a different language.") +
          (replyLanguage === "Kinyarwanda"
            ? " Write naturally in standard Kinyarwanda (Ikinyarwanda). Preserve Kinyarwanda spelling and diacritics where applicable, explain technical terms clearly, and do not invent translations. When a word or technical phrase is uncertain, keep the standard term and explain it in Kinyarwanda."
            : replyLanguage === "Spanish"
              ? " Write in clear, natural Spanish with correct accents and punctuation. Use broadly understandable Spanish and keep technical explanations accessible."
              : "") +
          (workspaceEnabled
            ? " The user has a sandboxed Workspace open — a real but isolated Node.js filesystem and terminal only you and they can see, not the real internet or their actual computer. Use the read_file, write_file, list_dir, and run_command tools to actually build/inspect/run things there instead of just describing code. When the user asks to package or ZIP a project folder, use zip_folder and tell them the download link is in the Workspace panel and expires after two hours. The ZIP process automatically excludes .env files and private keys. Prefer running a command to verify something (e.g. actually running a script) over guessing at its output. Keep tool calls purposeful — don't explore aimlessly."
            : " If the user asks you to package a project into a ZIP but the Workspace is not open, tell them to open Workspace from the add menu and ask again so you can package the project files. ") +
          personalizationPrompt,
      },
      ...trimmed,
      ...toolTurn,
    ];

    console.log(`Sending request to OpenRouter using ${requestedModelForCompletion}...`);

    // Call OpenRouter
    let response;
    let usedModel = requestedModelForCompletion;
    try {
      response = await axios.post(
        AI_URL,
        {
          model: requestedModelForCompletion,
          messages: messages,
          temperature,
          stream: false,
          ...(supportsReasoningEffort ? { reasoning_effort: smartMode ? "high" : "medium" } : {}),
          ...(workspaceEnabled ? { tools: WORKSPACE_TOOLS } : {}),
        },
        {
          headers: {
            Authorization: `Bearer ${AI_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.CLIENT_URL || "http://localhost:5173",
            "X-Title": "Figo AI",
          },
          timeout: deepResearch ? 120000 : 60000,
        }
      );
    } catch (error) {
      // groq/compound's free-tier search budget is small and shared across
      // every compound call, so it's the first thing to get rate-limited —
      // and since web search now defaults on for everyone, that budget runs
      // out constantly. Rather than surface an error for what's meant to be
      // an invisible enhancement, fall back once to the reliable non-search
      // model and answer without live search instead of failing the turn.
      const code = error.response?.data?.error?.code;
      const isRateLimited = error.response?.status === 429 || code === "rate_limit_exceeded" || code === "request_too_large";
      if (!isRateLimited || !false) throw error;

      console.warn(`Groq compound rate-limited — falling back to ${MODEL} for this reply`);
      usedModel = MODEL;
      response = await axios.post(
        AI_URL,
        {
          model: MODEL,
          messages: messages,
          temperature,
          stream: false,
          reasoning_effort: smartMode ? "high" : "medium",
        },
        {
          headers: {
            Authorization: `Bearer ${AI_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.CLIENT_URL || "http://localhost:5173",
            "X-Title": "Figo AI",
          },
          timeout: deepResearch ? 120000 : 60000,
        }
      );
    }

    const responseMessage = response.data?.choices?.[0]?.message;

    // The model asked to use a Workspace tool instead of replying — this
    // server can't run it (the sandbox lives in the user's browser), so hand
    // the tool calls back to the client. It executes them against the
    // WebContainer and re-POSTs here with the results appended to toolTurn.
    if (workspaceEnabled && Array.isArray(responseMessage?.tool_calls) && responseMessage.tool_calls.length > 0) {
      return res.json({
        success: true,
        needsTool: true,
        assistantMessage: { role: "assistant", content: responseMessage.content ?? null, tool_calls: responseMessage.tool_calls },
        model: requestedModelForCompletion,
      });
    }

    const assistantReply = responseMessage?.content;

    if (!assistantReply) {
      return res.status(500).json({
        success: false,
        error: "Invalid response from Groq",
      });
    }

    const sources = extractSources(responseMessage?.executed_tools);

    // The model signals a photo is warranted with a trailing [IMAGE: ...] line
    // (see system prompt). Pollinations turns a text prompt straight into an
    // image URL — no generation call or API key needed on our side, the
    // browser triggers the actual render when it loads the <img>.
    const imageMatch = assistantReply.match(/\[IMAGE:\s*([^\]]+)\]\s*$/i);
    const imagePrompt = imageMatch ? imageMatch[1].trim() : null;
    const cleanReply = imagePrompt ? assistantReply.slice(0, imageMatch.index).trim() : assistantReply;
    const images = imagePrompt
      ? [{
          // Pollinations' seed is expected to fit a normal int range — a raw
          // Date.now() timestamp (13 digits) overflows that and makes the
          // image request hang or 500, so keep it random but small instead.
          // "flux" is Pollinations' photorealistic model (vs. the faster but
          // flatter default), enhance=true runs the prompt through their own
          // LLM rewrite for better composition, and 3840x2160 is true 4K UHD
          // — this path only fires for real, photographable subjects (see
          // the system prompt), so photorealism is always the right call here.
          url: `https://image.pollinations.ai/prompt/${encodeURIComponent(`${imagePrompt}, photorealistic, ultra realistic, highly detailed, sharp focus`)}?width=3840&height=2160&model=flux&enhance=true&nologo=true&seed=${Math.floor(Math.random() * 1e9)}`,
          prompt: imagePrompt,
        }]
      : [];

    console.log("Response generated successfully");

    return res.json({
      success: true,
      reply: cleanReply,
      model: usedModel,
      sources,
      images,
    });

  } catch (error) {
    console.error("SERVER ERROR:");
    console.error(error.message);

    // Axios / Groq connection errors
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      return res.status(500).json({
        success: false,
        error: "Cannot connect to Groq. Check your network connection.",
      });
    }

    // Timeout
    if (error.code === "ECONNABORTED") {
      return res.status(500).json({
        success: false,
        error: "Groq request timed out",
      });
    }

    // groq/compound's free-tier token budget is small and shared across all
    // compound calls — surface this clearly instead of a cryptic 413/429.
    const providerCode = error.response?.data?.error?.code;
    if (error.response?.status === 429 || providerCode === "rate_limit_exceeded" || providerCode === "request_too_large") {
      return res.status(429).json({
        success: false,
        error: "Web search is rate-limited on Groq's free tier right now. Wait a moment and try again, or switch to a non-search model in Settings.",
      });
    }

    // Groq returned 4xx/5xx with a body (e.g. bad key, rate limit)
    const providerError = error.response?.data?.error?.message || error.response?.data?.error;
    if (providerError) {
      console.error("Groq:", providerError);
      return res.status(500).json({
        success: false,
        error: providerError,
      });
    }

    // Generic fallback
    return res.status(500).json({
      success: false,
      error: error.message || "Unknown server error",
    });
  }
});

/*
|--------------------------------------------------------------------------
| Chat Title Route — short auto-generated conversation name, ChatGPT-style
|--------------------------------------------------------------------------
*/
app.post("/api/chat/title", authenticate, async (req, res) => {
  try {
    const { message, reply } = req.body || {};
    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ success: false, error: "Request body must contain a message string" });
    }

    const response = await axios.post(
      AI_URL,
      {
        // Small/fast model — this is a cheap one-line summary, not a real answer.
        model: OPENROUTER_TITLE_MODEL,
        messages: [
          {
            role: "system",
            content:
              "Write a short title (3-6 words) that names what this conversation is about, the way a chat app names a conversation in its sidebar. Sound natural and specific, like a person titling their own conversation — never a clinical label. Avoid generic meta-words like 'exchange', 'conversation', 'chat', 'discussion', or 'inquiry'. For plain small talk or a greeting with no real topic yet, title it after what was actually said (e.g. 'Just Saying Hi', 'Hello There') rather than describing it abstractly. No quotes, no trailing punctuation, no emoji, no prefix like 'Title:'. Reply with only the title.",
          },
          {
            role: "user",
            content: `User: ${message.slice(0, 500)}${typeof reply === "string" ? `\nAssistant: ${reply.slice(0, 300)}` : ""}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 150,
        stream: false,
      },
      {
        headers: { Authorization: `Bearer ${AI_API_KEY}`, "Content-Type": "application/json", "HTTP-Referer": process.env.CLIENT_URL || "http://localhost:5173", "X-Title": "Figo AI" },
        timeout: 15000,
      }
    );

    let title = response.data?.choices?.[0]?.message?.content?.trim() || "";
    title = title.replace(/^["'“”]+|["'“”]+$/g, "").replace(/[.!?]+$/, "").trim().slice(0, 60);

    if (!title) {
      return res.status(500).json({ success: false, error: "Could not generate a title" });
    }

    return res.json({ success: true, title });
  } catch (error) {
    console.error("Title generation error:", error.message);
    return res.status(500).json({ success: false, error: "Could not generate a title" });
  }
});

/*
|--------------------------------------------------------------------------
| Voice Transcription Route — server-side speech-to-text via Groq Whisper
|--------------------------------------------------------------------------
| The browser's own SpeechRecognition API (used for dictation) only works in
| Chrome-family browsers, is flaky on mobile Safari, and only ever listens
| for one fixed language per session. This gives every browser a reliable,
| language-agnostic fallback: record audio client-side, ship it here as
| base64, transcribe it with Whisper (auto language detection, ~99
| languages) instead of a single hardcoded locale.
*/
const MAX_VOICE_BYTES = 20 * 1024 * 1024; // Whisper's own cap is 25MB; leave headroom

// Rough 0-1 confidence estimate from Whisper's verbose_json segments. There's
// no official "confidence" field, so this leans on the two signals Whisper
// does expose: avg_logprob (near 0 = confident, very negative = uncertain)
// and no_speech_prob (high = the model thinks it heard silence/noise, so its
// language guess for that stretch shouldn't be trusted). Segments with a high
// no_speech_prob are excluded rather than dragging the average down, since a
// silent segment isn't evidence of a *wrong* language guess.
function estimateConfidence(segments) {
  if (!Array.isArray(segments) || !segments.length) return 1;
  const voiced = segments.filter(s => typeof s.avg_logprob === "number" && (s.no_speech_prob ?? 0) < 0.5);
  if (!voiced.length) return 0;
  const avgLogprob = voiced.reduce((sum, s) => sum + s.avg_logprob, 0) / voiced.length;
  return Math.max(0, Math.min(1, Math.exp(avgLogprob)));
}

app.post("/api/voice/transcribe", authenticate, async (req, res) => {
  try {
    const { audio, mimeType, language } = req.body || {};
    if (typeof audio !== "string" || !audio) {
      return res.status(400).json({ success: false, error: "Request body must contain base64 audio data" });
    }

    let buffer;
    try {
      buffer = Buffer.from(audio, "base64");
    } catch {
      return res.status(400).json({ success: false, error: "Invalid base64 audio data" });
    }
    if (buffer.length === 0) {
      return res.status(400).json({ success: false, error: "Empty audio data" });
    }
    if (buffer.length > MAX_VOICE_BYTES) {
      return res.status(413).json({ success: false, error: "That recording is too long to transcribe" });
    }

    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mimeType || "audio/webm" }), "audio.webm");
    form.append("model", "whisper-large-v3");
    form.append("response_format", "verbose_json");
    // Omitting `language` lets Whisper auto-detect from the audio itself —
    // that's the default so users can speak any of its ~99 supported
    // languages without picking one first. A hint is only sent when the
    // caller passes one (see the client's low-confidence fallback), which
    // biases decoding toward that locale instead of forcing it.
    if (typeof language === "string" && language && language !== "auto" && language !== "rw" && LANGUAGE_NAMES[language]) {
      form.append("language", language);
    }

    const groqRes = await fetch(VOICE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${VOICE_API_KEY}` },
      body: form,
      signal: AbortSignal.timeout(30000),
    });

    if (!groqRes.ok) {
      const errBody = await groqRes.text().catch(() => "");
      console.error("Groq voice transcription error:", groqRes.status, errBody);
      return res.status(500).json({ success: false, error: "Could not transcribe that audio" });
    }

    const data = await groqRes.json();
    const text = data?.text?.trim();
    if (!text) {
      return res.status(422).json({ success: false, error: "Didn't catch any speech in that recording" });
    }

    return res.json({
      success: true,
      text,
      language: data?.language || null,
      confidence: estimateConfidence(data?.segments),
    });
  } catch (error) {
    console.error("Voice transcription error:", error.message);
    return res.status(500).json({ success: false, error: "Could not transcribe that audio" });
  }
});

// Groq text-to-speech for spoken assistant replies.
app.post("/api/voice/speak", authenticate, async (req, res) => {
  try {
    const { text: speechText } = req.body || {};
    if (typeof speechText !== "string" || !speechText.trim()) {
      return res.status(400).json({ success: false, error: "Text is required" });
    }
    if (!TTS_API_KEY) return res.status(503).json({ success: false, error: "Groq voice output is not configured" });
    const response = await fetch("https://api.groq.com/openai/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${TTS_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.GROQ_TTS_MODEL || "canopylabs/orpheus-v1-english",
        voice: process.env.GROQ_TTS_VOICE || "troy",
        input: speechText.trim().slice(0, 4000),
        response_format: "wav",
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("Groq TTS error:", response.status, detail);
      return res.status(502).json({ success: false, error: "Could not generate voice output" });
    }
    res.setHeader("Content-Type", response.headers.get("content-type") || "audio/wav");
    res.setHeader("Cache-Control", "no-store");
    return res.send(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error("Voice output error:", error.message);
    return res.status(500).json({ success: false, error: "Could not generate voice output" });
  }
});

/*
|--------------------------------------------------------------------------
| Serve the built frontend (production)
|--------------------------------------------------------------------------
| `npm run dev` runs the Vite dev server separately on :5173 with its own
| proxy for /api, so this block is a no-op locally unless you've actually
| built the client. In production there's only this one server: build the
| client first (`npm --prefix client run build`), then everything — API and
| static assets — is served from the same origin and port.
*/
const clientDist = path.join(__dirname, "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // Anything that isn't an API route is a client-side path (React Router) —
  // hand it index.html and let the SPA's own router figure out what to show.
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
} else {
  console.log("No client/dist found — this server will only answer /api/* requests.");
  console.log("Run `npm run build` (or `npm --prefix client run build`) to also serve the frontend from here.");
}

/*
|--------------------------------------------------------------------------
| Start Server
|--------------------------------------------------------------------------
*/
async function start() {
  await ensureDbReady();

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on 0.0.0.0:${PORT}`);
    console.log(`Using model: ${MODEL}`);
    console.log("Ready for requests...");
  });

  // Without this, a failed bind (e.g. a previous instance still holding the
  // port) is an unhandled 'error' event — Node treats that as a crash and
  // dumps a raw stack trace. Handle it explicitly so it's a clear message
  // and a clean exit instead.
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`\nPort ${PORT} is already in use — another FigoAI server is still running.`);
      console.error("Stop that instance first (Ctrl+C in its terminal, or close the window it's running in), then start this one again.\n");
    } else {
      console.error("Server failed to start:", err.message);
    }
    process.exit(1);
  });

  // Closing a terminal or hitting Ctrl+C without this just kills the process
  // outright, which can leave the port in a state Windows is slow to release —
  // the exact scenario that produces EADDRINUSE on the very next start. Closing
  // the server first lets the OS free the port immediately.
  const shutdown = (signal) => {
    console.log(`\nReceived ${signal}, shutting down...`);
    server.close(() => {
      console.log("Server closed.");
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

// Only bind a port when this file is actually run directly (`node server.js`
// — local dev, or Render/any persistent host). When it's instead required as
// a module (api/index.js, for Vercel's serverless runtime), skip straight to
// exporting the Express app below — Vercel's own runtime handles invoking it
// per request, and there's no long-lived process for a bound port to live in.
if (require.main === module) {
  start();
}

module.exports = app;
