/** Minimal cookie helpers over the Web Request/Response APIs. */

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function serializeCookie(
  name: string,
  value: string,
  opts: {
    maxAgeSec?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
    path?: string;
  } = {},
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts.path ?? "/"}`);
  if (opts.maxAgeSec != null) parts.push(`Max-Age=${opts.maxAgeSec}`);
  if (opts.httpOnly !== false) parts.push("HttpOnly");
  if (opts.secure !== false) parts.push("Secure");
  parts.push(`SameSite=${opts.sameSite ?? "Lax"}`);
  return parts.join("; ");
}
