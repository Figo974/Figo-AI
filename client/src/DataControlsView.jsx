import { useState } from "react";
import { Icons } from "./icons.jsx";

function DataToggle({ checked, onChange, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} className={`toggle-switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="toggle-switch__thumb" />
    </button>
  );
}

function exportChatsAsFile(chats, user) {
  const payload = { exportedAt: new Date().toISOString(), account: user?.email || user?.username, chats };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `figoai-data-export-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function DataControlsView({ settings, onUpdate, chats, setChats, onClearHistory, user }) {
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [privacyExpanded, setPrivacyExpanded] = useState(false);
  const [showArchivedManage, setShowArchivedManage] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [notice, setNotice] = useState("");

  const archivedChats = chats.filter(c => c.archived);

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(""), 2000); };

  const handleArchiveAll = () => {
    setChats(prev => prev.map(c => ({ ...c, archived: true })));
    flash("All chats archived");
  };

  const handleDeleteAll = () => {
    onClearHistory();
    setConfirmDeleteAll(false);
    flash("All chats deleted");
  };

  const handleUnarchive = (id) => {
    setChats(prev => prev.map(c => c.id === id ? { ...c, archived: false } : c));
  };

  return (
    <div className="data-controls">
      <div className="data-controls__row">
        <div>
          <span>Improve the model for everyone</span>
          {user?.advancedSecurityEnrolled && <p className="data-controls__inline-note">Disabled while Advanced Account Security is on.</p>}
        </div>
        <DataToggle
          checked={!user?.advancedSecurityEnrolled && settings.improveModel !== false}
          onChange={(v) => onUpdate({ ...settings, improveModel: v })}
          disabled={user?.advancedSecurityEnrolled}
        />
      </div>

      <div className="data-controls__block">
        <h3>Location</h3>
        <p>When enabled, your location helps FigoAI provide more relevant information, like local recommendations, news, and weather.</p>
        <button type="button" className="pill-btn" onClick={() => onUpdate({ ...settings, locationEnabled: !settings.locationEnabled })}>
          {settings.locationEnabled ? "Turn off" : "Turn on"}
        </button>
      </div>

      <button type="button" className="data-controls__row data-controls__row--link" onClick={() => setInfoExpanded(v => !v)}>
        <span>Information shared with apps</span>
        <Icons.ChevronRight size={16} />
      </button>
      {infoExpanded && <p className="data-controls__note">FigoAI doesn't share your conversations with any third-party apps.</p>}

      <div className="data-controls__row">
        <span>Shared links</span>
        <button type="button" className="pill-btn" onClick={() => flash("No shared links yet")}>Manage</button>
      </div>

      <div className="data-controls__row">
        <span>Archived chats</span>
        <button type="button" className="pill-btn" onClick={() => setShowArchivedManage(v => !v)}>Manage</button>
      </div>
      {showArchivedManage && (
        archivedChats.length ? (
          <div className="data-controls__archived-list">
            {archivedChats.map(c => (
              <div key={c.id} className="data-controls__archived-row">
                <span>{c.title || "Untitled chat"}</span>
                <button type="button" onClick={() => handleUnarchive(c.id)}>Unarchive</button>
              </div>
            ))}
          </div>
        ) : <p className="data-controls__note">No archived chats.</p>
      )}

      <div className="data-controls__row">
        <span>Archive all chats</span>
        <button type="button" className="pill-btn" onClick={handleArchiveAll}>Archive all</button>
      </div>

      <div className="data-controls__row">
        <span>Delete all chats</span>
        {confirmDeleteAll ? (
          <span className="data-controls__confirm">
            <button type="button" className="pill-btn" onClick={() => setConfirmDeleteAll(false)}>Cancel</button>
            <button type="button" className="pill-btn pill-btn--danger" onClick={handleDeleteAll}>Confirm</button>
          </span>
        ) : (
          <button type="button" className="pill-btn pill-btn--danger" onClick={() => setConfirmDeleteAll(true)}>Delete all</button>
        )}
      </div>

      <div className="data-controls__row">
        <span>Export data</span>
        <button type="button" className="pill-btn" onClick={() => exportChatsAsFile(chats, user)}>Export</button>
      </div>

      <button type="button" className="data-controls__row data-controls__row--link" onClick={() => setPrivacyExpanded(v => !v)}>
        <span>Marketing privacy</span>
        <Icons.ChevronRight size={16} />
      </button>
      {privacyExpanded && <p className="data-controls__note">FigoAI doesn't use your conversations for marketing or ad targeting.</p>}

      {notice && <p className="data-controls__flash">{notice}</p>}
    </div>
  );
}
