/**
 * Vercel serverless entrypoint.
 *
 * Vercel's Node runtime invokes functions with the Node (req, res) signature.
 * Our app exposes a framework-agnostic Web handler (Request -> Response), so
 * this adapter converts the incoming Node request into a Web Request, runs the
 * handler, and writes the Web Response back out. This avoids relying on Web-
 * signature auto-detection, which was failing to load on Vercel.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "../src/app.js";

let handler: ((req: Request) => Promise<Response>) | null = null;
function getHandler(): (req: Request) => Promise<Response> {
  if (!handler) handler = buildApp().handle;
  return handler;
}

function toWebRequest(req: IncomingMessage, body: Buffer): Request {
  const proto = (req.headers["x-forwarded-proto"] as string) ?? "https";
  const host = req.headers.host ?? "localhost";
  const url = `${proto}://${host}${req.url ?? "/"}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(", "));
  }
  const method = req.method ?? "GET";
  return new Request(url, {
    method,
    headers,
    body:
      method === "GET" || method === "HEAD" ? undefined : new Uint8Array(body),
  });
}

export default async function handle(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const webReq = toWebRequest(req, Buffer.concat(chunks));

    const webRes = await getHandler()(webReq);
    const headers: Record<string, string> = {};
    webRes.headers.forEach((v, k) => {
      headers[k] = v;
    });
    res.writeHead(webRes.status, headers);
    res.end(Buffer.from(await webRes.arrayBuffer()));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: message }));
  }
}
