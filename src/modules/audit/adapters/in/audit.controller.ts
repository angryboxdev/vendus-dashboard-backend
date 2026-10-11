import { Router, type Request } from "express";
import { problem } from "../../../../infra/http/problem-details.js";
import { InvalidAuditEvent, type AuditQuery } from "../../domain/entities/audit-event.js";
import type { AuditQueryPorts } from "../../domain/ports/in/audit.ports.js";

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

function readQuery(req: Request): Partial<AuditQuery> {
  const limit = Number(str(req.query.limit) ?? 100);
  const beforeSeq = Number(str(req.query.beforeSeq) ?? 0);
  const q: Partial<AuditQuery> = { limit: Number.isFinite(limit) ? limit : 100 };
  for (const k of ["resourceType", "resourceId", "action", "from", "to"] as const) {
    const v = str(req.query[k]);
    if (v) q[k] = v;
  }
  if (beforeSeq > 0) q.beforeSeq = beforeSeq;
  return q;
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Novo RH → Auditoria (`governance.audit`): consulta, exportação e verificação da cadeia. */
export class AuditController {
  readonly router: Router;

  constructor(private readonly audit: AuditQueryPorts) {
    const r = Router();
    const base = "/novo-rh/audit";
    const list = async (req: Request) => {
      try {
        return await this.audit.list(req.auth!.orgId, readQuery(req));
      } catch (e) {
        if (e instanceof InvalidAuditEvent) throw problem(400, "validation_error", e.message);
        throw e;
      }
    };

    r.get(`${base}/events`, async (req, res) => {
      res.json(await list(req));
    });

    r.get(`${base}/events.csv`, async (req, res) => {
      const rows = await list(req);
      const header = ["N.º", "Data (UTC)", "Autor", "Ação", "Recurso", "ID", "Antes", "Depois", "Motivo", "IP", "Dispositivo", "Correlação", "Hash"];
      const lines = rows.map((e) =>
        [e.seq, e.occurredAt, e.actor, e.action, e.resourceType, e.resourceId, e.before, e.after, e.reason, e.ip, e.userAgent, e.correlationId, e.hash].map(csvCell).join(";"),
      );
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="auditoria.csv"');
      res.send(`﻿${[header.map(csvCell).join(";"), ...lines].join("\r\n")}`);
    });

    r.get(`${base}/verify`, async (req, res) => {
      res.json(await this.audit.verify(req.auth!.orgId));
    });

    this.router = r;
  }
}
