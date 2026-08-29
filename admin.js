// Admin dashboard routes — everything here is gated behind requireAdmin, which
// reads the `is_admin` column for the calling user. Admin status lives on the
// account (see db.js's migration, which seeds it onto ADMIN_USERNAME the
// first time), not on a hardcoded username — any admin can promote or demote
// other accounts from the Users tab.

async function countRows(pool, sql) {
  const [rows] = await pool.query(sql);
  return rows[0].count;
}

function registerAdminRoutes(app, { pool, authenticate, isEmailConfigured, model, allowedModels }) {
  async function requireAdmin(req, res, next) {
    try {
      const [rows] = await pool.query("SELECT is_admin FROM users WHERE id = ?", [req.user.id]);
      if (!rows[0]?.is_admin) {
        return res.status(403).json({ success: false, error: "Admin access only" });
      }
      next();
    } catch (error) {
      console.error("Admin check error:", error.message);
      return res.status(500).json({ success: false, error: "Could not verify admin access" });
    }
  }

  // Gates adding/removing admin access itself — a regular admin can see who's
  // an admin or super admin (requireAdmin covers the list routes) but can't
  // change it; only a super admin can promote or demote.
  async function requireSuperAdmin(req, res, next) {
    try {
      const [rows] = await pool.query("SELECT is_super_admin FROM users WHERE id = ?", [req.user.id]);
      if (!rows[0]?.is_super_admin) {
        return res.status(403).json({ success: false, error: "Super admin access only" });
      }
      next();
    } catch (error) {
      console.error("Super admin check error:", error.message);
      return res.status(500).json({ success: false, error: "Could not verify super admin access" });
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Overview — headline counts + server/integration status
  |--------------------------------------------------------------------------
  */
  app.get("/api/admin/overview", authenticate, requireAdmin, async (req, res) => {
    try {
      const [totalUsers, activeSessions, familyLinks, pendingInvites, passkeyCount, totalSessionsEver] = await Promise.all([
        countRows(pool, "SELECT COUNT(*)::int AS count FROM users"),
        countRows(pool, "SELECT COUNT(*)::int AS count FROM sessions WHERE revoked_at IS NULL"),
        countRows(pool, "SELECT COUNT(*)::int AS count FROM family_links"),
        countRows(pool, "SELECT COUNT(*)::int AS count FROM family_invites WHERE status = 'pending'"),
        countRows(pool, "SELECT COUNT(*)::int AS count FROM passkeys"),
        countRows(pool, "SELECT COUNT(*)::int AS count FROM sessions"),
      ]);

      return res.json({
        success: true,
        overview: {
          totalUsers,
          activeSessions,
          totalSessionsEver,
          familyLinks,
          pendingInvites,
          passkeyCount,
          nodeVersion: process.version,
          uptimeSeconds: Math.round(process.uptime()),
          environment: process.env.NODE_ENV || "development",
          port: process.env.PORT || "3000",
          aiModel: model,
          allowedModels,
          database: { host: process.env.DB_HOST || "127.0.0.1", name: process.env.DB_NAME || "figoai" },
          integrations: {
            email: isEmailConfigured,
            googleOAuth: !!process.env.GOOGLE_CLIENT_ID,
            githubOAuth: !!process.env.GITHUB_CLIENT_ID,
          },
        },
      });
    } catch (error) {
      console.error("Admin overview error:", error.message);
      return res.status(500).json({ success: false, error: "Could not load overview" });
    }
  });

  /*
  |--------------------------------------------------------------------------
  | Users
  |--------------------------------------------------------------------------
  */
  app.get("/api/admin/users", authenticate, requireAdmin, async (req, res) => {
    try {
      const [rows] = await pool.query(`
        SELECT u.id, u.username, u.email, u.display_name, u.created_at, u.password_hash,
               u.advanced_security_enrolled, u.is_admin, u.is_super_admin,
               (SELECT COUNT(*)::int FROM sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL) AS active_sessions,
               (SELECT COUNT(*)::int FROM passkeys pk WHERE pk.user_id = u.id) AS passkey_count
        FROM users u
        ORDER BY u.created_at DESC
      `);
      return res.json({
        success: true,
        users: rows.map((row) => ({
          id: row.id,
          username: row.username,
          email: row.email,
          displayName: row.display_name,
          createdAt: row.created_at,
          hasPassword: !!row.password_hash,
          advancedSecurityEnrolled: !!row.advanced_security_enrolled,
          activeSessions: row.active_sessions,
          passkeyCount: row.passkey_count,
          isAdmin: !!row.is_admin,
          isSuperAdmin: !!row.is_super_admin,
        })),
      });
    } catch (error) {
      console.error("Admin list users error:", error.message);
      return res.status(500).json({ success: false, error: "Could not load users" });
    }
  });

  app.delete("/api/admin/users/:id", authenticate, requireAdmin, async (req, res) => {
    try {
      const targetId = Number(req.params.id);
      if (targetId === req.user.id) {
        return res.status(400).json({ success: false, error: "You can't delete your own admin account from here" });
      }
      const [result] = await pool.query("DELETE FROM users WHERE id = ?", [targetId]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, error: "User not found" });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Admin delete user error:", error.message);
      return res.status(500).json({ success: false, error: "Could not delete that user" });
    }
  });

  // "Burn" — force-logout everywhere, without deleting the account. Useful
  // for a compromised or misbehaving account you're not ready to delete yet.
  app.post("/api/admin/users/:id/burn", authenticate, requireAdmin, async (req, res) => {
    try {
      const targetId = Number(req.params.id);
      if (targetId === req.user.id) {
        return res.status(400).json({ success: false, error: "Use Settings > Security to log yourself out" });
      }
      await pool.query("UPDATE sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL", [targetId]);
      return res.json({ success: true });
    } catch (error) {
      console.error("Admin burn user error:", error.message);
      return res.status(500).json({ success: false, error: "Could not log that user out" });
    }
  });

  app.post("/api/admin/users/:id/promote", authenticate, requireSuperAdmin, async (req, res) => {
    try {
      const [result] = await pool.query("UPDATE users SET is_admin = TRUE WHERE id = ?", [req.params.id]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, error: "User not found" });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Admin promote user error:", error.message);
      return res.status(500).json({ success: false, error: "Could not make that user an admin" });
    }
  });

  app.post("/api/admin/users/:id/demote", authenticate, requireSuperAdmin, async (req, res) => {
    try {
      const targetId = Number(req.params.id);
      if (targetId === req.user.id) {
        return res.status(400).json({ success: false, error: "You can't remove your own admin access" });
      }
      // A super admin is necessarily also an admin, so losing admin access
      // has to take super admin with it — otherwise a user could end up
      // is_super_admin = TRUE while is_admin = FALSE, which every other route
      // here (and the UI) assumes can't happen.
      const [result] = await pool.query("UPDATE users SET is_admin = FALSE, is_super_admin = FALSE WHERE id = ?", [targetId]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, error: "User not found" });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Admin demote user error:", error.message);
      return res.status(500).json({ success: false, error: "Could not remove admin access" });
    }
  });

  // Only an existing super admin can create another one — this is the one
  // place that escalation happens through the UI (everything else about
  // super admin was a deploy-time-only DB bootstrap until now).
  app.post("/api/admin/users/:id/promote-super", authenticate, requireSuperAdmin, async (req, res) => {
    try {
      // Super admin implies admin, so grant both in case the target wasn't
      // already a regular admin.
      const [result] = await pool.query("UPDATE users SET is_admin = TRUE, is_super_admin = TRUE WHERE id = ?", [req.params.id]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, error: "User not found" });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Admin promote-super user error:", error.message);
      return res.status(500).json({ success: false, error: "Could not make that user a super admin" });
    }
  });

  app.post("/api/admin/users/:id/demote-super", authenticate, requireSuperAdmin, async (req, res) => {
    try {
      const targetId = Number(req.params.id);
      if (targetId === req.user.id) {
        return res.status(400).json({ success: false, error: "You can't remove your own super admin access" });
      }
      const [result] = await pool.query("UPDATE users SET is_super_admin = FALSE WHERE id = ?", [targetId]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, error: "User not found" });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Admin demote-super user error:", error.message);
      return res.status(500).json({ success: false, error: "Could not remove super admin access" });
    }
  });

  /*
  |--------------------------------------------------------------------------
  | Passkeys — every registered passkey, across every account
  |--------------------------------------------------------------------------
  */
  app.get("/api/admin/passkeys", authenticate, requireAdmin, async (req, res) => {
    try {
      const [rows] = await pool.query(`
        SELECT pk.id, pk.user_id, u.username, u.display_name, pk.nickname, pk.device_type,
               pk.backed_up, pk.transports, pk.created_at, pk.last_used_at
        FROM passkeys pk
        JOIN users u ON u.id = pk.user_id
        ORDER BY pk.created_at DESC
      `);
      return res.json({
        success: true,
        passkeys: rows.map((row) => ({
          id: row.id,
          userId: row.user_id,
          username: row.username,
          displayName: row.display_name,
          nickname: row.nickname,
          deviceType: row.device_type,
          backedUp: !!row.backed_up,
          transports: row.transports,
          createdAt: row.created_at,
          lastUsedAt: row.last_used_at,
        })),
      });
    } catch (error) {
      console.error("Admin list passkeys error:", error.message);
      return res.status(500).json({ success: false, error: "Could not load passkeys" });
    }
  });

  app.delete("/api/admin/passkeys/:id", authenticate, requireAdmin, async (req, res) => {
    try {
      const [result] = await pool.query("DELETE FROM passkeys WHERE id = ?", [req.params.id]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, error: "Passkey not found" });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Admin delete passkey error:", error.message);
      return res.status(500).json({ success: false, error: "Could not delete that passkey" });
    }
  });

  /*
  |--------------------------------------------------------------------------
  | Sessions — every active session, across every account
  |--------------------------------------------------------------------------
  */
  app.get("/api/admin/sessions", authenticate, requireAdmin, async (req, res) => {
    try {
      const [rows] = await pool.query(`
        SELECT s.id, s.jti, s.user_id, u.username, u.display_name, s.device_type, s.os, s.browser,
               s.city, s.region_code, s.ip_address, s.created_at
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.revoked_at IS NULL
        ORDER BY s.created_at DESC
        LIMIT 200
      `);
      return res.json({
        success: true,
        sessions: rows.map((row) => ({
          id: row.id,
          userId: row.user_id,
          username: row.username,
          displayName: row.display_name,
          deviceType: row.device_type,
          os: row.os,
          browser: row.browser,
          city: row.city,
          regionCode: row.region_code,
          ipAddress: row.ip_address,
          createdAt: row.created_at,
          current: row.jti === req.sessionJti,
        })),
      });
    } catch (error) {
      console.error("Admin list sessions error:", error.message);
      return res.status(500).json({ success: false, error: "Could not load sessions" });
    }
  });

  app.post("/api/admin/sessions/:id/revoke", authenticate, requireAdmin, async (req, res) => {
    try {
      const [result] = await pool.query("UPDATE sessions SET revoked_at = NOW() WHERE id = ? AND revoked_at IS NULL", [
        req.params.id,
      ]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, error: "Session not found" });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Admin revoke session error:", error.message);
      return res.status(500).json({ success: false, error: "Could not revoke that session" });
    }
  });

  /*
  |--------------------------------------------------------------------------
  | Family links & invites — every pairing and pending invite, across accounts
  |--------------------------------------------------------------------------
  */
  app.get("/api/admin/family", authenticate, requireAdmin, async (req, res) => {
    try {
      const [links] = await pool.query(`
        SELECT fl.id, fl.created_at,
               p.username AS parent_username, p.display_name AS parent_name,
               c.username AS child_username, c.display_name AS child_name
        FROM family_links fl
        JOIN users p ON p.id = fl.parent_user_id
        JOIN users c ON c.id = fl.child_user_id
        ORDER BY fl.created_at DESC
      `);

      const [invites] = await pool.query(`
        SELECT fi.id, fi.method, fi.contact, fi.relation, fi.status, fi.created_at, fi.expires_at,
               u.username AS inviter_username, u.display_name AS inviter_name
        FROM family_invites fi
        JOIN users u ON u.id = fi.inviter_id
        ORDER BY fi.created_at DESC
        LIMIT 200
      `);

      return res.json({
        success: true,
        links: links.map((row) => ({
          id: row.id,
          createdAt: row.created_at,
          parent: row.parent_name || row.parent_username,
          child: row.child_name || row.child_username,
        })),
        invites: invites.map((row) => ({
          id: row.id,
          method: row.method,
          contact: row.contact,
          relation: row.relation,
          status: row.status,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
          inviter: row.inviter_name || row.inviter_username,
        })),
      });
    } catch (error) {
      console.error("Admin list family error:", error.message);
      return res.status(500).json({ success: false, error: "Could not load family data" });
    }
  });

  app.post("/api/admin/family/invite/:id/cancel", authenticate, requireAdmin, async (req, res) => {
    try {
      const [result] = await pool.query(
        "UPDATE family_invites SET status = 'canceled' WHERE id = ? AND status = 'pending'",
        [req.params.id]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, error: "Invite not found" });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Admin cancel invite error:", error.message);
      return res.status(500).json({ success: false, error: "Could not cancel that invite" });
    }
  });

  app.delete("/api/admin/family/link/:id", authenticate, requireAdmin, async (req, res) => {
    try {
      const [result] = await pool.query("DELETE FROM family_links WHERE id = ?", [req.params.id]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, error: "Family link not found" });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Admin remove family link error:", error.message);
      return res.status(500).json({ success: false, error: "Could not remove that link" });
    }
  });
}

module.exports = { registerAdminRoutes };
