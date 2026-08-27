const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { pool } = require("./db");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const SALT_ROUNDS = 10;

// Valid bcrypt hash of a fixed, unused password. Comparing against this when a
// username isn't found keeps login response times consistent, so a client
// can't tell "wrong password" apart from "no such user" by timing alone.
const DUMMY_HASH = "$2b$10$uucLxNMy4.Xy2WmZEemX2OYViWskmVHpRG0RGsKdtYBoQ05vlUXPy";

if (!JWT_SECRET) {
  console.error("Missing JWT_SECRET. Set it in a .env file.");
  // Vercel sets VERCEL=1 automatically on every serverless invocation — skip
  // exiting there, since process.exit() kills the whole function invocation
  // (reported as "Serverless Function has crashed") instead of just this one
  // missing-config case. Local/Render runs (no VERCEL env var) still fail
  // fast with a clear message, same as before.
  if (!process.env.VERCEL) {
    process.exit(1);
  }
}

function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash || DUMMY_HASH);
}

// jti ties a token to a row in the `sessions` table so a specific device can
// be logged out remotely (Settings > Security > Active sessions) without
// waiting for the token to expire on its own. Older tokens issued before this
// existed simply have no jti, and skip that check below.
function signToken(user, jti, expiresIn) {
  return jwt.sign({ sub: user.id, username: user.username, jti }, JWT_SECRET, {
    expiresIn: expiresIn || JWT_EXPIRES_IN,
  });
}

async function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ success: false, error: "Missing or invalid authorization header" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    if (payload.jti) {
      const [rows] = await pool.query("SELECT revoked_at FROM sessions WHERE jti = ?", [payload.jti]);
      if (!rows.length || rows[0].revoked_at) {
        return res.status(401).json({ success: false, error: "This session has been logged out" });
      }
    }

    req.user = { id: payload.sub, username: payload.username };
    req.sessionJti = payload.jti;
    next();
  } catch {
    return res.status(401).json({ success: false, error: "Invalid or expired session" });
  }
}

module.exports = { hashPassword, verifyPassword, signToken, authenticate };
