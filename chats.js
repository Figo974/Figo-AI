// Server-side mirror of each account's "Recents" chat list, so it follows
// the account across devices instead of staying stuck in one browser's
// localStorage. The client keeps owning the chat shape (id/title/messages/
// archived/timestamps) — these routes just persist it.

function registerChatRoutes(app, { pool, authenticate }) {
  app.get("/api/chats", authenticate, async (req, res) => {
    try {
      const [rows] = await pool.query(
        "SELECT client_id, title, messages, archived, created_at, updated_at FROM chats WHERE user_id = ? ORDER BY updated_at DESC",
        [req.user.id]
      );
      return res.json({
        success: true,
        chats: rows.map((row) => ({
          id: Number(row.client_id),
          title: row.title,
          messages: row.messages,
          archived: !!row.archived,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
      });
    } catch (error) {
      console.error("List chats error:", error.message);
      return res.status(500).json({ success: false, error: "Could not load your chats" });
    }
  });

  // Upsert-only, deliberately never deletes — a single chat or the whole
  // list is removed through the explicit routes below instead, so a bug in
  // this bulk sync can't silently wipe someone's history.
  app.put("/api/chats", authenticate, async (req, res) => {
    try {
      const chats = Array.isArray(req.body?.chats) ? req.body.chats : [];
      for (const chat of chats) {
        const clientId = Number(chat?.id);
        if (!Number.isFinite(clientId)) continue;
        const title = typeof chat.title === "string" && chat.title.trim() ? chat.title.slice(0, 255) : "New chat";
        const messages = Array.isArray(chat.messages) ? chat.messages : [];
        const archived = chat.archived === true;
        await pool.query(
          `INSERT INTO chats (user_id, client_id, title, messages, archived, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, COALESCE(?, NOW()), COALESCE(?, NOW()))
           ON CONFLICT (user_id, client_id) DO UPDATE SET
             title = EXCLUDED.title,
             messages = EXCLUDED.messages,
             archived = EXCLUDED.archived,
             updated_at = EXCLUDED.updated_at`,
          [req.user.id, clientId, title, JSON.stringify(messages), archived, chat.createdAt || null, chat.updatedAt || null]
        );
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Sync chats error:", error.message);
      return res.status(500).json({ success: false, error: "Could not sync your chats" });
    }
  });

  app.delete("/api/chats/:clientId", authenticate, async (req, res) => {
    try {
      await pool.query("DELETE FROM chats WHERE user_id = ? AND client_id = ?", [req.user.id, req.params.clientId]);
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete chat error:", error.message);
      return res.status(500).json({ success: false, error: "Could not delete that chat" });
    }
  });

  app.post("/api/chats/clear", authenticate, async (req, res) => {
    try {
      await pool.query("DELETE FROM chats WHERE user_id = ?", [req.user.id]);
      return res.json({ success: true });
    } catch (error) {
      console.error("Clear chats error:", error.message);
      return res.status(500).json({ success: false, error: "Could not clear your chats" });
    }
  });
}

module.exports = { registerChatRoutes };
