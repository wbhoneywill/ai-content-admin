import { describe, it, expect } from "vitest";
import { buildTools } from "../src/llm/tools.js";
import { AnthropicAdapter, toInterpretation } from "../src/llm/anthropic.js";
import { registry } from "../src/operations/registry.js";
import type { InterpretContext } from "../src/llm/adapter.js";

const ctx: InterpretContext = {
  index: [
    {
      collection: "people",
      slug: "esin-alpogan",
      title: "Esin Alpogan",
      published: true,
    },
  ],
  operations: [],
};

describe("buildTools", () => {
  it("creates a tool per operation plus clarify and decline", () => {
    const tools = buildTools(registry);
    const names = tools.map((t) => t.name);
    expect(names).toContain("hidePerson");
    expect(names).toContain("addPost");
    expect(names).toContain("clarify");
    expect(names).toContain("decline");
  });

  it("derives JSON Schema input from the Zod args", () => {
    const hide = buildTools(registry).find((t) => t.name === "hidePerson")!;
    const schema = hide.inputSchema as {
      properties?: Record<string, unknown>;
    };
    expect(schema.properties).toHaveProperty("slug");
  });
});

describe("toInterpretation", () => {
  it("maps clarify/decline/operation tool calls", () => {
    expect(toInterpretation("clarify", { question: "Which?" }).kind).toBe(
      "clarify",
    );
    expect(toInterpretation("decline", { reason: "no" }).kind).toBe("decline");
    const op = toInterpretation("hidePerson", { slug: "x" });
    expect(op).toEqual({
      kind: "operation",
      operation: "hidePerson",
      args: { slug: "x" },
    });
  });
});

describe("AnthropicAdapter (mocked fetch)", () => {
  function mockFetch(toolName: string, input: unknown): typeof fetch {
    return (async () =>
      new Response(
        JSON.stringify({
          content: [{ type: "tool_use", name: toolName, input }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;
  }

  it("returns an operation interpretation from a tool_use response", async () => {
    const adapter = new AnthropicAdapter({
      apiKey: "test",
      operations: registry,
      fetchImpl: mockFetch("hidePerson", { slug: "esin-alpogan" }),
    });
    const res = await adapter.interpret("hide esin", ctx);
    expect(res).toEqual({
      kind: "operation",
      operation: "hidePerson",
      args: { slug: "esin-alpogan" },
    });
  });

  it("surfaces clarify from the model", async () => {
    const adapter = new AnthropicAdapter({
      apiKey: "test",
      operations: registry,
      fetchImpl: mockFetch("clarify", { question: "Who?", candidates: ["A"] }),
    });
    const res = await adapter.interpret("remove the writer", ctx);
    expect(res.kind).toBe("clarify");
  });

  it("throws a clear error on API failure", async () => {
    const failing = (async () =>
      new Response("rate limited", { status: 429 })) as unknown as typeof fetch;
    const adapter = new AnthropicAdapter({
      apiKey: "test",
      operations: registry,
      fetchImpl: failing,
    });
    await expect(adapter.interpret("x", ctx)).rejects.toThrow(/429/);
  });
});
