const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");

const RP_NAME = "FigoAI";
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const RP_ID = new URL(CLIENT_URL).hostname;
const ORIGIN = CLIENT_URL;

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

// In-memory challenge stores, same pattern as the in-memory chat history in
// server.js — a ceremony only needs to survive a few minutes, so there's no
// need for a DB table just to hold a one-time random value.
const registrationChallenges = new Map(); // userId -> { challenge, expiresAt }
const authChallenges = new Map(); // challenge -> { expiresAt }

function pruneExpired(map) {
  const now = Date.now();
  for (const [key, val] of map) {
    if (val.expiresAt < now) map.delete(key);
  }
}

function registerWebauthnRoutes(app, { pool, authenticate, signToken, createSession }) {
  /*
  |--------------------------------------------------------------------------
  | Registration (adding a passkey to an already-signed-in account)
  |--------------------------------------------------------------------------
  */
  app.post("/api/passkeys/register-options", authenticate, async (req, res) => {
    try {
      const [existing] = await pool.query(
        "SELECT credential_id, transports FROM passkeys WHERE user_id = ?",
        [req.user.id]
      );

      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: RP_ID,
        userID: new TextEncoder().encode(String(req.user.id)),
        userName: req.user.username,
        attestationType: "none",
        excludeCredentials: existing.map((row) => ({
          id: row.credential_id,
          transports: row.transports ? JSON.parse(row.transports) : undefined,
        })),
        // "required" so the credential is discoverable — needed for the
        // usernameless "Sign in with a passkey" flow on the login screen.
        authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
      });

      pruneExpired(registrationChallenges);
      registrationChallenges.set(req.user.id, {
        challenge: options.challenge,
        expiresAt: Date.now() + CHALLENGE_TTL_MS,
      });

      return res.json({ success: true, options });
    } catch (error) {
      console.error("Passkey register-options error:", error.message);
      return res.status(500).json({ success: false, error: "Could not start passkey registration" });
    }
  });

  app.post("/api/passkeys/register-verify", authenticate, async (req, res) => {
    try {
      const { response, nickname } = req.body || {};
      const pending = registrationChallenges.get(req.user.id);
      if (!response || !pending || pending.expiresAt < Date.now()) {
        return res.status(400).json({ success: false, error: "Registration session expired. Try adding the passkey again." });
      }

      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: pending.challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
      });

      registrationChallenges.delete(req.user.id);

      if (!verification.verified || !verification.registrationInfo) {
        return res.status(400).json({ success: false, error: "Could not verify that passkey" });
      }

      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
      await pool.query(
        `INSERT INTO passkeys (user_id, credential_id, public_key, counter, device_type, backed_up, transports, nickname)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          credential.id,
          Buffer.from(credential.publicKey).toString("base64"),
          credential.counter,
          credentialDeviceType,
          credentialBackedUp ? 1 : 0,
          credential.transports ? JSON.stringify(credential.transports) : null,
          typeof nickname === "string" && nickname.trim() ? nickname.trim().slice(0, 120) : null,
        ]
      );

      return res.json({ success: true });
    } catch (error) {
      console.error("Passkey register-verify error:", error.message);
      return res.status(500).json({ success: false, error: "Could not save that passkey" });
    }
  });

  /*
  |--------------------------------------------------------------------------
  | Managing existing passkeys
  |--------------------------------------------------------------------------
  */
  app.get("/api/passkeys", authenticate, async (req, res) => {
    try {
      const [rows] = await pool.query(
        "SELECT id, nickname, device_type, created_at, last_used_at FROM passkeys WHERE user_id = ? ORDER BY created_at DESC",
        [req.user.id]
      );
      return res.json({
        success: true,
        passkeys: rows.map((row) => ({
          id: row.id,
          nickname: row.nickname,
          deviceType: row.device_type,
          createdAt: row.created_at,
          lastUsedAt: row.last_used_at,
        })),
      });
    } catch (error) {
      console.error("List passkeys error:", error.message);
      return res.status(500).json({ success: false, error: "Could not load passkeys" });
    }
  });

  app.delete("/api/passkeys/:id", authenticate, async (req, res) => {
    try {
      const [result] = await pool.query("DELETE FROM passkeys WHERE id = ? AND user_id = ?", [
        req.params.id,
        req.user.id,
      ]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, error: "Passkey not found" });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete passkey error:", error.message);
      return res.status(500).json({ success: false, error: "Could not remove that passkey" });
    }
  });

  /*
  |--------------------------------------------------------------------------
  | Sign-in with a passkey (public — usernameless/discoverable credential)
  |--------------------------------------------------------------------------
  */
  app.post("/api/passkeys/login-options", async (req, res) => {
    try {
      const options = await generateAuthenticationOptions({
        rpID: RP_ID,
        userVerification: "preferred",
      });

      pruneExpired(authChallenges);
      authChallenges.set(options.challenge, { expiresAt: Date.now() + CHALLENGE_TTL_MS });

      return res.json({ success: true, options });
    } catch (error) {
      console.error("Passkey login-options error:", error.message);
      return res.status(500).json({ success: false, error: "Could not start passkey sign-in" });
    }
  });

  app.post("/api/passkeys/login-verify", async (req, res) => {
    try {
      const { response } = req.body || {};
      if (!response || typeof response.id !== "string" || !response.response?.clientDataJSON) {
        return res.status(400).json({ success: false, error: "Invalid passkey response" });
      }

      let expectedChallenge;
      try {
        const clientData = JSON.parse(Buffer.from(response.response.clientDataJSON, "base64url").toString("utf8"));
        expectedChallenge = clientData.challenge;
      } catch {
        return res.status(400).json({ success: false, error: "Invalid passkey response" });
      }

      const pending = authChallenges.get(expectedChallenge);
      if (!pending || pending.expiresAt < Date.now()) {
        return res.status(400).json({ success: false, error: "That sign-in attempt expired. Try again." });
      }
      authChallenges.delete(expectedChallenge);

      const [rows] = await pool.query(
        `SELECT p.id AS passkey_id, p.credential_id, p.public_key, p.counter, p.transports,
                u.id, u.username, u.email, u.display_name, u.advanced_security_enrolled
         FROM passkeys p JOIN users u ON u.id = p.user_id
         WHERE p.credential_id = ?`,
        [response.id]
      );
      const row = rows[0];
      if (!row) {
        return res.status(401).json({ success: false, error: "This passkey isn't registered with any account" });
      }

      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential: {
          id: row.credential_id,
          publicKey: new Uint8Array(Buffer.from(row.public_key, "base64")),
          counter: row.counter,
          transports: row.transports ? JSON.parse(row.transports) : undefined,
        },
      });

      if (!verification.verified) {
        return res.status(401).json({ success: false, error: "Could not verify that passkey" });
      }

      await pool.query("UPDATE passkeys SET counter = ?, last_used_at = NOW() WHERE id = ?", [
        verification.authenticationInfo.newCounter,
        row.passkey_id,
      ]);

      const user = { id: row.id, username: row.username, email: row.email, displayName: row.display_name, advancedSecurityEnrolled: !!row.advanced_security_enrolled };
      const { jti, expiresIn } = await createSession(pool, user.id, req);
      const token = signToken(user, jti, expiresIn);
      return res.json({ success: true, token, user });
    } catch (error) {
      console.error("Passkey login-verify error:", error.message);
      return res.status(500).json({ success: false, error: "Could not sign in with that passkey" });
    }
  });
}

module.exports = { registerWebauthnRoutes };
