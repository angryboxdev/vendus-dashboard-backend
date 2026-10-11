import { Router, type Request } from "express";
import { assertIfMatch, etagFor } from "../../../../infra/http/etag.js";
import { idempotency, type IdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problem } from "../../../../infra/http/problem-details.js";
import { OrgStructureError, OrgStructureNotFound, type ContactRole, type UnitType } from "../../domain/entities/org-structure.js";
import type { GroupInput, OrgStructurePorts } from "../../domain/ports/in/org-structure.ports.js";

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const optStr = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function toProblem(e: unknown): unknown {
  if (e instanceof OrgStructureError) return problem(400, "validation_error", e.message, { field: e.field });
  if (e instanceof OrgStructureNotFound) return problem(404, "not_found", e.message);
  return e;
}
async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw toProblem(e);
  }
}
/** Cada item leva o seu ETag (versão = updated_at) para o If-Match da alteração. */
const withEtag = <T extends { updatedAt: string }>(x: T) => ({ ...x, etag: etagFor(x.updatedAt) });

function groupPatch(b: Record<string, unknown>): Partial<GroupInput> & { archived?: boolean } {
  const p: Partial<GroupInput> & { archived?: boolean } = {};
  if ("parentId" in b) p.parentId = optStr(b.parentId);
  if ("code" in b) p.code = str(b.code);
  if ("name" in b) p.name = str(b.name);
  if ("color" in b) p.color = optStr(b.color);
  if ("description" in b) p.description = optStr(b.description);
  if ("hidden" in b) p.hidden = b.hidden === true;
  if ("archived" in b) p.archived = b.archived === true;
  return p;
}

/**
 * Novo RH → Estrutura em `/api/novo-rh/structure` (permissão `company.structure`).
 * Escritas com Idempotency-Key; alterações a departamento/grupo com If-Match.
 */
export class OrgStructureController {
  readonly router: Router;

  constructor(
    private readonly s: OrgStructurePorts,
    idempotencyStore: IdempotencyStore,
    private readonly actorOf: (req: Request) => string,
    /** Âmbito (RE-34): fora do âmbito → 404. */
    private readonly canSeeEmployee: (req: Request, employeeId: string, date: string) => Promise<boolean> = async () => true,
  ) {
    const r = Router();
    const base = "/novo-rh/structure";
    r.use(base, idempotency(idempotencyStore, { required: true }));
    const org = (req: Request) => req.auth!.orgId;

    r.get(`${base}/departments`, async (req, res) => {
      res.json((await this.s.listDepartments(org(req))).map(withEtag));
    });
    r.post(`${base}/departments`, async (req, res) => {
      res.status(201).json(withEtag(await run(() => this.s.createDepartment(org(req), str(req.body?.name), this.actorOf(req)))));
    });
    r.patch(`${base}/departments/:id`, async (req, res) => {
      const id = req.params.id as string;
      const b = (req.body ?? {}) as Record<string, unknown>;
      const updated = await run(async () => {
        const cur = (await this.s.listDepartments(org(req))).find((d) => d.id === id);
        if (!cur) throw new OrgStructureNotFound("Departamento não encontrado.");
        assertIfMatch(req, etagFor(cur.updatedAt));
        return this.s.updateDepartment(org(req), id, { ...("name" in b && { name: str(b.name) }), ...("archived" in b && { archived: b.archived === true }) }, this.actorOf(req));
      });
      res.json(withEtag(updated));
    });

    r.get(`${base}/groups`, async (req, res) => {
      res.json((await this.s.listGroups(org(req))).map(withEtag));
    });
    r.post(`${base}/groups`, async (req, res) => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const input: GroupInput = {
        parentId: optStr(b.parentId),
        code: str(b.code),
        name: str(b.name),
        color: optStr(b.color),
        description: optStr(b.description),
        hidden: b.hidden === true,
      };
      res.status(201).json(withEtag(await run(() => this.s.createGroup(org(req), input, this.actorOf(req)))));
    });
    r.patch(`${base}/groups/:id`, async (req, res) => {
      const id = req.params.id as string;
      const updated = await run(async () => {
        const cur = (await this.s.listGroups(org(req))).find((g) => g.id === id);
        if (!cur) throw new OrgStructureNotFound("Grupo não encontrado.");
        assertIfMatch(req, etagFor(cur.updatedAt));
        return this.s.updateGroup(org(req), id, groupPatch((req.body ?? {}) as Record<string, unknown>), this.actorOf(req));
      });
      res.json(withEtag(updated));
    });

    r.get(`${base}/assignments`, async (req, res) => {
      const f: { employeeId?: string; unitType?: UnitType; unitId?: string } = {};
      if (str(req.query.employeeId)) {
        f.employeeId = str(req.query.employeeId);
        if (!(await this.canSeeEmployee(req, f.employeeId, new Date().toISOString().slice(0, 10)))) throw problem(404, "not_found", "Colaborador não encontrado.");
      }
      if (str(req.query.unitType) === "department" || str(req.query.unitType) === "group") f.unitType = str(req.query.unitType) as UnitType;
      if (str(req.query.unitId)) f.unitId = str(req.query.unitId);
      res.json(await this.s.listAssignments(org(req), f));
    });
    r.post(`${base}/assignments`, async (req, res) => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const input = { employeeId: str(b.employeeId), unitType: str(b.unitType) as UnitType, unitId: str(b.unitId), validFrom: str(b.validFrom), validTo: optStr(b.validTo) };
      if (!(await this.canSeeEmployee(req, input.employeeId, input.validFrom))) throw problem(404, "not_found", "Colaborador não encontrado.");
      res.status(201).json(await run(() => this.s.assign(org(req), input, this.actorOf(req))));
    });
    r.post(`${base}/assignments/:id/end`, async (req, res) => {
      res.json(await run(() => this.s.endAssignment(org(req), req.params.id as string, str(req.body?.validTo), this.actorOf(req))));
    });

    r.get(`${base}/contacts`, async (req, res) => {
      res.json(await this.s.listContacts(org(req)));
    });
    r.put(`${base}/contacts/:role`, async (req, res) => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      res.json(await run(() => this.s.setContact(org(req), req.params.role as ContactRole, { name: str(b.name), email: optStr(b.email), phone: optStr(b.phone) }, this.actorOf(req))));
    });

    r.get(`${base}/terms`, async (req, res) => {
      res.json(await this.s.listTermsAcceptances(org(req)));
    });
    r.post(`${base}/terms/accept`, async (req, res) => {
      res.status(201).json(await run(() => this.s.acceptTerms(org(req), str(req.body?.version), this.actorOf(req))));
    });

    this.router = r;
  }
}
