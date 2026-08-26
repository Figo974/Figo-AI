const crypto = require("crypto");
const { sendFamilyInviteEmail, isEmailConfigured } = require("./mailer");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9]{7,15}$/;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

function registerFamilyRoutes(app, { pool, authenticate }) {
  app.post("/api/family/invite", authenticate, async (req, res) => {
    try {
      const { method, contact, relation } = req.body || {};

      if (method !== "email" && method !== "phone") {
        return res.status(400).json({ success: false, error: "Invalid invite method" });
      }
      if (relation !== "parent" && relation !== "child") {
        return res.status(400).json({ success: false, error: "Choose whether this person is a parent/guardian or a child" });
      }
      const cleanContact = typeof contact === "string" ? contact.trim() : "";
      if (method === "email") {
        if (!EMAIL_RE.test(cleanContact)) {
          return res.status(400).json({ success: false, error: "Enter a valid email address" });
        }
      } else if (!PHONE_RE.test(cleanContact.replace(/[\s()-]/g, ""))) {
        return res.status(400).json({ success: false, error: "Enter a valid phone number" });
      }

      const [[me]] = await pool.query("SELECT username, display_name, email FROM users WHERE id = ?", [req.user.id]);
      if (method === "email" && cleanContact.toLowerCase() === (me.email || "").toLowerCase()) {
        return res.status(400).json({ success: false, error: "You can't invite yourself" });
      }

      const token = crypto.randomBytes(24).toString("hex");
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

      await pool.query(
        `INSERT INTO family_invites (inviter_id, method, contact, relation, token, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [req.user.id, method, cleanContact, relation, token, expiresAt]
      );

      const inviteUrl = `${CLIENT_URL}/#family_invite=${token}`;
      let delivered = false;

      if (method === "email" && isEmailConfigured) {
        try {
          await sendFamilyInviteEmail(cleanContact, { inviterName: me.display_name || me.username, relation, inviteUrl });
          delivered = true;
        } catch (err) {
          console.error("Failed to send family invite email:", err.message);
        }
      }
      // Phone invites (and email when mail isn't configured) can't actually be
      // delivered by this server — there's no SMS provider wired up — so the
      // link is handed back for the inviter to share directly instead.

      return res.json({ success: true, delivered, inviteUrl });
    } catch (error) {
      console.error("Family invite error:", error.message);
      return res.status(500).json({ success: false, error: "Could not send that invite" });
    }
  });

  app.get("/api/family", authenticate, async (req, res) => {
    try {
      const [invites] = await pool.query(
        `SELECT id, method, contact, relation, status, created_at, expires_at
         FROM family_invites WHERE inviter_id = ? AND status = 'pending' ORDER BY created_at DESC`,
        [req.user.id]
      );

      const [links] = await pool.query(
        `SELECT fl.id, fl.parent_user_id, fl.child_user_id,
                p.display_name AS parent_name, p.username AS parent_username,
                c.display_name AS child_name, c.username AS child_username
         FROM family_links fl
         JOIN users p ON p.id = fl.parent_user_id
         JOIN users c ON c.id = fl.child_user_id
         WHERE fl.parent_user_id = ? OR fl.child_user_id = ?`,
        [req.user.id, req.user.id]
      );

      return res.json({
        success: true,
        invites: invites.map((row) => ({
          id: row.id,
          method: row.method,
          contact: row.contact,
          relation: row.relation,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
        })),
        members: links.map((row) => ({
          id: row.id,
          role: row.parent_user_id === req.user.id ? "child" : "parent",
          name:
            row.parent_user_id === req.user.id
              ? row.child_name || row.child_username
              : row.parent_name || row.parent_username,
        })),
      });
    } catch (error) {
      console.error("List family error:", error.message);
      return res.status(500).json({ success: false, error: "Could not load family members" });
    }
  });

  app.post("/api/family/invite/:id/cancel", authenticate, async (req, res) => {
    try {
      const [result] = await pool.query(
        "UPDATE family_invites SET status = 'canceled' WHERE id = ? AND inviter_id = ? AND status = 'pending'",
        [req.params.id, req.user.id]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, error: "Invite not found" });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Cancel family invite error:", error.message);
      return res.status(500).json({ success: false, error: "Could not cancel that invite" });
    }
  });

  app.get("/api/family/invite/:token", async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT fi.method, fi.contact, fi.relation, fi.status, fi.expires_at, u.display_name, u.username
         FROM family_invites fi JOIN users u ON u.id = fi.inviter_id
         WHERE fi.token = ?`,
        [req.params.token]
      );
      const row = rows[0];
      if (!row) {
        return res.status(404).json({ success: false, error: "Invite not found" });
      }
      if (row.status !== "pending" || new Date(row.expires_at) < new Date()) {
        return res.status(410).json({ success: false, error: "This invite is no longer valid" });
      }
      return res.json({
        success: true,
        invite: {
          inviterName: row.display_name || row.username,
          method: row.method,
          contact: row.contact,
          relation: row.relation,
        },
      });
    } catch (error) {
      console.error("Lookup family invite error:", error.message);
      return res.status(500).json({ success: false, error: "Could not load that invite" });
    }
  });

  app.post("/api/family/invite/:token/accept", authenticate, async (req, res) => {
    try {
      const [rows] = await pool.query("SELECT * FROM family_invites WHERE token = ?", [req.params.token]);
      const invite = rows[0];
      if (!invite) {
        return res.status(404).json({ success: false, error: "Invite not found" });
      }
      if (invite.status !== "pending" || new Date(invite.expires_at) < new Date()) {
        return res.status(410).json({ success: false, error: "This invite is no longer valid" });
      }
      if (invite.inviter_id === req.user.id) {
        return res.status(400).json({ success: false, error: "You can't accept your own invite" });
      }

      // relation describes how the INVITEE (the person accepting) relates to the inviter.
      const parentId = invite.relation === "child" ? invite.inviter_id : req.user.id;
      const childId = invite.relation === "child" ? req.user.id : invite.inviter_id;

      await pool.query(
        "INSERT INTO family_links (parent_user_id, child_user_id) VALUES (?, ?) ON CONFLICT (parent_user_id, child_user_id) DO NOTHING",
        [parentId, childId]
      );
      await pool.query("UPDATE family_invites SET status = 'accepted' WHERE id = ?", [invite.id]);

      return res.json({ success: true });
    } catch (error) {
      console.error("Accept family invite error:", error.message);
      return res.status(500).json({ success: false, error: "Could not accept that invite" });
    }
  });

  app.post("/api/family/invite/:token/decline", authenticate, async (req, res) => {
    try {
      const [result] = await pool.query(
        "UPDATE family_invites SET status = 'declined' WHERE token = ? AND status = 'pending'",
        [req.params.token]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, error: "Invite not found" });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Decline family invite error:", error.message);
      return res.status(500).json({ success: false, error: "Could not decline that invite" });
    }
  });

  app.delete("/api/family/link/:id", authenticate, async (req, res) => {
    try {
      const [result] = await pool.query(
        "DELETE FROM family_links WHERE id = ? AND (parent_user_id = ? OR child_user_id = ?)",
        [req.params.id, req.user.id, req.user.id]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, error: "Family member not found" });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Remove family link error:", error.message);
      return res.status(500).json({ success: false, error: "Could not remove that family member" });
    }
  });
}

module.exports = { registerFamilyRoutes };
