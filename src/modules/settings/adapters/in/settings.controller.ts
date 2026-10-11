import { Router, type Request } from "express";
import { assertIfMatch, etagFor, setEtag } from "../../../../infra/http/etag.js";
import { idempotency, type IdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problem } from "../../../../infra/http/problem-details.js";
import type { SettingData, SettingDomain } from "../../domain/entities/setting-definition.js";
import type { ProfileKind, TargetType } from "../../domain/entities/setting-profile.js";
import { RetroactiveNotAllowed, SettingNotFound, SettingRuleViolation, SettingValidationError } from "../../domain/errors.js";
import type { Actor, SettingsPorts } from "../../domain/ports/in/settings.ports.js";

const DOMAINS = new Set<SettingDomain>(["security", "time_tracking", "notifications"]);

/** Erros do domínio → RFC 7807 (ADR-0022). */
function toProblem(e: unknown): unknown {
  if (e instanceof SettingRuleViolation) return problem(422, "rule_violation", e.message, { key: e.key, requires: e.requires });
  if (e instanceof RetroactiveNotAllowed) return problem(403, "retroactive_not_allowed", e.message, { validFrom: e.validFrom });
  if (e instanceof SettingValidationError) return problem(400, "validation_error", e.message, { field: e.key });
  if (e instanceof SettingNotFound) return problem(404, "not_found", e.message);
  return e;
}

const wrap =
  <T>(fn: (req: Request) => Promise<T>) =>
  async (req: Request) => {
    try {
      return await fn(req);
    } catch (e) {
      throw toProblem(e);
    }
  };

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
  // Evita injeção de fórmulas ao abrir no Excel.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * Novo RH → Configurações (C11.3), em `/api/novo-rh/settings`.
 * Escritas com Idempotency-Key obrigatória; alterações a um perfil com
 * If-Match (versão do perfil). Classificação em `route-permissions.ts`.
 */
export class SettingsController {
  readonly router: Router;

  constructor(
    private readonly settings: SettingsPorts,
    idempotencyStore: IdempotencyStore,
    private readonly actorOf: (req: Request) => Actor,
  ) {
    const r = Router();
    const base = "/novo-rh/settings";
    r.use(base, idempotency(idempotencyStore, { required: true }));

    r.get(`${base}/definitions`, (req, res) => {
      const domain = str(req.query.domain) as SettingDomain;
      res.json(this.settings.listDefinitions(DOMAINS.has(domain) ? domain : undefined));
    });

    r.get(`${base}/profiles`, async (req, res) => {
      res.json(await this.settings.listProfiles(req.auth!.orgId));
    });

    r.post(`${base}/profiles`, async (req, res) => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const input = { domain: str(b.domain) as SettingDomain, name: str(b.name), kind: str(b.kind) as ProfileKind };
      res.status(201).json(await wrap(() => this.settings.createProfile(req.auth!.orgId, input, this.actorOf(req)))(req));
    });

    r.get(`${base}/profiles/:id`, async (req, res) => {
      const detail = await wrap(() => this.settings.getProfile(req.auth!.orgId, req.params.id as string))(req);
      setEtag(res, etagFor(detail.version));
      res.json(detail);
    });

    r.post(`${base}/profiles/:id/targets`, async (req, res) => {
      const orgId = req.auth!.orgId;
      const id = req.params.id as string;
      const b = (req.body ?? {}) as Record<string, unknown>;
      const target = await wrap(async () => {
        assertIfMatch(req, etagFor((await this.settings.getProfile(orgId, id)).version));
        return this.settings.addTarget(
          orgId,
          id,
          { targetType: str(b.targetType) as TargetType, targetId: str(b.targetId), validFrom: str(b.validFrom), validTo: str(b.validTo) || null },
          this.actorOf(req),
        );
      })(req);
      setEtag(res, etagFor((await this.settings.getProfile(orgId, id)).version));
      res.status(201).json(target);
    });

    r.post(`${base}/profiles/:id/values`, async (req, res) => {
      const orgId = req.auth!.orgId;
      const id = req.params.id as string;
      const b = (req.body ?? {}) as Record<string, unknown>;
      const result = await wrap(async () => {
        assertIfMatch(req, etagFor((await this.settings.getProfile(orgId, id)).version));
        return this.settings.setValue(
          orgId,
          id,
          { key: str(b.key), value: (b.value === undefined ? null : b.value) as SettingData | null, validFrom: str(b.validFrom), reason: str(b.reason) },
          this.actorOf(req),
        );
      })(req);
      setEtag(res, etagFor((await this.settings.getProfile(orgId, id)).version));
      res.status(201).json(result);
    });

    r.post(`${base}/profiles/:id/impact-preview`, async (req, res) => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      res.json(await wrap(() => this.settings.impactPreview(req.auth!.orgId, req.params.id as string, str(b.validFrom)))(req));
    });

    r.get(`${base}/effective`, async (req, res) => {
      const employeeId = str(req.query.employeeId);
      if (!employeeId) throw problem(400, "validation_error", "Escolha o colaborador.", { field: "employeeId" });
      const domain = str(req.query.domain) as SettingDomain;
      const date = str(req.query.date);
      res.json(await wrap(() => this.settings.effectiveFor(req.auth!.orgId, employeeId, date, DOMAINS.has(domain) ? domain : undefined))(req));
    });

    r.get(`${base}/history`, async (req, res) => {
      res.json(await this.settings.history(req.auth!.orgId, this.historyFilter(req)));
    });

    // CF-12: histórico exportável.
    r.get(`${base}/history.csv`, async (req, res) => {
      const rows = await this.settings.history(req.auth!.orgId, this.historyFilter(req));
      const sensitive = new Set(this.settings.listDefinitions().filter((d) => d.sensitive).map((d) => d.key));
      const mask = (key: string, v: unknown) => (sensitive.has(key) && v !== null ? "***" : v);
      const header = ["Data do registo", "Autor", "Perfil", "Parâmetro", "Chave", "Antes", "Depois", "Data de efeito", "Motivo"];
      const lines = rows.map((h) =>
        [h.createdAt, h.createdBy, h.profileName, h.label, h.key, mask(h.key, h.before), mask(h.key, h.after), h.validFrom, h.reason].map(csvCell).join(";"),
      );
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="historico-configuracoes.csv"');
      res.send(`﻿${[header.map(csvCell).join(";"), ...lines].join("\r\n")}`);
    });

    this.router = r;
  }

  private historyFilter(req: Request) {
    const key = str(req.query.key);
    const profileId = str(req.query.profileId);
    return { ...(key && { key }), ...(profileId && { profileId }) };
  }
}

