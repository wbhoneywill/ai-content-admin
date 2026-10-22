/**
 * Environment configuration, validated at startup. Fail fast with a clear
 * message if a required secret is missing.
 */
import { z } from "zod";

const envSchema = z.object({
  AUTH_PASSWORD: z.string().min(1, "AUTH_PASSWORD is required"),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 chars"),
  GITHUB_TOKEN: z.string().min(1, "GITHUB_TOKEN is required"),
  LLM_PROVIDER: z.enum(["anthropic", "mock"]).default("anthropic"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),
  PORT: z.coerce.number().default(8787),
  SECURE_COOKIES: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid configuration:\n${msg}`);
  }
  if (
    parsed.data.LLM_PROVIDER === "anthropic" &&
    !parsed.data.ANTHROPIC_API_KEY
  ) {
    throw new Error(
      "ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic",
    );
  }
  return parsed.data;
}
