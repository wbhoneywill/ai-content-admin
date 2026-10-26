/**
 * Build the LLM tool schema from a set of operations. Each operation becomes a
 * tool whose input schema is its Zod args converted to JSON Schema, plus two
 * meta-tools (clarify, decline) so the model always has a structured way to
 * respond. Provider adapters translate these into their own tool-call format.
 */
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Operation } from "../operations/types.js";

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export function buildTools(
  operations: Map<string, Operation<never>>,
): ToolDef[] {
  const tools: ToolDef[] = [];

  for (const op of operations.values()) {
    tools.push({
      name: op.name,
      description: op.description,
      inputSchema: zodToJsonSchema(op.args, {
        target: "openApi3",
        $refStrategy: "none",
      }) as Record<string, unknown>,
    });
  }

  tools.push({
    name: "clarify",
    description:
      "Ask the user a clarifying question when the request is ambiguous (e.g. multiple people match).",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string" },
        candidates: { type: "array", items: { type: "string" } },
      },
      required: ["question"],
    },
  });

  tools.push({
    name: "decline",
    description:
      "Decline when the request does not map to any supported operation.",
    inputSchema: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
    },
  });

  return tools;
}

export const SYSTEM_PROMPT = `You are the content editor for a static website. You help a non-technical \
site owner make changes by selecting exactly one tool that matches their \
request and filling its arguments.

Rules:
- You MUST respond by calling exactly one tool — never with plain text. If the
  request maps to no operation, call "decline"; if it is ambiguous, call
  "clarify". There is always an appropriate tool to call.
- Only use the provided tools. Never invent operations.
- Resolve people/posts/plays by matching the provided content index; use the \
item's slug as the argument.
- If multiple items match, call "clarify" with the candidates. If nothing \
matches or the request is outside the tools, call "decline".
- "remove"/"take down" a person or post means HIDE it (reversible) unless the \
user explicitly says permanently delete.
- For permanent deletion, set confirm:false first so the user is asked to \
confirm; only set confirm:true if they have already confirmed.`;
