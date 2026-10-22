import { describe, it, expect } from "vitest";
import { sanitizeInput } from "../src/sanitize-input.js";

describe("sanitizeInput", () => {
  it("wraps plain text paragraphs in <p>", () => {
    expect(sanitizeInput("Hello world.\n\nSecond para.")).toBe(
      "<p>Hello world.</p>\n<p>Second para.</p>",
    );
  });

  it("keeps allowed formatting tags", () => {
    const out = sanitizeInput("<p>A <strong>bold</strong> <em>idea</em>.</p>");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>idea</em>");
  });

  it("drops script and other disallowed tags but keeps their text", () => {
    const out = sanitizeInput("<p>Hi<script>alert(1)</script> there</p>");
    expect(out).not.toContain("<script");
    expect(out).toContain("Hi");
    expect(out).toContain("there");
  });

  it("strips javascript: and data: hrefs, keeps safe ones", () => {
    expect(sanitizeInput('<a href="javascript:alert(1)">x</a>')).toBe(
      "<a>x</a>",
    );
    expect(sanitizeInput('<a href="https://x.com/">x</a>')).toContain(
      'href="https://x.com/"',
    );
    expect(sanitizeInput('<a href="/people/x/">x</a>')).toContain(
      'href="/people/x/"',
    );
  });

  it("escapes stray angle brackets in text", () => {
    expect(sanitizeInput("2 < 3 and 4 > 1")).toContain("2 &lt; 3 and 4 &gt; 1");
  });

  it("returns empty for blank input", () => {
    expect(sanitizeInput("   ")).toBe("");
  });
});
