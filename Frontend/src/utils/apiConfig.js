export function getSocketUrl() {
  const envUrl = import.meta.env.VITE_SOCKET_URL;
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    // When accessed from LAN (e.g. mobile device pointing to host computer's IP),
    // redirect localhost socket URL to the same host so mobile can connect to backend
    if (host && host !== "localhost" && host !== "127.0.0.1") {
      if (!envUrl || envUrl.includes("localhost") || envUrl.includes("127.0.0.1")) {
        const protocol = window.location.protocol === "https:" ? "https:" : "http:";
        return `${protocol}//${host}:5000`;
      }
    }
  }
  return envUrl || "http://localhost:5000";
}
