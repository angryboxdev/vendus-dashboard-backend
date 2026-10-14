import type { Request, Router } from "express";
import type { IdempotencyStore } from "../../infra/http/idempotency.js";
import { createAssistantRouter } from "./adapters/in/assistant.controller.js";
import { OpenAiLlmAdapter, OpenAiTranscriberAdapter } from "./adapters/out/openai-llm.adapter.js";
import { AssistantUseCases } from "./application/use-cases/assistant.use-cases.js";
import type { Viewer } from "./domain/entities/assistant.js";
import type { AssistantAuditPort, SchedulingPort } from "./domain/ports/out/assistant.ports.js";

/**
 * Composition root do Assistente Mezza. Sem chave (`OPENAI_API_KEY`) o
 * assistente responde "indisponível" e as Escalas continuam iguais.
 */
export function createAssistantModule(deps: {
  apiKey: string | undefined;
  model: string;
  transcribeModel: string;
  scheduling: SchedulingPort;
  audit: AssistantAuditPort;
  idempotencyStore: IdempotencyStore;
  viewerOf: (req: Request) => Viewer;
}): { router: Router; assistant: AssistantUseCases } {
  const key = deps.apiKey?.trim();
  const assistant = new AssistantUseCases(key ? new OpenAiLlmAdapter(key, deps.model) : null, deps.scheduling, deps.audit, key ? new OpenAiTranscriberAdapter(key, deps.transcribeModel) : null);
  return { router: createAssistantRouter(assistant, deps.idempotencyStore, deps.viewerOf, !!key), assistant };
}
