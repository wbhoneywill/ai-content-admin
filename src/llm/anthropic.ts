/**
 * Anthropic implementation of the LLM adapter. Uses the Messages API with
 * tool-calling (via fetch, no SDK) so the model is constrained to the
 * operation tool set. The model's tool choice becomes the Interpretation.
 *
 * Provider-swappable: another provider implements the same LLMAdapter; the
 * tool schema (buildTools) and context formatting are shared.
 */
import type {
  InterpretContext,
  Interpretation,
  LLMAdapter,
} from "./adapter.js";
import { buildTools, SYSTEM_PROMPT } from "./tools.js";
import type { Operation } from "../operations/types.js";

export interface AnthropicOptions {
  apiKey: string;
  model?: string;
  operations: Map<string, Operation<never>>;
  /** Injectable fetch for testing. */
  fetchImpl?: typeof fetch;
  apiBase?: string;
}

function formatContext(context: InterpretContext): string {
  const lines = context.index
    .map(
      (e) =>
        `- [${e.collection}] ${e.title} (slug: ${e.slug})${e.published ? "" : " [hidden]"}`,
    )
    .join("\n");
  return `Current content index:\n${lines}`;
}

export class AnthropicAdapter implements LLMAdapter {
  readonly id = "anthropic";
  private configuredModel: string | null;
  private resolvedModel: string | null = null;
  private fetchImpl: typeof fetch;
  private apiBase: string;

  constructor(private opts: AnthropicOptions) {
    // If no model is configured, resolve one from the account's /v1/models
    // (model IDs are dated and vary by account, so hardcoding 404s).
    this.configuredModel = opts.model ?? null;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.apiBase = opts.apiBase ?? "https://api.anthropic.com";
  }

  /** The model to use: the configured one, else the newest Sonnet available. */
  private async resolveModel(): Promise<string> {
    if (this.configuredModel) return this.configuredModel;
    if (this.resolvedModel) return this.resolvedModel;

    const res = await this.fetchImpl(`${this.apiBase}/v1/models?limit=100`, {
      headers: {
        "x-api-key": this.opts.apiKey,
        "anthropic-version": "2023-06-01",
      },
    });
    if (!res.ok) {
      // Fall back to a widely-available alias if listing fails.
      this.resolvedModel = "claude-3-7-sonnet-latest";
      return this.resolvedModel;
    }
    const data = (await res.json()) as { data: Array<{ id: string }> };
    const ids = data.data.map((m) => m.id);
    // Models API lists newest first; prefer the newest Sonnet, else newest.
    this.resolvedModel =
      ids.find((id) => id.includes("sonnet")) ??
      ids[0] ??
      "claude-3-7-sonnet-latest";
    return this.resolvedModel;
  }

  async interpret(
    prompt: string,
    context: InterpretContext,
  ): Promise<Interpretation> {
    const model = await this.resolveModel();
    const tools = buildTools(this.opts.operations).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));

    const res = await this.fetchImpl(`${this.apiBase}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.opts.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: `${SYSTEM_PROMPT}\n\n${formatContext(context)}`,
        // "auto" is supported by all tool-capable models (unlike "any", which
        // some models reject). The system prompt insists on always calling a
        // tool; if the model still replies with text, we treat it as a decline.
        tool_choice: { type: "auto" },
        tools,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Anthropic API error ${res.status}: ${text.slice(0, 200)}`,
      );
    }

    const data = (await res.json()) as {
      content: Array<{ type: string; name?: string; input?: unknown }>;
    };
    const toolUse = data.content.find((c) => c.type === "tool_use");
    if (!toolUse || !toolUse.name) {
      return {
        kind: "decline",
        reason: "No actionable change was identified.",
      };
    }

    return toInterpretation(
      toolUse.name,
      (toolUse.input ?? {}) as Record<string, unknown>,
    );
  }
}

/** Map a tool-call into our Interpretation union. Exported for tests. */
export function toInterpretation(
  name: string,
  input: Record<string, unknown>,
): Interpretation {
  if (name === "clarify") {
    return {
      kind: "clarify",
      question: String(input.question ?? "Could you clarify?"),
      candidates: Array.isArray(input.candidates)
        ? (input.candidates as string[])
        : undefined,
    };
  }
  if (name === "decline") {
    return {
      kind: "decline",
      reason: String(input.reason ?? "Unsupported request."),
    };
  }
  return { kind: "operation", operation: name, args: input };
}
