import { Router, type Request } from "express";
import { problem } from "../../../../infra/http/problem-details.js";
import type { ReportsUseCases } from "../../application/use-cases/reports.use-cases.js";
import { ReportError } from "../../domain/errors.js";

const STATUS: Record<ReportError["code"], number> = { validation: 400, not_found: 404, forbidden: 403 };

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ReportError) throw problem(STATUS[e.code], e.code, e.message, e.field ? { field: e.field } : undefined);
    throw e;
  }
}

export interface ReportsAccess {
  canSeeEmployee: (req: Request, employeeId: string, date: string) => Promise<boolean>;
  canAudit: (req: Request) => boolean;
}

/** Lista de ids separada por vírgulas (`?locations=a,b`). */
const ids = (v: unknown): string[] => (typeof v === "string" && v ? [...new Set(v.split(",").map((x) => x.trim()).filter(Boolean))] : []);

/**
 * Relatórios (`/api/novo-rh/reports`, `hr.employees`): catálogo, ver (JSON) e
 * descarregar (CSV). Filtros por identificadores: `locations`, `employees` e
 * `columns` (FE-063).
 */
export function createReportsRouter(uc: ReportsUseCases, access: ReportsAccess): Router {
  const r = Router();
  const R = "/novo-rh/reports";
  const go = (req: Request) => {
    const from = String(req.query.from ?? "");
    const to = String(req.query.to ?? "");
    const today = new Date().toISOString().slice(0, 10);
    return run(() =>
      uc.run(
        req.auth!.orgId,
        req.params.key as string,
        from || to ? { from, to } : null,
        {
          canSee: (employeeId) => access.canSeeEmployee(req, employeeId, /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : today),
          canAudit: access.canAudit(req),
        },
        { locationIds: ids(req.query.locations), employeeIds: ids(req.query.employees), columns: ids(req.query.columns) },
      ),
    );
  };
  r.get(R, (req, res) => res.json(uc.catalog(access.canAudit(req))));
  r.get(`${R}/:key`, async (req, res) => {
    const out = await go(req);
    res.json({ definition: out.definition, columns: out.columns, rows: out.rows.map(({ employeeId: _e, ...rest }) => rest) });
  });
  r.get(`${R}/:key/csv`, async (req, res) => {
    const out = await go(req);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="relatorio-${out.definition.key}.csv"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(out.csv());
  });
  return r;
}
