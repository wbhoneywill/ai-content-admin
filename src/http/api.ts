/**
 * HTTP API (Requirements 2, 4, 7). A framework-agnostic handler over the Web
 * `Request`/`Response` APIs, so it runs on Vercel functions, Node, or any
 * serverless host. Routes:
 *
 *   POST /api/login      { password }            -> set session cookie
 *   POST /api/logout                             -> clear cookie
 *   GET  /api/status                             -> auth + preview/main divergence
 *   POST /api/propose    { prompt }              -> Proposal | clarify | decline
 *   POST /api/approve    { id }                  -> commit to preview
 *   POST /api/reject     { id }                  -> discard
 *   POST /api/publish                            -> merge preview -> main
 *   POST /api/undo                               -> revert last preview commit
 *
 * Every route except /api/login requires a valid session.
 */
import type { AuthAdapter } from "../auth/auth.js";
import type { Orchestrator } from "../orchestrator.js";
import type { GitService } from "../git/git-service.js";
import type { SiteProfile } from "../profile.js";
import { parseCookies, serializeCookie } from "./cookies.js";

export interface ApiDeps {
  auth: AuthAdapter;
  orchestrator: Orchestrator;
  git: GitService;
  profile: SiteProfile;
  /** Secure cookies in production; relax for local http. */
  secureCookies?: boolean;
}

function json(
  body: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function createApi(deps: ApiDeps) {
  const { auth, orchestrator, git, profile } = deps;

  function sessionFrom(req: Request) {
    const cookies = parseCookies(req.headers.get("cookie"));
    const raw = cookies[auth.cookieName];
    return raw ? auth.verify(raw) : null;
  }

  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method.toUpperCase();

    // --- login (unauthenticated) ---
    if (path === "/api/login" && method === "POST") {
      const body = await readJson(req);
      const session = auth.login(body);
      if (!session) return json({ error: "Invalid credentials" }, 401);
      const cookie = serializeCookie(auth.cookieName, auth.sign(session), {
        maxAgeSec: Math.floor((session.expiresAt - Date.now()) / 1000),
        secure: deps.secureCookies !== false,
      });
      return json({ ok: true, profile: profile.name }, 200, {
        "set-cookie": cookie,
      });
    }

    if (path === "/api/logout" && method === "POST") {
      const cleared = serializeCookie(auth.cookieName, "", {
        maxAgeSec: 0,
        secure: deps.secureCookies !== false,
      });
      return json({ ok: true }, 200, { "set-cookie": cleared });
    }

    // --- everything below requires a session ---
    const session = sessionFrom(req);
    if (!session) return json({ error: "Not authenticated" }, 401);

    if (path === "/api/status" && method === "GET") {
      const divergence = await git.checkDivergence();
      return json({
        authenticated: true,
        profile: {
          id: profile.id,
          name: profile.name,
          adminDomain: profile.adminDomain,
        },
        preview: {
          sha: divergence.previewSha,
          canPublish: divergence.previewSha !== divergence.mainSha,
          diverged: !divergence.canFastForward,
        },
      });
    }

    if (path === "/api/propose" && method === "POST") {
      const { prompt } = await readJson(req);
      if (typeof prompt !== "string" || prompt.trim() === "")
        return json({ error: "Missing prompt" }, 400);
      const result = await orchestrator.propose(prompt);
      return json(result);
    }

    if (path === "/api/approve" && method === "POST") {
      const { id } = await readJson(req);
      if (typeof id !== "string") return json({ error: "Missing id" }, 400);
      try {
        const res = await orchestrator.approve(id);
        return json({ ok: true, ...res });
      } catch (e) {
        return json({ error: (e as Error).message }, 409);
      }
    }

    if (path === "/api/reject" && method === "POST") {
      const { id } = await readJson(req);
      if (typeof id === "string") orchestrator.reject(id);
      return json({ ok: true });
    }

    if (path === "/api/publish" && method === "POST") {
      try {
        const sha = await git.publish();
        return json({ ok: true, sha });
      } catch (e) {
        return json({ error: (e as Error).message }, 409);
      }
    }

    if (path === "/api/undo" && method === "POST") {
      const sha = await git.undoLast();
      return json({ ok: true, sha });
    }

    return json({ error: "Not found" }, 404);
  };
}
