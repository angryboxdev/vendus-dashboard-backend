import { currentRequestContext } from "../../../../infra/http/correlation.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Assignment, Contact, ContactRole, Department, Group, TermsAcceptance, UnitType } from "../../domain/entities/org-structure.js";
import type { OrgStructureRepositoryPort, RequestIpPort } from "../../domain/ports/out/org-structure.ports.js";

type Res<T> = { data: T | null; error: { message: string } | null };
function check<T>(res: Res<unknown>): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

const DEP = "id, name, archived, updated_at";
const GRP = "id, parent_id, code, name, color, description, hidden, archived, updated_at";
const ASG = "id, employee_id, unit_type, unit_id, valid_from, valid_to";
const CON = "role, name, email, phone, updated_at";
const TRM = "id, document, version, accepted_by, accepted_at, ip";

interface DepRow { id: string; name: string; archived: boolean; updated_at: string }
interface GrpRow { id: string; parent_id: string | null; code: string; name: string; color: string | null; description: string | null; hidden: boolean; archived: boolean; updated_at: string }
interface AsgRow { id: string; employee_id: string; unit_type: UnitType; unit_id: string; valid_from: string; valid_to: string | null }
interface ConRow { role: ContactRole; name: string; email: string | null; phone: string | null; updated_at: string }
interface TrmRow { id: string; document: "terms_and_dpa"; version: string; accepted_by: string; accepted_at: string; ip: string | null }

const dep = (r: DepRow): Department => ({ id: r.id, name: r.name, archived: r.archived, updatedAt: r.updated_at });
const grp = (r: GrpRow): Group => ({
  id: r.id,
  parentId: r.parent_id,
  code: r.code,
  name: r.name,
  color: r.color,
  description: r.description,
  hidden: r.hidden,
  archived: r.archived,
  updatedAt: r.updated_at,
});
const asg = (r: AsgRow): Assignment => ({ id: r.id, employeeId: r.employee_id, unitType: r.unit_type, unitId: r.unit_id, validFrom: r.valid_from, validTo: r.valid_to });
const con = (r: ConRow): Contact => ({ role: r.role, name: r.name, email: r.email, phone: r.phone, updatedAt: r.updated_at });
const trm = (r: TrmRow): TermsAcceptance => ({ id: r.id, document: r.document, version: r.version, acceptedBy: r.accepted_by, acceptedAt: r.accepted_at, ip: r.ip });

export class SupabaseOrgStructureRepository implements OrgStructureRepositoryPort {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  async listDepartments(orgId: OrganizationId) {
    return check<DepRow[]>(await this.scoped(orgId).table("org_departments").select(DEP).order("name")).map(dep);
  }
  async createDepartment(orgId: OrganizationId, input: { name: string; createdBy: string }) {
    return dep(check<DepRow>(await this.scoped(orgId).table("org_departments").insert({ name: input.name, created_by: input.createdBy }).select(DEP).single()));
  }
  async updateDepartment(orgId: OrganizationId, id: string, patch: { name?: string; archived?: boolean }) {
    const row = { ...patch, updated_at: new Date().toISOString() };
    return dep(check<DepRow>(await this.scoped(orgId).table("org_departments").update(row).eq("id", id).select(DEP).single()));
  }

  async listGroups(orgId: OrganizationId) {
    return check<GrpRow[]>(await this.scoped(orgId).table("org_groups").select(GRP).order("name")).map(grp);
  }
  async createGroup(orgId: OrganizationId, input: Omit<Group, "id" | "archived" | "updatedAt"> & { createdBy: string }) {
    const row = {
      parent_id: input.parentId,
      code: input.code,
      name: input.name,
      color: input.color,
      description: input.description,
      hidden: input.hidden,
      created_by: input.createdBy,
    };
    return grp(check<GrpRow>(await this.scoped(orgId).table("org_groups").insert(row).select(GRP).single()));
  }
  async updateGroup(orgId: OrganizationId, id: string, patch: Partial<Omit<Group, "id" | "updatedAt">>) {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.parentId !== undefined) row.parent_id = patch.parentId;
    for (const k of ["code", "name", "color", "description", "hidden", "archived"] as const) if (patch[k] !== undefined) row[k] = patch[k];
    return grp(check<GrpRow>(await this.scoped(orgId).table("org_groups").update(row).eq("id", id).select(GRP).single()));
  }

  async listAssignments(orgId: OrganizationId, filter: { employeeId?: string; unitType?: UnitType; unitId?: string }) {
    let q = this.scoped(orgId).table("employee_org_assignments").select(ASG);
    if (filter.employeeId) q = q.eq("employee_id", filter.employeeId);
    if (filter.unitType) q = q.eq("unit_type", filter.unitType);
    if (filter.unitId) q = q.eq("unit_id", filter.unitId);
    return check<AsgRow[]>(await q.order("valid_from")).map(asg);
  }
  async createAssignment(orgId: OrganizationId, input: Omit<Assignment, "id"> & { createdBy: string }) {
    const row = {
      employee_id: input.employeeId,
      unit_type: input.unitType,
      unit_id: input.unitId,
      valid_from: input.validFrom,
      valid_to: input.validTo,
      created_by: input.createdBy,
    };
    return asg(check<AsgRow>(await this.scoped(orgId).table("employee_org_assignments").insert(row).select(ASG).single()));
  }
  async endAssignment(orgId: OrganizationId, id: string, validTo: string) {
    return asg(check<AsgRow>(await this.scoped(orgId).table("employee_org_assignments").update({ valid_to: validTo }).eq("id", id).select(ASG).single()));
  }
  async employeeExists(orgId: OrganizationId, employeeId: string) {
    return !!check<{ id: string } | null>(await this.scoped(orgId).table("hr_employees").select("id").eq("id", employeeId).maybeSingle());
  }

  async listContacts(orgId: OrganizationId) {
    return check<ConRow[]>(await this.scoped(orgId).table("org_contacts").select(CON)).map(con);
  }
  async upsertContact(orgId: OrganizationId, input: Omit<Contact, "updatedAt"> & { createdBy: string }) {
    const row = { role: input.role, name: input.name, email: input.email, phone: input.phone, created_by: input.createdBy, updated_at: new Date().toISOString() };
    return con(check<ConRow>(await this.scoped(orgId).table("org_contacts").upsert(row, { onConflict: "org_id,role" }).select(CON).single()));
  }

  async listTermsAcceptances(orgId: OrganizationId) {
    return check<TrmRow[]>(await this.scoped(orgId).table("org_terms_acceptances").select(TRM).order("accepted_at", { ascending: false })).map(trm);
  }
  async acceptTerms(orgId: OrganizationId, input: { version: string; acceptedBy: string; ip: string | null }) {
    const row = { document: "terms_and_dpa", version: input.version, accepted_by: input.acceptedBy, ip: input.ip };
    return trm(check<TrmRow>(await this.scoped(orgId).table("org_terms_acceptances").insert(row).select(TRM).single()));
  }
}

export class HttpRequestIp implements RequestIpPort {
  current(): string | null {
    return currentRequestContext()?.ip ?? null;
  }
}
