import { Router, type Request } from "express";
import { assertIfMatch, etagFor, setEtag } from "../../../../infra/http/etag.js";
import { idempotency, type IdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problem } from "../../../../infra/http/problem-details.js";
import type { EmploymentUseCases } from "../../application/use-cases/employment.use-cases.js";
import { EXPORT_COLUMNS, IMPORT_COLUMNS, type PeopleUseCases } from "../../application/use-cases/people.use-cases.js";
import type { ContractInput, ManagerLink } from "../../domain/entities/employment.js";
import { PeopleConflictError, PeopleForbiddenError, PeopleNotFoundError, PeopleRuleViolation, PeopleValidationError } from "../../domain/errors.js";
import type { Viewer } from "../../domain/ports/in/people.ports.js";

const s = (v: unknown): string => (typeof v === "string" ? v : "");
const optS = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const optN = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

function toProblem(e: unknown): unknown {
  if (e instanceof PeopleValidationError) return problem(400, "validation_error", e.message, { field: e.field });
  if (e instanceof PeopleConflictError) return problem(409, e.code, e.message, { ...(e.field && { field: e.field }) });
  if (e instanceof PeopleRuleViolation) return problem(422, "rule_violation", e.message, { rule: e.rule });
  if (e instanceof PeopleForbiddenError) return problem(403, "forbidden_field", e.message, { ...(e.field && { field: e.field }) });
  if (e instanceof PeopleNotFoundError) return problem(404, "not_found", e.message);
  return e;
}
async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw toProblem(e);
  }
}

function contractInput(b: Record<string, unknown>): ContractInput {
  return {
    contractType: s(b.contractType) as ContractInput["contractType"],
    code: optS(b.code),
    startDate: s(b.startDate),
    endDate: optS(b.endDate),
    seniorityDate: optS(b.seniorityDate),
    probationEnd: optS(b.probationEnd),
    weeklyHours: optN(b.weeklyHours),
    fte: optN(b.fte),
    agreementId: optS(b.agreementId),
    remote: b.remote === true,
    comment: optS(b.comment),
  };
}

/**
 * Novo RH → Pessoas (`/api/novo-rh/people`, permissão `hr.employees`;
 * exportação `hr.people_export`) e catálogos (`/api/novo-rh/catalog`,
 * `company.structure`). Escritas com Idempotency-Key; ficha e contratos com If-Match.
 */
export class PeopleController {
  readonly router: Router;

  constructor(
    people: PeopleUseCases,
    employment: EmploymentUseCases,
    store: IdempotencyStore,
    viewerOf: (req: Request) => Promise<Viewer>,
  ) {
    const r = Router();
    const P = "/novo-rh/people";
    const C = "/novo-rh/catalog";
    r.use(P, idempotency(store, { required: true }));
    r.use(C, idempotency(store, { required: true }));
    const org = (req: Request) => req.auth!.orgId;
    const id = (req: Request) => req.params.id as string;

    // ── Portal: o meu perfil (só identificação, nunca campos sensíveis) ──
    r.get("/me/profile", async (req, res) => res.json(await run(() => people.myProfile(org(req), req.auth!.sub))));

    // ── Lista, exportação, importação ────────────────────────────────
    r.get(P, async (req, res) => {
      const status = s(req.query.status);
      const viewer = await viewerOf(req);
      res.json(
        await run(() =>
          people.list(org(req), viewer, {
            status: status === "inactive" || status === "all" ? status : "active",
            ...(optS(req.query.q) && { q: optS(req.query.q)! }),
            ...(optS(req.query.locationId) && { locationId: optS(req.query.locationId)! }),
          }),
        ),
      );
    });
    r.get(`${P}/export-columns`, (_req, res) => {
      res.json({ export: EXPORT_COLUMNS, import: IMPORT_COLUMNS.map((c) => c.header) });
    });
    r.get(`${P}/export.csv`, async (req, res) => {
      const viewer = await viewerOf(req);
      const columns = s(req.query.columns).split(",").filter(Boolean);
      const out = await run(() => people.exportCsv(org(req), viewer, { columns, includeInactive: req.query.includeInactive === "1" }));
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="colaboradores.csv"');
      res.send(out.csv);
    });
    r.post(`${P}/import`, async (req, res) => {
      const viewer = await viewerOf(req);
      res.json(await run(() => people.importCsv(org(req), viewer, s(req.body?.csv), req.body?.dryRun !== false)));
    });

    // ── Ficha ────────────────────────────────────────────────────────
    r.post(P, async (req, res) => {
      const viewer = await viewerOf(req);
      const created = await run(() => people.create(org(req), viewer, (req.body ?? {}) as Record<string, unknown>));
      setEtag(res, etagFor(created.version));
      res.status(201).json(created);
    });
    r.get(`${P}/:id`, async (req, res) => {
      const viewer = await viewerOf(req);
      const e = await run(() => people.get(org(req), viewer, id(req)));
      setEtag(res, etagFor(e.version));
      res.json(e);
    });
    r.patch(`${P}/:id`, async (req, res) => {
      const viewer = await viewerOf(req);
      const b = (req.body ?? {}) as Record<string, unknown>;
      const updated = await run(async () => {
        const cur = await people.get(org(req), viewer, id(req));
        assertIfMatch(req, etagFor(cur.version));
        const { reason, ...fields } = b;
        return people.update(org(req), viewer, id(req), fields, cur.version, optS(reason));
      });
      setEtag(res, etagFor(updated.version));
      res.json(updated);
    });
    // PIN do quiosque (permissão hr.kiosk_pin): nunca volta na resposta.
    r.put(`${P}/:id/kiosk-pin`, async (req, res) => {
      const viewer = await viewerOf(req);
      await run(() => people.setKioskPin(org(req), viewer, id(req), s(req.body?.pin)));
      res.json({ ok: true });
    });
    for (const action of ["deactivate", "reactivate"] as const) {
      r.post(`${P}/:id/${action}`, async (req, res) => {
        const viewer = await viewerOf(req);
        const out = await run(async () => {
          const cur = await people.get(org(req), viewer, id(req));
          assertIfMatch(req, etagFor(cur.version));
          return people[action](org(req), viewer, id(req), s(req.body?.reason), cur.version);
        });
        setEtag(res, etagFor(out.version));
        res.json(out);
      });
    }

    // ── Contratos ────────────────────────────────────────────────────
    r.get(`${P}/:id/contracts`, async (req, res) => {
      const viewer = await viewerOf(req);
      const list = await run(() => employment.listContracts(org(req), viewer, id(req)));
      res.json(list.map((c) => ({ ...c, etag: etagFor(c.version) })));
    });
    r.post(`${P}/:id/contracts`, async (req, res) => {
      const viewer = await viewerOf(req);
      res.status(201).json(await run(() => employment.createContract(org(req), viewer, id(req), contractInput((req.body ?? {}) as Record<string, unknown>))));
    });
    r.patch(`${P}/:id/contracts/:cid`, async (req, res) => {
      const viewer = await viewerOf(req);
      const cid = req.params.cid as string;
      res.json(
        await run(async () => {
          const cur = (await employment.listContracts(org(req), viewer, id(req))).find((c) => c.id === cid);
          if (!cur) throw new PeopleNotFoundError("Contrato não encontrado.");
          assertIfMatch(req, etagFor(cur.version));
          return employment.updateContract(org(req), viewer, id(req), cid, contractInput((req.body ?? {}) as Record<string, unknown>), cur.version, s(req.body?.reason));
        }),
      );
    });
    r.post(`${P}/:id/contracts/:cid/cancel`, async (req, res) => {
      const viewer = await viewerOf(req);
      const cid = req.params.cid as string;
      res.json(
        await run(async () => {
          const cur = (await employment.listContracts(org(req), viewer, id(req))).find((c) => c.id === cid);
          if (!cur) throw new PeopleNotFoundError("Contrato não encontrado.");
          assertIfMatch(req, etagFor(cur.version));
          return employment.cancelContract(org(req), viewer, id(req), cid, cur.version, s(req.body?.reason));
        }),
      );
    });

    // ── Responsáveis ─────────────────────────────────────────────────
    r.get(`${P}/:id/managers`, async (req, res) => {
      res.json(await run(async () => employment.listManagers(org(req), await viewerOf(req), id(req))));
    });
    r.post(`${P}/:id/managers`, async (req, res) => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const input: Omit<ManagerLink, "id"> = {
        employeeId: id(req),
        managerEmployeeId: s(b.managerEmployeeId),
        kind: s(b.kind) as ManagerLink["kind"],
        level: Number(b.level ?? 1),
        validFrom: s(b.validFrom),
        validTo: optS(b.validTo),
      };
      res.status(201).json(await run(async () => employment.addManager(org(req), await viewerOf(req), input)));
    });
    r.post(`${P}/:id/managers/:mid/end`, async (req, res) => {
      res.json(await run(async () => employment.endManager(org(req), await viewerOf(req), id(req), req.params.mid as string, s(req.body?.validTo))));
    });

    /** Organograma: chefias diretas em vigor num dia (omisso = hoje), entre quem se pode ver. */
    r.get("/novo-rh/org-chart", async (req, res) => {
      const date = typeof req.query.date === "string" && req.query.date ? req.query.date : new Date().toISOString().slice(0, 10);
      res.json(await run(async () => employment.orgChart(org(req), await viewerOf(req), date)));
    });
    /** Organograma: mudar a chefia direta (termina a atual na véspera e cria a nova). */
    r.put(`${P}/:id/direct-manager`, async (req, res) => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const managerEmployeeId = b.managerEmployeeId === null || b.managerEmployeeId === undefined || b.managerEmployeeId === "" ? null : s(b.managerEmployeeId);
      res.json(await run(async () => employment.setDirectManager(org(req), await viewerOf(req), id(req), managerEmployeeId, s(b.validFrom))));
    });

    // ── Remuneração ──────────────────────────────────────────────────
    r.get(`${P}/:id/compensations`, async (req, res) => {
      res.json(await run(async () => employment.listEmployeeCompensations(org(req), await viewerOf(req), id(req))));
    });
    r.post(`${P}/:id/compensations`, async (req, res) => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const input = { employeeId: id(req), itemId: s(b.itemId), amount: optN(b.amount), validFrom: s(b.validFrom), validTo: optS(b.validTo) };
      res.status(201).json(await run(async () => employment.assignCompensation(org(req), await viewerOf(req), input)));
    });
    r.post(`${P}/:id/compensations/:aid/end`, async (req, res) => {
      res.json(await run(async () => employment.endCompensation(org(req), await viewerOf(req), id(req), req.params.aid as string, s(req.body?.validTo))));
    });

    // ── Campos personalizados ────────────────────────────────────────
    r.get(`${P}/:id/custom-fields`, async (req, res) => {
      res.json(await run(async () => employment.getCustomValues(org(req), await viewerOf(req), id(req))));
    });
    r.put(`${P}/:id/custom-fields`, async (req, res) => {
      const values = (req.body?.values ?? {}) as Record<string, string | null>;
      res.json(await run(async () => employment.setCustomValues(org(req), await viewerOf(req), id(req), values)));
    });

    // ── Catálogos (convénios, complementos/benefícios, campos) ────────
    const actor = (req: Request) => req.auth!.email || req.auth!.sub;
    r.get(`${C}/locations`, async (req, res) => {
      res.json(await employment.listLocations(org(req)));
    });
    r.get(`${C}/positions`, async (req, res) => {
      res.json(await employment.listPositions(org(req)));
    });
    r.get(`${C}/agreements`, async (req, res) => {
      res.json(await employment.listAgreements(org(req)));
    });
    r.post(`${C}/agreements`, async (req, res) => {
      res.status(201).json(await run(() => employment.createAgreement(org(req), actor(req), { name: s(req.body?.name), code: optS(req.body?.code) })));
    });
    r.post(`${C}/agreements/:id/archive`, async (req, res) => {
      await run(() => employment.archiveAgreement(org(req), actor(req), id(req)));
      res.json({ ok: true });
    });
    r.get(`${C}/compensation-items`, async (req, res) => {
      res.json(await employment.listCompensationItems(org(req)));
    });
    r.post(`${C}/compensation-items`, async (req, res) => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const input = {
        kind: s(b.kind) as "complement" | "benefit",
        name: s(b.name),
        code: optS(b.code),
        mode: s(b.mode) as "fixed",
        amount: Number(b.amount ?? 0),
        employeeAmount: optN(b.employeeAmount),
        currency: (optS(b.currency) ?? "EUR").toUpperCase(),
        payPeriod: (optS(b.payPeriod) ?? "monthly") as "monthly",
        everyNMonths: Number(b.everyNMonths ?? 1),
      };
      res.status(201).json(await run(() => employment.createCompensationItem(org(req), actor(req), input)));
    });
    r.post(`${C}/compensation-items/:id/deactivate`, async (req, res) => {
      await run(() => employment.deactivateCompensationItem(org(req), actor(req), id(req)));
      res.json({ ok: true });
    });
    r.get(`${C}/custom-fields`, async (req, res) => {
      res.json(await employment.listCustomFields(org(req)));
    });
    r.post(`${C}/custom-fields`, async (req, res) => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const input = {
        section: s(b.section) as "custom",
        name: s(b.name),
        format: s(b.format) as "text",
        options: Array.isArray(b.options) ? (b.options as unknown[]).map(String) : [],
        sensitive: b.sensitive === true,
      };
      res.status(201).json(await run(() => employment.createCustomField(org(req), actor(req), input)));
    });
    r.post(`${C}/custom-fields/:id/archive`, async (req, res) => {
      await run(() => employment.archiveCustomField(org(req), actor(req), id(req)));
      res.json({ ok: true });
    });

    this.router = r;
  }
}
