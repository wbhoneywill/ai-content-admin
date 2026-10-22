import type {
  InterpretContext,
  Interpretation,
  LLMAdapter,
} from "../src/llm/adapter.js";

/**
 * Scripted LLM adapter for tests. Either returns a fixed interpretation, or
 * uses a simple rule function over the prompt + context so tests can exercise
 * the orchestrator deterministically without a real model.
 */
export class MockLLM implements LLMAdapter {
  readonly id = "mock";
  constructor(
    private rule: (prompt: string, context: InterpretContext) => Interpretation,
  ) {}
  async interpret(
    prompt: string,
    context: InterpretContext,
  ): Promise<Interpretation> {
    return this.rule(prompt, context);
  }
}

/** A rule that resolves "hide X" to hidePerson by matching a title substring. */
export function simpleHideRule(
  prompt: string,
  context: InterpretContext,
): Interpretation {
  const p = prompt.toLowerCase();
  if (p.includes("hide") || p.includes("remove") || p.includes("take down")) {
    const matches = context.index.filter(
      (e) => e.collection === "people" && p.includes(e.title.toLowerCase()),
    );
    if (matches.length === 0)
      return { kind: "decline", reason: "No matching person found." };
    if (matches.length > 1)
      return {
        kind: "clarify",
        question: "Which person did you mean?",
        candidates: matches.map((m) => m.title),
      };
    return {
      kind: "operation",
      operation: "hidePerson",
      args: { slug: matches[0].slug },
    };
  }
  return { kind: "decline", reason: "Unsupported request." };
}
