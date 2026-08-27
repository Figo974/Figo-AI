const API_BASE = '/api';
const TOKEN_KEY = 'figoai_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function parseError(res, fallback) {
  const data = await res.json().catch(() => null);
  const err = new Error(data?.error || fallback);
  err.status = res.status;
  return err;
}

export async function checkHealth() {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Server unavailable');
  return res.json();
}

export async function registerUser(username, email, password) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  });
  if (!res.ok) throw await parseError(res, 'Could not create account');
  return res.json();
}

export async function changePassword(currentPassword, newPassword, notifyEmail) {
  const res = await fetch(`${API_BASE}/auth/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ currentPassword, newPassword, notifyEmail }),
  });
  if (!res.ok) throw await parseError(res, 'Could not update password');
  return res.json();
}

export async function addPassword(newPassword) {
  const res = await fetch(`${API_BASE}/auth/add-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ newPassword }),
  });
  if (!res.ok) throw await parseError(res, 'Could not add a password');
  return res.json();
}

export async function loginUser(username, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw await parseError(res, 'Could not sign in');
  return res.json();
}

export async function forgotPassword(email) {
  const res = await fetch(`${API_BASE}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw await parseError(res, 'Could not send reset email');
  return res.json();
}

export async function resetPassword(token, newPassword) {
  const res = await fetch(`${API_BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  });
  if (!res.ok) throw await parseError(res, 'Could not reset password');
  return res.json();
}

export async function fetchCurrentUser() {
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw await parseError(res, 'Session invalid');
  return res.json();
}

export async function updateUsername(username) {
  const res = await fetch(`${API_BASE}/auth/username`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ username }),
  });
  if (!res.ok) throw await parseError(res, 'Could not update username');
  return res.json();
}

export async function updateDisplayName(displayName) {
  const res = await fetch(`${API_BASE}/auth/display-name`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ displayName }),
  });
  if (!res.ok) throw await parseError(res, 'Could not update display name');
  return res.json();
}

export async function updateEmail(email, currentPassword) {
  const res = await fetch(`${API_BASE}/auth/email`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ email, currentPassword }),
  });
  if (!res.ok) throw await parseError(res, 'Could not update email');
  return res.json();
}

export async function deleteAccount(password) {
  const res = await fetch(`${API_BASE}/auth/account`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw await parseError(res, 'Could not delete account');
  return res.json();
}

export async function sendMessage(message, { temperature, model, deepResearch, language, personalization, history, smart, attachments } = {}) {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ message, temperature, model, deepResearch, language, personalization, history, smart, attachments }),
  });
  if (!res.ok) throw await parseError(res, 'Failed to send message');
  const data = await res.json();
  return { reply: data.reply, sources: data.sources || [], images: data.images || [] };
}

export async function listSessions() {
  const res = await fetch(`${API_BASE}/sessions`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw await parseError(res, 'Could not load sessions');
  const data = await res.json();
  return data.sessions;
}

export async function revokeSession(id) {
  const res = await fetch(`${API_BASE}/sessions/${id}/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw await parseError(res, 'Could not log out that device');
  return res.json();
}

export async function logoutAllSessions() {
  const res = await fetch(`${API_BASE}/sessions/logout-all`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw await parseError(res, 'Could not log out all sessions');
  return res.json();
}

export async function sendFamilyInvite(method, contact, relation) {
  const res = await fetch(`${API_BASE}/family/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({ method, contact, relation }),
  });
  if (!res.ok) throw await parseError(res, 'Could not send that invite');
  return res.json();
}

export async function listFamily() {
  const res = await fetch(`${API_BASE}/family`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw await parseError(res, 'Could not load family members');
  return res.json();
}

export async function cancelFamilyInvite(id) {
  const res = await fetch(`${API_BASE}/family/invite/${id}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw await parseError(res, 'Could not cancel that invite');
  return res.json();
}

export async function removeFamilyLink(id) {
  const res = await fetch(`${API_BASE}/family/link/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw await parseError(res, 'Could not remove that family member');
  return res.json();
}

export async function getFamilyInviteByToken(token) {
  const res = await fetch(`${API_BASE}/family/invite/${token}`);
  if (!res.ok) throw await parseError(res, 'Could not load that invite');
  const data = await res.json();
  return data.invite;
}

export async function acceptFamilyInvite(token) {
  const res = await fetch(`${API_BASE}/family/invite/${token}/accept`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw await parseError(res, 'Could not accept that invite');
  return res.json();
}

export async function declineFamilyInvite(token) {
  const res = await fetch(`${API_BASE}/family/invite/${token}/decline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw await parseError(res, 'Could not decline that invite');
  return res.json();
}

export async function enrollAdvancedSecurity() {
  const res = await fetch(`${API_BASE}/security/advanced/enroll`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw await parseError(res, 'Could not enroll in Advanced Account Security');
  return res.json();
}

export async function unenrollAdvancedSecurity() {
  const res = await fetch(`${API_BASE}/security/advanced/unenroll`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw await parseError(res, 'Could not turn off Advanced Account Security');
  return res.json();
}

export async function getPasskeyRegisterOptions() {
  const res = await fetch(`${API_BASE}/passkeys/register-options`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw await parseError(res, 'Could not start passkey registration');
  const data = await res.json();
  return data.options;
}

export async function verifyPasskeyRegistration(response, nickname) {
  const res = await fetch(`${API_BASE}/passkeys/register-verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ response, nickname }),
  });
  if (!res.ok) throw await parseError(res, 'Could not save that passkey');
  return res.json();
}

export async function listPasskeys() {
  const res = await fetch(`${API_BASE}/passkeys`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw await parseError(res, 'Could not load passkeys');
  const data = await res.json();
  return data.passkeys;
}

export async function deletePasskey(id) {
  const res = await fetch(`${API_BASE}/passkeys/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw await parseError(res, 'Could not remove that passkey');
  return res.json();
}

export async function getPasskeyLoginOptions() {
  const res = await fetch(`${API_BASE}/passkeys/login-options`, { method: 'POST' });
  if (!res.ok) throw await parseError(res, 'Could not start passkey sign-in');
  const data = await res.json();
  return data.options;
}

export async function verifyPasskeyLogin(response) {
  const res = await fetch(`${API_BASE}/passkeys/login-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response }),
  });
  if (!res.ok) throw await parseError(res, 'Could not sign in with that passkey');
  return res.json();
}

export async function generateChatTitle(message, reply) {
  const res = await fetch(`${API_BASE}/chat/title`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ message, reply }),
  });
  if (!res.ok) throw await parseError(res, 'Could not generate a title');
  const data = await res.json();
  return data.title;
}

// `language` is an optional ISO-639-1 hint (see App.jsx's low-confidence
// fallback) — omit it to let Whisper freely auto-detect. Returns the
// transcript plus what Whisper actually detected and how confident it was,
// so the caller can decide whether to keep trusting auto-detect.
export async function transcribeVoice(base64Audio, mimeType, language) {
  const res = await fetch(`${API_BASE}/voice/transcribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ audio: base64Audio, mimeType, language }),
  });
  if (!res.ok) throw await parseError(res, 'Could not transcribe that audio');
  const data = await res.json();
  return { text: data.text, language: data.language, confidence: data.confidence };
}

function adminGet(path, fallback) {
  return async () => {
    const res = await fetch(`${API_BASE}/admin/${path}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw await parseError(res, fallback);
    return res.json();
  };
}

export const getAdminOverview = adminGet('overview', 'Could not load the admin overview');
export const listAdminUsers = adminGet('users', 'Could not load users');
export const listAdminPasskeys = adminGet('passkeys', 'Could not load passkeys');
export const listAdminSessions = adminGet('sessions', 'Could not load sessions');
export const listAdminFamily = adminGet('family', 'Could not load family data');

export async function deleteAdminUser(id) {
  const res = await fetch(`${API_BASE}/admin/users/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw await parseError(res, 'Could not delete that user');
  return res.json();
}

function adminUserAction(action, fallback) {
  return async (id) => {
    const res = await fetch(`${API_BASE}/admin/users/${id}/${action}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw await parseError(res, fallback);
    return res.json();
  };
}

export const burnAdminUser = adminUserAction('burn', 'Could not log that user out');
export const promoteAdminUser = adminUserAction('promote', 'Could not make that user an admin');
export const demoteAdminUser = adminUserAction('demote', 'Could not remove admin access');

export async function deleteAdminPasskey(id) {
  const res = await fetch(`${API_BASE}/admin/passkeys/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw await parseError(res, 'Could not delete that passkey');
  return res.json();
}

export async function revokeAdminSession(id) {
  const res = await fetch(`${API_BASE}/admin/sessions/${id}/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw await parseError(res, 'Could not revoke that session');
  return res.json();
}

export async function cancelAdminFamilyInvite(id) {
  const res = await fetch(`${API_BASE}/admin/family/invite/${id}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw await parseError(res, 'Could not cancel that invite');
  return res.json();
}

export async function removeAdminFamilyLink(id) {
  const res = await fetch(`${API_BASE}/admin/family/link/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw await parseError(res, 'Could not remove that link');
  return res.json();
}
