const STORAGE_KEY = "coordinator_auth_user";

export const isAuthTokenExpired = (token, leewaySeconds = 30) => {
  return true; // Always expired/disabled
};

export const getAuthUser = () => {
  return null; // No Google authenticated user
};

export const setAuthUser = (user) => {
  // no-op
};

export const clearAuthUser = () => {
  // no-op
};

export const getAuthToken = () => {
  return null;
};

export const getAuthHeaders = () => {
  try {
    const raw = localStorage.getItem("coordinator_user");
    const user = raw ? JSON.parse(raw) : null;
    if (user?.userId) {
      return { Authorization: `Bearer ${user.userId}` };
    }
  } catch (err) {
    // ignore
  }
  return {};
};
