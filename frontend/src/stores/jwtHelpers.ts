export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64));
    if (payload.exp && typeof payload.exp === "number") {
      if (Date.now() >= payload.exp * 1000) return null;
    }
    return payload;
  } catch {
    return null;
  }
}
