const crypto = require("crypto");
const axios = require("axios");
const { sendLoginAlertEmail, isEmailConfigured } = require("./mailer");

// Accounts with Advanced Account Security get shorter-lived tokens instead of
// the normal JWT_EXPIRES_IN — one of the protections listed on that page.
const SHORT_SESSION_EXPIRES_IN = "24h";

// Coarse device/OS/browser labels parsed straight out of the User-Agent
// string — good enough for a "which device is this" list without pulling in
// a full UA-parsing dependency.
function parseUserAgent(ua = "") {
  let deviceType = "Computer";
  if (/iPad|Tablet(?!.*Mobile)/.test(ua)) deviceType = "Tablet";
  else if (/Mobi|Android|iPhone/.test(ua)) deviceType = "Phone";

  let os = "Unknown OS";
  if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
  else if (/Linux/.test(ua)) os = "Linux";

  let browser = "Unknown browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = "Safari";

  return { deviceType, os, browser };
}

function normalizeIp(ip = "") {
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

const PRIVATE_IP_RE = /^(::1|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

// Best-effort IP → city lookup via a free, keyless geolocation API. Failures
// (private/local IP, network hiccup, rate limit) just mean no city is shown —
// never block sign-in on this.
async function geolocateIp(ip) {
  const clean = normalizeIp(ip);
  if (!clean || PRIVATE_IP_RE.test(clean)) return null;
  try {
    const { data } = await axios.get(`http://ip-api.com/json/${encodeURIComponent(clean)}`, {
      params: { fields: "status,city,region" },
      timeout: 3000,
    });
    if (data?.status !== "success") return null;
    return { city: data.city || null, regionCode: data.region || null };
  } catch {
    return null;
  }
}

async function createSession(pool, userId, req) {
  const jti = crypto.randomUUID();
  const ua = req.headers["user-agent"] || "";
  const { deviceType, os, browser } = parseUserAgent(ua);
  const ip = normalizeIp((req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "");
  const geo = await geolocateIp(ip);

  await pool.query(
    `INSERT INTO sessions (user_id, jti, device_type, os, browser, ip_address, city, region_code, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, jti, deviceType, os, browser, ip || null, geo?.city || null, geo?.regionCode || null, ua.slice(0, 512)]
  );

  const [userRows] = await pool.query("SELECT email, advanced_security_enrolled FROM users WHERE id = ?", [userId]);
  const enrolled = !!userRows[0]?.advanced_security_enrolled;

  if (enrolled && isEmailConfigured && userRows[0].email) {
    sendLoginAlertEmail(userRows[0].email, { deviceType, os, browser, city: geo?.city, regionCode: geo?.regionCode }).catch((err) => {
      console.error("Failed to send login-alert email:", err.message);
    });
  }

  return { jti, expiresIn: enrolled ? SHORT_SESSION_EXPIRES_IN : undefined };
}

function registerSessionRoutes(app, { pool, authenticate }) {
  app.get("/api/sessions", authenticate, async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT id, jti, device_type, os, browser, city, region_code, created_at
         FROM sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC`,
        [req.user.id]
      );
      return res.json({
        success: true,
        sessions: rows.map((row) => ({
          id: row.id,
          deviceType: row.device_type,
          os: row.os,
          browser: row.browser,
          city: row.city,
          regionCode: row.region_code,
          createdAt: row.created_at,
          current: row.jti === req.sessionJti,
        })),
      });
    } catch (error) {
      console.error("List sessions error:", error.message);
      return res.status(500).json({ success: false, error: "Could not load sessions" });
    }
  });

  app.post("/api/sessions/:id/revoke", authenticate, async (req, res) => {
    try {
      const [rows] = await pool.query("SELECT jti FROM sessions WHERE id = ? AND user_id = ?", [
        req.params.id,
        req.user.id,
      ]);
      const row = rows[0];
      if (!row) {
        return res.status(404).json({ success: false, error: "Session not found" });
      }
      if (row.jti === req.sessionJti) {
        return res.status(400).json({ success: false, error: 'Use "Log out" to end your current session' });
      }
      await pool.query("UPDATE sessions SET revoked_at = NOW() WHERE id = ?", [req.params.id]);
      return res.json({ success: true });
    } catch (error) {
      console.error("Revoke session error:", error.message);
      return res.status(500).json({ success: false, error: "Could not log out that device" });
    }
  });

  app.post("/api/sessions/logout-all", authenticate, async (req, res) => {
    try {
      await pool.query("UPDATE sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL", [
        req.user.id,
      ]);
      return res.json({ success: true });
    } catch (error) {
      console.error("Logout-all sessions error:", error.message);
      return res.status(500).json({ success: false, error: "Could not log out all sessions" });
    }
  });
}

module.exports = { createSession, registerSessionRoutes };
