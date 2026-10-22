/**
 * Local / Node server: serves the static admin UI from public/ and routes
 * /api/* to the API handler. For serverless (Vercel) the same `handle` from
 * buildApp() is mounted as a function instead; this server is for local dev and
 * simple Node hosting.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildApp } from "./app.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(here, "..", "public");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

const { handle, config } = buildApp();

function toWebRequest(
  req: import("node:http").IncomingMessage,
  body: Buffer,
): Request {
  const url = `http://${req.headers.host}${req.url}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(", "));
  }
  return new Request(url, {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method ?? "GET")
      ? undefined
      : new Uint8Array(body),
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  if (url.pathname.startsWith("/api/")) {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const webReq = toWebRequest(req, Buffer.concat(chunks));
    const webRes = await handle(webReq);
    const headers: Record<string, string> = {};
    webRes.headers.forEach((v, k) => {
      headers[k] = v;
    });
    res.writeHead(webRes.status, headers);
    res.end(Buffer.from(await webRes.arrayBuffer()));
    return;
  }

  // Static files (noindex header on everything).
  let file = url.pathname === "/" ? "/index.html" : url.pathname;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, "");
  try {
    const content = await readFile(path.join(PUBLIC, file));
    res.writeHead(200, {
      "content-type": MIME[path.extname(file)] ?? "application/octet-stream",
      "x-robots-tag": "noindex, nofollow",
    });
    res.end(content);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  }
});

server.listen(config.PORT, () => {
  console.log(`Content admin running at http://localhost:${config.PORT}`);
});
