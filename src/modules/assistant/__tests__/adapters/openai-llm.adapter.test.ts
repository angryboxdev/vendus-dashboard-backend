import type OpenAI from "openai";
import { OpenAiLlmAdapter } from "../../adapters/out/openai-llm.adapter.js";

describe("OpenAiLlmAdapter", () => {
  test("mensagens e ferramentas no formato do fornecedor; chamadas de ferramenta de volta no formato neutro", async () => {
    const sent: unknown[] = [];
    const client = {
      chat: {
        completions: {
          create: async (body: unknown) => {
            sent.push(body);
            return { choices: [{ message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "QUERY_SCHEDULE", arguments: "{}" } }] } }] };
          },
        },
      },
    } as unknown as OpenAI;
    const llm = new OpenAiLlmAdapter("sk-test", "modelo-x", client);
    const r = await llm.complete({
      messages: [
        { role: "system", content: "regras" },
        { role: "user", content: "Quem trabalha hoje?" },
        { role: "assistant", content: null, toolCalls: [{ id: "c0", name: "QUERY_EMPLOYEES", arguments: "{}" }] },
        { role: "tool", toolCallId: "c0", content: '{"employees":[]}' },
      ],
      tools: [{ name: "QUERY_SCHEDULE", description: "d", parameters: { type: "object", properties: {} } }],
    });
    expect(r).toEqual({ text: null, toolCalls: [{ id: "c1", name: "QUERY_SCHEDULE", arguments: "{}" }] });
    const body = sent[0] as { model: string; messages: { role: string; tool_call_id?: string; tool_calls?: unknown[] }[]; tools: { type: string; function: { name: string } }[] };
    expect(body.model).toBe("modelo-x");
    expect(body.messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "tool"]);
    expect(body.messages[3]!.tool_call_id).toBe("c0");
    expect(body.tools[0]).toMatchObject({ type: "function", function: { name: "QUERY_SCHEDULE" } });
  });
});
