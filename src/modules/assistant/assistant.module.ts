import type { Request, Router } from "express";
import type { IdempotencyStore } from "../../infra/http/idempotency.js";
import { createAssistantRouter } from "./adapters/in/assistant.controller.js";
import { GeminiLlmAdapter, GeminiTranscriberAdapter } from "./adapters/out/gemini-llm.adapter.js";
import { OpenAiLlmAdapter, OpenAiTranscriberAdapter } from "./adapters/out/openai-llm.adapter.js";
import { AssistantUseCases } from "./application/use-cases/assistant.use-cases.js";
import type { Viewer } from "./domain/entities/assistant.js";
import type { AssistantAuditPort, LlmPort, SchedulingPort, TranscriberPort } from "./domain/ports/out/assistant.ports.js";

export interface AssistantProviderConfig {
  /** "gemini" | "openai"; vazio = Gemini se houver chave Gemini, senão OpenAI. */
  provider: string | undefined;
  gemini: { apiKey: string | undefined; model: string };
  openai: { apiKey: string | undefined; model: string; transcribeModel: string };
}

/** Fornecedor da IA escolhido pelas variáveis de ambiente (sem chave → assistente "indisponível"). */
export function chooseProvider(c: AssistantProviderConfig): { name: "gemini" | "openai" | null; llm: LlmPort | null; transcriber: TranscriberPort | null } {
  const gKey = c.gemini.apiKey?.trim();
  const oKey = c.openai.apiKey?.trim();
  const wanted = c.provider?.trim().toLowerCase() || (gKey ? "gemini" : "openai");
  if (wanted === "gemini") return gKey ? { name: "gemini", llm: new GeminiLlmAdapter(gKey, c.gemini.model), transcriber: new GeminiTranscriberAdapter(gKey, c.gemini.model) } : { name: null, llm: null, transcriber: null };
  return oKey ? { name: "openai", llm: new OpenAiLlmAdapter(oKey, c.openai.model), transcriber: new OpenAiTranscriberAdapter(oKey, c.openai.transcribeModel) } : { name: null, llm: null, transcriber: null };
}

/**
 * Composition root do Assistente Mezza. Sem chave do fornecedor escolhido, o
 * assistente responde "indisponível" e as Escalas continuam iguais.
 */
export function createAssistantModule(deps: {
  providers: AssistantProviderConfig;
  scheduling: SchedulingPort;
  audit: AssistantAuditPort;
  idempotencyStore: IdempotencyStore;
  viewerOf: (req: Request) => Viewer;
}): { router: Router; assistant: AssistantUseCases; provider: "gemini" | "openai" | null } {
  const p = chooseProvider(deps.providers);
  const assistant = new AssistantUseCases(p.llm, deps.scheduling, deps.audit, p.transcriber);
  return { router: createAssistantRouter(assistant, deps.idempotencyStore, deps.viewerOf, !!p.transcriber), assistant, provider: p.name };
}
