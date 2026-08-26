const axios = require("axios");
const crypto = require("crypto");
const { pool } = require("./db");

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

// Short-lived CSRF tokens for the OAuth redirect round-trip.
const pendingStates = new Map();
const STATE_TTL_MS = 5 * 60 * 1000;

function createState() {
  const state = crypto.randomBytes(16).toString("hex");
  pendingStates.set(state, Date.now() + STATE_TTL_MS);
  return state;
}

function consumeState(state) {
  const expires = pendingStates.get(state);
  pendingStates.delete(state);
  return !!expires && expires > Date.now();
}

setInterval(() => {
  const now = Date.now();
  for (const [state, expires] of pendingStates) {
    if (expires <= now) pendingStates.delete(state);
  }
}, 60 * 1000).unref();

function redirectWithError(res, message) {
  res.redirect(`${CLIENT_URL}/#auth_error=${encodeURIComponent(message)}`);
}

function redirectWithToken(res, token, user) {
  const params = new URLSearchParams({
    auth_token: token,
    auth_name: user.displayName || "",
    auth_avatar: user.avatarUrl || "",
  });
  res.redirect(`${CLIENT_URL}/#${params.toString()}`);
}

async function generateUniqueUsername(base) {
  let candidate = (base || "user").toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 28);
  if (candidate.length < 3) candidate = candidate.padEnd(3, "0");
  let username = candidate;
  let suffix = 0;
  for (;;) {
    const [rows] = await pool.query("SELECT id FROM users WHERE username = ?", [username]);
    if (rows.length === 0) return username;
    suffix += 1;
    username = `${candidate}${suffix}`.slice(0, 32);
  }
}

// Finds a user by provider id, else links an existing account with the same
// email, else creates a brand-new account. avatarUrl is never persisted (the
// app keeps profile data client-side) — it's only passed through this once.
async function findOrCreateOAuthUser({ column, providerId, email, displayName, avatarUrl }) {
  const [byProvider] = await pool.query(`SELECT id, username, email, display_name, advanced_security_enrolled, password_hash FROM users WHERE ${column} = ?`, [providerId]);
  if (byProvider.length) {
    const row = byProvider[0];
    return { id: row.id, username: row.username, email: row.email, displayName: row.display_name, avatarUrl, advancedSecurityEnrolled: !!row.advanced_security_enrolled, hasPassword: !!row.password_hash };
  }

  const [byEmail] = await pool.query("SELECT id, username, email, display_name, advanced_security_enrolled, password_hash FROM users WHERE email = ?", [email]);
  if (byEmail.length) {
    const row = byEmail[0];
    await pool.query(`UPDATE users SET ${column} = ? WHERE id = ?`, [providerId, row.id]);
    return { id: row.id, username: row.username, email: row.email, displayName: row.display_name, avatarUrl, advancedSecurityEnrolled: !!row.advanced_security_enrolled, hasPassword: !!row.password_hash };
  }

  const username = await generateUniqueUsername(displayName || email.split("@")[0]);
  const [result] = await pool.query(
    `INSERT INTO users (username, email, display_name, ${column}) VALUES (?, ?, ?, ?)`,
    [username, email, displayName || username, providerId]
  );
  return { id: result.insertId, username, email, displayName: displayName || username, avatarUrl, advancedSecurityEnrolled: false, hasPassword: false };
}

function registerOAuthRoutes(app, { signToken, createSession }) {
  // Google
  app.get("/api/auth/google", (req, res) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return redirectWithError(res, "Google sign-in is not configured on this server yet");
    }
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: `${SERVER_URL}/api/auth/google/callback`,
      response_type: "code",
      scope: "openid email profile",
      state: createState(),
      prompt: "select_account",
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    try {
      const { code, state } = req.query;
      if (!code || !state || !consumeState(state)) {
        return redirectWithError(res, "Invalid or expired sign-in request — please try again");
      }

      const tokenRes = await axios.post("https://oauth2.googleapis.com/token", {
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        redirect_uri: `${SERVER_URL}/api/auth/google/callback`,
        grant_type: "authorization_code",
      });

      const userRes = await axios.get("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
      });
      const profile = userRes.data;

      if (!profile.email) {
        return redirectWithError(res, "Your Google account has no accessible email address");
      }

      const user = await findOrCreateOAuthUser({
        column: "google_id",
        providerId: profile.sub,
        email: profile.email,
        displayName: profile.name,
        avatarUrl: profile.picture,
      });

      const { jti, expiresIn } = await createSession(pool, user.id, req);
      redirectWithToken(res, signToken(user, jti, expiresIn), user);
    } catch (error) {
      console.error("Google OAuth error:", error.response?.data || error.message);
      redirectWithError(res, "Google sign-in failed. Please try again.");
    }
  });

  // GitHub
  app.get("/api/auth/github", (req, res) => {
    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      return redirectWithError(res, "GitHub sign-in is not configured on this server yet");
    }
    const params = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      redirect_uri: `${SERVER_URL}/api/auth/github/callback`,
      scope: "read:user user:email",
      state: createState(),
    });
    res.redirect(`https://github.com/login/oauth/authorize?${params}`);
  });

  app.get("/api/auth/github/callback", async (req, res) => {
    try {
      const { code, state } = req.query;
      if (!code || !state || !consumeState(state)) {
        return redirectWithError(res, "Invalid or expired sign-in request — please try again");
      }

      const tokenRes = await axios.post(
        "https://github.com/login/oauth/access_token",
        { client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET, code, redirect_uri: `${SERVER_URL}/api/auth/github/callback` },
        { headers: { Accept: "application/json" } }
      );
      const accessToken = tokenRes.data.access_token;
      if (!accessToken) throw new Error(tokenRes.data.error_description || "No access token from GitHub");

      const headers = { Authorization: `Bearer ${accessToken}`, "User-Agent": "FigoAI" };
      const [userRes, emailsRes] = await Promise.all([
        axios.get("https://api.github.com/user", { headers }),
        axios.get("https://api.github.com/user/emails", { headers }).catch(() => ({ data: [] })),
      ]);
      const profile = userRes.data;
      const emails = emailsRes.data;
      const primaryEmail =
        emails.find((e) => e.primary && e.verified)?.email ||
        emails.find((e) => e.verified)?.email ||
        profile.email;

      if (!primaryEmail) {
        return redirectWithError(res, "Your GitHub account has no accessible email address");
      }

      const user = await findOrCreateOAuthUser({
        column: "github_id",
        providerId: String(profile.id),
        email: primaryEmail,
        displayName: profile.name || profile.login,
        avatarUrl: profile.avatar_url,
      });

      const { jti, expiresIn } = await createSession(pool, user.id, req);
      redirectWithToken(res, signToken(user, jti, expiresIn), user);
    } catch (error) {
      console.error("GitHub OAuth error:", error.response?.data || error.message);
      redirectWithError(res, "GitHub sign-in failed. Please try again.");
    }
  });
}

module.exports = { registerOAuthRoutes };
