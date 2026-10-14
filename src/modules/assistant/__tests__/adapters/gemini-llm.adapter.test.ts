import { GeminiLlmAdapter, GeminiTranscriberAdapter, geminiSchema } from "../../adapters/out/gemini-llm.adapter.js";
import { chooseProvider } from "../../assistant.module.js";
import { TOOLS } from "../../domain/services/tools.js";

function fakeFetch(reply: unknown, status = 200) {
  const seen: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    seen.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) as Record<string, unknown> });
    return new Response(typeof reply === "string" ? reply : JSON.stringify(reply), { status });
  }) as unknown as typeof fetch;
  return { fn, seen };
}

describe("GeminiLlmAdapter", () => {
  test("instruções, conversa e ferramentas no formato do Gemini; chave só no cabeçalho", async () => {
    const { fn, seen } = fakeFetch({ candidates: [{ content: { parts: [{ functionCall: { name: "QUERY_SCHEDULE", args: { from: "2026-10-12" } } }] } }] });
    const llm = new GeminiLlmAdapter("SEGREDO", "gemini-x", fn);
    const r = await llm.complete({
      messages: [
        { role: "system", content: "regras" },
        { role: "user", content: "Quem trabalha?" },
        { role: "assistant", content: null, toolCalls: [{ id: "c1", name: "QUERY_EMPLOYEES", arguments: "{}" }, { id: "c2", name: "QUERY_SHIFT_MODELS", arguments: "{}" }] },
        { role: "tool", toolCallId: "c1", content: '{"employees":[]}' },
        { role: "tool", toolCallId: "c2", content: "[1,2]" },
      ],
      tools: TOOLS.map(({ name, description, parameters }) => ({ name, description, parameters })),
    });
    expect(r.text).toBeNull();
    expect(r.toolCalls).toHaveLength(1);
    expect(r.toolCalls[0]).toMatchObject({ name: "QUERY_SCHEDULE", arguments: '{"from":"2026-10-12"}' });
    const s = seen[0]!;
    expect(s.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent");
    expect(s.url).not.toContain("SEGREDO");
    expect(s.headers["x-goog-api-key"]).toBe("SEGREDO");
    expect(s.body.systemInstruction).toEqual({ parts: [{ text: "regras" }] });
    const contents = s.body.contents as { role: string; parts: Record<string, unknown>[] }[];
    expect(contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
    // As duas respostas de ferramenta seguem juntas, com o nome da função certo.
    expect(contents[2]!.parts).toEqual([{ functionResponse: { name: "QUERY_EMPLOYEES", response: { employees: [] } } }, { functionResponse: { name: "QUERY_SHIFT_MODELS", response: { result: [1, 2] } } }]);
    const decls = (s.body.tools as { functionDeclarations: { name: string; parameters?: unknown }[] }[])[0]!.functionDeclarations;
    expect(decls.find((d) => d.name === "QUERY_SHIFT_MODELS")!.parameters).toBeUndefined();
    expect(JSON.stringify(decls)).not.toMatch(/additionalProperties|minimum|maximum/);
  });

  test("texto final; erro do Gemini sem a chave", async () => {
    const ok = new GeminiLlmAdapter("K", "m", fakeFetch({ candidates: [{ content: { parts: [{ text: "✓ Feito." }] } }] }).fn);
    expect(await ok.complete({ messages: [{ role: "user", content: "x" }], tools: [] })).toEqual({ text: "✓ Feito.", toolCalls: [] });
    const bad = new GeminiLlmAdapter("SEGREDO", "m", fakeFetch("quota", 429).fn);
    const err = await bad.complete({ messages: [{ role: "user", content: "x" }], tools: [] }).catch((e: Error) => e);
    expect((err as Error).message).toContain("429");
    expect((err as Error).message).not.toContain("SEGREDO");
  });

  test("esquema: só o subconjunto que o Gemini aceita", () => {
    expect(geminiSchema({ type: "object", additionalProperties: false, required: ["a"], properties: { a: { type: "integer", minimum: 1, maximum: 7, description: "d" }, b: { type: "array", items: { type: "string", pattern: "x" } } } })).toEqual({
      type: "object",
      required: ["a"],
      properties: { a: { type: "integer", description: "d" }, b: { type: "array", items: { type: "string" } } },
    });
  });

  test("voz: áudio em linha, sem parâmetros do codec no tipo", async () => {
    const { fn, seen } = fakeFetch({ candidates: [{ content: { parts: [{ text: " Coloca o João amanhã. " }] } }] });
    const t = new GeminiTranscriberAdapter("K", "m", fn);
    expect(await t.transcribe(Buffer.from([1, 2, 3]), "audio/webm;codecs=opus")).toBe("Coloca o João amanhã.");
    const part = ((seen[0]!.body.contents as { parts: { inlineData?: { mimeType: string; data: string } }[] }[])[0]!.parts[0]!).inlineData!;
    expect(part).toEqual({ mimeType: "audio/webm", data: "AQID" });
  });
});

describe("Escolha do fornecedor", () => {
  const base = { provider: undefined, gemini: { apiKey: undefined, model: "g" }, openai: { apiKey: undefined, model: "o", transcribeModel: "t" } };
  test("Gemini quando há chave Gemini; OpenAI se for pedido ou só houver essa; sem chave → nenhum", () => {
    expect(chooseProvider({ ...base, gemini: { apiKey: "g-key", model: "g" }, openai: { ...base.openai, apiKey: "o-key" } }).name).toBe("gemini");
    expect(chooseProvider({ ...base, provider: "openai", gemini: { apiKey: "g-key", model: "g" }, openai: { ...base.openai, apiKey: "o-key" } }).name).toBe("openai");
    expect(chooseProvider({ ...base, openai: { ...base.openai, apiKey: "o-key" } }).name).toBe("openai");
    expect(chooseProvider({ ...base, provider: "gemini", openai: { ...base.openai, apiKey: "o-key" } }).name).toBeNull();
    expect(chooseProvider(base).llm).toBeNull();
  });
});
