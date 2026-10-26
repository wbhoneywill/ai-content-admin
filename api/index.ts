/**
 * Vercel serverless entrypoint (Web signature).
 *
 * Vercel's modern Node runtime (Fluid Compute) invokes functions with a Web
 * `Request` and expects a `Response`, which is exactly our framework-agnostic
 * handler's shape. We build the app lazily and reuse it across invocations.
 *
 * vercel.json routes /api/* here and serves public/ statically.
 */
import { buildApp } from "../src/app.js";

let handler: ((req: Request) => Promise<Response>) | null = null;
function getHandler(): (req: Request) => Promise<Response> {
  if (!handler) handler = buildApp().handle;
  return handler;
}

export function GET(req: Request): Promise<Response> {
  return run(req);
}
export function POST(req: Request): Promise<Response> {
  return run(req);
}

async function run(req: Request): Promise<Response> {
  try {
    return await getHandler()(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
