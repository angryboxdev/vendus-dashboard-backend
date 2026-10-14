import type { LlmMessage, LlmPort, LlmToolCall, TranscriberPort } from "../../domain/ports/out/assistant.ports.js";

/**
 * Google Gemini (API `generateContent`) por HTTP, sem SDK. A chave vai só no
 * cabeçalho `x-goog-api-key` (nunca no URL nem nos logs).
 */
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 25_000;

type Part = { text?: string; functionCall?: { name: string; args?: Record<string, unknown> }; functionResponse?: { name: string; response: Record<string, unknown> }; inlineData?: { mimeType: string; data: string } };
type Content = { role: "user" | "model"; parts: Part[] };

/** O Gemini aceita um subconjunto do JSON Schema: fica só o que ele entende. */
const SCHEMA_KEYS = new Set(["type", "description", "properties", "required", "items", "enum", "format", "nullable"]);
export function geminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(geminiSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (!SCHEMA_KEYS.has(k)) continue;
    if (k === "properties") out[k] = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([p, s]) => [p, geminiSchema(s)]));
    else if (k === "items") out[k] = geminiSchema(v);
    else out[k] = v;
  }
  return out;
}

async function call(apiKey: string, model: string, body: unknown, fetchFn: typeof fetch): Promise<{ candidates?: { content?: { parts?: Part[] } }[] }> {
  const res = await fetchFn(`${BASE}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as { candidates?: { content?: { parts?: Part[] } }[] };
}

export class GeminiLlmAdapter implements LlmPort {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async complete(input: { messages: LlmMessage[]; tools: { name: string; description: string; parameters: Record<string, unknown> }[] }): Promise<{ text: string | null; toolCalls: LlmToolCall[] }> {
    const system = input.messages.filter((m) => m.role === "system").map((m) => m.content as string).join("\n");
    const names = new Map<string, string>();
    const contents: Content[] = [];
    const add = (role: Content["role"], part: Part) => {
      const last = contents.at(-1);
      // Respostas de várias ferramentas seguidas vão juntas, como o Gemini espera.
      if (last && last.role === role && (part.functionResponse ? !!last.parts[0]?.functionResponse : false)) last.parts.push(part);
      else contents.push({ role, parts: [part] });
    };
    for (const m of input.messages) {
      if (m.role === "system") continue;
      if (m.role === "user") add("user", { text: m.content });
      else if (m.role === "assistant") {
        const parts: Part[] = [];
        if (m.content) parts.push({ text: m.content });
        for (const c of m.toolCalls ?? []) {
          names.set(c.id, c.name);
          parts.push({ functionCall: { name: c.name, args: safeJson(c.arguments) } });
        }
        if (parts.length) contents.push({ role: "model", parts });
      } else if (m.role === "tool") {
        const parsed = safeJson(m.content);
        add("user", { functionResponse: { name: names.get(m.toolCallId) ?? "tool", response: parsed } });
      }
    }
    const res = await call(
      this.apiKey,
      this.model,
      {
        ...(system && { systemInstruction: { parts: [{ text: system }] } }),
        contents,
        tools: [
          {
            functionDeclarations: input.tools.map((t) => {
              const params = geminiSchema(t.parameters) as { properties?: Record<string, unknown> };
              return { name: t.name, description: t.description, ...(params.properties && Object.keys(params.properties).length ? { parameters: params } : {}) };
            }),
          },
        ],
        generationConfig: { temperature: 0.1 },
      },
      this.fetchFn,
    );
    const parts = res.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p) => p.text ?? "").join("").trim() || null;
    const toolCalls = parts.filter((p) => p.functionCall).map((p, i) => ({ id: `g${Date.now().toString(36)}${i}`, name: p.functionCall!.name, arguments: JSON.stringify(p.functionCall!.args ?? {}) }));
    return { text, toolCalls };
  }
}

/** Voz → texto com o mesmo modelo (áudio em linha; não é guardado). */
export class GeminiTranscriberAdapter implements TranscriberPort {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async transcribe(audio: Buffer, mimeType: string): Promise<string> {
    const res = await call(
      this.apiKey,
      this.model,
      {
        contents: [{ role: "user", parts: [{ inlineData: { mimeType: mimeType.split(";")[0] || "audio/webm", data: audio.toString("base64") } }, { text: "Transcreve fielmente este áudio em português de Portugal. Responde só com o texto dito, sem comentários." }] }],
        generationConfig: { temperature: 0 },
      },
      this.fetchFn,
    );
    return (res.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  }
}

function safeJson(s: string): Record<string, unknown> {
  try {
    const v: unknown = s ? JSON.parse(s) : {};
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : { result: v };
  } catch {
    return { result: s };
  }
}
