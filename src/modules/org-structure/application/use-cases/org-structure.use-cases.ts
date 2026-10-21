import type { OrganizationId } from "../../../../kernel/organization-id.js";
import {
  activeOn,
  cleanName,
  CONTACT_ROLES,
  OrgStructureError,
  OrgStructureNotFound,
  overlapsExisting,
  validateContact,
  validateGroupFields,
  validatePeriod,
  wouldCreateCycle,
  type Assignment,
  type ContactRole,
  type UnitType,
} from "../../domain/entities/org-structure.js";
import type { GroupInput, OrgStructurePorts } from "../../domain/ports/in/org-structure.ports.js";
import type { OrgStructureAuditPort, OrgStructureRepositoryPort, RequestIpPort } from "../../domain/ports/out/org-structure.ports.js";

const lower = (s: string) => s.toLocaleLowerCase("pt");

/** Validade da cache de unidades (ver `unitsData`). */
const UNITS_TTL_MS = 30_000;

export class OrgStructureUseCases implements OrgStructurePorts {
  constructor(
    private readonly repo: OrgStructureRepositoryPort,
    private readonly audit: OrgStructureAuditPort,
    private readonly ip: RequestIpPort,
    private readonly today: (orgId: OrganizationId) => Promise<string> = async () => new Date().toISOString().slice(0, 10),
    private readonly now: () => number = () => Date.now(),
  ) {}

  /**
   * Departamentos, grupos e todas as pertenças da organização, em memória
   * ${UNITS_TTL_MS / 1000} s. Só este módulo escreve nestas tabelas e cada escrita
   * limpa a cache. Antes, cada colaborador × dia lia três tabelas (o motor de
   * configurações pede as unidades de cada pessoa em cada data).
   */
  private readonly unitsCache = new Map<string, { at: number; value: Promise<{ deps: Awaited<ReturnType<OrgStructureRepositoryPort["listDepartments"]>>; groups: Awaited<ReturnType<OrgStructureRepositoryPort["listGroups"]>>; assignments: Awaited<ReturnType<OrgStructureRepositoryPort["listAssignments"]>> }> }>();
  private unitsData(orgId: OrganizationId) {
    const hit = this.unitsCache.get(orgId);
    if (hit && this.now() - hit.at < UNITS_TTL_MS) return hit.value;
    const value = Promise.all([this.repo.listDepartments(orgId), this.repo.listGroups(orgId), this.repo.listAssignments(orgId, {})]).then(([deps, groups, assignments]) => ({ deps, groups, assignments }));
    this.unitsCache.set(orgId, { at: this.now(), value });
    value.catch(() => this.unitsCache.delete(orgId));
    return value;
  }
  private changed(orgId: OrganizationId) {
    this.unitsCache.delete(orgId);
  }

  listDepartments(orgId: OrganizationId) {
    return this.repo.listDepartments(orgId);
  }

  async createDepartment(orgId: OrganizationId, rawName: string, actor: string) {
    const name = cleanName(rawName);
    const all = await this.repo.listDepartments(orgId);
    if (all.some((d) => !d.archived && lower(d.name) === lower(name))) throw new OrgStructureError("Já existe um departamento com este nome.", "name");
    const dep = await this.repo.createDepartment(orgId, { name, createdBy: actor });
    this.changed(orgId);
    await this.audit.record(orgId, { actor, action: "structure.department.create", resourceType: "org_department", resourceId: dep.id, before: null, after: dep, reason: null });
    return dep;
  }

  async updateDepartment(orgId: OrganizationId, id: string, patch: { name?: string; archived?: boolean }, actor: string) {
    const all = await this.repo.listDepartments(orgId);
    const cur = all.find((d) => d.id === id);
    if (!cur) throw new OrgStructureNotFound("Departamento não encontrado.");
    const next: { name?: string; archived?: boolean } = {};
    if (patch.name !== undefined) {
      next.name = cleanName(patch.name);
      if (all.some((d) => d.id !== id && !d.archived && lower(d.name) === lower(next.name!))) throw new OrgStructureError("Já existe um departamento com este nome.", "name");
    }
    if (patch.archived !== undefined) next.archived = patch.archived;
    const dep = await this.repo.updateDepartment(orgId, id, next);
    this.changed(orgId);
    await this.audit.record(orgId, {
      actor,
      action: patch.archived === true ? "structure.department.archive" : "structure.department.update",
      resourceType: "org_department",
      resourceId: id,
      before: cur,
      after: dep,
      reason: null,
    });
    return dep;
  }

  listGroups(orgId: OrganizationId) {
    return this.repo.listGroups(orgId);
  }

  async createGroup(orgId: OrganizationId, input: GroupInput, actor: string) {
    const g = { ...input, name: cleanName(input.name), code: input.code.trim() };
    validateGroupFields(g);
    const all = await this.repo.listGroups(orgId);
    if (all.some((x) => !x.archived && lower(x.code) === lower(g.code))) throw new OrgStructureError("Já existe um grupo com este código.", "code");
    if (g.parentId && !all.some((x) => x.id === g.parentId && !x.archived)) throw new OrgStructureError("Grupo-pai não encontrado.", "parentId");
    const created = await this.repo.createGroup(orgId, { ...g, createdBy: actor });
    this.changed(orgId);
    await this.audit.record(orgId, { actor, action: "structure.group.create", resourceType: "org_group", resourceId: created.id, before: null, after: created, reason: null });
    return created;
  }

  async updateGroup(orgId: OrganizationId, id: string, patch: Partial<GroupInput> & { archived?: boolean }, actor: string) {
    const all = await this.repo.listGroups(orgId);
    const cur = all.find((g) => g.id === id);
    if (!cur) throw new OrgStructureNotFound("Grupo não encontrado.");
    const merged = {
      code: patch.code !== undefined ? patch.code.trim() : cur.code,
      color: patch.color !== undefined ? patch.color : cur.color,
      description: patch.description !== undefined ? patch.description : cur.description,
    };
    validateGroupFields(merged);
    const next: Partial<GroupInput> & { archived?: boolean } = { ...patch, ...(patch.code !== undefined && { code: merged.code }) };
    if (patch.name !== undefined) next.name = cleanName(patch.name);
    if (patch.code !== undefined && all.some((x) => x.id !== id && !x.archived && lower(x.code) === lower(merged.code))) {
      throw new OrgStructureError("Já existe um grupo com este código.", "code");
    }
    if (patch.parentId !== undefined) {
      if (patch.parentId && !all.some((x) => x.id === patch.parentId && !x.archived)) throw new OrgStructureError("Grupo-pai não encontrado.", "parentId");
      if (wouldCreateCycle(all, id, patch.parentId)) throw new OrgStructureError("Um grupo não pode ficar dentro de si próprio nem de um subgrupo seu.", "parentId");
    }
    if (patch.archived === true && all.some((x) => x.parentId === id && !x.archived)) {
      throw new OrgStructureError("Arquive primeiro os subgrupos.", "archived");
    }
    const updated = await this.repo.updateGroup(orgId, id, next);
    this.changed(orgId);
    await this.audit.record(orgId, {
      actor,
      action: patch.archived === true ? "structure.group.archive" : "structure.group.update",
      resourceType: "org_group",
      resourceId: id,
      before: cur,
      after: updated,
      reason: null,
    });
    return updated;
  }

  listAssignments(orgId: OrganizationId, filter: { employeeId?: string; unitType?: UnitType; unitId?: string }) {
    return this.repo.listAssignments(orgId, filter);
  }

  async assign(orgId: OrganizationId, input: Omit<Assignment, "id">, actor: string) {
    if (input.unitType !== "department" && input.unitType !== "group") {
      throw new OrgStructureError(input.unitType === "location" ? "Para mudar de centro use a transferência." : "Tipo de unidade inválido.", "unitType");
    }
    validatePeriod(input.validFrom, input.validTo);
    if (!(await this.repo.employeeExists(orgId, input.employeeId))) throw new OrgStructureNotFound("Colaborador não encontrado.");
    const units = input.unitType === "department" ? await this.repo.listDepartments(orgId) : await this.repo.listGroups(orgId);
    if (!units.some((u) => u.id === input.unitId && !u.archived)) throw new OrgStructureNotFound("Unidade não encontrada.");
    const existing = await this.repo.listAssignments(orgId, { employeeId: input.employeeId });
    if (overlapsExisting(existing, input)) throw new OrgStructureError("O colaborador já pertence a esta unidade nesse período.", "validFrom");
    const a = await this.repo.createAssignment(orgId, { ...input, createdBy: actor });
    this.changed(orgId);
    await this.audit.record(orgId, { actor, action: "structure.assignment.create", resourceType: "employee", resourceId: input.employeeId, before: null, after: a, reason: null });
    return a;
  }

  async endAssignment(orgId: OrganizationId, id: string, validTo: string, actor: string) {
    const all = await this.repo.listAssignments(orgId, {});
    const cur = all.find((a) => a.id === id);
    if (!cur) throw new OrgStructureNotFound("Pertença não encontrada.");
    validatePeriod(cur.validFrom, validTo);
    if (cur.validTo !== null && validTo > cur.validTo) throw new OrgStructureError("Só se pode encurtar a vigência.", "validTo");
    const a = await this.repo.endAssignment(orgId, id, validTo);
    this.changed(orgId);
    await this.audit.record(orgId, { actor, action: "structure.assignment.end", resourceType: "employee", resourceId: cur.employeeId, before: cur, after: a, reason: null });
    return a;
  }

  listContacts(orgId: OrganizationId) {
    return this.repo.listContacts(orgId);
  }

  async setContact(orgId: OrganizationId, role: ContactRole, input: { name: string; email: string | null; phone: string | null }, actor: string) {
    if (!CONTACT_ROLES.includes(role)) throw new OrgStructureError("Função de contacto desconhecida.", "role");
    const c = { name: (input.name ?? "").trim(), email: input.email?.trim() || null, phone: input.phone?.trim() || null };
    validateContact(c);
    const before = (await this.repo.listContacts(orgId)).find((x) => x.role === role) ?? null;
    const saved = await this.repo.upsertContact(orgId, { role, ...c, createdBy: actor });
    await this.audit.record(orgId, { actor, action: "structure.contact.set", resourceType: "org_contact", resourceId: role, before, after: saved, reason: null });
    return saved;
  }

  listTermsAcceptances(orgId: OrganizationId) {
    return this.repo.listTermsAcceptances(orgId);
  }

  async acceptTerms(orgId: OrganizationId, version: string, actor: string) {
    const v = (version ?? "").trim();
    if (!v || v.length > 40) throw new OrgStructureError("Versão dos termos obrigatória.", "version");
    const t = await this.repo.acceptTerms(orgId, { version: v, acceptedBy: actor, ip: this.ip.current() });
    await this.audit.record(orgId, { actor, action: "structure.terms.accept", resourceType: "org_terms", resourceId: t.id, before: null, after: t, reason: null });
    return t;
  }

  async transfer(orgId: OrganizationId, employeeId: string, locationId: string, effectiveDate: string, actor: string, reason: string) {
    validatePeriod(effectiveDate, null);
    if (!reason.trim()) throw new OrgStructureError("O motivo é obrigatório.", "reason");
    const info = await this.repo.employeeLocationInfo(orgId, employeeId);
    if (!info) throw new OrgStructureNotFound("Colaborador não encontrado.");
    if (!(await this.repo.listActiveLocationIds(orgId)).includes(locationId)) throw new OrgStructureNotFound("Centro não encontrado.");
    let history = (await this.repo.listAssignments(orgId, { employeeId })).filter((a) => a.unitType === "location");
    if (history.some((a) => a.validFrom >= effectiveDate)) throw new OrgStructureError("Já existe uma mudança de centro nessa data ou depois.", "effectiveDate");

    // Primeira transferência: o centro atual passa a ter vigência até à véspera (TK-10).
    if (history.length === 0 && info.primaryLocationId) {
      const from = info.hireDate && info.hireDate < effectiveDate ? info.hireDate : "2000-01-01";
      history = [await this.repo.createAssignment(orgId, { employeeId, unitType: "location", unitId: info.primaryLocationId, validFrom: from, validTo: null, createdBy: actor })];
    }
    const current = history.find((a) => activeOn(a, effectiveDate));
    if (current?.unitId === locationId) throw new OrgStructureError("O colaborador já está neste centro nessa data.", "locationId");
    const dayBefore = new Date(Date.parse(`${effectiveDate}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    if (current) await this.repo.endAssignment(orgId, current.id, dayBefore);
    const next = await this.repo.createAssignment(orgId, { employeeId, unitType: "location", unitId: locationId, validFrom: effectiveDate, validTo: null, createdBy: actor });
    this.changed(orgId);
    // O RH atual lê o centro principal: só muda quando a data chega (transferências futuras: ver dívida no README).
    if (effectiveDate <= (await this.today(orgId))) await this.repo.setPrimaryLocation(orgId, employeeId, locationId);
    await this.audit.record(orgId, {
      actor,
      action: "structure.employee.transfer",
      resourceType: "employee",
      resourceId: employeeId,
      before: { locationId: current?.unitId ?? info.primaryLocationId },
      after: { locationId, effectiveDate },
      reason: reason.trim(),
    });
    return next;
  }

  async membersOf(orgId: OrganizationId, unitType: UnitType, unitIds: string[], date: string) {
    if (unitIds.length === 0) return [];
    const rows = await this.repo.listAssignments(orgId, { unitType });
    return [...new Set(rows.filter((a) => unitIds.includes(a.unitId) && activeOn(a, date)).map((a) => a.employeeId))];
  }

  async unitsOf(orgId: OrganizationId, employeeId: string, date: string) {
    const { assignments, deps, groups } = await this.unitsData(orgId);
    const rows = assignments.filter((a) => a.employeeId === employeeId);
    // Unidades arquivadas deixam de contar; só a pertença direta (o subgrupo não herda o grupo-pai).
    const liveDeps = new Set(deps.filter((d) => !d.archived).map((d) => d.id));
    const liveGroups = new Set(groups.filter((g) => !g.archived).map((g) => g.id));
    const active = rows.filter((a) => activeOn(a, date));
    const hasLocationHistory = rows.some((a) => a.unitType === "location");
    return {
      departmentIds: active.filter((a) => a.unitType === "department" && liveDeps.has(a.unitId)).map((a) => a.unitId),
      groupIds: active.filter((a) => a.unitType === "group" && liveGroups.has(a.unitId)).map((a) => a.unitId),
      locationIds: hasLocationHistory ? active.filter((a) => a.unitType === "location").map((a) => a.unitId) : null,
    };
  }
}
