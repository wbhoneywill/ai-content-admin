import { describe, it, expect } from "vitest";
import { PasswordAuth } from "../src/auth/auth.js";

const auth = new PasswordAuth({ password: "s3cret", secret: "signing-key" });

describe("PasswordAuth", () => {
  it("rejects a wrong password", () => {
    expect(auth.login({ password: "nope" })).toBeNull();
  });

  it("accepts the right password and round-trips a session", () => {
    const session = auth.login({ password: "s3cret" });
    expect(session).not.toBeNull();
    const cookie = auth.sign(session!);
    const back = auth.verify(cookie);
    expect(back?.subject).toBe("owner");
  });

  it("rejects a tampered cookie", () => {
    const session = auth.login({ password: "s3cret" })!;
    const cookie = auth.sign(session);
    const tampered = cookie.slice(0, -2) + (cookie.endsWith("a") ? "bb" : "aa");
    expect(auth.verify(tampered)).toBeNull();
  });

  it("rejects an expired session", () => {
    const expired = new PasswordAuth({
      password: "x",
      secret: "k",
      ttlMs: -1000,
    });
    const s = expired.login({ password: "x" })!;
    expect(expired.verify(expired.sign(s))).toBeNull();
  });

  it("rejects a cookie signed with a different secret", () => {
    const other = new PasswordAuth({ password: "s3cret", secret: "different" });
    const s = other.login({ password: "s3cret" })!;
    expect(auth.verify(other.sign(s))).toBeNull();
  });
});
