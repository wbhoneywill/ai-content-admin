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
  private model: string;
  private fetchImpl: typeof fetch;
  private apiBase: string;

  constructor(private opts: AnthropicOptions) {
    this.model = opts.model ?? "claude-sonnet-4-20250514";
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.apiBase = opts.apiBase ?? "https://api.anthropic.com";
  }

  async interpret(
    prompt: string,
    context: InterpretContext,
  ): Promise<Interpretation> {
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
        model: this.model,
        max_tokens: 1024,
        system: `${SYSTEM_PROMPT}\n\n${formatContext(context)}`,
        tool_choice: { type: "any" },
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
