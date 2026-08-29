import { useEffect, useState } from "react";
import { Icons } from "./icons.jsx";
import {
  getAdminOverview, listAdminUsers, deleteAdminUser, burnAdminUser, promoteAdminUser, demoteAdminUser,
  promoteSuperAdminUser, demoteSuperAdminUser,
  listAdminPasskeys, deleteAdminPasskey,
  listAdminSessions, revokeAdminSession,
  listAdminFamily, cancelAdminFamilyInvite, removeAdminFamilyLink,
} from "./api.js";

const TABS = [
  { id: "overview", label: "Overview", icon: (s) => <Icons.Shield size={16} {...s}/> },
  { id: "users", label: "Users", icon: (s) => <Icons.User size={16} {...s}/> },
  { id: "passkeys", label: "Passkeys", icon: (s) => <Icons.Key size={16} {...s}/> },
  { id: "sessions", label: "Sessions", icon: (s) => <Icons.Laptop size={16} {...s}/> },
  { id: "family", label: "Family", icon: (s) => <Icons.Baby size={16} {...s}/> },
];

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function StatCard({ label, value }) {
  return (
    <div className="admin-stat">
      <span className="admin-stat__value">{value}</span>
      <span className="admin-stat__label">{label}</span>
    </div>
  );
}

function EmptyRow({ children }) {
  return <div className="no-chats" style={{ padding: "24px 0" }}><span>{children}</span></div>;
}

function OverviewTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getAdminOverview().then((r) => setData(r.overview)).catch((e) => setError(e.message));
  }, []);

  if (error) return <EmptyRow>{error}</EmptyRow>;
  if (!data) return <EmptyRow>Loading…</EmptyRow>;

  return (
    <>
      <div className="admin-stat-grid">
        <StatCard label="Users" value={data.totalUsers} />
        <StatCard label="Active sessions" value={data.activeSessions} />
        <StatCard label="Sessions ever" value={data.totalSessionsEver} />
        <StatCard label="Family links" value={data.familyLinks} />
        <StatCard label="Pending invites" value={data.pendingInvites} />
        <StatCard label="Passkeys" value={data.passkeyCount} />
        <StatCard label="Server uptime" value={formatUptime(data.uptimeSeconds)} />
      </div>
      <h3 className="admin-section-title">Server</h3>
      <div className="account-row">
        <span className="account-row__label">Node.js version</span>
        <span className="account-row__value">{data.nodeVersion}</span>
      </div>
      <div className="account-row">
        <span className="account-row__label">Environment</span>
        <span className="account-row__value">{data.environment}</span>
      </div>
      <div className="account-row">
        <span className="account-row__label">Port</span>
        <span className="account-row__value">{data.port}</span>
      </div>
      <div className="account-row">
        <span className="account-row__label">Database</span>
        <span className="account-row__value">{data.database.name} @ {data.database.host}</span>
      </div>
      <h3 className="admin-section-title">AI model</h3>
      <div className="account-row">
        <span className="account-row__label">Default model</span>
        <span className="account-row__value">{data.aiModel}</span>
      </div>
      <div className="account-row">
        <span className="account-row__label">Allowed models</span>
        <span className="account-row__value">{data.allowedModels.join(", ")}</span>
      </div>
      <h3 className="admin-section-title">Integrations</h3>
      <div className="account-row">
        <span className="account-row__label">Password-reset email</span>
        <span className={`admin-badge ${data.integrations.email ? "admin-badge--on" : "admin-badge--off"}`}>{data.integrations.email ? "Configured" : "Not configured"}</span>
      </div>
      <div className="account-row">
        <span className="account-row__label">Google sign-in</span>
        <span className={`admin-badge ${data.integrations.googleOAuth ? "admin-badge--on" : "admin-badge--off"}`}>{data.integrations.googleOAuth ? "Configured" : "Not configured"}</span>
      </div>
      <div className="account-row">
        <span className="account-row__label">GitHub sign-in</span>
        <span className={`admin-badge ${data.integrations.githubOAuth ? "admin-badge--on" : "admin-badge--off"}`}>{data.integrations.githubOAuth ? "Configured" : "Not configured"}</span>
      </div>
    </>
  );
}

function UsersTab({ currentUserId, isSuperAdmin }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = () => listAdminUsers().then((r) => setUsers(r.users)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const patchUser = (id, patch) => setUsers((prev) => prev.map((x) => x.id === id ? { ...x, ...patch } : x));

  const handleDelete = async (u) => {
    if (!confirm(`Delete ${u.username}? This removes their account, sessions, and family links permanently.`)) return;
    try {
      await deleteAdminUser(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } catch (e) {
      alert(e.message);
    }
  };

  const handleBurn = async (u) => {
    if (!confirm(`Log ${u.username} out of every device? Their account stays intact.`)) return;
    setBusyId(u.id);
    try {
      await burnAdminUser(u.id);
      patchUser(u.id, { activeSessions: 0 });
    } catch (e) {
      alert(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleAdmin = async (u) => {
    if (u.isAdmin && !confirm(`Remove admin access from ${u.username}?`)) return;
    setBusyId(u.id);
    try {
      await (u.isAdmin ? demoteAdminUser(u.id) : promoteAdminUser(u.id));
      // Demoting from admin takes super admin with it too (server enforces
      // the same rule), so clear both here rather than just isAdmin.
      patchUser(u.id, u.isAdmin ? { isAdmin: false, isSuperAdmin: false } : { isAdmin: true });
    } catch (e) {
      alert(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleSuperAdmin = async (u) => {
    if (u.isSuperAdmin && !confirm(`Remove super admin access from ${u.username}?`)) return;
    setBusyId(u.id);
    try {
      await (u.isSuperAdmin ? demoteSuperAdminUser(u.id) : promoteSuperAdminUser(u.id));
      // Granting super admin also grants admin server-side, if it wasn't set already.
      patchUser(u.id, u.isSuperAdmin ? { isSuperAdmin: false } : { isSuperAdmin: true, isAdmin: true });
    } catch (e) {
      alert(e.message);
    } finally {
      setBusyId(null);
    }
  };

  if (error) return <EmptyRow>{error}</EmptyRow>;
  if (!users) return <EmptyRow>Loading…</EmptyRow>;
  if (users.length === 0) return <EmptyRow>No users yet</EmptyRow>;

  return (
    <div>
      {users.map((u) => {
        const isSelf = u.id === currentUserId;
        return (
          <div className="account-row" key={u.id}>
            <span className="account-row__label" style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
              <span style={{ color: "#ececec", fontSize: 14 }}>
                {u.displayName || u.username}
                {" "}
                {u.isSuperAdmin && <span className="admin-badge admin-badge--on">Super Admin</span>}
                {" "}
                {u.isAdmin && !u.isSuperAdmin && <span className="admin-badge admin-badge--on">Admin</span>}
              </span>
              <span>@{u.username} {u.email && `· ${u.email}`}</span>
              <span>Joined {formatDate(u.createdAt)} · {u.activeSessions} active session{u.activeSessions === 1 ? "" : "s"} · {u.passkeyCount} passkey{u.passkeyCount === 1 ? "" : "s"}{u.advancedSecurityEnrolled ? " · Advanced security on" : ""}</span>
            </span>
            <span style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              {isSuperAdmin && (
                <button className="admin-outline-btn" disabled={busyId === u.id} onClick={() => handleToggleAdmin(u)} title={u.isAdmin ? "Remove admin access" : "Make admin"}>
                  <Icons.Shield size={14}/> {u.isAdmin ? "Remove admin" : "Make admin"}
                </button>
              )}
              {isSuperAdmin && !isSelf && (
                <button className="admin-outline-btn" disabled={busyId === u.id} onClick={() => handleToggleSuperAdmin(u)} title={u.isSuperAdmin ? "Remove super admin access" : "Make super admin"}>
                  <Icons.Shield size={14}/> {u.isSuperAdmin ? "Remove super admin" : "Make super admin"}
                </button>
              )}
              {!isSelf && u.activeSessions > 0 && (
                <button className="admin-danger-btn" disabled={busyId === u.id} onClick={() => handleBurn(u)} title="Log out everywhere"><Icons.Zap size={14}/> Burn</button>
              )}
              {!isSelf && (
                <button className="admin-danger-btn" disabled={busyId === u.id} onClick={() => handleDelete(u)} title="Delete user"><Icons.Trash size={14}/> Delete</button>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PasskeysTab() {
  const [passkeys, setPasskeys] = useState(null);
  const [error, setError] = useState("");

  const load = () => listAdminPasskeys().then((r) => setPasskeys(r.passkeys)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const handleDelete = async (pk) => {
    if (!confirm(`Delete the passkey "${pk.nickname || pk.deviceType || "unnamed"}" for ${pk.username}?`)) return;
    try {
      await deleteAdminPasskey(pk.id);
      setPasskeys((prev) => prev.filter((x) => x.id !== pk.id));
    } catch (e) {
      alert(e.message);
    }
  };

  if (error) return <EmptyRow>{error}</EmptyRow>;
  if (!passkeys) return <EmptyRow>Loading…</EmptyRow>;
  if (passkeys.length === 0) return <EmptyRow>No passkeys registered yet</EmptyRow>;

  return (
    <div>
      {passkeys.map((pk) => (
        <div className="account-row" key={pk.id}>
          <span className="account-row__label" style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
            <span style={{ color: "#ececec", fontSize: 14 }}><Icons.Key size={14}/> {pk.nickname || pk.deviceType || "Unnamed passkey"}</span>
            <span>{pk.displayName || pk.username} · {pk.deviceType || "Unknown device"}{pk.backedUp ? " · Synced" : ""}</span>
            <span>Added {formatDate(pk.createdAt)}{pk.lastUsedAt ? ` · Last used ${formatDate(pk.lastUsedAt)}` : " · Never used"}</span>
          </span>
          <button className="admin-danger-btn" onClick={() => handleDelete(pk)} title="Delete passkey"><Icons.Trash size={14}/> Delete</button>
        </div>
      ))}
    </div>
  );
}

function SessionsTab() {
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState("");

  const load = () => listAdminSessions().then((r) => setSessions(r.sessions)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const handleRevoke = async (s) => {
    try {
      await revokeAdminSession(s.id);
      setSessions((prev) => prev.filter((x) => x.id !== s.id));
    } catch (e) {
      alert(e.message);
    }
  };

  if (error) return <EmptyRow>{error}</EmptyRow>;
  if (!sessions) return <EmptyRow>Loading…</EmptyRow>;
  if (sessions.length === 0) return <EmptyRow>No active sessions</EmptyRow>;

  return (
    <div>
      {sessions.map((s) => (
        <div className="account-row" key={s.id}>
          <span className="account-row__value">
            {s.deviceType === "Phone" ? <Icons.Smartphone size={16}/> : <Icons.Laptop size={16}/>}
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span>{s.displayName || s.username} — {s.browser} on {s.os}{s.city ? ` · ${s.city}` : ""}</span>
              <span className="account-row__label" style={{ fontSize: 12 }}>{formatDate(s.createdAt)}{s.current ? " · This session" : ""}</span>
            </span>
          </span>
          {!s.current && (
            <button className="admin-danger-btn" onClick={() => handleRevoke(s)} title="Revoke session"><Icons.Logout size={14}/> Revoke</button>
          )}
        </div>
      ))}
    </div>
  );
}

function FamilyTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = () => listAdminFamily().then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const handleCancel = async (invite) => {
    try {
      await cancelAdminFamilyInvite(invite.id);
      setData((prev) => ({ ...prev, invites: prev.invites.map((i) => i.id === invite.id ? { ...i, status: "canceled" } : i) }));
    } catch (e) {
      alert(e.message);
    }
  };

  const handleRemoveLink = async (link) => {
    if (!confirm(`Remove the link between ${link.parent} and ${link.child}?`)) return;
    try {
      await removeAdminFamilyLink(link.id);
      setData((prev) => ({ ...prev, links: prev.links.filter((l) => l.id !== link.id) }));
    } catch (e) {
      alert(e.message);
    }
  };

  if (error) return <EmptyRow>{error}</EmptyRow>;
  if (!data) return <EmptyRow>Loading…</EmptyRow>;

  return (
    <>
      <h3 className="admin-section-title">Linked families ({data.links.length})</h3>
      {data.links.length === 0 ? <EmptyRow>No family links yet</EmptyRow> : data.links.map((l) => (
        <div className="account-row" key={l.id}>
          <span className="account-row__label"><Icons.Baby size={14}/> {l.parent} ↔ {l.child} <span style={{ marginLeft: 8 }}>since {formatDate(l.createdAt)}</span></span>
          <button className="admin-danger-btn" onClick={() => handleRemoveLink(l)} title="Remove link"><Icons.X size={14}/> Remove</button>
        </div>
      ))}
      <h3 className="admin-section-title">Invites ({data.invites.length})</h3>
      {data.invites.length === 0 ? <EmptyRow>No invites yet</EmptyRow> : data.invites.map((i) => (
        <div className="account-row" key={i.id}>
          <span className="account-row__label">
            <Icons.Mail size={14}/> {i.inviter} invited {i.contact} as {i.relation}
            <span className={`admin-badge ${i.status === "pending" ? "admin-badge--on" : "admin-badge--off"}`} style={{ marginLeft: 8 }}>{i.status}</span>
          </span>
          {i.status === "pending" && (
            <button className="admin-danger-btn" onClick={() => handleCancel(i)} title="Cancel invite"><Icons.X size={14}/> Cancel</button>
          )}
        </div>
      ))}
    </>
  );
}

export default function AdminView({ user }) {
  const [tab, setTab] = useState("overview");

  return (
    <div className="library-view admin-view">
      <div className="library-view__header">
        <h1 className="view-title"><Icons.Shield size={22}/> Admin dashboard</h1>
      </div>
      <div className="admin-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`admin-tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            {t.icon()} {t.label}
          </button>
        ))}
      </div>
      {tab === "overview" && <OverviewTab />}
      {tab === "users" && <UsersTab currentUserId={user.id} isSuperAdmin={!!user.isSuperAdmin} />}
      {tab === "passkeys" && <PasskeysTab />}
      {tab === "sessions" && <SessionsTab />}
      {tab === "family" && <FamilyTab />}
    </div>
  );
}
