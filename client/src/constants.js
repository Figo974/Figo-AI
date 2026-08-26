export const AVATAR_COLORS = [
  '#a1a1aa', '#52525b', '#f093fb', '#f5576c', '#10b981',
  '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899',
];

// Deterministic fallback avatar: same name always gets the same letter + color.
export function getAvatarInitial(name) {
  const trimmed = (name || '').trim();
  return trimmed ? trimmed[0].toUpperCase() : '?';
}

export function getAvatarColor(name) {
  const str = (name || '').trim() || '?';
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
