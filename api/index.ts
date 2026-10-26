/**
 * Vercel serverless entrypoint. Vercel's Node runtime invokes the default
 * export with a Web `Request` and expects a `Response` — exactly the shape of
 * our framework-agnostic handler. We build the app once per cold start and
 * reuse it across invocations.
 *
 * All /api/* paths are routed here by vercel.json; the static UI in public/ is
 * served directly by Vercel's CDN.
 */
import { buildApp } from "../src/app.js";

let handler: ((req: Request) => Promise<Response>) | null = null;

function getHandler(): (req: Request) => Promise<Response> {
  if (!handler) {
    handler = buildApp().handle;
  }
  return handler;
}

export default async function handle(req: Request): Promise<Response> {
  try {
    return await getHandler()(req);
  } catch (err) {
    // Surface config/startup errors as 500 with a safe message.
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
