import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { problem } from "./problem-details.js";

/**
 * Concorrência otimista com `ETag` / `If-Match` (ADR-0022, task RH §4.2, TK-2).
 *
 * O ETag deriva da versão do registo (contador ou `updated_at`) — opaco para
 * o cliente. Leitura: `setEtag(res, etagFor(v))`. Escrita: `assertIfMatch(req,
 * etagFor(vAtual))` antes de gravar — sem cabeçalho → 428; desatualizado → 412.
 */

export function etagFor(version: string | number): string {
  const digest = createHash("sha256").update(String(version)).digest("base64url").slice(0, 22);
  return `"${digest}"`;
}

export function setEtag(res: Response, etag: string): void {
  res.setHeader("ETag", etag);
}

/** Lança `ProblemError` 428/412; não faz nada se a versão do cliente for a atual (ou `*`). */
export function assertIfMatch(req: Request, currentEtag: string, options: { required?: boolean } = { required: true }): void {
  const header = req.get("If-Match");
  if (!header) {
    if (options.required === false) return;
    throw problem(428, "precondition_required", "Falta o cabeçalho If-Match com a versão do registo.");
  }
  if (header.trim() === "*") return;
  const strip = (t: string) => t.trim().replace(/^W\//, "");
  const sent = header.split(",").map(strip);
  if (!sent.includes(strip(currentEtag))) {
    throw problem(412, "precondition_failed", "O registo foi alterado por outra pessoa. Recarregue e tente de novo.");
  }
}
