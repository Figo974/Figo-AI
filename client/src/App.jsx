import { useEffect, useRef, useState, useCallback, useMemo, lazy, Suspense } from "react";
import {
  checkHealth, sendMessage, changePassword, addPassword, generateChatTitle, transcribeVoice,
  getPasskeyRegisterOptions, verifyPasskeyRegistration, listPasskeys, deletePasskey,
  listSessions, revokeSession, logoutAllSessions,
  enrollAdvancedSecurity, unenrollAdvancedSecurity,
  sendFamilyInvite, listFamily, cancelFamilyInvite, removeFamilyLink,
  updateUsername, updateDisplayName, updateEmail, deleteAccount,
} from "./api.js";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { Icons } from "./icons.jsx";
import { getAvatarInitial, getAvatarColor } from "./constants.js";
import ImagesView from "./ImagesView.jsx";
import LibraryView, { getLibraryStats } from "./LibraryView.jsx";
import ProjectsView from "./ProjectsView.jsx";
import DataControlsView from "./DataControlsView.jsx";
import AdminView from "./AdminView.jsx";
import "./App.css";

// Lazy-loaded: pulls in @imgly/background-removal (and its on-demand WASM/model
// download) only when someone actually opens the image editor, not on every page load.
const ImageEditor = lazy(() => import("./ImageEditor.jsx"));

// Windows' emoji font renders most country flags as plain two-letter text
// instead of a picture, so the picker shows real flag SVGs for those instead.
// The character typed into the chat is still the actual Unicode flag emoji.
function flagCountryCode(emoji) {
  const letters = [...emoji]
    .map((c) => c.codePointAt(0))
    .filter((cp) => cp >= 0x1f1e6 && cp <= 0x1f1ff)
    .map((cp) => String.fromCharCode(cp - 0x1f1e6 + 97));
  return letters.length === 2 ? letters.join("") : null;
}

// The composer's plain <input> can't show images in place of characters, so a
// typed flag still looks like text there — that's a native-input limitation.
// Sent messages render as rich HTML though, so this swaps flag characters for
// real flag pictures wherever it's used.
const FLAG_SPLIT_RE = /([\u{1F1E6}-\u{1F1FF}]{2})/gu;
const FLAG_TEST_RE = /^[\u{1F1E6}-\u{1F1FF}]{2}$/u;

function renderTextWithFlags(text, keyPrefix) {
  return text.split(FLAG_SPLIT_RE).filter(Boolean).map((part, i) => {
    if (FLAG_TEST_RE.test(part)) {
      const cc = flagCountryCode(part);
      if (cc) {
        return <img key={`${keyPrefix}-f${i}`} className="flag-icon-inline" src={`/flags/4x3/${cc}.svg`} alt={part} title={cc.toUpperCase()} />;
      }
    }
    return part;
  });
}

const EMOJI_CATEGORIES = {
  "Smileys": ["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘","😋","😜","🤪","🤑","🤗","🤭","🤔","🤨","😐","😑","😏","🙄","😴","🤤","🥳","😎","🤓","🧐","😕","🙁","😮","😲","🥺","😢","😭","😤","😡","🤯","🥵","🥶","😱","🤢","🤮","🤒","🤕","😷","🤠","👻","💀","🤡","👽","🤖"],
  "Gestures": ["👋","🤚","🖐️","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","👈","👉","👆","👇","☝️","👍","👎","✊","👊","👏","🙌","👐","🤲","🤝","🙏","💪","🧠","👀","👄"],
  "Hearts": ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","💌"],
  "Animals & Nature": ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐔","🐧","🐦","🦆","🦉","🐺","🐴","🦄","🐝","🦋","🐢","🐍","🐙","🐬","🐳","🦈","🐘","🦒","🌵","🌲","🌸","🌻","🌈","🔥","⭐","🌙","☀️","❄️","🌊"],
  "Food & Drink": ["🍏","🍎","🍊","🍋","🍌","🍉","🍇","🍓","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🥑","🥦","🌽","🥕","🍕","🍔","🍟","🌭","🍿","🧀","🥐","🍞","🥞","🍗","🍳","🥗","🍜","🍣","🍩","🍪","🎂","🍰","🍫","🍦","☕","🍵","🍺","🍷","🥂"],
  "Activities": ["⚽","🏀","🏈","⚾","🎾","🏐","🏉","🎱","🏓","🏸","🥊","🎯","🎮","🎲","🎸","🎹","🎤","🎧","🎨","🎬","🏆","🥇","🎖️"],
  "Travel & Places": ["🚗","🚕","🚙","🚌","🏎️","🚓","🚑","🚒","🚲","✈️","🚀","🚁","⛵","🚂","🗽","🗼","🏰","🎡","🎢","⛺","🏖️","🏔️","🌋"],
  "Objects": ["💡","🔦","📱","💻","🖥️","⌨️","🖱️","📷","🎥","📞","📺","📻","⏰","⌚","🔋","🔌","💰","💵","💳","💎","🔑","🔒","🔓","🛠️","🔧","🔨","⚙️","📌","📎","✂️","📝","📚","📖","🎁","🎀","🛒","📦"],
  "Symbols": ["✨","💫","⚡","💥","💯","✅","❌","❗","❓","🔥","💤","🎵","🎶","🚩","🔔","♻️","🆕","🆗","⚠️","🚫","🔴","🟢","🟡","🔵","🟣","⚪","⚫"],
  "Flags": ["🏳️","🏴","🚩","🏁","🏳️‍🌈","🇦🇩","🇦🇪","🇦🇫","🇦🇬","🇦🇮","🇦🇱","🇦🇲","🇦🇴","🇦🇶","🇦🇷","🇦🇸","🇦🇹","🇦🇺","🇦🇼","🇦🇽","🇦🇿","🇧🇦","🇧🇧","🇧🇩","🇧🇪","🇧🇫","🇧🇬","🇧🇭","🇧🇮","🇧🇯","🇧🇱","🇧🇲","🇧🇳","🇧🇴","🇧🇶","🇧🇷","🇧🇸","🇧🇹","🇧🇻","🇧🇼","🇧🇾","🇧🇿","🇨🇦","🇨🇨","🇨🇩","🇨🇫","🇨🇬","🇨🇭","🇨🇮","🇨🇰","🇨🇱","🇨🇲","🇨🇳","🇨🇴","🇨🇷","🇨🇺","🇨🇻","🇨🇼","🇨🇽","🇨🇾","🇨🇿","🇩🇪","🇩🇯","🇩🇰","🇩🇲","🇩🇴","🇩🇿","🇪🇨","🇪🇪","🇪🇬","🇪🇭","🇪🇷","🇪🇸","🇪🇹","🇪🇺","🇫🇮","🇫🇯","🇫🇰","🇫🇲","🇫🇴","🇫🇷","🇬🇦","🇬🇧","🇬🇩","🇬🇪","🇬🇫","🇬🇬","🇬🇭","🇬🇮","🇬🇱","🇬🇲","🇬🇳","🇬🇵","🇬🇶","🇬🇷","🇬🇸","🇬🇹","🇬🇺","🇬🇼","🇬🇾","🇭🇰","🇭🇲","🇭🇳","🇭🇷","🇭🇹","🇭🇺","🇮🇩","🇮🇪","🇮🇱","🇮🇲","🇮🇳","🇮🇴","🇮🇶","🇮🇷","🇮🇸","🇮🇹","🇯🇪","🇯🇲","🇯🇴","🇯🇵","🇰🇪","🇰🇬","🇰🇭","🇰🇮","🇰🇲","🇰🇳","🇰🇵","🇰🇷","🇰🇼","🇰🇾","🇰🇿","🇱🇦","🇱🇧","🇱🇨","🇱🇮","🇱🇰","🇱🇷","🇱🇸","🇱🇹","🇱🇺","🇱🇻","🇱🇾","🇲🇦","🇲🇨","🇲🇩","🇲🇪","🇲🇫","🇲🇬","🇲🇭","🇲🇰","🇲🇱","🇲🇲","🇲🇳","🇲🇴","🇲🇵","🇲🇶","🇲🇷","🇲🇸","🇲🇹","🇲🇺","🇲🇻","🇲🇼","🇲🇽","🇲🇾","🇲🇿","🇳🇦","🇳🇨","🇳🇪","🇳🇫","🇳🇬","🇳🇮","🇳🇱","🇳🇴","🇳🇵","🇳🇷","🇳🇺","🇳🇿","🇴🇲","🇵🇦","🇵🇪","🇵🇫","🇵🇬","🇵🇭","🇵🇰","🇵🇱","🇵🇲","🇵🇳","🇵🇷","🇵🇸","🇵🇹","🇵🇼","🇵🇾","🇶🇦","🇷🇪","🇷🇴","🇷🇸","🇷🇺","🇷🇼","🇸🇦","🇸🇧","🇸🇨","🇸🇩","🇸🇪","🇸🇬","🇸🇭","🇸🇮","🇸🇯","🇸🇰","🇸🇱","🇸🇲","🇸🇳","🇸🇴","🇸🇷","🇸🇸","🇸🇹","🇸🇻","🇸🇽","🇸🇾","🇸🇿","🇹🇨","🇹🇩","🇹🇫","🇹🇬","🇹🇭","🇹🇯","🇹🇰","🇹🇱","🇹🇲","🇹🇳","🇹🇴","🇹🇷","🇹🇹","🇹🇻","🇹🇼","🇹🇿","🇺🇦","🇺🇬","🇺🇲","🇺🇸","🇺🇾","🇺🇿","🇻🇦","🇻🇨","🇻🇪","🇻🇬","🇻🇮","🇻🇳","🇻🇺","🇼🇫","🇼🇸","🇾🇪","🇾🇹","🇿🇦","🇿🇲","🇿🇼"],
};

const PROFILE_USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;

function ProfilePanel({ user, onUpdate, onClose }) {
  const [name, setName] = useState(user?.displayName || user?.username || '');
  const [username, setUsername] = useState(user?.username || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);
  const avatarColor = getAvatarColor(user?.displayName || user?.username);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => setAvatarUrl(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    const trimmedUsername = username.trim();
    if (!trimmedName) { setError('Enter a display name'); return; }
    if (!PROFILE_USERNAME_RE.test(trimmedUsername)) {
      setError('Username must be 3-32 characters (letters, numbers, . _ -)');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const updates = { ...user, avatarUrl };
      if (trimmedName !== (user?.displayName || '')) {
        await updateDisplayName(trimmedName);
        updates.displayName = trimmedName;
      }
      if (trimmedUsername !== (user?.username || '')) {
        await updateUsername(trimmedUsername);
        updates.username = trimmedUsername;
      }
      onUpdate(updates);
      onClose();
    } catch (err) {
      setError(err.message || 'Could not update profile');
    }
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="profile-panel" onClick={e => e.stopPropagation()}>
        <div className="profile-panel__header">
          <h2>Edit profile</h2>
          <button onClick={onClose}><Icons.X /></button>
        </div>

        <div className="profile-panel__body">
          <div className="profile-avatar-section">
            <div
              className="profile-avatar"
              style={{background: avatarColor}}
              onClick={() => fileInputRef.current?.click()}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="avatar" />
              ) : (
                <span className="avatar-initial">{getAvatarInitial(name)}</span>
              )}
              <div className="avatar-overlay">
                <Icons.Camera />
              </div>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" hidden />
          </div>

          <div className="profile-field">
            <label>Display name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>

          <div className="profile-field">
            <label>Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
          </div>

          {error && <p className="password-form__status password-form__status--error">{error}</p>}
        </div>

        <div className="profile-panel__footer">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-save" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

function ChangePasswordForm({ notifyEmail }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState(null); // { type: 'error'|'success', text }
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setStatus({ type: "error", text: "Fill in all fields" });
      return;
    }
    if (newPassword.length < 8) {
      setStatus({ type: "error", text: "New password must be at least 8 characters" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus({ type: "error", text: "New passwords don't match" });
      return;
    }

    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword, notifyEmail);
      setStatus({ type: "success", text: "Password updated" });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (err) {
      setStatus({ type: "error", text: err.message || "Could not update password" });
    }
    setSubmitting(false);
  };

  return (
    <form className="password-form" onSubmit={handleSubmit}>
      <input type="password" placeholder="Current password" autoComplete="current-password" value={currentPassword} onChange={(e)=>setCurrentPassword(e.target.value)} />
      <input type="password" placeholder="New password" autoComplete="new-password" value={newPassword} onChange={(e)=>setNewPassword(e.target.value)} />
      <input type="password" placeholder="Confirm new password" autoComplete="new-password" value={confirmPassword} onChange={(e)=>setConfirmPassword(e.target.value)} />
      {status && <p className={`password-form__status password-form__status--${status.type}`}>{status.text}</p>}
      <button type="submit" className="password-form__submit" disabled={submitting}>
        <Icons.Key size={14}/> {submitting ? "Updating…" : "Update Password"}
      </button>
    </form>
  );
}

// For accounts created via Google/Microsoft/Apple that have no password yet —
// unlike ChangePasswordForm, there's no "current password" to verify.
function AddPasswordForm({ onAdded }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState(null); // { type: 'error'|'success', text }
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus(null);

    if (!newPassword || !confirmPassword) {
      setStatus({ type: "error", text: "Fill in all fields" });
      return;
    }
    if (newPassword.length < 8) {
      setStatus({ type: "error", text: "Password must be at least 8 characters" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus({ type: "error", text: "Passwords don't match" });
      return;
    }

    setSubmitting(true);
    try {
      await addPassword(newPassword);
      setNewPassword(""); setConfirmPassword("");
      onAdded();
    } catch (err) {
      setStatus({ type: "error", text: err.message || "Could not add a password" });
    }
    setSubmitting(false);
  };

  return (
    <form className="password-form" onSubmit={handleSubmit}>
      <input type="password" placeholder="New password" autoComplete="new-password" value={newPassword} onChange={(e)=>setNewPassword(e.target.value)} />
      <input type="password" placeholder="Confirm new password" autoComplete="new-password" value={confirmPassword} onChange={(e)=>setConfirmPassword(e.target.value)} />
      {status && <p className={`password-form__status password-form__status--${status.type}`}>{status.text}</p>}
      <button type="submit" className="password-form__submit" disabled={submitting}>
        <Icons.Key size={14}/> {submitting ? "Adding…" : "Add Password"}
      </button>
    </form>
  );
}

// ChatGPT-style account switcher: the current account's header, any other
// accounts signed in on this browser (click to switch without logging out
// of the current one), then the usual Profile/Settings/Add account/Log out.
function UserMenu({ user, accounts, onSwitchAccount, onProfile, onSettings, onAddAccount, onAdmin, onLogout, rail }) {
  const otherAccounts = (accounts || []).filter(a => a.user?.id !== user.id);

  const avatarFor = (u) => (
    <div className="sidebar__user-avatar" style={{background:getAvatarColor(u.displayName||u.username)}}>
      {u.avatarUrl ? <img src={u.avatarUrl} alt="" style={{width:'100%',height:'100%',borderRadius:'50%',objectFit:'cover'}}/> : <span className="avatar-initial">{getAvatarInitial(u.displayName||u.username)}</span>}
    </div>
  );

  return (
    <div className={`user-menu ${rail ? 'user-menu--rail' : ''}`}>
      <div className="user-menu__header">
        {avatarFor(user)}
        <div className="user-menu__id">
          <span className="user-menu__name">{user.displayName||user.username}</span>
          {user.email && <span className="user-menu__email">{user.email}</span>}
        </div>
      </div>
      {otherAccounts.length > 0 && (
        <>
          <div className="user-menu__divider"></div>
          {otherAccounts.map(a => (
            <button key={a.user.id} className="user-menu__account-row" onClick={()=>onSwitchAccount(a)}>
              {avatarFor(a.user)}
              <div className="user-menu__id">
                <span className="user-menu__name">{a.user.displayName||a.user.username}</span>
                {a.user.email && <span className="user-menu__email">{a.user.email}</span>}
              </div>
            </button>
          ))}
        </>
      )}
      <div className="user-menu__divider"></div>
      <button onClick={onProfile}><Icons.User size={16}/> Profile</button>
      <button onClick={onSettings}><Icons.Settings size={16}/> Settings</button>
      {user.isAdmin && <button onClick={onAdmin}><Icons.Shield size={16}/> Admin dashboard</button>}
      <button onClick={onAddAccount}><Icons.Plus size={16}/> Add account</button>
      <div className="user-menu__divider"></div>
      <button className="user-menu__logout" onClick={onLogout}><Icons.Logout size={16}/> Log out</button>
    </div>
  );
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const MOD_KEY = IS_MAC ? '⌘' : 'Ctrl';

const SETTINGS_CATEGORIES = [
  { id: 'general', label: 'General', icon: Icons => <Icons.Settings size={16}/> },
  { id: 'notifications', label: 'Notifications', icon: Icons => <Icons.Bell size={16}/> },
  { id: 'personalization', label: 'Personalization', icon: Icons => <Icons.Sparkles size={16}/> },
  { id: 'voice', label: 'Voice', icon: Icons => <Icons.Mic size={16}/> },
  { id: 'data', label: 'Data controls', icon: Icons => <Icons.Broom size={16}/> },
  { id: 'storage', label: 'Storage', icon: Icons => <Icons.Database size={16}/> },
  { id: 'safety', label: 'Safety', icon: Icons => <Icons.Shield size={16}/> },
  { id: 'security', label: 'Security and login', icon: Icons => <Icons.Key size={16}/> },
  { id: 'parental', label: 'Parental controls', icon: Icons => <Icons.Baby size={16}/> },
  { id: 'account', label: 'Account', icon: Icons => <Icons.User size={16}/> },
  { id: 'keyboard', label: 'Keyboard', icon: Icons => <Icons.Keyboard size={16}/> },
];

const LEARN_MORE_CONTENT = {
  'reduce-sensitive-content': {
    title: 'Reduce sensitive content',
    body: "When this is on, FigoAI is more cautious around sensitive topics — things like self-harm, illegal activity, or graphic content — and will decline or soften its answers on those rather than engaging in depth. Turning it off returns FigoAI to its normal, less restricted behavior. This applies per-account and takes effect on your next message.",
  },
  'lockdown-mode': {
    title: 'Lockdown mode',
    body: "Lockdown mode limits what FigoAI can connect to on your behalf — web search, external links, and any browser-based tools are restricted so a malicious prompt hidden in a document or webpage can't trick the model into leaking data or taking unwanted actions. It's a defensive trade-off: safer against prompt-injection, at the cost of losing some of the web-connected features.",
  },
  'developer-mode': {
    title: 'Developer mode',
    body: "Developer mode is meant for adding your own experimental connectors and tools that haven't been reviewed or verified. Because they run with real permissions against your account, an unverified connector could misbehave — modifying or deleting data it shouldn't touch. Only enable this if you understand and trust exactly what you're connecting.",
  },
  'enforce-csp': {
    title: 'Enforce CSP in developer mode',
    body: "A Content Security Policy (CSP) restricts which network destinations a piece of code is allowed to talk to. Normally, apps you add in developer mode get relaxed network access so they're easier to build against. Turning this on keeps the same restricted CSP developer-mode apps would get in production, trading convenience for a smaller attack surface while you're testing.",
  },
  'secure-signin': {
    title: 'Secure sign in with FigoAI',
    body: "This lets other websites and apps offer \"Sign in with FigoAI\" instead of you creating a separate password for each one — authentication happens through your existing FigoAI account and its passkey/2FA protections. Nothing shows up here until you've actually used FigoAI to sign into something.",
  },
  'parental-controls': {
    title: 'Parental controls',
    body: "Linking accounts connects a parent/guardian's account with a child's account. Once linked, either side can see the connection from Settings > Parental controls and remove it at any time. An invite is sent to the email or phone number you enter; if they're new to FigoAI, they'll be asked to create an account before they can accept it.",
  },
};

function LearnMoreModal({ topic, onClose }) {
  const content = LEARN_MORE_CONTENT[topic];
  if (!content) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="delete-modal__close" onClick={onClose}><Icons.X size={16} /></button>
        <h3>{content.title}</h3>
        <p>{content.body}</p>
        <div className="delete-modal__actions">
          <button className="btn-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={`toggle-switch ${checked?'on':''}`} onClick={()=>onChange(!checked)}>
      <span className="toggle-switch__thumb" />
    </button>
  );
}

function Checkbox({ checked, onChange, label }) {
  return (
    <label className="account-checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={`account-checkbox__box ${checked ? 'checked' : ''}`}>
        {checked && <Icons.Check size={11} />}
      </span>
      {label}
    </label>
  );
}

function SettingsDropdown({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const current = options.find(o => o.value === value) || options[0];

  return (
    <div className="settings-dropdown" ref={ref}>
      <button type="button" className="settings-dropdown__trigger" onClick={()=>setOpen(v=>!v)}>
        {current.color && <span className="settings-dropdown__dot" style={{background:current.color}} />}
        {current.label} <Icons.ChevronDown size={13}/>
      </button>
      {open && (
        <div className="settings-dropdown__menu">
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              className={`settings-dropdown__item ${o.value===value ? 'active':''}`}
              onClick={()=>{ onChange(o.value); setOpen(false); }}
            >
              {o.color && <span className="settings-dropdown__dot" style={{background:o.color}} />}
              <span className="settings-dropdown__label">{o.label}</span>
              {o.value===value && <Icons.Check size={13}/>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationChannelDropdown({ value = {}, channels, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const selected = channels.filter(c => value[c.value]);
  const label = selected.length ? selected.map(c => c.label).join(', ') : 'Off';

  return (
    <div className="settings-dropdown" ref={ref}>
      <button type="button" className="settings-dropdown__trigger" onClick={()=>setOpen(v=>!v)}>
        {label} <Icons.ChevronDown size={13}/>
      </button>
      {open && (
        <div className="settings-dropdown__menu">
          {channels.map(c => (
            <button
              key={c.value}
              type="button"
              className={`settings-dropdown__item ${value[c.value] ? 'active':''}`}
              onClick={()=>onChange({ ...value, [c.value]: !value[c.value] })}
            >
              <span className="settings-dropdown__label">{c.label}</span>
              {value[c.value] && <Icons.Check size={13}/>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function VoicePicker({ settings, onUpdate }) {
  const [voices, setVoices] = useState([]);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, []);

  const filteredVoices = useMemo(() => {
    let list = voices;
    if (settings.language && settings.language !== 'auto') {
      const narrowed = list.filter(v => v.lang.toLowerCase().startsWith(settings.language));
      if (narrowed.length) list = narrowed;
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [voices, settings.language]);

  const currentIndex = Math.max(0, filteredVoices.findIndex(v => v.voiceURI === settings.voiceURI));
  const currentVoice = filteredVoices[currentIndex];

  const selectVoice = (index) => {
    if (!filteredVoices.length) return;
    const v = filteredVoices[(index + filteredVoices.length) % filteredVoices.length];
    onUpdate({ ...settings, voiceURI: v.voiceURI });
  };

  const playSample = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis || !currentVoice) return;
    window.speechSynthesis.cancel();
    const greetings = {
      en: "Hi there. It's nice to meet you!",
      fr: "Salut. Ravi de faire votre connaissance !",
      es: "Hola. ¡Encantado de conocerte!",
    };
    const lang = (settings.language && settings.language !== 'auto') ? settings.language : (currentVoice.lang || 'en').slice(0, 2).toLowerCase();
    const utterance = new SpeechSynthesisUtterance(greetings[lang] || greetings.en);
    utterance.voice = currentVoice;
    utterance.rate = settings.voiceRate || 1;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return <p className="settings-hint">Your browser doesn't support text-to-speech.</p>;
  }
  if (!voices.length) {
    return <p className="settings-hint">No text-to-speech voices are available in this browser yet.</p>;
  }

  return (
    <div className="voice-picker">
      <button type="button" className={`voice-orb ${speaking ? 'speaking' : ''}`} onClick={playSample} title="Play a sample">
        <Icons.Volume2 size={26}/>
      </button>
      <h3 className="voice-picker__name">{currentVoice?.name || 'No voice available'}</h3>
      <p className="voice-picker__desc">{currentVoice?.lang}</p>
      <div className="voice-picker__nav">
        <button type="button" onClick={()=>selectVoice(currentIndex-1)} title="Previous voice"><Icons.ChevronLeft size={18}/></button>
        {filteredVoices.length <= 10 ? (
          <div className="voice-picker__dots">
            {filteredVoices.map((v,i) => <span key={v.voiceURI} className={i===currentIndex ? 'active' : ''} />)}
          </div>
        ) : (
          <span className="voice-picker__count">{currentIndex+1} / {filteredVoices.length}</span>
        )}
        <button type="button" onClick={()=>selectVoice(currentIndex+1)} title="Next voice"><Icons.ChevronRight size={18}/></button>
      </div>
    </div>
  );
}

const STORAGE_QUOTA_BYTES = 512 * 1024 * 1024;

// A short, human "Chrome on Windows"-style label for a passkey just created on
// this device, since the browser doesn't hand back anything friendlier.
function guessDeviceLabel() {
  const ua = navigator.userAgent;
  let os = "Unknown device";
  if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS X/.test(ua)) os = "Mac";
  else if (/Android/.test(ua)) os = "Android";
  else if (/iPhone|iPad/.test(ua)) os = "iOS";
  else if (/Linux/.test(ua)) os = "Linux";

  let browser = "browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";

  return `${browser} on ${os}`;
}

function formatSessionDate(iso) {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${datePart} at ${timePart}`;
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function getStorageBreakdown() {
  let chats = 0, images = 0, other = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const size = key.length + (localStorage.getItem(key) || '').length;
    if (key.startsWith('figoai_chats_')) chats += size;
    else if (key.startsWith('figoai_images_')) images += size;
    else other += size;
  }
  return { chats, images, other, total: chats + images + other };
}

function SettingsPanel({ settings, onUpdate, onClose, user, onUpdateUser, onClearHistory, chats, setChats, onOpenLibrary, onLogout }) {
  const [category, setCategory] = useState('general');
  const [navSearch, setNavSearch] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [passwordExpanded, setPasswordExpanded] = useState(false);
  const [securitySubpage, setSecuritySubpage] = useState(null); // null | 'passkeys' | 'sessions' | 'advanced'
  const [passkeys, setPasskeys] = useState([]);
  const [passkeysLoading, setPasskeysLoading] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState("");
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [enrollError, setEnrollError] = useState("");
  const [unenrollTarget, setUnenrollTarget] = useState(false);
  const [learnMoreTopic, setLearnMoreTopic] = useState(null);
  const [familyInvites, setFamilyInvites] = useState([]);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [familyLoading, setFamilyLoading] = useState(false);
  const [showAddFamilyModal, setShowAddFamilyModal] = useState(false);
  const [showEditUsername, setShowEditUsername] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [usernameBusy, setUsernameBusy] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [emailModalMode, setEmailModalMode] = useState(null); // null | 'add-password' | 'edit'
  const [emailDraft, setEmailDraft] = useState('');
  const [emailPasswordDraft, setEmailPasswordDraft] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletePasswordDraft, setDeletePasswordDraft] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [showVerifyAge, setShowVerifyAge] = useState(false);
  const [birthDateDraft, setBirthDateDraft] = useState('');
  const [verifyAgeError, setVerifyAgeError] = useState('');
  const [toast, setToast] = useState(null); // { type: 'success' | 'error', text }
  const toastTimerRef = useRef(null);
  const storage = useMemo(() => getStorageBreakdown(), [category]);
  const libraryStats = useMemo(() => getLibraryStats(user, chats), [user, chats, category]);

  useEffect(() => {
    if (securitySubpage !== 'passkeys') return;
    let cancelled = false;
    setPasskeysLoading(true);
    listPasskeys()
      .then((rows) => { if (!cancelled) setPasskeys(rows); })
      .catch((err) => { if (!cancelled) setPasskeyError(err.message || "Could not load passkeys"); })
      .finally(() => { if (!cancelled) setPasskeysLoading(false); });
    return () => { cancelled = true; };
  }, [securitySubpage]);

  const handleAddPasskey = async () => {
    setPasskeyError("");
    if (!browserSupportsWebAuthn()) {
      setPasskeyError("This browser doesn't support passkeys. Try Chrome, Edge, or Safari.");
      return;
    }
    setPasskeyBusy(true);
    try {
      const options = await getPasskeyRegisterOptions();
      const attestation = await startRegistration({ optionsJSON: options });
      await verifyPasskeyRegistration(attestation, guessDeviceLabel());
      const rows = await listPasskeys();
      setPasskeys(rows);
    } catch (err) {
      if (err.name === "NotAllowedError") {
        // User canceled the prompt — not worth showing as an error.
      } else {
        setPasskeyError(err.message || "Could not create a passkey");
      }
    }
    setPasskeyBusy(false);
  };

  const handleRemovePasskey = async (id) => {
    setPasskeyError("");
    try {
      await deletePasskey(id);
      setPasskeys((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setPasskeyError(err.message || "Could not remove that passkey");
    }
  };

  const showToast = (type, text) => {
    setToast({ type, text });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  };
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  useEffect(() => {
    if (category !== 'security') return;
    let cancelled = false;
    setSessionsLoading(true);
    listSessions()
      .then((rows) => { if (!cancelled) setSessions(rows); })
      .catch((err) => { if (!cancelled) setSessionsError(err.message || "Could not load sessions"); })
      .finally(() => { if (!cancelled) setSessionsLoading(false); });
    return () => { cancelled = true; };
  }, [category, securitySubpage]);

  const handleConfirmRevokeSession = async () => {
    if (!revokeTarget) return;
    const target = revokeTarget;
    setRevokeTarget(null);
    try {
      await revokeSession(target.id);
      setSessions((prev) => prev.filter((s) => s.id !== target.id));
      showToast('success', 'Device logged out');
    } catch (err) {
      showToast('error', err.message || 'Could not log out that device');
    }
  };

  const handleLogoutAllSessions = async () => {
    try {
      await logoutAllSessions();
    } catch {
      // Best-effort — the local session is cleared below regardless.
    }
    onLogout();
  };

  const handleEnrollAdvancedSecurity = async () => {
    setEnrollError("");
    setEnrollBusy(true);
    try {
      await enrollAdvancedSecurity();
      onUpdateUser({ ...user, advancedSecurityEnrolled: true });
      onUpdate({ ...settings, improveModel: false });
      showToast('success', 'Advanced Account Security is on');
    } catch (err) {
      setEnrollError(err.message || "Could not enroll in Advanced Account Security");
    }
    setEnrollBusy(false);
  };

  const handleUnenrollAdvancedSecurity = async () => {
    setUnenrollTarget(false);
    setEnrollError("");
    setEnrollBusy(true);
    try {
      await unenrollAdvancedSecurity();
      onUpdateUser({ ...user, advancedSecurityEnrolled: false });
      showToast('success', 'Advanced Account Security is off');
    } catch (err) {
      showToast('error', err.message || "Could not turn off Advanced Account Security");
    }
    setEnrollBusy(false);
  };

  const refreshFamily = () => {
    setFamilyLoading(true);
    return listFamily()
      .then((data) => { setFamilyInvites(data.invites); setFamilyMembers(data.members); })
      .catch((err) => showToast('error', err.message || "Could not load family members"))
      .finally(() => setFamilyLoading(false));
  };

  useEffect(() => {
    if (category !== 'parental') return;
    refreshFamily();
  }, [category]);

  const handleSendFamilyInvite = async (method, contact, relation) => {
    const data = await sendFamilyInvite(method, contact, relation);
    await refreshFamily();
    showToast('success', data.delivered ? 'Invite sent' : 'Invite created — share the link with them directly');
    return data;
  };

  const handleCancelFamilyInvite = async (id) => {
    try {
      await cancelFamilyInvite(id);
      setFamilyInvites((prev) => prev.filter((i) => i.id !== id));
      showToast('success', 'Invite canceled');
    } catch (err) {
      showToast('error', err.message || 'Could not cancel that invite');
    }
  };

  const handleRemoveFamilyMember = async (id) => {
    try {
      await removeFamilyLink(id);
      setFamilyMembers((prev) => prev.filter((m) => m.id !== id));
      showToast('success', 'Family member removed');
    } catch (err) {
      showToast('error', err.message || 'Could not remove that family member');
    }
  };

  const handleNotifyChannelChange = async (key, next) => {
    if (next.push && !(settings[key] || {}).push) {
      if (typeof Notification === 'undefined') { next = { ...next, push: false }; }
      else {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') next = { ...next, push: false };
      }
    }
    onUpdate({ ...settings, [key]: next });
  };

  const updateTrait = (key, value) => onUpdate({ ...settings, traits: { ...settings.traits, [key]: value } });
  const handleClearMemory = () => onUpdate({ ...settings, nickname: '', occupation: '', aboutMore: '', customInstructions: '' });

  const openUsernameModal = () => {
    setUsernameDraft(user.username || '');
    setUsernameError('');
    setShowEditUsername(true);
  };

  const handleSaveUsername = async () => {
    const next = usernameDraft.trim();
    if (!next || next === user.username) { setShowEditUsername(false); return; }
    setUsernameBusy(true);
    setUsernameError('');
    try {
      await updateUsername(next);
      onUpdateUser({ ...user, username: next });
      setShowEditUsername(false);
      showToast('success', 'Username updated');
    } catch (err) {
      setUsernameError(err.message || 'Could not update username');
    }
    setUsernameBusy(false);
  };

  const openEmailModal = () => {
    setEmailError('');
    if (!user.hasPassword) {
      setEmailModalMode('add-password');
      return;
    }
    setEmailDraft(user.email || '');
    setEmailPasswordDraft('');
    setEmailModalMode('edit');
  };

  const handleSaveEmail = async () => {
    setEmailBusy(true);
    setEmailError('');
    try {
      const { email } = await updateEmail(emailDraft.trim(), emailPasswordDraft);
      onUpdateUser({ ...user, email });
      setEmailModalMode(null);
      showToast('success', 'Email updated');
    } catch (err) {
      setEmailError(err.message || 'Could not update email');
    }
    setEmailBusy(false);
  };

  const handleGoToSecurity = () => {
    setEmailModalMode(null);
    setCategory('security');
    setSecuritySubpage(null);
    setPasswordExpanded(true);
  };

  const handleDeleteAccount = async () => {
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await deleteAccount(deletePasswordDraft);
      onLogout();
    } catch (err) {
      setDeleteError(err.message || 'Could not delete account');
      setDeleteBusy(false);
    }
  };

  const handleVerifyAge = () => {
    setVerifyAgeError('');
    if (!birthDateDraft) { setVerifyAgeError('Enter your date of birth'); return; }
    const dob = new Date(birthDateDraft);
    if (Number.isNaN(dob.getTime()) || dob > new Date()) { setVerifyAgeError('Enter a valid date of birth'); return; }
    const ageMs = Date.now() - dob.getTime();
    const age = Math.floor(ageMs / (365.25 * 24 * 60 * 60 * 1000));
    if (age < 13) { setVerifyAgeError('You must be at least 13 years old to use FigoAI'); return; }
    onUpdateUser({ ...user, ageVerified: true, birthDate: birthDateDraft });
    setShowVerifyAge(false);
    showToast('success', 'Age verified');
  };

  const visibleCategories = SETTINGS_CATEGORIES.filter(c => c.label.toLowerCase().includes(navSearch.toLowerCase()));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>
        <div className="settings-panel__header">
          <h2>Settings</h2>
          <button onClick={onClose} className="settings-close"><Icons.X /></button>
        </div>
        <div className="settings-panel__layout">
          <nav className="settings-nav">
            <div className="settings-nav__search">
              <Icons.Search size={14}/>
              <input type="text" value={navSearch} onChange={(e)=>setNavSearch(e.target.value)} placeholder="Search settings" />
            </div>
            <div className="settings-nav__items">
              {visibleCategories.map(c => (
                <button key={c.id} className={`settings-nav__item ${category===c.id?'active':''}`} onClick={()=>{setCategory(c.id); setSecuritySubpage(null); setPasswordExpanded(false);}}>
                  {c.icon(Icons)} {c.label}
                </button>
              ))}
            </div>
          </nav>
          <div className="settings-panel__body">
            {category === 'general' && (
              <>
                <div className="settings-section">
                  <div className="settings-row settings-row--compact">
                    <h3>Contrast</h3>
                    <SettingsDropdown value={settings.contrast || 'standard'} options={CONTRAST_OPTIONS} onChange={(v)=>onUpdate({...settings, contrast:v})} />
                  </div>
                  <div className="settings-row settings-row--compact">
                    <h3>Accent color</h3>
                    <SettingsDropdown value={settings.accentColor || DEFAULT_ACCENT} options={ACCENT_OPTIONS} onChange={(v)=>onUpdate({...settings, accentColor:v})} />
                  </div>
                  <div className="settings-row settings-row--compact">
                    <h3>Language</h3>
                    <SettingsDropdown value={settings.language || 'auto'} options={LANGUAGE_OPTIONS} onChange={(v)=>onUpdate({...settings, language:v})} />
                  </div>
                </div>
                <div className="settings-section">
                  <div className="settings-row">
                    <div>
                      <h3>Higher intelligence</h3>
                      <p>FigoAI switches to its most capable model when this is on (same as the brain icon in the message box).</p>
                    </div>
                    <Toggle checked={!!settings.smartMode} onChange={(v)=>onUpdate({...settings, smartMode:v})} />
                  </div>
                </div>
                <div className="settings-section">
                  <div className="settings-row">
                    <div>
                      <h3>Enable Dictation</h3>
                      <p>Use dictation in the chat composer.</p>
                    </div>
                    <Toggle checked={settings.dictationEnabled !== false} onChange={(v)=>onUpdate({...settings, dictationEnabled:v})} />
                  </div>
                </div>
              </>
            )}
            {category === 'notifications' && (
              <div className="settings-section">
                <div className="settings-row settings-row--notif">
                  <div>
                    <h3>Responses</h3>
                    <p>Get notified when FigoAI finishes responding to requests that take a while, like Deep Research or image generation.</p>
                  </div>
                  <NotificationChannelDropdown
                    value={settings.notifyResponses || {}}
                    channels={[{ value: 'push', label: 'Push' }]}
                    onChange={(v)=>handleNotifyChannelChange('notifyResponses', v)}
                  />
                </div>
                {settings.notifyResponses?.push && typeof Notification !== 'undefined' && Notification.permission !== 'granted' && (
                  <p className="settings-hint">Notifications are blocked in your browser — allow them for this site to receive alerts.</p>
                )}
                <div className="settings-row settings-row--notif">
                  <div>
                    <h3>Security</h3>
                    <p>Get an email whenever your account password is changed.</p>
                  </div>
                  <NotificationChannelDropdown
                    value={settings.notifySecurity || {}}
                    channels={[{ value: 'email', label: 'Email' }]}
                    onChange={(v)=>handleNotifyChannelChange('notifySecurity', v)}
                  />
                </div>
              </div>
            )}
            {category === 'personalization' && (
              <>
                <div className="settings-section">
                  <div className="settings-row">
                    <div>
                      <h3>Base style and tone</h3>
                      <p>Set the style and tone of how FigoAI responds to you. This doesn't impact FigoAI's capabilities.</p>
                    </div>
                    <SettingsDropdown value={settings.tone || 'default'} options={TONE_OPTIONS} onChange={(v)=>onUpdate({...settings, tone:v})} />
                  </div>
                </div>

                <div className="settings-section">
                  <h3>Characteristics</h3>
                  <p>Choose additional customizations on top of your base style and tone.</p>
                  <div className="settings-row settings-row--compact">
                    <h3>Warm</h3>
                    <SettingsDropdown value={settings.traits?.warmth || 'default'} options={DEGREE_OPTIONS} onChange={(v)=>updateTrait('warmth', v)} />
                  </div>
                  <div className="settings-row settings-row--compact">
                    <h3>Enthusiastic</h3>
                    <SettingsDropdown value={settings.traits?.enthusiasm || 'default'} options={DEGREE_OPTIONS} onChange={(v)=>updateTrait('enthusiasm', v)} />
                  </div>
                  <div className="settings-row settings-row--compact">
                    <h3>Headers & Lists</h3>
                    <SettingsDropdown value={settings.traits?.formatting || 'default'} options={DEGREE_OPTIONS} onChange={(v)=>updateTrait('formatting', v)} />
                  </div>
                  <div className="settings-row settings-row--compact">
                    <h3>Emoji</h3>
                    <SettingsDropdown value={settings.traits?.emoji || 'default'} options={DEGREE_OPTIONS} onChange={(v)=>updateTrait('emoji', v)} />
                  </div>
                </div>

                <div className="settings-section">
                  <h3>Custom instructions</h3>
                  <textarea
                    className="settings-textarea"
                    rows={3}
                    value={settings.customInstructions || ''}
                    onChange={(e)=>onUpdate({...settings, customInstructions:e.target.value})}
                    placeholder="Additional behavior, style, and tone preferences"
                  />
                </div>

                <div className="settings-section">
                  <h3>About you</h3>
                  <div className="settings-field">
                    <label>Nickname</label>
                    <input type="text" value={settings.nickname || ''} onChange={(e)=>onUpdate({...settings, nickname:e.target.value})} placeholder="What should FigoAI call you?" />
                  </div>
                  <div className="settings-field">
                    <label>Occupation</label>
                    <input type="text" value={settings.occupation || ''} onChange={(e)=>onUpdate({...settings, occupation:e.target.value})} placeholder="e.g. Software engineer" />
                  </div>
                  <div className="settings-field">
                    <label>More about you</label>
                    <textarea
                      className="settings-textarea"
                      rows={2}
                      value={settings.aboutMore || ''}
                      onChange={(e)=>onUpdate({...settings, aboutMore:e.target.value})}
                      placeholder="Interests, values, or preferences to keep in mind"
                    />
                  </div>
                </div>

                <div className="settings-section">
                  <h3>Memory</h3>
                  <div className="settings-row">
                    <div>
                      <h3>Enable memory</h3>
                      <p>Let FigoAI use your name, occupation, and notes above to personalize replies.</p>
                    </div>
                    <Toggle checked={settings.memoryEnabled !== false} onChange={(v)=>onUpdate({...settings, memoryEnabled:v})} />
                  </div>
                  <div className="memory-summary">
                    <h4>Memory summary</h4>
                    {settings.nickname || settings.occupation || settings.aboutMore || settings.customInstructions ? (
                      <ul>
                        {settings.nickname && <li><strong>Nickname:</strong> {settings.nickname}</li>}
                        {settings.occupation && <li><strong>Occupation:</strong> {settings.occupation}</li>}
                        {settings.aboutMore && <li><strong>More about you:</strong> {settings.aboutMore}</li>}
                        {settings.customInstructions && <li><strong>Custom instructions:</strong> {settings.customInstructions}</li>}
                      </ul>
                    ) : (
                      <p className="settings-hint">Nothing saved yet — fill in the fields above.</p>
                    )}
                    <button type="button" className="danger-btn" onClick={handleClearMemory}><Icons.Trash size={14}/> Clear</button>
                  </div>
                </div>

                <div className="settings-section">
                  <button type="button" className="settings-advanced-toggle" onClick={()=>setAdvancedOpen(v=>!v)}>
                    Advanced <Icons.ChevronDown size={14} className={advancedOpen?'':'collapsed'}/>
                  </button>
                  {advancedOpen && (
                    <div className="settings-row">
                      <div>
                        <h3>Web search</h3>
                        <p>Let FigoAI automatically search the web for answers by default.</p>
                      </div>
                      <Toggle checked={!!settings.defaultWebSearch} onChange={(v)=>onUpdate({...settings, defaultWebSearch:v})} />
                    </div>
                  )}
                </div>

                <div className="settings-section">
                  <div className="settings-row">
                    <div>
                      <h3>AI Model</h3>
                      <p>Choose the model FigoAI answers with</p>
                    </div>
                    <SettingsDropdown value={settings.model} options={MODEL_OPTIONS} onChange={(v)=>onUpdate({...settings, model:v})} />
                  </div>
                  {settings.model.startsWith('groq/compound') && (
                    <p className="settings-hint">Pulls live results from the web with source links, but Groq's free tier only allows a few searches per minute — expect occasional rate-limit errors.</p>
                  )}
                </div>
                <div className="settings-section">
                  <h3>Creativity: {settings.temperature}</h3>
                  <p>How closely FigoAI sticks to safe, predictable answers vs. more varied ones</p>
                  <input type="range" min="0" max="2" step="0.1" value={settings.temperature} onChange={(e)=>onUpdate({...settings,temperature:parseFloat(e.target.value)})}/>
                  <div className="range-labels"><span>Precise</span><span>Balanced</span><span>Creative</span></div>
                </div>
              </>
            )}
            {category === 'voice' && (
              <>
                <div className="settings-section">
                  <VoicePicker settings={settings} onUpdate={onUpdate} />
                  <div className="settings-row settings-row--compact">
                    <h3>Speed</h3>
                    <SettingsDropdown value={settings.voiceRate || 1} options={SPEED_OPTIONS} onChange={(v)=>onUpdate({...settings, voiceRate:v})} />
                  </div>
                  <div className="settings-row settings-row--compact">
                    <h3>Language</h3>
                    <SettingsDropdown value={settings.language || 'auto'} options={LANGUAGE_OPTIONS} onChange={(v)=>onUpdate({...settings, language:v})} />
                  </div>
                </div>
                <div className="settings-section">
                  <div className="settings-row">
                    <div>
                      <h3>Speak replies aloud</h3>
                      <p>Read FigoAI's replies out loud automatically using the voice above.</p>
                    </div>
                    <Toggle checked={!!settings.voiceEnabled} onChange={(v)=>onUpdate({...settings, voiceEnabled:v})} />
                  </div>
                </div>
                <div className="settings-section">
                  <h3>Voice input</h3>
                  <p>Tap the microphone in the message box to dictate instead of typing — needs microphone permission the first time you use it. With Language set to "Auto-detect" above, it recognizes whatever language you speak automatically, in any browser; pinning a specific language instead uses your browser's faster built-in speech recognition where available (Chrome and Edge).</p>
                </div>
              </>
            )}
            {category === 'data' && (
              <DataControlsView settings={settings} onUpdate={onUpdate} chats={chats} setChats={setChats} onClearHistory={onClearHistory} user={user} />
            )}
            {category === 'storage' && (
              <div className="storage-view">
                <div className="storage-view__quota">
                  <p className="storage-view__quota-label">{formatBytes(storage.total)} of {formatBytes(STORAGE_QUOTA_BYTES)} used</p>
                  <div className="storage-view__bar">
                    <div className="storage-view__bar-fill" style={{ width: `${Math.min(100, (storage.total / STORAGE_QUOTA_BYTES) * 100)}%` }} />
                  </div>
                </div>
                <div className="settings-section">
                  <h3>Manage storage</h3>
                  <p>Manage your library to free up storage</p>
                  <button type="button" className="storage-manage-row" onClick={() => onOpenLibrary('documents')}>
                    <div>
                      <span className="storage-manage-row__label">Files</span>
                      <span className="storage-manage-row__meta">{formatBytes(libraryStats.files.bytes)} · {libraryStats.files.count} file{libraryStats.files.count === 1 ? '' : 's'}</span>
                    </div>
                    <Icons.ChevronRight size={16} />
                  </button>
                  <button type="button" className="storage-manage-row" onClick={() => onOpenLibrary('images')}>
                    <div>
                      <span className="storage-manage-row__label">Images</span>
                      <span className="storage-manage-row__meta">{formatBytes(libraryStats.images.bytes)} · {libraryStats.images.count} image{libraryStats.images.count === 1 ? '' : 's'}</span>
                    </div>
                    <Icons.ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
            {category === 'safety' && (
              <div className="settings-section">
                <div className="settings-row">
                  <div>
                    <h3>Reduce sensitive content</h3>
                    <p>Add extra safeguards around sensitive topics and limit certain types of content in FigoAI. <button type="button" className="settings-link" onClick={() => setLearnMoreTopic('reduce-sensitive-content')}>Learn more</button></p>
                  </div>
                  <Toggle checked={settings.reduceSensitiveContent !== false} onChange={(v) => onUpdate({ ...settings, reduceSensitiveContent: v })} />
                </div>
              </div>
            )}
            {category === 'security' && securitySubpage === 'passkeys' && (
              <div className="settings-subpage">
                <button type="button" className="settings-subpage__back" onClick={() => setSecuritySubpage(null)}>
                  <Icons.ChevronLeft size={20} /> Security keys &amp; passkeys
                </button>
                <p className="settings-subpage__desc">See all the active security keys and passkeys.</p>
                <button type="button" className="pill-btn pill-btn--solid" onClick={handleAddPasskey} disabled={passkeyBusy}>
                  {passkeyBusy ? 'Waiting for your device…' : 'Add a Security key or Passkey'}
                </button>
                {passkeyError && <p className="data-controls__note data-controls__note--error">{passkeyError}</p>}

                {passkeysLoading ? (
                  <p className="settings-link-row__desc">Loading passkeys…</p>
                ) : passkeys.length > 0 && (
                  <div className="passkey-list">
                    {passkeys.map((pk) => (
                      <div key={pk.id} className="passkey-row">
                        <div className="passkey-row__icon"><Icons.Key size={16} /></div>
                        <div className="passkey-row__info">
                          <span className="passkey-row__name">{pk.nickname || 'Passkey'}</span>
                          <span className="passkey-row__meta">Added {new Date(pk.createdAt).toLocaleDateString()}{pk.lastUsedAt ? ` · Last used ${new Date(pk.lastUsedAt).toLocaleDateString()}` : ''}</span>
                        </div>
                        <button type="button" className="passkey-row__remove" onClick={() => handleRemovePasskey(pk.id)} title="Remove this passkey">
                          <Icons.Trash size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {category === 'security' && securitySubpage === 'sessions' && (
              <div className="settings-subpage">
                <button type="button" className="settings-subpage__back" onClick={() => setSecuritySubpage(null)}>
                  <Icons.ChevronLeft size={20} /> Active sessions
                </button>
                <p className="settings-subpage__desc">Review devices that are currently signed in to your account.</p>

                {sessionsError && <p className="data-controls__note data-controls__note--error">{sessionsError}</p>}

                {sessionsLoading ? (
                  <p className="settings-link-row__desc">Loading sessions…</p>
                ) : (
                  <div className="session-list">
                    {sessions.map((s) => (
                      <div key={s.id} className="session-row">
                        <div className="session-row__icon">
                          {s.deviceType === 'Phone' ? <Icons.Smartphone size={18} /> : <Icons.Laptop size={18} />}
                        </div>
                        <div className="session-row__info">
                          <span className="session-row__app">FigoAI Web</span>
                          <span className="session-row__meta">{s.deviceType || 'Device'} · {s.os || 'Unknown OS'}</span>
                          <span className="session-row__meta">{formatSessionDate(s.createdAt)}</span>
                          {s.city && <span className="session-row__meta">{s.city}{s.regionCode ? `, ${s.regionCode}` : ''}</span>}
                        </div>
                        {s.current ? (
                          <span className="session-badge">Current session</span>
                        ) : (
                          <button type="button" className="pill-btn" onClick={() => setRevokeTarget(s)}>Log out</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {sessions.length > 1 && (
                  <button type="button" className="danger-btn settings-subpage__logout-all" onClick={handleLogoutAllSessions}>
                    <Icons.Logout size={14} /> Log out all sessions
                  </button>
                )}
              </div>
            )}
            {category === 'security' && securitySubpage === 'advanced' && (
              <div className="settings-subpage">
                <button type="button" className="settings-subpage__back" onClick={() => setSecuritySubpage(null)}>
                  <Icons.ChevronLeft size={20} /> Advanced account security
                </button>
                <p className="settings-subpage__desc">Advanced account security helps keep your account safe by requiring stronger sign-in methods like passkeys or hardware security keys.</p>
                <p className="settings-subpage__desc settings-subpage__desc--strong">The following protections are included with advanced account security:</p>
                <ul className="advanced-security-list">
                  <li>Disable email and SMS sign-in codes.</li>
                  <li>Disable password sign-in.</li>
                  <li>Disable email account recovery.</li>
                  <li>Disable model training.</li>
                  <li>Enable email alerts for login attempts.</li>
                  <li>Enable shorter active sessions.</li>
                </ul>

                {user.advancedSecurityEnrolled ? (
                  <>
                    <p className="settings-subpage__desc">Enrolled — your account currently has these protections active.</p>
                    <button type="button" className="pill-btn pill-btn--danger" onClick={() => setUnenrollTarget(true)} disabled={enrollBusy}>
                      Turn off Advanced Account Security
                    </button>
                  </>
                ) : (
                  <>
                    <p className="settings-subpage__desc">Requires at least one passkey on your account first, since password sign-in gets disabled the moment you enroll.</p>
                    <button type="button" className="pill-btn pill-btn--solid" onClick={handleEnrollAdvancedSecurity} disabled={enrollBusy}>
                      {enrollBusy ? 'Enrolling…' : 'Enroll'}
                    </button>
                  </>
                )}
                {enrollError && (
                  <p className="data-controls__note data-controls__note--error">
                    {enrollError}
                    {enrollError.toLowerCase().includes('passkey') && (
                      <> <button type="button" className="link-btn" onClick={() => setSecuritySubpage('passkeys')}>Add a passkey</button></>
                    )}
                  </p>
                )}
              </div>
            )}
            {category === 'security' && !securitySubpage && (
              <>
                <div className="settings-section">
                  <button type="button" className="settings-link-row" onClick={() => setPasswordExpanded(v => !v)}>
                    <span className="settings-link-row__label">Password</span>
                    <span className="settings-link-row__action">{passwordExpanded ? 'Close' : (user.hasPassword ? 'Change' : 'Add')} <Icons.ChevronRight size={14} /></span>
                  </button>
                  {passwordExpanded && (
                    <div className="settings-link-row__detail">
                      {user.hasPassword ? (
                        <ChangePasswordForm notifyEmail={!!settings.notifySecurity?.email} />
                      ) : (
                        <AddPasswordForm onAdded={() => {
                          onUpdateUser({ ...user, hasPassword: true });
                          setPasswordExpanded(false);
                          showToast('success', 'Password added');
                        }} />
                      )}
                    </div>
                  )}

                  <button type="button" className="settings-link-row" onClick={() => setSecuritySubpage('passkeys')}>
                    <div>
                      <span className="settings-link-row__label">Security keys &amp; passkeys</span>
                      <p className="settings-link-row__desc">Use hardware security keys or passkeys to sign in. These phishing-resistant methods provide stronger protection than passwords.</p>
                    </div>
                    <span className="settings-link-row__action">Add <Icons.ChevronRight size={14} /></span>
                  </button>
                </div>

                <div className="settings-section">
                  <h3 className="settings-group-title">Multi-factor authentication (MFA)</h3>
                  <div className="settings-row settings-row--compact">
                    <div>
                      <h3>Authenticator app</h3>
                      <p className="settings-link-row__desc">Use one-time codes from an authenticator app.</p>
                    </div>
                    <Toggle checked={!!settings.mfaAuthenticatorApp} onChange={(v) => onUpdate({ ...settings, mfaAuthenticatorApp: v })} />
                  </div>
                  <div className="settings-row settings-row--compact">
                    <div>
                      <h3>Text message</h3>
                      <p className="settings-link-row__desc">Get 6-digit verification codes by SMS or WhatsApp based on your country code.</p>
                    </div>
                    <Toggle checked={!!settings.mfaSms} onChange={(v) => onUpdate({ ...settings, mfaSms: v })} />
                  </div>
                </div>

                <div className="settings-section">
                  <h3 className="settings-group-title">Sessions</h3>
                  <button type="button" className="settings-link-row" onClick={() => setSecuritySubpage('sessions')}>
                    <div>
                      <span className="settings-link-row__label">Active sessions</span>
                      <p className="settings-link-row__desc">View all devices that have accessed your account. You can review active sessions or log out all to end all sessions.</p>
                    </div>
                    <span className="settings-link-row__action">{sessions.length || ''} <Icons.ChevronRight size={14} /></span>
                  </button>
                </div>

                <div className="settings-section">
                  <h3 className="settings-group-title">Advanced security</h3>
                  <button type="button" className="settings-link-row" onClick={() => setSecuritySubpage('advanced')}>
                    <div>
                      <span className="settings-link-row__label">Advanced account security</span>
                      <p className="settings-link-row__desc">Adds the highest level of account security by requiring stronger sign-in methods and applying stricter protections to help prevent unauthorized access.</p>
                    </div>
                    <span className="settings-link-row__action">{user.advancedSecurityEnrolled ? 'On' : 'Enroll'} <Icons.ChevronRight size={14} /></span>
                  </button>
                  <div className="settings-row settings-row--compact">
                    <div>
                      <h3>Lockdown mode</h3>
                      <p className="settings-link-row__desc">Helps protect sensitive data from prompt-injection attacks by limiting features that can connect to the web or external services. <button type="button" className="settings-link" onClick={() => setLearnMoreTopic('lockdown-mode')}>Learn more</button></p>
                    </div>
                    <Toggle checked={!!settings.lockdownMode} onChange={(v) => onUpdate({ ...settings, lockdownMode: v })} />
                  </div>
                </div>

                <div className="settings-section">
                  <h3 className="settings-group-title">Developer mode</h3>
                  <div className="settings-row settings-row--compact">
                    <div>
                      <h3>Developer mode <span className="risk-badge"><Icons.AlertTriangle size={11} /> Elevated risk</span></h3>
                      <p className="settings-link-row__desc">Allows you to add unverified connectors that could modify or erase data permanently. Use at your own risk. <button type="button" className="settings-link" onClick={() => setLearnMoreTopic('developer-mode')}>Learn more</button></p>
                    </div>
                    <Toggle checked={!!settings.developerMode} onChange={(v) => onUpdate({ ...settings, developerMode: v })} />
                  </div>
                  <div className="settings-row settings-row--compact">
                    <div>
                      <h3>Enforce CSP in developer mode</h3>
                      <p className="settings-link-row__desc">When enabled, dev mode apps without a declared CSP get the same restricted default CSP they would in production instead of unrestricted network access. <button type="button" className="settings-link" onClick={() => setLearnMoreTopic('enforce-csp')}>Learn more</button></p>
                    </div>
                    <Toggle checked={!!settings.enforceCspDevMode} onChange={(v) => onUpdate({ ...settings, enforceCspDevMode: v })} />
                  </div>
                </div>

                <div className="settings-section">
                  <h3 className="settings-group-title">Secure sign in with FigoAI</h3>
                  <p>Sign in to websites and apps across the internet with the trusted security of FigoAI. <button type="button" className="settings-link" onClick={() => setLearnMoreTopic('secure-signin')}>Learn more</button></p>
                  <div className="security-card">You haven't used FigoAI to sign into any websites or apps yet. Once you do, they'll show up here.</div>
                  <div className="settings-row settings-row--compact">
                    <div>
                      <h3>Enable device code authorization for CLI</h3>
                      <p className="settings-link-row__desc">Use device code sign-in for headless or remote environments where the normal browser flow isn't available. Exercise caution in enabling, as device codes can be phished. Never share a device code.</p>
                    </div>
                    <Toggle checked={!!settings.deviceCodeAuth} onChange={(v) => onUpdate({ ...settings, deviceCodeAuth: v })} />
                  </div>
                </div>
              </>
            )}
            {category === 'parental' && (
              <div className="settings-section">
                <div className="parental-header">
                  <h3>Parental controls</h3>
                  <button type="button" className="icon-btn" onClick={() => setLearnMoreTopic('parental-controls')} title="Learn more">
                    <Icons.HelpCircle size={18} />
                  </button>
                </div>
                <p>Parents and teens can link accounts, giving parents tools to adjust certain features, set limits, and add safeguards that work for their family. <button type="button" className="settings-link" onClick={() => setLearnMoreTopic('parental-controls')}>Learn more</button></p>
                <button type="button" className="pill-btn pill-btn--solid" onClick={() => setShowAddFamilyModal(true)}>
                  <Icons.Plus size={14} /> Add family member
                </button>

                {familyLoading ? (
                  <p className="settings-link-row__desc">Loading…</p>
                ) : (familyMembers.length > 0 || familyInvites.length > 0) && (
                  <div className="passkey-list">
                    {familyMembers.map((m) => (
                      <div key={`m${m.id}`} className="passkey-row">
                        <div className="passkey-row__icon"><Icons.User size={16} /></div>
                        <div className="passkey-row__info">
                          <span className="passkey-row__name">{m.name}</span>
                          <span className="passkey-row__meta">{m.role === 'child' ? 'Your child' : 'Your parent or guardian'}</span>
                        </div>
                        <button type="button" className="passkey-row__remove" onClick={() => handleRemoveFamilyMember(m.id)} title="Remove"><Icons.Trash size={14} /></button>
                      </div>
                    ))}
                    {familyInvites.map((inv) => (
                      <div key={`i${inv.id}`} className="passkey-row">
                        <div className="passkey-row__icon">{inv.method === 'phone' ? <Icons.Smartphone size={16} /> : <Icons.Mail size={16} />}</div>
                        <div className="passkey-row__info">
                          <span className="passkey-row__name">{inv.contact}</span>
                          <span className="passkey-row__meta">Pending · {inv.relation === 'child' ? 'invited as your child' : 'invited as your parent or guardian'}</span>
                        </div>
                        <button type="button" className="pill-btn" onClick={() => handleCancelFamilyInvite(inv.id)}>Cancel</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {category === 'account' && (
              <>
                <div className="settings-section">
                  <h3 className="settings-group-title" style={{ fontSize: 22 }}>Account</h3>
                  <div className="account-row">
                    <span className="account-row__label">Name</span>
                    <span className="account-row__value">{user.displayName || user.username}</span>
                  </div>
                  <button type="button" className="account-row" onClick={openUsernameModal}>
                    <span className="account-row__label">Username</span>
                    <span className="account-row__value">@{user.username} <Icons.ChevronRight size={14}/></span>
                  </button>
                  {user.email && (
                    <button type="button" className="account-row" onClick={openEmailModal}>
                      <span className="account-row__label">Email</span>
                      <span className="account-row__value">{user.email} <Icons.ChevronRight size={14}/></span>
                    </button>
                  )}
                </div>

                <div className="settings-section">
                  <div className="settings-row settings-row--compact">
                    <div>
                      <h3 style={{ fontWeight: 600, fontSize: 14, color: '#ececec' }}>Age verification</h3>
                      <p className="settings-link-row__desc">
                        {user.ageVerified
                          ? "Your age has been verified for this account."
                          : "To help keep FigoAI appropriate for everyone, some settings require age verification."}
                      </p>
                    </div>
                    {user.ageVerified ? (
                      <span className="account-row__value"><Icons.Check size={14}/> Verified</span>
                    ) : (
                      <button type="button" className="pill-btn pill-btn--solid" onClick={() => { setBirthDateDraft(''); setVerifyAgeError(''); setShowVerifyAge(true); }}>Verify age</button>
                    )}
                  </div>

                  <div className="settings-row settings-row--compact">
                    <span>Delete account</span>
                    <button type="button" className="pill-btn pill-btn--danger" onClick={() => { setDeletePasswordDraft(''); setDeleteError(''); setShowDeleteAccount(true); }}>Delete</button>
                  </div>
                </div>

                <div className="settings-section">
                  <h3 className="settings-group-title" style={{ fontSize: 17 }}>GPT builder profile</h3>
                  <p>Personalize your builder profile to connect with users of your GPTs. These settings apply to publicly shared GPTs.</p>

                  <div className="builder-preview">
                    <div className="builder-preview__icon"><Icons.Puzzle size={20}/></div>
                    <div className="builder-preview__info">
                      <span className="builder-preview__name">PlaceholderGPT</span>
                      <span className="builder-preview__meta">By community builder</span>
                    </div>
                    <span className="builder-preview__tag">Preview</span>
                  </div>

                  <div className="security-card builder-verify-note">
                    <Icons.HelpCircle size={16}/>
                    <span>Complete verification to publish GPTs to everyone. Verify your identity by adding billing details or verifying ownership of a public domain name.</span>
                  </div>

                  <h3 className="settings-group-title" style={{ fontSize: 14 }}>Links</h3>
                  <div className="account-row">
                    <span className="account-row__label"><Icons.Globe size={14}/> Domain</span>
                    <button type="button" className="pill-btn" onClick={() => showToast('error', 'Custom domains are not available yet')}>
                      Select a domain <Icons.ChevronDown size={13}/>
                    </button>
                  </div>
                  <div className="account-row">
                    <span className="account-row__label"><Icons.Github size={16}/> GitHub</span>
                    <button type="button" className="pill-btn" onClick={() => showToast('error', 'GitHub linking is not available yet')}>Add</button>
                  </div>

                  <h3 className="settings-group-title" style={{ fontSize: 14, marginTop: 20 }}>Email</h3>
                  <div className="account-row">
                    <span className="account-row__label"><Icons.Mail size={16}/> {user.email}</span>
                  </div>
                  <Checkbox
                    checked={!!settings.receiveFeedbackEmails}
                    onChange={(v) => onUpdate({ ...settings, receiveFeedbackEmails: v })}
                    label="Receive feedback emails"
                  />
                </div>
              </>
            )}
            {category === 'keyboard' && (
              <div className="settings-section">
                <h3>Keyboard shortcuts</h3>
                <p>App</p>
                <div className="shortcut-list">
                  <div className="shortcut-row"><span>New chat</span><span><kbd>{MOD_KEY}</kbd> + <kbd>Shift</kbd> + <kbd>O</kbd></span></div>
                  <div className="shortcut-row"><span>Toggle sidebar</span><span><kbd>{MOD_KEY}</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd></span></div>
                  <div className="shortcut-row"><span>Search chats</span><span><kbd>{MOD_KEY}</kbd> + <kbd>K</kbd></span></div>
                  <div className="shortcut-row"><span>Open settings</span><span><kbd>{MOD_KEY}</kbd> + <kbd>,</kbd></span></div>
                  <div className="shortcut-row"><span>Close a menu, panel, or dialog</span><kbd>Esc</kbd></div>
                </div>
                <p>Composer</p>
                <div className="shortcut-list">
                  <div className="shortcut-row"><span>Send message</span><kbd>Enter</kbd></div>
                  <div className="shortcut-row"><span>New line</span><span><kbd>Shift</kbd> + <kbd>Enter</kbd></span></div>
                  <div className="shortcut-row"><span>Focus the message box</span><span><kbd>Shift</kbd> + <kbd>Esc</kbd></span></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {revokeTarget && (
        <div className="modal-overlay" onClick={() => setRevokeTarget(null)}>
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="delete-modal__close" onClick={() => setRevokeTarget(null)}><Icons.X size={16} /></button>
            <h3>Log out?</h3>
            <p>This will immediately log out from your account. You'll need to log in again to access your account on that device.</p>
            <div className="delete-modal__actions">
              <button className="btn-cancel" onClick={() => setRevokeTarget(null)}>Cancel</button>
              <button className="btn-delete-confirm" onClick={handleConfirmRevokeSession}>Log out</button>
            </div>
          </div>
        </div>
      )}
      {unenrollTarget && (
        <div className="modal-overlay" onClick={() => setUnenrollTarget(false)}>
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="delete-modal__close" onClick={() => setUnenrollTarget(false)}><Icons.X size={16} /></button>
            <h3>Turn off Advanced Account Security?</h3>
            <p>This removes the extra protections on your account — password sign-in, email recovery, and longer sessions will work normally again.</p>
            <div className="delete-modal__actions">
              <button className="btn-cancel" onClick={() => setUnenrollTarget(false)}>Cancel</button>
              <button className="btn-delete-confirm" onClick={handleUnenrollAdvancedSecurity}>Turn off</button>
            </div>
          </div>
        </div>
      )}
      {showAddFamilyModal && (
        <AddFamilyMemberModal onClose={() => setShowAddFamilyModal(false)} onSend={handleSendFamilyInvite} />
      )}
      {showEditUsername && (
        <div className="modal-overlay" onClick={() => setShowEditUsername(false)}>
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="delete-modal__close" onClick={() => setShowEditUsername(false)}><Icons.X size={16} /></button>
            <h3>Edit username</h3>
            <label className="modal-field-label">Username</label>
            <input
              type="text"
              className="modal-field"
              value={usernameDraft}
              onChange={(e) => setUsernameDraft(e.target.value)}
              placeholder="username"
              maxLength={32}
              autoFocus
            />
            {usernameError && <p className="password-form__status password-form__status--error" style={{ marginTop: 8 }}>{usernameError}</p>}
            <div className="delete-modal__actions">
              <button className="btn-cancel" onClick={() => setShowEditUsername(false)}>Cancel</button>
              <button className="btn-primary" disabled={usernameBusy} onClick={handleSaveUsername}>{usernameBusy ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
      {emailModalMode === 'add-password' && (
        <div className="modal-overlay" onClick={() => setEmailModalMode(null)}>
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="delete-modal__close" onClick={() => setEmailModalMode(null)}><Icons.X size={16} /></button>
            <h3>Add a password first</h3>
            <p>Your account was created with Google, Microsoft, or Apple. To change your email, first add a password in Settings -&gt; Security -&gt; Password -&gt; Add.</p>
            <div className="delete-modal__actions">
              <button className="btn-cancel" onClick={() => setEmailModalMode(null)}>Not now</button>
              <button className="btn-primary" onClick={handleGoToSecurity}>Go to Security</button>
            </div>
          </div>
        </div>
      )}
      {emailModalMode === 'edit' && (
        <div className="modal-overlay" onClick={() => setEmailModalMode(null)}>
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="delete-modal__close" onClick={() => setEmailModalMode(null)}><Icons.X size={16} /></button>
            <h3>Edit email</h3>
            <label className="modal-field-label">New email</label>
            <input
              type="email"
              className="modal-field"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              placeholder="you@example.com"
              autoFocus
            />
            <label className="modal-field-label">Current password</label>
            <input
              type="password"
              className="modal-field"
              value={emailPasswordDraft}
              onChange={(e) => setEmailPasswordDraft(e.target.value)}
              placeholder="Confirm with your password"
              autoComplete="current-password"
            />
            {emailError && <p className="password-form__status password-form__status--error" style={{ marginTop: 8 }}>{emailError}</p>}
            <div className="delete-modal__actions">
              <button className="btn-cancel" onClick={() => setEmailModalMode(null)}>Cancel</button>
              <button className="btn-primary" disabled={emailBusy || !emailDraft || !emailPasswordDraft} onClick={handleSaveEmail}>{emailBusy ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
      {showDeleteAccount && (
        <div className="modal-overlay" onClick={() => setShowDeleteAccount(false)}>
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="delete-modal__close" onClick={() => setShowDeleteAccount(false)}><Icons.X size={16} /></button>
            <h3>Delete account?</h3>
            <p>This permanently deletes your FigoAI account, sign-in methods, and passkeys. This can't be undone.</p>
            {user.hasPassword && (
              <input
                type="password"
                className="modal-field"
                value={deletePasswordDraft}
                onChange={(e) => setDeletePasswordDraft(e.target.value)}
                placeholder="Enter your password to confirm"
                autoComplete="current-password"
              />
            )}
            {deleteError && <p className="password-form__status password-form__status--error" style={{ marginTop: 8 }}>{deleteError}</p>}
            <div className="delete-modal__actions">
              <button className="btn-cancel" onClick={() => setShowDeleteAccount(false)}>Cancel</button>
              <button className="btn-delete-confirm" disabled={deleteBusy || (user.hasPassword && !deletePasswordDraft)} onClick={handleDeleteAccount}>{deleteBusy ? 'Deleting…' : 'Delete account'}</button>
            </div>
          </div>
        </div>
      )}
      {showVerifyAge && (
        <div className="modal-overlay" onClick={() => setShowVerifyAge(false)}>
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="delete-modal__close" onClick={() => setShowVerifyAge(false)}><Icons.X size={16} /></button>
            <h3>Verify your age</h3>
            <p>Enter your date of birth. This is stored only on this device and is used to unlock age-appropriate settings.</p>
            <label className="modal-field-label">Date of birth</label>
            <input
              type="date"
              className="modal-field"
              value={birthDateDraft}
              onChange={(e) => setBirthDateDraft(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
            />
            {verifyAgeError && <p className="password-form__status password-form__status--error" style={{ marginTop: 8 }}>{verifyAgeError}</p>}
            <div className="delete-modal__actions">
              <button className="btn-cancel" onClick={() => setShowVerifyAge(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleVerifyAge}>Verify</button>
            </div>
          </div>
        </div>
      )}
      {learnMoreTopic && (
        <LearnMoreModal topic={learnMoreTopic} onClose={() => setLearnMoreTopic(null)} />
      )}
      {toast && (
        <div className={`top-toast ${toast.type === 'error' ? 'top-toast--error' : ''}`}>
          {toast.type === 'error' ? <Icons.AlertTriangle size={16} /> : <Icons.Check size={16} />}
          {toast.text}
        </div>
      )}
    </div>
  );
}

function SearchChatsModal({ chats, onClose, onSelectChat }) {
  const [query, setQuery] = useState("");
  const results = chats
    .filter(c => !c.archived)
    .filter(c => c.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a,b)=>new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt));

  return (
    <div className="modal-overlay search-modal-overlay" onClick={onClose}>
      <div className="search-modal" onClick={e => e.stopPropagation()}>
        <div className="search-modal__input-row">
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e)=>setQuery(e.target.value)}
            placeholder="Ask anything"
          />
          <button type="button" onClick={onClose}><Icons.X /></button>
        </div>
        <div className="search-modal__body">
          {results.length > 0 && <div className="search-modal__label">Recent chats</div>}
          {results.map(c => (
            <button key={c.id} type="button" className="search-modal__item" onClick={()=>onSelectChat(c.id)}>
              <Icons.EmptyCircle size={16}/>
              <span>{c.title}</span>
            </button>
          ))}
          {query && results.length === 0 && <p className="search-modal__empty">No matches</p>}
        </div>
      </div>
    </div>
  );
}

const COUNTRY_CODES = [
  { code: '+1', cc: 'us', country: 'United States' },
  { code: '+44', cc: 'gb', country: 'United Kingdom' },
  { code: '+250', cc: 'rw', country: 'Rwanda' },
  { code: '+254', cc: 'ke', country: 'Kenya' },
  { code: '+233', cc: 'gh', country: 'Ghana' },
  { code: '+234', cc: 'ng', country: 'Nigeria' },
  { code: '+27', cc: 'za', country: 'South Africa' },
  { code: '+91', cc: 'in', country: 'India' },
  { code: '+86', cc: 'cn', country: 'China' },
  { code: '+81', cc: 'jp', country: 'Japan' },
  { code: '+49', cc: 'de', country: 'Germany' },
  { code: '+33', cc: 'fr', country: 'France' },
];

function CountryCodePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const current = COUNTRY_CODES.find((c) => c.code === value) || COUNTRY_CODES[0];

  return (
    <div className="country-picker" ref={ref}>
      <button type="button" className="country-picker__trigger" onClick={() => setOpen((v) => !v)}>
        <img className="country-picker__flag" src={`/flags/4x3/${current.cc}.svg`} alt="" />
        <span>{current.code}</span>
        <Icons.ChevronDown size={12} />
      </button>
      {open && (
        <div className="country-picker__menu">
          {COUNTRY_CODES.map((c) => (
            <button
              key={c.code}
              type="button"
              className={`country-picker__item ${c.code === value ? 'active' : ''}`}
              onClick={() => { onChange(c.code); setOpen(false); }}
            >
              <img className="country-picker__flag" src={`/flags/4x3/${c.cc}.svg`} alt="" />
              <span className="country-picker__name">{c.country}</span>
              <span className="country-picker__code">{c.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AddFamilyMemberModal({ onClose, onSend }) {
  const [method, setMethod] = useState('email');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('+1');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const contact = method === 'email' ? email.trim() : `${countryCode}${phone.trim()}`;
  const canSend = relation && (method === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) : phone.trim().length >= 7);

  const handleSend = async () => {
    if (!canSend || submitting) return;
    setError('');
    setSubmitting(true);
    try {
      await onSend(method, contact, relation);
      onClose();
    } catch (err) {
      setError(err.message || 'Could not send that invite');
    }
    setSubmitting(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="family-modal" onClick={(e) => e.stopPropagation()}>
        <div className="family-modal__header">
          <h3>Invite family member</h3>
          <button type="button" className="icon-btn" onClick={onClose}><Icons.X size={16} /></button>
        </div>

        <div className="family-modal__field-header">
          <label>{method === 'email' ? 'Email address' : 'Phone number'}</label>
          <button type="button" className="settings-link" onClick={() => { setMethod(method === 'email' ? 'phone' : 'email'); setError(''); }}>
            {method === 'email' ? 'Use phone' : 'Use email'}
          </button>
        </div>

        {method === 'email' ? (
          <input
            type="email"
            className="family-modal__input"
            placeholder="name@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        ) : (
          <div className="family-modal__phone-row">
            <CountryCodePicker value={countryCode} onChange={setCountryCode} />
            <input
              type="tel"
              className="family-modal__input"
              placeholder="Phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoFocus
            />
          </div>
        )}
        <p className="family-modal__hint">If your family member is new to FigoAI, they'll be asked to create an account.</p>

        <p className="family-modal__label">This person is:</p>
        <div className="family-modal__radios">
          <label className="family-modal__radio">
            <input type="radio" name="relation" checked={relation === 'parent'} onChange={() => setRelation('parent')} />
            <span className="family-modal__radio-dot" />
            My parent or guardian
          </label>
          <label className="family-modal__radio">
            <input type="radio" name="relation" checked={relation === 'child'} onChange={() => setRelation('child')} />
            <span className="family-modal__radio-dot" />
            My child
          </label>
        </div>

        {error && <p className="data-controls__note data-controls__note--error">{error}</p>}

        <div className="delete-modal__actions">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="pill-btn pill-btn--solid" disabled={!canSend || submitting} onClick={handleSend}>
            {submitting ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteChatModal({ chat, onCancel, onConfirm, onOpenSettings }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="delete-modal" onClick={e => e.stopPropagation()}>
        <h3>Delete chat?</h3>
        <p>This will delete <strong>{chat.title}</strong>.</p>
        <p className="delete-modal__hint">
          Visit <button type="button" className="link-btn" onClick={() => { onCancel(); onOpenSettings(); }}>settings</button> to delete any memories saved during this chat.
        </p>
        <div className="delete-modal__actions">
          <button className="btn-cancel" onClick={onCancel}>Cancel</button>
          <button className="btn-delete-confirm" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

function EmojiPicker({ onSelect }) {
  const [activeTab, setActiveTab] = useState("Smileys");
  return (
    <div className="emoji-picker">
      <div className="emoji-tabs">
        {Object.keys(EMOJI_CATEGORIES).map(cat => (
          <button key={cat} className={`emoji-tab ${activeTab===cat?'active':''}`} onClick={()=>setActiveTab(cat)}>{cat}</button>
        ))}
      </div>
      <div className="emoji-grid">
        {EMOJI_CATEGORIES[activeTab].map(emoji => {
          const countryCode = activeTab === "Flags" ? flagCountryCode(emoji) : null;
          return (
            <button key={emoji} className="emoji-btn" onClick={()=>onSelect(emoji)} title={countryCode ? countryCode.toUpperCase() : undefined}>
              {countryCode ? <img className="flag-icon" src={`/flags/4x3/${countryCode}.svg`} alt={countryCode} loading="lazy"/> : emoji}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function renderInline(text, keyPrefix) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g);
  return parts.filter(Boolean).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={key} className="inline-code">{part.slice(1, -1)}</code>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={key}>{part.slice(1, -1)}</em>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) return <a key={key} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
    return renderTextWithFlags(part, key);
  });
}

const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function parseTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
}

function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="code-block">
      <div className="code-block__header">
        <span>{lang || 'code'}</span>
        <button type="button" onClick={handleCopy}>
          {copied ? <Icons.Check size={13}/> : <Icons.Copy size={13}/>} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

function Markdown({ text }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="markdown">
      {blocks.map((block, bi) => {
        if (block.startsWith('```')) {
          const lang = block.match(/^```([a-zA-Z0-9+#-]*)/)?.[1] || '';
          const code = block.replace(/^```[a-zA-Z0-9+#-]*\n?/, '').replace(/```$/, '');
          return <CodeBlock key={bi} lang={lang} code={code} />;
        }
        const lines = block.split('\n').filter(l => l.trim().length > 0);
        const isTable = lines.length >= 2 && lines[0].includes('|') && TABLE_SEPARATOR_RE.test(lines[1]);
        if (isTable) {
          const header = parseTableRow(lines[0]);
          const rows = lines.slice(2).map(parseTableRow);
          return (
            <div className="markdown-table-wrap" key={bi}>
              <table className="markdown-table">
                <thead><tr>{header.map((h, hi) => <th key={hi}>{renderInline(h, `${bi}-h${hi}`)}</th>)}</tr></thead>
                <tbody>{rows.map((row, ri) => (
                  <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{renderInline(cell, `${bi}-${ri}-${ci}`)}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
          );
        }
        const isList = lines.length > 0 && lines.every(l => /^\s*([-*]|\d+\.)\s+/.test(l));
        if (isList) {
          const ordered = /^\s*\d+\.\s+/.test(lines[0]);
          const items = lines.map(l => l.replace(/^\s*([-*]|\d+\.)\s+/, ''));
          const ListTag = ordered ? 'ol' : 'ul';
          return <ListTag key={bi}>{items.map((it, ii) => <li key={ii}>{renderInline(it, `${bi}-${ii}`)}</li>)}</ListTag>;
        }
        const heading = block.match(/^(#{1,4})\s+(.*)$/);
        if (heading) {
          const Tag = `h${Math.min(heading[1].length + 2, 6)}`;
          return <Tag key={bi}>{renderInline(heading[2], `${bi}`)}</Tag>;
        }
        return <p key={bi}>{block.split('\n').map((line, li) => (
          <span key={li}>{renderInline(line, `${bi}-${li}`)}{li < block.split('\n').length - 1 && <br />}</span>
        ))}</p>;
      })}
    </div>
  );
}

function sourceHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function Message({ msg, onCopy, onLike, onDislike, onReply, onRegenerate, onEdit, onShare }) {
  const [copied, setCopied] = useState(false);
  const [liked, setLiked] = useState(msg.liked || false);
  const [disliked, setDisliked] = useState(msg.disliked || false);

  const handleCopy = () => { onCopy(msg.content); setCopied(true); setTimeout(()=>setCopied(false),2000); };

  return (
    <div className={`message message--${msg.role}`}>
      <div className="message__body">
        {msg.attachments?.length > 0 && (
          <div className="message__attachments">
            {msg.attachments.map((att,i) => (
              <div key={i} className="message__attachment">
                {att.type==='image' ? <img src={att.url} alt={att.name} /> : <div className="attachment-file"><Icons.File/><span>{att.name}</span></div>}
              </div>
            ))}
          </div>
        )}
        <div className={`message__content ${msg.isError ? 'message__content--error' : ''}`}>
          {msg.isError && <span className="error-icon-inline"><Icons.AlertTriangle size={14}/></span>}
          {msg.role === "assistant" && !msg.isError ? <Markdown text={msg.content} /> : renderTextWithFlags(msg.content, 'raw')}
        </div>
        {msg.role==="assistant" && msg.images?.length > 0 && (
          <div className="message__generated-images">
            {msg.images.map((img,i) => (
              <img key={i} className="message__generated-image" src={img.url} alt={img.prompt} loading="lazy" />
            ))}
          </div>
        )}
        {msg.role==="assistant" && msg.sources?.length > 0 && (
          <div className="message__sources">
            <span className="message__sources-label"><Icons.Globe/> Sources</span>
            {msg.sources.map((s,i) => (
              <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="message__source-chip" title={s.title || s.url}>
                {sourceHostname(s.url)}
              </a>
            ))}
          </div>
        )}
        <div className="message__actions">
          {msg.role==="assistant" ? (
            <>
              <button className="action-btn" onClick={handleCopy} title="Copy">{copied?<Icons.Check/>:<Icons.Copy/>}</button>
              <button className={`action-btn ${liked?'active':''}`} onClick={()=>{setLiked(!liked);setDisliked(false);onLike(msg);}} title="Good response"><Icons.ThumbsUp/></button>
              <button className={`action-btn ${disliked?'active':''}`} onClick={()=>{setDisliked(!disliked);setLiked(false);onDislike(msg);}} title="Bad response"><Icons.ThumbsDown/></button>
              <button className="action-btn" onClick={()=>onReply(msg)} title="Reply"><Icons.Reply/></button>
              <button className="action-btn" onClick={()=>onRegenerate(msg)} title="Regenerate"><Icons.Refresh/></button>
            </>
          ) : (
            <>
              <button className="action-btn" onClick={handleCopy} title="Copy">{copied?<Icons.Check/>:<Icons.Copy/>}</button>
              <button className="action-btn" onClick={()=>onEdit(msg)} title="Edit"><Icons.Edit/></button>
              <button className="action-btn" onClick={()=>onShare(msg)} title="Share"><Icons.Share/></button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DragDropOverlay({ onFiles }) {
  const [isOver, setIsOver] = useState(false);
  useEffect(() => {
    const handleDragOver = (e) => { e.preventDefault(); setIsOver(true); };
    const handleDragLeave = () => setIsOver(false);
    const handleDrop = (e) => { e.preventDefault(); setIsOver(false); if(e.dataTransfer.files.length>0) onFiles(Array.from(e.dataTransfer.files)); };
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDrop);
    return () => {
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('drop', handleDrop);
    };
  }, [onFiles]);
  if(!isOver) return null;
  return (
    <div className="drag-overlay">
      <div className="drag-overlay__content"><Icons.Upload/><h3>Drop files here</h3><p>Images, documents, and more</p></div>
    </div>
  );
}

const HEALTH_POLL_MS = 15000;
const SMART_MODEL = 'openai/gpt-oss-120b';
const DEFAULT_ACCENT = '#a1a1aa';
const CONTRAST_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'high', label: 'High' },
];
const ACCENT_OPTIONS = [
  { value: '#a1a1aa', label: 'Default', color: '#a1a1aa' },
  { value: '#3b82f6', label: 'Blue', color: '#3b82f6' },
  { value: '#8b5cf6', label: 'Purple', color: '#8b5cf6' },
  { value: '#ec4899', label: 'Pink', color: '#ec4899' },
  { value: '#10b981', label: 'Green', color: '#10b981' },
  { value: '#f59e0b', label: 'Orange', color: '#f59e0b' },
  { value: '#ef4444', label: 'Red', color: '#ef4444' },
];
const LANGUAGE_OPTIONS = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'rw', label: 'Kinyarwanda' },
  { value: 'sw', label: 'Swahili' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'nl', label: 'Dutch' },
  { value: 'ru', label: 'Russian' },
  { value: 'uk', label: 'Ukrainian' },
  { value: 'pl', label: 'Polish' },
  { value: 'tr', label: 'Turkish' },
  { value: 'ar', label: 'Arabic' },
  { value: 'he', label: 'Hebrew' },
  { value: 'fa', label: 'Persian' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ur', label: 'Urdu' },
  { value: 'bn', label: 'Bengali' },
  { value: 'zh', label: 'Chinese (Simplified)' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'vi', label: 'Vietnamese' },
  { value: 'th', label: 'Thai' },
  { value: 'id', label: 'Indonesian' },
  { value: 'ms', label: 'Malay' },
  { value: 'tl', label: 'Filipino' },
  { value: 'el', label: 'Greek' },
  { value: 'sv', label: 'Swedish' },
  { value: 'no', label: 'Norwegian' },
  { value: 'da', label: 'Danish' },
  { value: 'fi', label: 'Finnish' },
  { value: 'cs', label: 'Czech' },
  { value: 'ro', label: 'Romanian' },
  { value: 'hu', label: 'Hungarian' },
  { value: 'am', label: 'Amharic' },
  { value: 'zu', label: 'Zulu' },
  // Broader regional coverage — these ride the same Whisper auto-detect path
  // as the languages above, so adding them here is what actually lets
  // dictation and "Auto" recognize them (this list also gates which locales
  // the pinned, single-language browser recognizer can be set to).
  { value: 'af', label: 'Afrikaans' },
  { value: 'sq', label: 'Albanian' },
  { value: 'hy', label: 'Armenian' },
  { value: 'az', label: 'Azerbaijani' },
  { value: 'eu', label: 'Basque' },
  { value: 'be', label: 'Belarusian' },
  { value: 'bs', label: 'Bosnian' },
  { value: 'bg', label: 'Bulgarian' },
  { value: 'ca', label: 'Catalan' },
  { value: 'hr', label: 'Croatian' },
  { value: 'et', label: 'Estonian' },
  { value: 'gl', label: 'Galician' },
  { value: 'ka', label: 'Georgian' },
  { value: 'is', label: 'Icelandic' },
  { value: 'lv', label: 'Latvian' },
  { value: 'lt', label: 'Lithuanian' },
  { value: 'lb', label: 'Luxembourgish' },
  { value: 'mk', label: 'Macedonian' },
  { value: 'mt', label: 'Maltese' },
  { value: 'sr', label: 'Serbian' },
  { value: 'sk', label: 'Slovak' },
  { value: 'sl', label: 'Slovenian' },
  { value: 'cy', label: 'Welsh' },
  { value: 'yi', label: 'Yiddish' },
  { value: 'gu', label: 'Gujarati' },
  { value: 'kn', label: 'Kannada' },
  { value: 'ml', label: 'Malayalam' },
  { value: 'mr', label: 'Marathi' },
  { value: 'ne', label: 'Nepali' },
  { value: 'pa', label: 'Punjabi' },
  { value: 'ps', label: 'Pashto' },
  { value: 'sd', label: 'Sindhi' },
  { value: 'si', label: 'Sinhala' },
  { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' },
  { value: 'bo', label: 'Tibetan' },
  { value: 'my', label: 'Burmese' },
  { value: 'km', label: 'Khmer' },
  { value: 'lo', label: 'Lao' },
  { value: 'jw', label: 'Javanese' },
  { value: 'su', label: 'Sundanese' },
  { value: 'kk', label: 'Kazakh' },
  { value: 'mn', label: 'Mongolian' },
  { value: 'tg', label: 'Tajik' },
  { value: 'tk', label: 'Turkmen' },
  { value: 'uz', label: 'Uzbek' },
  { value: 'ha', label: 'Hausa' },
  { value: 'so', label: 'Somali' },
  { value: 'sn', label: 'Shona' },
  { value: 'yo', label: 'Yoruba' },
  { value: 'mg', label: 'Malagasy' },
  { value: 'mi', label: 'Maori' },
  { value: 'ht', label: 'Haitian Creole' },
];
const RECOGNITION_LANGUAGE_CODES = new Set(LANGUAGE_OPTIONS.map(o => o.value).filter(v => v !== 'auto'));

// Maps a BCP-47 locale (the browser/OS locale, navigator.language) down to
// one of the recognition codes above — used to pick a fallback locale when
// Whisper's auto-detect confidence comes back low. Falls back to English
// when the system locale isn't one of ours.
function toRecognitionLanguageCode(locale) {
  const primary = (locale || '').split('-')[0].toLowerCase();
  return RECOGNITION_LANGUAGE_CODES.has(primary) ? primary : 'en';
}

// The Web Speech API's `lang` property needs a full BCP-47 tag ("es-ES"),
// not a bare ISO-639-1 code — passing "es" isn't a recognized tag, and
// Chrome doesn't error on that, it just silently keeps recognizing in
// whatever locale it was already using (normally English). That made
// pinning any language other than English silently mishear as English.
// This maps each of our codes to one real region tag so recognition
// actually switches; anything the browser truly doesn't support still
// throws 'language-not-supported', which is already handled by falling
// back to Whisper.
const NATIVE_RECOGNITION_LOCALES = {
  en: 'en-US', fr: 'fr-FR', es: 'es-ES', rw: 'rw-RW', sw: 'sw-KE',
  de: 'de-DE', it: 'it-IT', pt: 'pt-BR', nl: 'nl-NL', ru: 'ru-RU',
  uk: 'uk-UA', pl: 'pl-PL', tr: 'tr-TR', ar: 'ar-SA', he: 'he-IL',
  fa: 'fa-IR', hi: 'hi-IN', ur: 'ur-PK', bn: 'bn-BD', zh: 'zh-CN',
  ja: 'ja-JP', ko: 'ko-KR', vi: 'vi-VN', th: 'th-TH', id: 'id-ID',
  ms: 'ms-MY', tl: 'fil-PH', el: 'el-GR', sv: 'sv-SE', no: 'nb-NO',
  da: 'da-DK', fi: 'fi-FI', cs: 'cs-CZ', ro: 'ro-RO', hu: 'hu-HU',
  am: 'am-ET', zu: 'zu-ZA', af: 'af-ZA', sq: 'sq-AL', hy: 'hy-AM',
  az: 'az-AZ', eu: 'eu-ES', be: 'be-BY', bs: 'bs-BA', bg: 'bg-BG',
  ca: 'ca-ES', hr: 'hr-HR', et: 'et-EE', gl: 'gl-ES', ka: 'ka-GE',
  is: 'is-IS', lv: 'lv-LV', lt: 'lt-LT', lb: 'lb-LU', mk: 'mk-MK',
  mt: 'mt-MT', sr: 'sr-RS', sk: 'sk-SK', sl: 'sl-SI', cy: 'cy-GB',
  yi: 'yi-001', gu: 'gu-IN', kn: 'kn-IN', ml: 'ml-IN', mr: 'mr-IN',
  ne: 'ne-NP', pa: 'pa-Guru-IN', ps: 'ps-AF', sd: 'sd-IN', si: 'si-LK',
  ta: 'ta-IN', te: 'te-IN', bo: 'bo-CN', my: 'my-MM', km: 'km-KH',
  lo: 'lo-LA', jw: 'jv-ID', su: 'su-ID', kk: 'kk-KZ', mn: 'mn-MN',
  tg: 'tg-TJ', tk: 'tk-TM', uz: 'uz-UZ', ha: 'ha-NG', so: 'so-SO',
  sn: 'sn-ZW', yo: 'yo-NG', mg: 'mg-MG', mi: 'mi-NZ', ht: 'ht-HT',
};
const TONE_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'concise', label: 'Concise' },
  { value: 'witty', label: 'Witty' },
];
const DEGREE_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'more', label: 'More' },
  { value: 'less', label: 'Less' },
];
const MODEL_OPTIONS = [
  { value: 'openai/gpt-oss-120b', label: 'Recommended' },
  { value: 'openai/gpt-oss-20b', label: 'Fastest' },
  { value: 'groq/compound', label: 'Web Search' },
  { value: 'groq/compound-mini', label: 'Web Search (Faster)' },
];
const SPEED_OPTIONS = [
  { value: 0.8, label: 'Slow' },
  { value: 1, label: 'Normal' },
  { value: 1.25, label: 'Fast' },
];

// Only role+content survive the trip to the server — attachments, sources,
// likes etc. are local UI state, and a failed reply shouldn't poison context
// for the next turn in this chat.
function toHistoryPayload(msgs) {
  return msgs
    .filter(m => !m.isError && (m.role === 'user' || m.role === 'assistant'))
    .map(m => ({ role: m.role, content: m.content }));
}

function fallbackTitle(text) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const title = words.slice(0, 5).join(' ');
  return words.length > 5 ? `${title}...` : title;
}

// Strip markdown/code-block/image-marker artifacts so text-to-speech doesn't
// read out literal asterisks, pipes, or code — just the words.
function stripForSpeech(text) {
  return text
    .replace(/\[IMAGE:[^\]]*\]/gi, '')
    .replace(/```[\s\S]*?```/g, ' code block omitted ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_#`>|]/g, '')
    // Most TTS voices read "AI" as a word ("eye") rather than spelling the
    // letters — force letter-by-letter pronunciation, e.g. "FigoAI" -> "Figo A I".
    .replace(/Figo\s*AI\b/gi, 'Figo A I')
    .replace(/\bAI\b/g, 'A I')
    .trim();
}

function speakReply(text, settings) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const clean = stripForSpeech(text);
  if (!clean) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(clean);
  const voice = window.speechSynthesis.getVoices().find(v => v.voiceURI === settings.voiceURI);
  if (voice) utterance.voice = voice;
  utterance.rate = settings.voiceRate || 1;
  window.speechSynthesis.speak(utterance);
}

export default function App({ user, accounts, onLogout, onUpdateUser, onAddAccount, onSwitchAccount }) {
  const chatsKey = `figoai_chats_${user.id}`;

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState('openai/gpt-oss-120b');
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // 'connecting' | 'online' | 'offline'
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 768);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [researchMode, setResearchMode] = useState(null); // null | 'web' | 'deep'
  const [attachments, setAttachments] = useState([]);
  const [dismissedSuggestions, setDismissedSuggestions] = useState([]);
  const [editingAttachment, setEditingAttachment] = useState(null);
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('figoai_settings');
    const parsed = saved ? JSON.parse(saved) : {
      model: 'openai/gpt-oss-120b', temperature: 0.7,
      notifyResponses: { push: false }, notifySecurity: { email: false },
      contrast: 'standard', accentColor: DEFAULT_ACCENT, language: 'auto', smartMode: false, dictationEnabled: true,
      tone: 'default', traits: { warmth: 'default', enthusiasm: 'default', formatting: 'default', emoji: 'default' },
      customInstructions: '', nickname: '', occupation: '', aboutMore: '', memoryEnabled: true, defaultWebSearch: true,
      voiceEnabled: false, voiceURI: '', voiceRate: 1,
    };
    // One-time migration: web search used to default to off. Force it on for
    // installs that already had settings saved under the old default, once —
    // after that, whatever the user picks in Settings sticks.
    if (saved && !localStorage.getItem('figoai_websearch_default_migrated')) {
      parsed.defaultWebSearch = true;
      localStorage.setItem('figoai_websearch_default_migrated', '1');
    }
    return parsed;
  });
  const effectiveTheme = 'dark';
  const [chats, setChats] = useState(() => {
    const saved = localStorage.getItem(chatsKey);
    return saved ? JSON.parse(saved) : [];
  });
  const [activeChat, setActiveChat] = useState(null);
  const [activeView, setActiveView] = useState('chat'); // 'chat' | 'images' | 'library' | 'projects' | 'admin'
  const [libraryTab, setLibraryTab] = useState('all');
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [recentsCollapsed, setRecentsCollapsed] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [voiceHint, setVoiceHint] = useState("");
  const [openChatMenuId, setOpenChatMenuId] = useState(null);
  const [renamingChatId, setRenamingChatId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const chatMenuRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const userMenuRef = useRef(null);
  const railUserMenuRef = useRef(null);

  useEffect(() => {
    if (!showUserMenu) return;
    const handleClickOutside = (e) => {
      if (userMenuRef.current?.contains(e.target)) return;
      if (railUserMenuRef.current?.contains(e.target)) return;
      setShowUserMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu]);

  useEffect(() => {
    if (!openChatMenuId) return;
    const handleClickOutside = (e) => {
      if (!e.target.closest('.chat-item-menu')) setOpenChatMenuId(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openChatMenuId]);

  useEffect(() => {
    if (!showAttachMenu) return;
    const handleClickOutside = (e) => {
      if (!e.target.closest('.composer-menu-wrap')) setShowAttachMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAttachMenu]);

  useEffect(() => {
    let cancelled = false;
    const ping = () => {
      setConnectionStatus(prev => (prev === 'online' ? prev : 'connecting'));
      checkHealth()
        .then(d => { if (!cancelled) { setConnectionStatus('online'); setModel(d.model || settings.model); } })
        .catch(() => { if (!cancelled) setConnectionStatus('offline'); });
    };
    ping();
    const interval = setInterval(ping, HEALTH_POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({behavior:"smooth"}); }, [messages, loading]);
  useEffect(() => { localStorage.setItem(chatsKey, JSON.stringify(chats)); }, [chats, chatsKey]);
  useEffect(() => { localStorage.setItem('figoai_settings', JSON.stringify(settings)); }, [settings]);

  // Auto-save current conversation
  useEffect(() => {
    if (activeChat && messages.length > 0) {
      setChats(prev => prev.map(c => c.id === activeChat ? { ...c, messages, updatedAt: new Date().toISOString() } : c));
    }
  }, [messages]);

  // Auto-create chat if sending first message without active chat
  useEffect(() => {
    if (!activeChat && messages.length === 1) {
      const newChat = { id: Date.now(), title: fallbackTitle(messages[0].content), messages: [...messages], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      setChats(prev => [newChat, ...prev]);
      setActiveChat(newChat.id);
    }
  }, [messages.length]);

  // Wait until the 2nd turn lands before naming the chat — a lone opening
  // message ("Hi", "quick question") rarely reveals the real topic; by turn
  // 2 it usually has. Same trick ChatGPT uses to name new chats, just timed later.
  useEffect(() => {
    if (!activeChat || messages.length !== 4) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role !== 'assistant' || lastMsg.isError) return;
    const userTurns = messages.filter(m => m.role === 'user').map(m => m.content).join('\n');
    const fallback = fallbackTitle(messages[0].content);

    generateChatTitle(userTurns, lastMsg.content)
      .then(title => {
        if (!title) return;
        const trimmed = title.length > 50 ? `${title.slice(0, 50).trim()}...` : title;
        setChats(prev => prev.map(c => (c.id === activeChat && c.title === fallback) ? { ...c, title: trimmed } : c));
      })
      .catch(() => {}); // keep the cleaned fallback title if generation fails
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  const processFiles = useCallback((files) => {
    const newAtts = [];
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        newAtts.push({ name: file.name, type: file.type.startsWith('image/') ? 'image' : 'file', url: e.target.result, size: file.size });
        if(newAtts.length === files.length) setAttachments(prev => [...prev, ...newAtts]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const VOICE_ERROR_MESSAGES = {
    'not-allowed': 'Microphone access was blocked. Allow it in your browser settings and try again.',
    'no-speech': "Didn't catch that — try again.",
    'audio-capture': 'No microphone found.',
    'network': 'Network error during voice recognition.',
  };

  const blobToBase64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  // Fallback for browsers without SpeechRecognition (Firefox, flaky on
  // mobile Safari) and the primary path whenever the user hasn't pinned a
  // language: record audio and transcribe it server-side via Groq Whisper,
  // which auto-detects language from the audio itself (ALD) instead of
  // needing one picked up front. To still feel like live dictation rather
  // than record-then-wait, the growing recording is re-transcribed every few
  // seconds so the composer fills in progressively, with one final pass on
  // stop for the authoritative transcript.
  const startWhisperRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError('Voice input is not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      const baseText = input && !input.endsWith(' ') ? input + ' ' : input;
      // A language the user explicitly pinned (reached here only because this
      // browser lacks SpeechRecognition) is honored as-is — auto-detect only
      // applies when they left it on "Auto".
      const pinnedLanguage = (settings.language && settings.language !== 'auto') ? settings.language : null;
      let languageHint = pinnedLanguage;
      setVoiceHint('');

      const transcribeSoFar = async () => {
        if (!chunks.length) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size === 0) return;
        const base64 = await blobToBase64(blob);
        const { text, language, confidence } = await transcribeVoice(base64, blob.type, languageHint || undefined);
        // Whisper transcribes the whole recording-so-far each pass, so the
        // result already supersedes the last partial — replace, don't append.
        if (text) setInput(baseText + text);
        // Fallback behavior: a low-confidence auto-detect pass switches future
        // passes to the device's system/app locale, but keeps the recording
        // (and the "listening" indicator) running rather than stopping it —
        // the user never has to notice or restart anything.
        if (!pinnedLanguage && !languageHint && typeof confidence === 'number' && confidence < 0.5) {
          languageHint = toRecognitionLanguageCode(navigator.language);
          setVoiceHint(`Low confidence — switched to ${LANGUAGE_OPTIONS.find(o => o.value === languageHint)?.label || languageHint}`);
        } else if (language) {
          setVoiceHint(`Listening in ${LANGUAGE_OPTIONS.find(o => o.value === language)?.label || language}`);
        }
      };

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      // Guards against overlapping passes: if a poll is still waiting on a
      // slow response when the next tick fires, skip that tick rather than
      // firing another request whose (possibly out-of-order) reply could
      // stomp a newer one.
      let inFlight = null;
      const pollTimer = setInterval(() => {
        if (inFlight) return;
        inFlight = transcribeSoFar().catch(() => {}).finally(() => { inFlight = null; });
      }, 3500);
      recorder.onstop = async () => {
        clearInterval(pollTimer);
        stream.getTracks().forEach(t => t.stop());
        try {
          if (inFlight) await inFlight;
          await transcribeSoFar();
        } catch (err) {
          setVoiceError(err.message || 'Voice input failed. Try again.');
        } finally {
          setIsListening(false);
          inputRef.current?.focus();
        }
      };
      window.voiceRecorder = recorder;
      recorder.start();
      setIsListening(true);
    } catch {
      setVoiceError('Microphone access was blocked. Allow it in your browser settings and try again.');
    }
  };

  const toggleVoice = () => {
    setVoiceError("");
    setVoiceHint("");
    if(isListening) {
      // Don't flip isListening here — it's premature. abort()/stop() each
      // fire their own callback (onend, or the MediaRecorder's onstop ->
      // transcribe chain) which is what actually turns the indicator off;
      // setting it here too just causes it to flash off while the Whisper
      // fallback is still uploading and transcribing in the background.
      window.speechRecognition?.abort();
      if (window.voiceRecorder?.state !== 'inactive') window.voiceRecorder?.stop();
      return;
    }
    // The browser's built-in recognizer only ever listens for one fixed
    // language per session — it can't tell what language you're actually
    // speaking. Whisper can (it auto-detects from the audio itself), so
    // "Auto" — meaning you haven't pinned one specific language — routes
    // straight to it instead of guessing a single locale and getting
    // anything else you say misheard. A specific chosen language still uses
    // the faster, live-captioned native recognizer for that one language.
    const isAutoLanguage = !settings.language || settings.language === 'auto';
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(isAutoLanguage || !SR) { startWhisperRecording(); return; }
    const r = new SR();
    // Live, ChatGPT-style dictation: keep listening across pauses (continuous)
    // and show words in the composer as they're recognized (interimResults),
    // instead of staying silent until you stop and dumping one final chunk.
    r.continuous = true;
    r.interimResults = true;
    // Honor the user's chosen reply language for recognition too, mapped to a
    // real BCP-47 tag the API actually understands (see
    // NATIVE_RECOGNITION_LOCALES above — a bare code like "es" silently
    // mishears as English instead of erroring). The 'auto' case never
    // reaches here — it's routed to Whisper above.
    r.lang = NATIVE_RECOGNITION_LOCALES[settings.language] || settings.language;
    const baseText = input && !input.endsWith(' ') ? input + ' ' : input;
    let finalTranscript = '';
    r.onstart = () => setIsListening(true);
    r.onend = () => setIsListening(false);
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalTranscript += transcript;
        else interim += transcript;
      }
      setInput(baseText + finalTranscript + interim);
    };
    r.onerror = (e) => {
      setIsListening(false);
      // 'aborted' fires as the direct result of our own call to .abort()
      // when the user clicks the mic again to stop — that's a deliberate
      // stop, not a failure, so it gets no error message.
      if (e.error === 'aborted') return;
      // Chrome's built-in recognizer only supports a limited set of
      // languages — it doesn't know Kinyarwanda, for one. Rather than just
      // fail, fall back to the Whisper path, which transcribes any language
      // server-side without needing browser-level language support.
      if (e.error === 'language-not-supported') { startWhisperRecording(); return; }
      setVoiceError(VOICE_ERROR_MESSAGES[e.error] || `Voice input failed (${e.error}). Try again.`);
    };
    window.speechRecognition = r;
    r.start();
  };

  const createNewChat = () => {
    setActiveView('chat'); setActiveChat(null); setMessages([]); setAttachments([]); setDismissedSuggestions([]); inputRef.current?.focus();
  };

  // Esc closes whichever menu, panel, or dialog is currently open; the rest
  // are the app-level shortcuts listed in Settings > Keyboard.
  useEffect(() => {
    const handleShortcut = (e) => {
      if (e.key === 'Escape') {
        if (e.shiftKey) { e.preventDefault(); return inputRef.current?.focus(); }
        if (showSettings) return setShowSettings(false);
        if (showProfile) return setShowProfile(false);
        if (showSearchModal) return setShowSearchModal(false);
        if (deleteTarget) return setDeleteTarget(null);
        if (showAttachMenu) return setShowAttachMenu(false);
        if (openChatMenuId) return setOpenChatMenuId(null);
        if (showEmoji) return setShowEmoji(false);
        if (showUserMenu) return setShowUserMenu(false);
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (e.shiftKey && key === 'o') { e.preventDefault(); createNewChat(); }
      else if (e.shiftKey && key === 's') { e.preventDefault(); setSidebarOpen(v => !v); }
      else if (!e.shiftKey && key === 'k') { e.preventDefault(); setShowSearchModal(true); }
      else if (!e.shiftKey && e.key === ',') { e.preventDefault(); setShowSettings(true); }
    };
    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  }, [showSettings, showProfile, showSearchModal, deleteTarget, showAttachMenu, openChatMenuId, showEmoji, showUserMenu, createNewChat]);

  const deleteChat = (chatId) => {
    setChats(prev => prev.filter(c => c.id !== chatId));
    if(activeChat === chatId) { setActiveChat(null); setMessages([]); setAttachments([]); }
  };

  const handleDeleteWithConfirm = (chat) => setDeleteTarget(chat);

  const startRename = (chat) => { setRenamingChatId(chat.id); setRenameValue(chat.title); setOpenChatMenuId(null); };

  const saveRename = (chatId) => {
    const title = renameValue.trim();
    if (title) setChats(prev => prev.map(c => c.id===chatId ? { ...c, title } : c));
    setRenamingChatId(null);
  };

  const handleShare = async (chat) => {
    setOpenChatMenuId(null);
    const transcript = (chat.messages||[]).map(m => `${m.role==='user' ? (user.displayName||user.username) : 'FigoAI'}: ${m.content}`).join('\n\n');
    const text = `${chat.title}\n\n${transcript}`;
    try {
      await navigator.clipboard.writeText(text);
      alert('Conversation copied to clipboard.');
    } catch {
      alert('Could not copy to clipboard.');
    }
  };

  const toggleArchive = (chat) => {
    setChats(prev => prev.map(c => c.id===chat.id ? { ...c, archived: !c.archived } : c));
    setOpenChatMenuId(null);
  };

  const handleClearHistory = () => {
    setChats([]);
    setActiveChat(null);
    setMessages([]);
    setAttachments([]);
  };

  const openLibraryTab = (tab) => {
    setLibraryTab(tab);
    setActiveView('library');
    setShowSettings(false);
  };

  // Priority: an explicit research mode > "Higher intelligence" > the
  // Personalization > Advanced "Web search" default > whatever's picked in
  // Personalization > AI Model.
  const getModel = () => {
    if (researchMode) return settings.model;
    if (settings.smartMode) return SMART_MODEL;
    if (settings.defaultWebSearch) return 'groq/compound-mini';
    return settings.model;
  };

  const getPersonalization = () => ({
    tone: settings.tone,
    traits: settings.traits,
    customInstructions: settings.customInstructions,
    memoryEnabled: settings.memoryEnabled !== false,
    nickname: settings.nickname,
    occupation: settings.occupation,
    aboutMore: settings.aboutMore,
  });

  const toggleResearchMode = (mode) => {
    setResearchMode(prev => {
      const next = prev === mode ? null : mode;
      const nextModel = next === 'deep' ? 'groq/compound' : next === 'web' ? 'groq/compound-mini' : SMART_MODEL;
      setSettings(s => ({ ...s, model: nextModel }));
      return next;
    });
    setShowAttachMenu(false);
    inputRef.current?.focus();
  };

  const handleCopy = (text) => navigator.clipboard.writeText(text);
  const handleLike = (msg) => setMessages(prev => prev.map(m => m===msg?{...m,liked:!m.liked,disliked:false}:m));
  const handleDislike = (msg) => setMessages(prev => prev.map(m => m===msg?{...m,disliked:!m.disliked,liked:false}:m));
  const handleReply = (msg) => { setInput(`> ${msg.content.substring(0,80)}...\n`); inputRef.current?.focus(); };
  const handleEdit = (msg) => { setInput(msg.content); inputRef.current?.focus(); };
  const handleShareMessage = async (msg) => {
    if (navigator.share) {
      try { await navigator.share({ text: msg.content }); } catch { /* user cancelled */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(msg.content);
      alert('Copied to clipboard.');
    } catch {
      alert('Could not copy to clipboard.');
    }
  };

  const handleRegenerate = async (msg) => {
    setLoading(true);
    try {
      const priorMessages = messages.slice(0, messages.indexOf(msg));
      const r = await sendMessage("Regenerate your last reply, with a fresh take.", {temperature:settings.temperature, model:getModel(), deepResearch:researchMode==='deep', language:settings.language, personalization:getPersonalization(), history: toHistoryPayload(priorMessages), smart:!!settings.smartMode});
      setMessages(prev => prev.map(m => m===msg ? {...m, content:r.reply, sources:r.sources, images:r.images, isError:false} : m));
      if (settings.voiceEnabled) speakReply(r.reply, settings);
    } catch (err) {
      if (err.status === 401) return onLogout();
      setMessages(prev => prev.map(m => m===msg ? {...m, content: err.message || "Couldn't regenerate. Please try again.", isError:true} : m));
    }
    setLoading(false);
  };

  const insertEmoji = (emoji) => { setInput(p=>p+emoji); setShowEmoji(false); inputRef.current?.focus(); };

  const composerDisabled = loading || connectionStatus !== 'online';

  async function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if(!text || composerDisabled) return;
    const userMsg = { role:"user", content:text, attachments:[...attachments], likes:0 };
    const priorMessages = messages;
    setInput(""); setAttachments([]);
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    setTimeout(async () => {
      try {
        const { reply, sources, images } = await sendMessage(text, {temperature:settings.temperature, model:getModel(), deepResearch:researchMode==='deep', language:settings.language, personalization:getPersonalization(), history: toHistoryPayload(priorMessages), smart:!!settings.smartMode, attachments:userMsg.attachments});
        setMessages(prev => [...prev, { role:"assistant", content:reply, sources, images, likes:0 }]);
        if (settings.notifyResponses?.push && document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('FigoAI replied', { body: reply.slice(0, 120), icon: '/logo-mark.png' });
        }
        if (settings.voiceEnabled) speakReply(reply, settings);
      } catch (err) {
        if (err.status === 401) { setLoading(false); return onLogout(); }
        setMessages(prev => [...prev, { role:"assistant", content: err.message || "Something went wrong. Please try again.", likes:0, isError:true }]);
      }
      setLoading(false);
      inputRef.current?.focus();
    }, 300);
  }

  const handleLogout = () => { onLogout(); };

  const composerPlaceholder = connectionStatus === 'online'
    ? 'Ask anything'
    : connectionStatus === 'connecting'
      ? 'Connecting to FigoAI...'
      : 'Server unreachable — retrying...';

  const visibleChats = [...chats]
    .sort((a,b)=>new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt));

  const renderComposer = () => (
    <>
      {attachments.length>0 && (
        <div className="attachments-bar">
          {attachments.map((att,i)=>(
            <div key={i} className="attachment-item">
              {att.type==='image'?<img src={att.url} alt=""/>:<Icons.File/>}
              <span>{att.name}</span>
              {att.type==='image' && <button onClick={()=>setEditingAttachment(i)} title="Edit image"><Icons.Wand size={12}/></button>}
              <button onClick={()=>setAttachments(prev=>prev.filter((_,j)=>j!==i))}><Icons.X/></button>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <div className="input-wrapper">
          <div className="composer-menu-wrap">
            <button type="button" className="input-btn" onClick={()=>setShowAttachMenu(v=>!v)} title="Add"><Icons.Plus/></button>
            {showAttachMenu && (
              <div className="composer-menu">
                <button type="button" onClick={()=>{fileInputRef.current?.click(); setShowAttachMenu(false);}}><Icons.Paperclip size={16}/> <span>Add photos & files</span></button>
                <button type="button" onClick={()=>{setActiveView('library'); setShowAttachMenu(false);}}><Icons.Library size={16}/> <span>Add from library</span></button>
                <button type="button" onClick={()=>{setActiveView('images'); setShowAttachMenu(false);}}><Icons.Image size={16}/> <span>Create image</span></button>
                <button type="button" className={researchMode==='web'?'active':''} onClick={()=>toggleResearchMode('web')}><Icons.Globe size={16}/> <span>Web search</span> {researchMode==='web' && <Icons.Check size={13}/>}</button>
                <button type="button" className={researchMode==='deep'?'active':''} onClick={()=>toggleResearchMode('deep')}><Icons.Sparkles size={16}/> <span>Deep research</span> {researchMode==='deep' && <Icons.Check size={13}/>}</button>
              </div>
            )}
          </div>
          {researchMode && (
            <span className="research-chip">
              {researchMode==='deep' ? <Icons.Sparkles size={12}/> : <Icons.Globe size={12}/>}
              {researchMode==='deep' ? 'Deep research' : 'Web search'}
              <button type="button" onClick={()=>toggleResearchMode(researchMode)} title="Turn off"><Icons.X size={11}/></button>
            </span>
          )}
          <input type="file" ref={fileInputRef} onChange={(e)=>{if(e.target.files.length>0)processFiles(Array.from(e.target.files));}} style={{display:'none'}} accept="image/*,.pdf,.doc,.docx,.txt,.csv" multiple/>
          <input ref={inputRef} type="text" value={input} onChange={(e)=>setInput(e.target.value)}
            placeholder={composerPlaceholder} disabled={composerDisabled} autoFocus
            onKeyDown={(e)=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSubmit(e);}}}/>
          {settings.dictationEnabled !== false && (
            <button type="button" className={`input-btn voice-btn ${isListening?'listening':''}`} onClick={toggleVoice} disabled={composerDisabled} title="Dictate"><Icons.Mic/></button>
          )}
          <button type="button" className={`input-btn ${settings.smartMode?'active':''}`} onClick={()=>setSettings(s=>({...s, smartMode:!s.smartMode}))} title={settings.smartMode ? "Higher intelligence on — using the most capable model" : "Higher intelligence — switch to the most capable model"}><Icons.Brain/></button>
          <button type="submit" className="send-btn" disabled={composerDisabled||!input.trim()}><Icons.Send/></button>
        </div>
      </form>
      {voiceError && <p className="voice-error">{voiceError}</p>}
      {!voiceError && isListening && voiceHint && <p className="voice-hint">{voiceHint}</p>}
    </>
  );

  return (
    <div
      className={`app-container theme-${effectiveTheme} ${settings.contrast==='high'?'contrast-high':''}`}
      style={{'--accent': settings.accentColor || DEFAULT_ACCENT}}
    >
      <DragDropOverlay onFiles={processFiles} />

      {sidebarOpen && <div className="sidebar-backdrop" onClick={()=>setSidebarOpen(false)} />}

      {!sidebarOpen && (
        <div className="sidebar-rail">
          <button className="sidebar-rail__logo" onClick={()=>setSidebarOpen(true)} title="Open sidebar">
            <img src="/logo-mark.png" alt="FigoAI" />
          </button>
          <button onClick={createNewChat} title="New conversation"><Icons.Plus size={18}/></button>
          <button onClick={()=>setShowSearchModal(true)} title="Search chats"><Icons.Search size={18}/></button>
          <button onClick={()=>setSidebarOpen(true)} title="Recents"><Icons.MessageSquare size={18}/></button>
          <div className="sidebar-rail__spacer"></div>
          <div className="sidebar-rail__user" ref={railUserMenuRef}>
            <button className="sidebar-rail__avatar" onClick={()=>setShowUserMenu(v=>!v)} title={user.displayName||user.username}>
              <div className="sidebar__user-avatar" style={{background:getAvatarColor(user.displayName||user.username)}}>
                {user.avatarUrl ? <img src={user.avatarUrl} alt="" style={{width:'100%',height:'100%',borderRadius:'50%',objectFit:'cover'}}/> : <span className="avatar-initial">{getAvatarInitial(user.displayName||user.username)}</span>}
              </div>
            </button>
            {showUserMenu && (
              <UserMenu
                rail
                user={user}
                accounts={accounts}
                onSwitchAccount={(a)=>{setShowUserMenu(false); onSwitchAccount(a);}}
                onProfile={()=>{setShowProfile(true);setShowUserMenu(false);}}
                onSettings={()=>{setShowSettings(true);setShowUserMenu(false);}}
                onAddAccount={()=>{setShowUserMenu(false); onAddAccount();}}
                onAdmin={()=>{setShowUserMenu(false); setActiveView('admin');}}
                onLogout={handleLogout}
              />
            )}
          </div>
        </div>
      )}
      <div className={`sidebar ${sidebarOpen?'open':'closed'}`}>
        <div className="sidebar__header">
          <div className="sidebar__logo"><img src="/logo-mark.png" alt="" /><span>FigoAI</span></div>
          <div className="sidebar__header-actions">
            <button onClick={()=>setShowSearchModal(true)} title="Search chats"><Icons.Search size={16}/></button>
            <button onClick={()=>setSidebarOpen(false)} title="Close sidebar"><Icons.SidebarClose size={16}/></button>
          </div>
        </div>
        <button className="new-chat-btn" onClick={createNewChat}><Icons.Edit size={18}/> New chat</button>
        <nav className="sidebar__nav">
          <button className={`sidebar__nav-item ${activeView==='images'?'active':''}`} onClick={()=>setActiveView('images')}><Icons.Image size={16}/> Images</button>
          <button className={`sidebar__nav-item ${activeView==='library'?'active':''}`} onClick={()=>setActiveView('library')}><Icons.Library size={16}/> Library</button>
          <button className={`sidebar__nav-item ${activeView==='projects'?'active':''}`} onClick={()=>setActiveView('projects')}><Icons.Folder size={16}/> Projects</button>
        </nav>
        <div className="sidebar__chats">
          {chats.length > 0 && (
            <button className="sidebar__section-label" onClick={()=>setRecentsCollapsed(v=>!v)}>
              Recents <Icons.ChevronDown size={12} className={recentsCollapsed?'collapsed':''}/>
            </button>
          )}
          {!recentsCollapsed && visibleChats.filter(c=>!c.archived).map(chat => (
            <div key={chat.id} className={`chat-item ${activeView==='chat' && activeChat===chat.id?'active':''}`}
              onClick={()=>{if(renamingChatId===chat.id) return; setActiveView('chat');setActiveChat(chat.id);setMessages(chat.messages||[]);setAttachments([]);}}>
              <div className="chat-item__info">
                {renamingChatId===chat.id ? (
                  <input
                    className="chat-item__rename-input"
                    value={renameValue}
                    autoFocus
                    onClick={(e)=>e.stopPropagation()}
                    onChange={(e)=>setRenameValue(e.target.value)}
                    onBlur={()=>saveRename(chat.id)}
                    onKeyDown={(e)=>{if(e.key==='Enter'){e.preventDefault();saveRename(chat.id);} if(e.key==='Escape'){setRenamingChatId(null);}}}
                  />
                ) : (
                  <span className="chat-item__title">{chat.title}</span>
                )}
              </div>
              <div className="chat-item-menu">
                <button className="chat-item__more" onClick={(e)=>{e.stopPropagation(); setOpenChatMenuId(openChatMenuId===chat.id?null:chat.id);}}><Icons.MoreVertical/></button>
                {openChatMenuId===chat.id && (
                  <div className="chat-item__dropdown" onClick={(e)=>e.stopPropagation()}>
                    <button onClick={()=>startRename(chat)}><Icons.Edit size={14}/> Rename</button>
                    <button onClick={()=>handleShare(chat)}><Icons.Share size={14}/> Share</button>
                    <button onClick={()=>toggleArchive(chat)}><Icons.Archive size={14}/> {chat.archived?'Unarchive':'Archive'}</button>
                    <button className="chat-item__dropdown-delete" onClick={()=>{setOpenChatMenuId(null); handleDeleteWithConfirm(chat);}}><Icons.Trash size={14}/> Delete</button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {chats.length===0 && <div className="no-chats"><Icons.MessageSquare/><p>No conversations</p><span>Start chatting to save</span></div>}
          {chats.some(c=>c.archived) && (
            <>
              <button className="sidebar__section-label" onClick={()=>setShowArchived(v=>!v)}>
                Archived <Icons.ChevronDown size={12} className={!showArchived?'collapsed':''}/>
              </button>
              {showArchived && visibleChats.filter(c=>c.archived).map(chat => (
                <div key={chat.id} className="chat-item" onClick={()=>{setActiveView('chat');setActiveChat(chat.id);setMessages(chat.messages||[]);setAttachments([]);}}>
                  <div className="chat-item__info">
                    <span className="chat-item__title">{chat.title}</span>
                  </div>
                  <button className="chat-item__delete" onClick={(e)=>{e.stopPropagation(); toggleArchive(chat);}} title="Unarchive"><Icons.Archive size={14}/></button>
                </div>
              ))}
            </>
          )}
        </div>
        <div className="sidebar__footer" ref={userMenuRef}>
          <button className="sidebar__user" onClick={()=>setShowUserMenu(v=>!v)}>
            <div className="sidebar__user-avatar" style={{background:getAvatarColor(user.displayName||user.username)}}>
              {user.avatarUrl ? <img src={user.avatarUrl} alt="" style={{width:'100%',height:'100%',borderRadius:'50%',objectFit:'cover'}}/> : <span className="avatar-initial">{getAvatarInitial(user.displayName||user.username)}</span>}
            </div>
            <span>{user.displayName||user.username}</span>
          </button>
          {showUserMenu && (
            <UserMenu
              user={user}
              accounts={accounts}
              onSwitchAccount={(a)=>{setShowUserMenu(false); onSwitchAccount(a);}}
              onProfile={()=>{setShowProfile(true);setShowUserMenu(false);}}
              onSettings={()=>{setShowSettings(true);setShowUserMenu(false);}}
              onAddAccount={()=>{setShowUserMenu(false); onAddAccount();}}
              onAdmin={()=>{setShowUserMenu(false); setActiveView('admin');}}
              onLogout={handleLogout}
            />
          )}
        </div>
      </div>

      <div className="main">
        {activeView === 'chat' ? (
          <>
            <header className="header">
              <button className="header__menu-btn header__menu-btn--mobile" onClick={()=>setSidebarOpen(true)} title="Open menu"><Icons.Menu/></button>
              <div className="header__title header__title--mobile">FigoAI</div>
            </header>

            <div className="chat-area">
              {messages.length===0 && !loading ? (
                <div className="welcome">
                  <div className="welcome__icon"><img src="/logo-mark.png" alt="" /></div>
                  <h1>Ready when you are, {user.displayName||user.username}</h1>
                  <div className="welcome__composer">{renderComposer()}</div>
                  <div className="welcome__suggestions">
                    {[{icon:<Icons.Image/>,text:"Create an image"},{icon:<Icons.EditCircle/>,text:"Write or edit"}]
                      .filter(s => !dismissedSuggestions.includes(s.text))
                      .map((s,i)=>(
                        <div key={i} className="suggestion-link">
                          <button className="suggestion-link__body" onClick={()=>{setInput(s.text);inputRef.current?.focus();}}>{s.icon} <span>{s.text}</span></button>
                          <button className="suggestion-link__dismiss" onClick={(e)=>{e.stopPropagation();setDismissedSuggestions(prev=>[...prev,s.text]);}} title="Dismiss"><Icons.X size={14}/></button>
                        </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="messages">
                  {messages.map((msg,i)=>(<Message key={i} msg={msg} onCopy={handleCopy} onLike={handleLike} onDislike={handleDislike} onReply={handleReply} onRegenerate={handleRegenerate} onEdit={handleEdit} onShare={handleShareMessage}/>))}
                  {loading && (
                    <div className="message message--assistant">
                      <div className="message__body"><div className="typing"><span className="typing__dot"></span><span className="typing__dot"></span><span className="typing__dot"></span></div></div>
                    </div>
                  )}
                  <div ref={messagesEndRef}/>
                </div>
              )}
            </div>

            {(messages.length>0 || loading) && (
              <div className="input-area">
                {renderComposer()}
                <p className="input-hint">FigoAI is professional and accurate. Verify important information.</p>
              </div>
            )}
          </>
        ) : (
          <div className="view-scroll">
            {!sidebarOpen && <button className="header__menu-btn view-scroll__menu" onClick={()=>setSidebarOpen(true)}><Icons.Menu/></button>}
            {activeView==='images' && <ImagesView user={user}/>}
            {activeView==='library' && <LibraryView user={user} chats={chats} initialTab={libraryTab}/>}
            {activeView==='projects' && (
              <ProjectsView user={user} chats={chats} onOpenChat={(id)=>{
                const c = chats.find(ch=>ch.id===id);
                if (c) { setActiveView('chat'); setActiveChat(id); setMessages(c.messages||[]); setAttachments([]); }
              }}/>
            )}
            {activeView==='admin' && user.isAdmin && <AdminView user={user}/>}
          </div>
        )}
      </div>

      {showSearchModal && (
        <SearchChatsModal
          chats={chats}
          onClose={()=>setShowSearchModal(false)}
          onSelectChat={(id)=>{
            const c = chats.find(ch=>ch.id===id);
            if (c) { setActiveView('chat'); setActiveChat(id); setMessages(c.messages||[]); setAttachments([]); }
            setShowSearchModal(false);
          }}
        />
      )}
      {deleteTarget && (
        <DeleteChatModal
          chat={deleteTarget}
          onCancel={()=>setDeleteTarget(null)}
          onConfirm={()=>{ deleteChat(deleteTarget.id); setDeleteTarget(null); }}
          onOpenSettings={()=>setShowSettings(true)}
        />
      )}
      {showProfile && <ProfilePanel user={user} onUpdate={onUpdateUser} onClose={()=>setShowProfile(false)}/>}
      {showSettings && <SettingsPanel settings={settings} onUpdate={setSettings} onClose={()=>setShowSettings(false)} user={user} onUpdateUser={onUpdateUser} onClearHistory={handleClearHistory} chats={chats} setChats={setChats} onOpenLibrary={openLibraryTab} onLogout={handleLogout}/>}
      {editingAttachment!=null && attachments[editingAttachment] && (
        <Suspense fallback={<div className="modal-overlay"><div className="typing"><span className="typing__dot"/><span className="typing__dot"/><span className="typing__dot"/></div></div>}>
          <ImageEditor
            attachment={attachments[editingAttachment]}
            onClose={()=>setEditingAttachment(null)}
            onApply={(dataUrl)=>{
              setAttachments(prev => prev.map((a,i) => i===editingAttachment ? {...a, url: dataUrl} : a));
              setEditingAttachment(null);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
