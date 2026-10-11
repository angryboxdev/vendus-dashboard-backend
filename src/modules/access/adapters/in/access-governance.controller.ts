import { Router, type Request } from "express";
import { idempotency, type IdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problem } from "../../../../infra/http/problem-details.js";
import type { AccessGovernanceUseCases } from "../../application/use-cases/access-governance.use-cases.js";
import { AccessNotFoundError, AccessValidationError } from "../../domain/errors.js";
import { FIELD_PRIVACY_CATALOG, type FieldRule } from "../../domain/field-privacy.js";
import type { ScopeKind, ScopeType } from "../../domain/services/scope.service.js";

const str = (v: unknown): string => (typeof v === "string" ? v : "");

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AccessValidationError) throw problem(400, "validation_error", e.message);
    if (e instanceof AccessNotFoundError) throw problem(404, "not_found", e.message);
    throw e;
  }
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * Novo RH, ticket 05 — sob `/api/access-profiles` e `/api/users` (já
 * classificados como só Admin). Escritas novas com Idempotency-Key.
 */
export function createAccessGovernanceRouter(gov: AccessGovernanceUseCases, store: IdempotencyStore): Router {
  const r = Router();
  const keyed = idempotency(store, { required: true });
  const actor = (req: Request) => req.auth!.email || req.auth!.sub;
  const org = (req: Request) => req.auth!.orgId;

  r.get("/access-profiles/field-catalog", (_req, res) => {
    res.json(FIELD_PRIVACY_CATALOG);
  });

  const history = (req: Request) =>
    run(() =>
      gov.roleHistory(org(req), {
        ...(str(req.query.from) && { from: str(req.query.from) }),
        ...(str(req.query.to) && { to: str(req.query.to) }),
        ...(str(req.query.limit) && { limit: Number(str(req.query.limit)) }),
      }),
    );
  r.get("/access-profiles/history", async (req, res) => {
    res.json(await history(req));
  });
  r.get("/access-profiles/history.csv", async (req, res) => {
    const rows = await history(req);
    const header = ["Data", "Autor", "Tipo", "ID", "Ação", "Antes", "Depois"];
    const lines = rows.map((h) => [h.at, h.actor, h.entityType, h.entityId, h.action, h.before, h.after].map(csvCell).join(";"));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="historico-papeis.csv"');
    res.send(`﻿${[header.map(csvCell).join(";"), ...lines].join("\r\n")}`);
  });

  r.get("/access-profiles/:id/governance", async (req, res) => {
    res.json(await run(() => gov.profileGovernance(org(req), req.params.id as string)));
  });
  r.put("/access-profiles/:id/scope-kind", keyed, async (req, res) => {
    await run(() => gov.setScopeKind(org(req), req.params.id as string, str(req.body?.scopeKind) as ScopeKind, actor(req)));
    res.json(await run(() => gov.profileGovernance(org(req), req.params.id as string)));
  });
  r.put("/access-profiles/:id/field-privacy", keyed, async (req, res) => {
    const raw = Array.isArray(req.body?.rules) ? (req.body.rules as unknown[]) : [];
    const rules: FieldRule[] = raw.map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      return { fieldKey: str(o.fieldKey), canView: o.canView === true, canEdit: o.canEdit === true };
    });
    await run(() => gov.setFieldPrivacy(org(req), req.params.id as string, rules, actor(req)));
    res.json(await run(() => gov.profileGovernance(org(req), req.params.id as string)));
  });

  r.get("/users/:id/scopes", async (req, res) => {
    res.json(await run(() => gov.listScopes(org(req), req.params.id as string)));
  });
  r.post("/users/:id/scopes", keyed, async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const input = { scopeType: str(b.scopeType) as ScopeType, scopeId: str(b.scopeId) || null, validFrom: str(b.validFrom), validTo: str(b.validTo) || null };
    res.status(201).json(await run(() => gov.addScope(org(req), req.params.id as string, input, actor(req))));
  });
  r.post("/users/:id/scopes/:scopeId/end", keyed, async (req, res) => {
    res.json(await run(() => gov.endScope(org(req), req.params.id as string, req.params.scopeId as string, str(req.body?.validTo), actor(req))));
  });

  return r;
}
