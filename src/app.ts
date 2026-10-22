/**
 * Assemble the application from config + the active profile. Returns the API
 * request handler, ready to mount in a server or serverless function.
 */
import { loadConfig, type AppConfig } from "./config.js";
import { activeProfile } from "./profile.js";
import { PasswordAuth } from "./auth/auth.js";
import { GitService } from "./git/git-service.js";
import { Orchestrator } from "./orchestrator.js";
import { createApi } from "./http/api.js";
import { AnthropicAdapter } from "./llm/anthropic.js";
import type {
  LLMAdapter,
  InterpretContext,
  Interpretation,
} from "./llm/adapter.js";
import { GitHubRestClient } from "./git/github-rest.js";

function makeLLM(config: AppConfig, profile = activeProfile()): LLMAdapter {
  if (config.LLM_PROVIDER === "anthropic") {
    return new AnthropicAdapter({
      apiKey: config.ANTHROPIC_API_KEY!,
      model: config.ANTHROPIC_MODEL,
      operations: profile.operations,
    });
  }
  // mock provider: always declines (useful for a no-key smoke test).
  return {
    id: "mock",
    async interpret(_p: string, _c: InterpretContext): Promise<Interpretation> {
      return { kind: "decline", reason: "LLM provider is set to mock." };
    },
  };
}

export function buildApp(env: NodeJS.ProcessEnv = process.env) {
  const config = loadConfig(env);
  const profile = activeProfile();

  const auth = new PasswordAuth({
    password: config.AUTH_PASSWORD,
    secret: config.AUTH_SECRET,
  });
  const gh = new GitHubRestClient({
    token: config.GITHUB_TOKEN,
    repo: profile.contentRepo,
  });
  const git = new GitService(gh);
  const llm = makeLLM(config, profile);
  const orchestrator = new Orchestrator(profile, llm, git);

  const handle = createApi({
    auth,
    orchestrator,
    git,
    profile,
    secureCookies: config.SECURE_COOKIES,
  });

  return { handle, config, profile, git };
}
