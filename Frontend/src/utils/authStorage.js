const STORAGE_KEY = "coordinator_auth_user";

const decodeJwtPayload = (token) => {
  try {
    const payload = token.split(".")[1];
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
};

export const isAuthTokenExpired = (token, leewaySeconds = 30) => {
  if (!token) return true;
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return nowSeconds >= payload.exp - leewaySeconds;
};

export const getAuthUser = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const user = raw ? JSON.parse(raw) : null;
    if (user?.idToken && isAuthTokenExpired(user.idToken)) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return user;
  } catch {
    return null;
  }
};

export const setAuthUser = (user) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch {
    // ignore
  }
};

export const clearAuthUser = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};

export const getAuthToken = () => {
  const user = getAuthUser();
  return user?.idToken || null;
};

export const getAuthHeaders = () => {
  const token = getAuthToken();
  if (!token || isAuthTokenExpired(token)) {
    clearAuthUser();
    return {};
  }
  return { Authorization: `Bearer ${token}` };
};
