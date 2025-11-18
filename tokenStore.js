const activeTokens = new Map();

export function setActiveToken(userId, token) {
  activeTokens.set(userId, token);
}

export function getActiveToken(userId) {
  return activeTokens.get(userId);
}

export function clearActiveToken(userId) {
  activeTokens.delete(userId);
}
