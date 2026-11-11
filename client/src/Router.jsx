import { useEffect, useState, useCallback } from "react";
import App from "./App.jsx";
import Login from "./login.jsx";
import FamilyInviteAccept from "./FamilyInviteAccept.jsx";
import { getToken, setToken, fetchCurrentUser } from "./api.js";

const USER_KEY = "figoai_user";
const ACCOUNTS_KEY = "figoai_accounts";

function readCachedProfile() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

function buildProfile(authUser, cached) {
  return {
    ...authUser,
    displayName: cached?.displayName || authUser.displayName || authUser.username,
    bio: cached?.bio || "",
    // authUser.avatarUrl is the server-persisted value (or an OAuth provider's
    // photo, passed through on that login) — only fall back to a cached local
    // value when the server has nothing at all.
    avatarUrl: authUser.avatarUrl || cached?.avatarUrl || "",
  };
}

// Every account that's ever signed in on this browser (until logged out of),
// so the user menu can offer a ChatGPT-style account switcher — not just the
// single "active" session tracked by figoai_token/figoai_user above.
function readAccounts() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeAccounts(list) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
  return list;
}

function upsertAccount(list, token, user) {
  const next = [{ token, user }, ...list.filter((a) => a.user?.id !== user.id)];
  return writeAccounts(next);
}

function removeAccount(list, userId) {
  return writeAccounts(list.filter((a) => a.user?.id !== userId));
}

// Google/GitHub sign-in, and password-reset links, both finish with a
// full-page redirect back here carrying the result in the URL fragment
// (never sent to a server, unlike a query string).
function consumeUrlFragment() {
  const hash = window.location.hash;
  if (
    !hash.includes("auth_token=") &&
    !hash.includes("auth_error=") &&
    !hash.includes("reset_token=") &&
    !hash.includes("family_invite=")
  ) {
    return {};
  }

  const params = new URLSearchParams(hash.slice(1));
  window.history.replaceState({}, "", window.location.pathname);

  const token = params.get("auth_token");
  if (token) {
    setToken(token);
    const name = params.get("auth_name");
    const avatarUrl = params.get("auth_avatar");
    if (name || avatarUrl) {
      localStorage.setItem(USER_KEY, JSON.stringify({ displayName: name || "", avatarUrl: avatarUrl || "" }));
    }
    return {};
  }

  const resetToken = params.get("reset_token");
  if (resetToken) return { resetToken };

  const familyInviteToken = params.get("family_invite");
  if (familyInviteToken) return { familyInviteToken };

  return { error: params.get("auth_error") || "Sign-in failed. Please try again." };
}

export default function Router() {
  const [user, setUser] = useState(null);
  const [accounts, setAccounts] = useState(() => readAccounts());
  const [addingAccount, setAddingAccount] = useState(false);
  const [checked, setChecked] = useState(false);
  const [oauthError, setOauthError] = useState("");
  const [resetToken, setResetToken] = useState(null);
  const [familyInviteToken, setFamilyInviteToken] = useState(null);

  useEffect(() => {
    async function restoreSession() {
      const fragment = consumeUrlFragment();
      if (fragment.error) setOauthError(fragment.error);
      if (fragment.resetToken) setResetToken(fragment.resetToken);
      if (fragment.familyInviteToken) setFamilyInviteToken(fragment.familyInviteToken);

      const token = getToken();
      if (!token) {
        setChecked(true);
        return;
      }
      try {
        const { user: authUser } = await fetchCurrentUser();
        const fullUser = buildProfile(authUser, readCachedProfile());
        setUser(fullUser);
        setAccounts(upsertAccount(readAccounts(), token, fullUser));
      } catch (err) {
        if (err.status === 401) {
          setToken(null);
          localStorage.removeItem(USER_KEY);
        } else {
          // Server/DB hiccup, not a bad token — trust the cached session for now.
          const cached = readCachedProfile();
          if (cached) setUser(cached);
          else setToken(null);
        }
      }
      setChecked(true);
    }
    restoreSession();
  }, []);

  // A hash-only change (e.g. clicking a family-invite link in a tab that
  // already has the app open) doesn't reload the page, so it never re-runs
  // the mount-only effect above — pick those up separately.
  useEffect(() => {
    function handleHashChange() {
      const fragment = consumeUrlFragment();
      if (fragment.error) setOauthError(fragment.error);
      if (fragment.resetToken) setResetToken(fragment.resetToken);
      if (fragment.familyInviteToken) setFamilyInviteToken(fragment.familyInviteToken);
    }
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const handleGuest = useCallback(({ token, user: guestUser }) => {
    setToken(token);
    const guestProfile = { ...guestUser, isGuest: true, displayName: "Guest" };
    localStorage.setItem(USER_KEY, JSON.stringify(guestProfile));
    setUser(guestProfile);
  }, []);

  const handleLogin = useCallback(({ token, user: authUser }) => {
    setToken(token);
    const fullUser = buildProfile(authUser, null);
    localStorage.setItem(USER_KEY, JSON.stringify(fullUser));
    setUser(fullUser);
    setAccounts(upsertAccount(readAccounts(), token, fullUser));
    setAddingAccount(false);
  }, []);

  // Logs out of the *active* account only. If other accounts are still
  // signed in on this browser, switch to the most recently used one instead
  // of dropping all the way back to the login screen.
  const handleLogout = useCallback(() => {
    setUser((current) => {
      const remaining = current ? removeAccount(readAccounts(), current.id) : readAccounts();
      setAccounts(remaining);
      if (remaining.length > 0) {
        const next = remaining[0];
        setToken(next.token);
        localStorage.setItem(USER_KEY, JSON.stringify(next.user));
        return next.user;
      }
      setToken(null);
      localStorage.removeItem(USER_KEY);
      return null;
    });
  }, []);

  const handleUpdateUser = useCallback((updatedUser) => {
    localStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
    setUser(updatedUser);
    setAccounts((prev) => upsertAccount(prev, getToken(), updatedUser));
  }, []);

  // Switches the active session to an already-signed-in account without
  // logging out of the one currently active (that one stays in `accounts`).
  const handleSwitchAccount = useCallback(async (account) => {
    setToken(account.token);
    try {
      const { user: authUser } = await fetchCurrentUser();
      const fullUser = buildProfile(authUser, account.user);
      localStorage.setItem(USER_KEY, JSON.stringify(fullUser));
      setUser(fullUser);
      setAccounts((prev) => upsertAccount(prev, account.token, fullUser));
    } catch (err) {
      if (err.status === 401) {
        setAccounts((prev) => removeAccount(prev, account.user?.id));
        alert(`Your session for ${account.user?.email || account.user?.username} has expired. Sign in again to add it back.`);
      }
    }
  }, []);

  if (!checked) return null;

  if (resetToken) {
    return <Login onLogin={handleLogin} onGuest={handleGuest} />;
  }

  if (!user || addingAccount) {
    return <Login onLogin={handleLogin} onGuest={handleGuest} oauthError={oauthError} onCancel={user ? () => setAddingAccount(false) : undefined} />;
  }

  if (familyInviteToken) {
    return <FamilyInviteAccept token={familyInviteToken} onDone={() => setFamilyInviteToken(null)} />;
  }

  return (
    <App
      key={user.id}
      user={user}
      accounts={accounts}
      onLogout={handleLogout}
      onUpdateUser={handleUpdateUser}
      onAddAccount={() => setAddingAccount(true)}
      onSwitchAccount={handleSwitchAccount}
    />
  );
}
