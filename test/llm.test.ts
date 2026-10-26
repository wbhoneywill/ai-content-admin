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
  // URL-aware mock: /v1/models returns a model list (for auto-resolution),
  // /v1/messages returns the tool_use response.
  function mockFetch(toolName: string, input: unknown): typeof fetch {
    return (async (url: string) => {
      if (url.includes("/v1/models")) {
        return new Response(
          JSON.stringify({ data: [{ id: "claude-3-7-sonnet-latest" }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          content: [{ type: "tool_use", name: toolName, input }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;
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
      model: "claude-3-7-sonnet-latest", // skip auto-resolution; test the messages call
      operations: registry,
      fetchImpl: failing,
    });
    await expect(adapter.interpret("x", ctx)).rejects.toThrow(/429/);
  });

  it("auto-resolves the newest Sonnet when no model is configured", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      if (url.includes("/v1/models")) {
        return new Response(
          JSON.stringify({
            data: [
              { id: "claude-opus-4-1" },
              { id: "claude-sonnet-4-5-20991231" },
              { id: "claude-haiku-4" },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          content: [
            { type: "tool_use", name: "decline", input: { reason: "x" } },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const adapter = new AnthropicAdapter({
      apiKey: "test",
      operations: registry,
      fetchImpl,
    });
    await adapter.interpret("x", ctx);
    // Picked the sonnet id and used it in the messages request.
    const messagesCall = calls.find((c) => c.includes("/v1/messages"));
    expect(messagesCall).toBeTruthy();
    expect(calls.some((c) => c.includes("/v1/models"))).toBe(true);
  });
});
