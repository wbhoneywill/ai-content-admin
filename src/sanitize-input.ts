/**
 * Sanitizer for owner-entered content (bios, post bodies) typed through the
 * admin. The public migration sanitizer targets the specific injected-spam
 * patterns; this one allows a safe subset of formatting HTML and strips
 * anything executable or tracking-like, so nothing unsafe can be introduced
 * via the admin even if a prompt or paste includes it.
 *
 * Allowed: p, br, strong/b, em/i, a[href], ul/ol/li, h2-h4, blockquote.
 * Links: only http(s), mailto, or site-relative; no javascript:/data:.
 */

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "a",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
  "h4",
  "blockquote",
]);

const VOID_TAGS = new Set(["br"]);

function safeHref(href: string): string | null {
  const v = href.trim();
  if (/^(https?:)?\/\//i.test(v)) return v;
  if (/^mailto:/i.test(v)) return v;
  if (v.startsWith("/")) return v; // site-relative
  // Reject javascript:, data:, and anything else.
  return null;
}

/**
 * If the input looks like plain text (no tags), wrap paragraphs in <p>.
 * Otherwise sanitize the existing markup tag-by-tag.
 */
export function sanitizeInput(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") return "";

  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(trimmed);
  if (!looksLikeHtml) {
    return trimmed
      .split(/\n{2,}/)
      .map((p) => `<p>${escapeText(p.trim())}</p>`)
      .join("\n");
  }

  return sanitizeHtml(trimmed);
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sanitizeHtml(html: string): string {
  // Tokenize into tags and text; keep allowed tags, escape the rest.
  const tagRe = /<\/?([a-zA-Z0-9]+)([^>]*)>/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    out += escapeText(html.slice(last, m.index));
    last = tagRe.lastIndex;

    const raw = m[0];
    const tag = m[1].toLowerCase();
    const closing = raw.startsWith("</");

    if (!ALLOWED_TAGS.has(tag)) continue; // drop disallowed tags, keep text

    if (closing) {
      out += `</${tag}>`;
      continue;
    }

    if (tag === "a") {
      const hrefMatch = m[2].match(/href\s*=\s*["']([^"']*)["']/i);
      const href = hrefMatch ? safeHref(hrefMatch[1]) : null;
      out += href ? `<a href="${href}">` : "<a>";
      continue;
    }

    out += VOID_TAGS.has(tag) ? `<${tag}>` : `<${tag}>`;
  }
  out += escapeText(html.slice(last));
  return out;
}
