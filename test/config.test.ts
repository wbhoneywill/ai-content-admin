import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

const base = {
  AUTH_PASSWORD: "pw",
  AUTH_SECRET: "a-sufficiently-long-secret",
  GITHUB_TOKEN: "ghp_x",
  ANTHROPIC_API_KEY: "sk-x",
};

describe("loadConfig", () => {
  it("loads a valid environment", () => {
    const c = loadConfig(base as NodeJS.ProcessEnv);
    expect(c.LLM_PROVIDER).toBe("anthropic");
    expect(c.PORT).toBe(8787);
    expect(c.SECURE_COOKIES).toBe(true);
  });

  it("fails when a required secret is missing", () => {
    expect(() =>
      loadConfig({ ...base, AUTH_PASSWORD: "" } as NodeJS.ProcessEnv),
    ).toThrow(/AUTH_PASSWORD/);
  });

  it("requires an Anthropic key when provider is anthropic", () => {
    const env = { ...base } as Record<string, string>;
    delete env.ANTHROPIC_API_KEY;
    expect(() => loadConfig(env as NodeJS.ProcessEnv)).toThrow(
      /ANTHROPIC_API_KEY/,
    );
  });

  it("allows mock provider without an Anthropic key", () => {
    const env = { ...base, LLM_PROVIDER: "mock" } as Record<string, string>;
    delete env.ANTHROPIC_API_KEY;
    expect(loadConfig(env as NodeJS.ProcessEnv).LLM_PROVIDER).toBe("mock");
  });

  it("coerces SECURE_COOKIES=false", () => {
    const c = loadConfig({
      ...base,
      SECURE_COOKIES: "false",
    } as NodeJS.ProcessEnv);
    expect(c.SECURE_COOKIES).toBe(false);
  });
});
