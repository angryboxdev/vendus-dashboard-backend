import OpenAI, { toFile } from "openai";
import type { LlmMessage, LlmPort, LlmToolCall, TranscriberPort } from "../../domain/ports/out/assistant.ports.js";

/** Modelo de linguagem via OpenAI (dependência e chave já existentes no projeto). Só o servidor fala com o fornecedor. */
export class OpenAiLlmAdapter implements LlmPort {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
    client?: OpenAI,
  ) {
    this.client = client ?? new OpenAI({ apiKey, timeout: 25_000, maxRetries: 1 });
  }

  async complete(input: { messages: LlmMessage[]; tools: { name: string; description: string; parameters: Record<string, unknown> }[] }): Promise<{ text: string | null; toolCalls: LlmToolCall[] }> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.1,
      messages: input.messages.map((m): OpenAI.Chat.Completions.ChatCompletionMessageParam => {
        if (m.role === "tool") return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
        if (m.role === "assistant") {
          return m.toolCalls?.length
            ? { role: "assistant", content: m.content, tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: c.arguments } })) }
            : { role: "assistant", content: m.content ?? "" };
        }
        return { role: m.role, content: m.content };
      }),
      tools: input.tools.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.parameters } })),
      tool_choice: "auto",
    });
    const msg = res.choices[0]?.message;
    const toolCalls = (msg?.tool_calls ?? []).flatMap((c) => (c.type === "function" ? [{ id: c.id, name: c.function.name, arguments: c.function.arguments }] : []));
    return { text: msg?.content ?? null, toolCalls };
  }
}

/** Voz → texto (o áudio vai só para a transcrição e não é guardado). */
export class OpenAiTranscriberAdapter implements TranscriberPort {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
    client?: OpenAI,
  ) {
    this.client = client ?? new OpenAI({ apiKey, timeout: 30_000, maxRetries: 0 });
  }

  async transcribe(audio: Buffer, mimeType: string): Promise<string> {
    const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") || mimeType.includes("m4a") ? "m4a" : mimeType.includes("wav") ? "wav" : "webm";
    const res = await this.client.audio.transcriptions.create({ file: await toFile(audio, `voz.${ext}`, { type: mimeType }), model: this.model, language: "pt" });
    return res.text;
  }
}
