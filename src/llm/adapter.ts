/**
 * LLM adapter interface (provider-agnostic). An implementation turns a natural
 * language request into one of three outcomes:
 *   - operation: pick a registered operation + fill its arguments
 *   - clarify:   the request is ambiguous; ask the user a question
 *   - decline:   the request maps to no supported operation
 *
 * Implementations use structured/tool-call output constrained to the operation
 * set, so the model can only ever return a valid operation name. Providers
 * (Anthropic, OpenAI, local) implement this interface; tests use a scripted
 * mock. The engine never trusts free-form model text to touch the repo.
 */

export interface SlugIndexEntry {
  collection: string;
  slug: string;
  title: string;
  published: boolean;
}

/** Compact context handed to the model so it can resolve references. */
export interface InterpretContext {
  /** All content items (collection, slug, title, published). */
  index: SlugIndexEntry[];
  /** Operation name -> one-line description, for the tool schema. */
  operations: { name: string; description: string }[];
}

export type Interpretation =
  | { kind: "operation"; operation: string; args: Record<string, unknown> }
  | { kind: "clarify"; question: string; candidates?: string[] }
  | { kind: "decline"; reason: string };

export interface LLMAdapter {
  /** The provider id, e.g. "anthropic" | "openai" | "mock". */
  readonly id: string;
  interpret(prompt: string, context: InterpretContext): Promise<Interpretation>;
}
