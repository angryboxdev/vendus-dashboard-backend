import OpenAI from "openai";
import type { ForecastModelPort } from "../../domain/ports/out/sales-analysis.ports.js";

const TIMEOUT_MS = 30_000;

/** Mesma configuração de fornecedor do Assistente (ASSISTANT_PROVIDER, GEMINI_*, OPENAI_*). */
export interface ForecastProviderConfig {
  provider?: string | undefined;
  gemini: { apiKey?: string | undefined; model: string };
  openai: { apiKey?: string | undefined; model: string };
}

class OpenAiForecastModel implements ForecastModelPort {
  readonly available = true;
  private readonly client: OpenAI;
  constructor(apiKey: string, private readonly model: string) {
    this.client = new OpenAI({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
  }
  async complete(prompt: string): Promise<string | null> {
    try {
      const res = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      });
      return res.choices[0]?.message?.content ?? null;
    } catch (e) {
      console.error("[sales-analysis] OpenAI forecast failed:", e instanceof Error ? e.message : e);
      return null;
    }
  }
}

/** Gemini por fetch; a chave vai no cabeçalho `x-goog-api-key` (nunca no URL nem nos logs). */
class GeminiForecastModel implements ForecastModelPort {
  readonly available = true;
  constructor(private readonly apiKey: string, private readonly model: string, private readonly fetchFn: typeof fetch = fetch) {}
  async complete(prompt: string): Promise<string | null> {
    try {
      const res = await this.fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        console.error("[sales-analysis] Gemini forecast HTTP", res.status);
        return null;
      }
      const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      return (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim() || null;
    } catch (e) {
      console.error("[sales-analysis] Gemini forecast failed:", e instanceof Error ? e.message : e);
      return null;
    }
  }
}

class UnavailableForecastModel implements ForecastModelPort {
  readonly available = false;
  async complete(): Promise<string | null> {
    return null;
  }
}

export function createForecastModel(c: ForecastProviderConfig): ForecastModelPort {
  const gKey = c.gemini.apiKey?.trim();
  const oKey = c.openai.apiKey?.trim();
  const wanted = c.provider?.trim().toLowerCase() || (gKey ? "gemini" : "openai");
  if (wanted === "gemini") return gKey ? new GeminiForecastModel(gKey, c.gemini.model) : new UnavailableForecastModel();
  return oKey ? new OpenAiForecastModel(oKey, c.openai.model) : new UnavailableForecastModel();
}
