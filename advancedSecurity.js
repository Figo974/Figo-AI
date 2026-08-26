// "Advanced account security" — the stricter protection bundle from
// Settings > Security and login > Advanced security > Enroll. Requiring a
// passkey first (rather than just flipping a flag) is what keeps this from
// being able to lock someone out of their own account: password sign-in gets
// disabled the moment you enroll, so there has to already be another way in.
function registerAdvancedSecurityRoutes(app, { pool, authenticate }) {
  app.post("/api/security/advanced/enroll", authenticate, async (req, res) => {
    try {
      const [rows] = await pool.query("SELECT COUNT(*) AS cnt FROM passkeys WHERE user_id = ?", [req.user.id]);
      if (rows[0].cnt < 1) {
        return res.status(400).json({
          success: false,
          error: "Add at least one passkey before enrolling in Advanced Account Security — otherwise you'd lock yourself out.",
        });
      }

      await pool.query("UPDATE users SET advanced_security_enrolled = TRUE WHERE id = ?", [req.user.id]);
      return res.json({ success: true });
    } catch (error) {
      console.error("Advanced security enroll error:", error.message);
      return res.status(500).json({ success: false, error: "Could not enroll in Advanced Account Security" });
    }
  });

  app.post("/api/security/advanced/unenroll", authenticate, async (req, res) => {
    try {
      await pool.query("UPDATE users SET advanced_security_enrolled = FALSE WHERE id = ?", [req.user.id]);
      return res.json({ success: true });
    } catch (error) {
      console.error("Advanced security unenroll error:", error.message);
      return res.status(500).json({ success: false, error: "Could not turn off Advanced Account Security" });
    }
  });
}

module.exports = { registerAdvancedSecurityRoutes };
