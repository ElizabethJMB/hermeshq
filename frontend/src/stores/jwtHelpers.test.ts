import { describe, it, expect } from "vitest";
import { decodeJwtPayload } from "./jwtHelpers";

describe("decodeJwtPayload", () => {
  it("returns null for malformed tokens", () => {
    expect(decodeJwtPayload("not-a-jwt")).toBeNull();
    expect(decodeJwtPayload("a.b")).toBeNull();
    expect(decodeJwtPayload("")).toBeNull();
  });

  it("decodes a valid JWT payload", () => {
    const payload = { sub: "user-1", role: "admin", exp: Math.floor(Date.now() / 1000) + 3600 };
    const encoded = btoa(JSON.stringify(payload));
    const token = `header.${encoded}.signature`;
    const result = decodeJwtPayload(token);
    expect(result).toEqual(payload);
  });

  it("returns null for expired tokens", () => {
    const payload = { sub: "user-1", exp: Math.floor(Date.now() / 1000) - 3600 };
    const encoded = btoa(JSON.stringify(payload));
    const token = `header.${encoded}.signature`;
    expect(decodeJwtPayload(token)).toBeNull();
  });

  it("handles base64url encoding (dashes and underscores)", () => {
    const payload = { sub: "user-test", exp: Math.floor(Date.now() / 1000) + 3600 };
    const json = JSON.stringify(payload);
    const encoded = btoa(json).replace(/\+/g, "-").replace(/\//g, "_");
    const token = `header.${encoded}.signature`;
    const result = decodeJwtPayload(token);
    expect(result?.sub).toBe("user-test");
  });
});
