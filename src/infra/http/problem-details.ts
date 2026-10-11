import type { ErrorRequestHandler, Response } from "express";
import { currentCorrelationId, log } from "./correlation.js";

/**
 * Erros HTTP no formato RFC 7807 (`application/problem+json`) — base da
 * Fase 0 do RH (ADR-0022). Os endpoints novos lançam `ProblemError`; o
 * `problemHandler` (último middleware do servidor) converte-o, e converte
 * também qualquer erro não tratado num 500 sem detalhes internos.
 *
 * Compatibilidade: o corpo leva também `error` (= detail ?? title), porque o
 * frontend atual lê `body.error` nas mensagens de erro.
 */
export interface Problem {
  /** URI que identifica o tipo de erro. Relativo: `/problems/<código>`. */
  type: string;
  title: string;
  status: number;
  detail?: string;
  /** Membros de extensão (ex.: `field`, `requires`). Nunca dados pessoais. */
  extensions?: Record<string, unknown>;
}

export class ProblemError extends Error {
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.detail ?? problem.title);
    this.name = "ProblemError";
    this.problem = problem;
  }
}

const TITLES: Record<number, string> = {
  400: "Pedido inválido",
  401: "Não autenticado",
  403: "Sem permissão",
  404: "Não encontrado",
  409: "Conflito",
  412: "A versão do registo mudou",
  415: "Tipo de conteúdo não suportado",
  422: "Regra violada",
  428: "Falta a versão do registo",
  500: "Erro interno",
};

/** Atalho: `problem(422, "rule_violation", "…", { requires: "…" })`. */
export function problem(status: number, code: string, detail?: string, extensions?: Record<string, unknown>): ProblemError {
  return new ProblemError({
    type: `/problems/${code}`,
    title: TITLES[status] ?? "Erro",
    status,
    ...(detail !== undefined && { detail }),
    ...(extensions && { extensions }),
  });
}

export function sendProblem(res: Response, p: Problem, instance?: string): void {
  const correlationId = currentCorrelationId();
  res
    .status(p.status)
    .type("application/problem+json")
    .json({
      type: p.type,
      title: p.title,
      status: p.status,
      ...(p.detail !== undefined && { detail: p.detail }),
      ...(instance && { instance }),
      ...(correlationId && { correlationId }),
      ...p.extensions,
      error: p.detail ?? p.title,
    });
}

/** Último middleware: `ProblemError` → corpo RFC 7807; o resto → 500 genérico (a causa só vai para o log). */
export const problemHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const instance = req.originalUrl.split("?")[0];
  if (err instanceof ProblemError) {
    sendProblem(res, err.problem, instance);
    return;
  }
  // JSON mal formado (express.json) traz status 400 e type "entity.parse.failed".
  if (typeof err === "object" && err !== null && (err as { type?: unknown }).type === "entity.parse.failed") {
    sendProblem(res, problem(400, "malformed_json", "O corpo do pedido não é JSON válido.").problem, instance);
    return;
  }
  log("error", "unhandled_error", { error: err instanceof Error ? err.name : "unknown", method: req.method, path: instance });
  sendProblem(res, problem(500, "internal_error").problem, instance);
};
