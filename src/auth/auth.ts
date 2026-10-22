/**
 * Auth adapter (Requirement 7). Pluggable so the deploy can choose the
 * mechanism. v1 ships a single-shared-password adapter that issues a signed,
 * httpOnly session cookie. The HTTP layer calls `requireSession` on every
 * editing endpoint.
 *
 * No external dependencies: the session token is an HMAC-signed, time-bounded
 * value using Node's crypto.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface Session {
  subject: string;
  expiresAt: number;
}

export interface AuthAdapter {
  /** Verify credentials from a login request body; returns a session or null. */
  login(body: Record<string, unknown>): Session | null;
  /** Serialize a session into a signed cookie value. */
  sign(session: Session): string;
  /** Parse and verify a cookie value back into a session (null if invalid). */
  verify(cookieValue: string): Session | null;
  /** The cookie name to use. */
  readonly cookieName: string;
}

export interface PasswordAuthOptions {
  /** The shared admin password. */
  password: string;
  /** Secret used to sign session cookies. */
  secret: string;
  /** Session lifetime in ms (default 12h). */
  ttlMs?: number;
  cookieName?: string;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export class PasswordAuth implements AuthAdapter {
  readonly cookieName: string;
  private ttlMs: number;

  constructor(private opts: PasswordAuthOptions) {
    this.cookieName = opts.cookieName ?? "acadmin_session";
    this.ttlMs = opts.ttlMs ?? 12 * 60 * 60 * 1000;
  }

  login(body: Record<string, unknown>): Session | null {
    const provided = typeof body.password === "string" ? body.password : "";
    if (!constantTimeEqual(provided, this.opts.password)) return null;
    return { subject: "owner", expiresAt: Date.now() + this.ttlMs };
  }

  sign(session: Session): string {
    const payload = b64url(JSON.stringify(session));
    const sig = b64url(
      createHmac("sha256", this.opts.secret).update(payload).digest(),
    );
    return `${payload}.${sig}`;
  }

  verify(cookieValue: string): Session | null {
    const dot = cookieValue.lastIndexOf(".");
    if (dot < 0) return null;
    const payload = cookieValue.slice(0, dot);
    const sig = cookieValue.slice(dot + 1);
    const expected = b64url(
      createHmac("sha256", this.opts.secret).update(payload).digest(),
    );
    const a = fromB64url(sig);
    const b = fromB64url(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      const session = JSON.parse(fromB64url(payload).toString()) as Session;
      if (typeof session.expiresAt !== "number") return null;
      if (Date.now() > session.expiresAt) return null;
      return session;
    } catch {
      return null;
    }
  }
}

/** Constant-time string comparison that tolerates length differences. */
function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  const len = Math.max(ab.length, bb.length);
  const pa = Buffer.alloc(len);
  const pb = Buffer.alloc(len);
  ab.copy(pa);
  bb.copy(pb);
  const equal = timingSafeEqual(pa, pb);
  return equal && ab.length === bb.length;
}
