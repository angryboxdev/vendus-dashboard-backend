import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { normalizeDocument, type Employee } from "../../domain/entities/employee.js";
import type { Agreement, CompensationAssignment, CompensationItem, Contract, ContractInput, CustomFieldDefinition, ManagerLink } from "../../domain/entities/employment.js";
import type { EmployeeWrite, PeopleRepositoryPort } from "../../domain/ports/out/people.ports.js";

type Res = { data: unknown; error: { message: string; code?: string } | null };
function check<T>(res: Res): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

const EMP_COLS =
  "id, first_name, last_name, full_name, nif, email, phone, personal_email, address, postal_code, city, country, birth_date, gender, nationality, social_security_number, id_card_number, iban, hired_at, primary_location_id, position_id, status, currency, pay_period, base_salary, hourly_rate, deactivated_at, deactivation_reason, user_id, photo_storage_path, record_version";

type EmpRow = Record<string, unknown> & { id: string; full_name: string; status: string; record_version: number };

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

function toEmployee(r: EmpRow): Employee {
  return {
    id: r.id,
    firstName: str(r.first_name),
    lastName: str(r.last_name),
    fullName: r.full_name,
    nif: str(r.nif),
    email: str(r.email),
    phone: str(r.phone),
    personalEmail: str(r.personal_email),
    address: str(r.address),
    postalCode: str(r.postal_code),
    city: str(r.city),
    country: str(r.country),
    birthDate: str(r.birth_date),
    gender: str(r.gender),
    nationality: str(r.nationality),
    niss: str(r.social_security_number),
    idCardNumber: str(r.id_card_number),
    iban: str(r.iban),
    hireDate: r.hired_at ? String(r.hired_at).slice(0, 10) : null,
    primaryLocationId: str(r.primary_location_id),
    positionId: str(r.position_id),
    status: r.status === "active" ? "active" : "inactive",
    currency: str(r.currency) ?? "EUR",
    payPeriod: (str(r.pay_period) ?? "monthly") as Employee["payPeriod"],
    baseSalary: num(r.base_salary),
    hourlyRate: num(r.hourly_rate),
    deactivatedAt: str(r.deactivated_at),
    deactivationReason: str(r.deactivation_reason),
    userId: str(r.user_id),
    photoPath: str(r.photo_storage_path),
    version: Number(r.record_version ?? 1),
  };
}

const COLUMN: Record<string, string> = {
  firstName: "first_name",
  lastName: "last_name",
  fullName: "full_name",
  nif: "nif",
  email: "email",
  phone: "phone",
  personalEmail: "personal_email",
  address: "address",
  postalCode: "postal_code",
  city: "city",
  country: "country",
  birthDate: "birth_date",
  gender: "gender",
  nationality: "nationality",
  niss: "social_security_number",
  idCardNumber: "id_card_number",
  iban: "iban",
  hireDate: "hired_at",
  primaryLocationId: "primary_location_id",
  positionId: "position_id",
  currency: "currency",
  payPeriod: "pay_period",
  baseSalary: "base_salary",
  hourlyRate: "hourly_rate",
};

function toRow(d: EmployeeWrite): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) {
    const col = COLUMN[k];
    if (col) row[col] = v === undefined ? null : v;
  }
  return row;
}

const CONTRACT_COLS = "id, employee_id, contract_type, code, start_date, end_date, seniority_date, probation_end, weekly_hours, fte, agreement_id, remote, comment, status, version";
const toContract = (r: Record<string, unknown>): Contract => ({
  id: String(r.id),
  employeeId: String(r.employee_id),
  contractType: r.contract_type as Contract["contractType"],
  code: str(r.code),
  startDate: String(r.start_date),
  endDate: str(r.end_date),
  seniorityDate: str(r.seniority_date),
  probationEnd: str(r.probation_end),
  weeklyHours: num(r.weekly_hours),
  fte: num(r.fte),
  agreementId: str(r.agreement_id),
  remote: r.remote === true,
  comment: str(r.comment),
  status: r.status === "cancelled" ? "cancelled" : "active",
  version: Number(r.version),
});
const contractRow = (c: ContractInput) => ({
  contract_type: c.contractType,
  code: c.code,
  start_date: c.startDate,
  end_date: c.endDate,
  seniority_date: c.seniorityDate,
  probation_end: c.probationEnd,
  weekly_hours: c.weeklyHours,
  fte: c.fte,
  agreement_id: c.agreementId,
  remote: c.remote,
  comment: c.comment,
});

const MGR_COLS = "id, employee_id, manager_employee_id, kind, level, valid_from, valid_to";
const toManager = (r: Record<string, unknown>): ManagerLink => ({
  id: String(r.id),
  employeeId: String(r.employee_id),
  managerEmployeeId: String(r.manager_employee_id),
  kind: r.kind as ManagerLink["kind"],
  level: Number(r.level),
  validFrom: String(r.valid_from),
  validTo: str(r.valid_to),
});

const ITEM_COLS = "id, kind, name, code, mode, amount, employee_amount, currency, pay_period, every_n_months, active";
const toItem = (r: Record<string, unknown>): CompensationItem => ({
  id: String(r.id),
  kind: r.kind as CompensationItem["kind"],
  name: String(r.name),
  code: str(r.code),
  mode: r.mode as CompensationItem["mode"],
  amount: Number(r.amount),
  employeeAmount: num(r.employee_amount),
  currency: String(r.currency),
  payPeriod: r.pay_period as CompensationItem["payPeriod"],
  everyNMonths: Number(r.every_n_months),
  active: r.active === true,
});

const COMP_COLS = "id, employee_id, item_id, amount, valid_from, valid_to";
const toComp = (r: Record<string, unknown>): CompensationAssignment => ({
  id: String(r.id),
  employeeId: String(r.employee_id),
  itemId: String(r.item_id),
  amount: num(r.amount),
  validFrom: String(r.valid_from),
  validTo: str(r.valid_to),
});

const CF_COLS = "id, section, name, format, options, sensitive, archived";
const toField = (r: Record<string, unknown>): CustomFieldDefinition => ({
  id: String(r.id),
  section: r.section as CustomFieldDefinition["section"],
  name: String(r.name),
  format: r.format as CustomFieldDefinition["format"],
  options: Array.isArray(r.options) ? (r.options as string[]) : [],
  sensitive: r.sensitive === true,
  archived: r.archived === true,
});

export class SupabasePeopleRepository implements PeopleRepositoryPort {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  async list(org: OrganizationId, filter: { status: "active" | "inactive" | "all"; q?: string; locationId?: string }) {
    let q = this.scoped(org).table("hr_employees").select(EMP_COLS);
    if (filter.status !== "all") q = q.eq("status", filter.status);
    if (filter.locationId) q = q.eq("primary_location_id", filter.locationId);
    if (filter.q) q = q.ilike("full_name", `%${filter.q.replace(/[%_]/g, "")}%`);
    return check<EmpRow[]>(await q.order("full_name")).map(toEmployee);
  }
  async get(org: OrganizationId, id: string) {
    const r = check<EmpRow | null>(await this.scoped(org).table("hr_employees").select(EMP_COLS).eq("id", id).maybeSingle());
    return r ? toEmployee(r) : null;
  }
  async setKioskPin(org: OrganizationId, id: string, pinHash: string) {
    const { error } = await this.scoped(org).table("hr_employees").update({ kiosk_pin_hash: pinHash, updated_at: new Date().toISOString() }).eq("id", id);
    if (error?.code === "23505") return "taken" as const;
    if (error) throw new Error(error.message);
    return "ok" as const;
  }
  async findByUserId(org: OrganizationId, userId: string) {
    const r = check<EmpRow | null>(await this.scoped(org).table("hr_employees").select(EMP_COLS).eq("user_id", userId).maybeSingle());
    return r ? toEmployee(r) : null;
  }
  async findIdByNif(org: OrganizationId, nif: string) {
    const target = normalizeDocument(nif);
    const rows = check<{ id: string; nif: string | null }[]>(await this.scoped(org).table("hr_employees").select("id, nif").not("nif", "is", null));
    return rows.find((r) => r.nif && normalizeDocument(r.nif) === target)?.id ?? null;
  }
  async create(org: OrganizationId, d: EmployeeWrite & { fullName: string }) {
    const row = { ...toRow(d), status: "active", record_version: 1 };
    return toEmployee(check<EmpRow>(await this.scoped(org).table("hr_employees").insert(row).select(EMP_COLS).single()));
  }
  async update(org: OrganizationId, id: string, d: EmployeeWrite, expectedVersion: number) {
    const row = { ...toRow(d), record_version: expectedVersion + 1, updated_at: new Date().toISOString() };
    const rows = check<EmpRow[]>(await this.scoped(org).table("hr_employees").update(row).eq("id", id).eq("record_version", expectedVersion).select(EMP_COLS));
    return rows[0] ? toEmployee(rows[0]) : null;
  }
  async setStatus(org: OrganizationId, id: string, s: { status: "active" | "inactive"; deactivatedAt: string | null; reason: string | null }, expectedVersion: number) {
    const row = {
      status: s.status,
      deactivated_at: s.deactivatedAt,
      deactivation_reason: s.reason,
      ended_at: s.status === "inactive" ? s.deactivatedAt : null,
      record_version: expectedVersion + 1,
      updated_at: new Date().toISOString(),
    };
    const rows = check<EmpRow[]>(await this.scoped(org).table("hr_employees").update(row).eq("id", id).eq("record_version", expectedVersion).select(EMP_COLS));
    return rows[0] ? toEmployee(rows[0]) : null;
  }
  async locationIdByCode(org: OrganizationId, codeOrId: string) {
    const rows = check<{ id: string; code: string }[]>(await this.scoped(org).table("locations").select("id, code").eq("is_active", true));
    return rows.find((l) => l.id === codeOrId || l.code.toUpperCase() === codeOrId.toUpperCase())?.id ?? null;
  }

  async listLocations(org: OrganizationId) {
    return check<{ id: string; name: string; code: string }[]>(await this.scoped(org).table("locations").select("id, name, code").eq("is_active", true).order("name"));
  }

  async listPositions(org: OrganizationId) {
    return check<{ id: string; name: string }[]>(await this.scoped(org).table("hr_positions").select("id, name").eq("active", true).order("name"));
  }

  async listContracts(org: OrganizationId, employeeId: string) {
    return check<Record<string, unknown>[]>(await this.scoped(org).table("employment_contracts").select(CONTRACT_COLS).eq("employee_id", employeeId).order("start_date")).map(toContract);
  }
  async listContractsStartedBy(org: OrganizationId, date: string) {
    return check<Record<string, unknown>[]>(await this.scoped(org).table("employment_contracts").select(CONTRACT_COLS).eq("status", "active").lte("start_date", date)).map(toContract);
  }
  async createContract(org: OrganizationId, employeeId: string, input: ContractInput, createdBy: string) {
    return toContract(check(await this.scoped(org).table("employment_contracts").insert({ ...contractRow(input), employee_id: employeeId, created_by: createdBy }).select(CONTRACT_COLS).single()));
  }
  async updateContract(org: OrganizationId, id: string, input: ContractInput, expectedVersion: number) {
    const rows = check<Record<string, unknown>[]>(
      await this.scoped(org).table("employment_contracts").update({ ...contractRow(input), version: expectedVersion + 1, updated_at: new Date().toISOString() }).eq("id", id).eq("version", expectedVersion).select(CONTRACT_COLS),
    );
    return rows[0] ? toContract(rows[0]) : null;
  }
  async cancelContract(org: OrganizationId, id: string, expectedVersion: number) {
    const rows = check<Record<string, unknown>[]>(
      await this.scoped(org).table("employment_contracts").update({ status: "cancelled", version: expectedVersion + 1, updated_at: new Date().toISOString() }).eq("id", id).eq("version", expectedVersion).select(CONTRACT_COLS),
    );
    return rows[0] ? toContract(rows[0]) : null;
  }

  async listAgreements(org: OrganizationId) {
    return check<Agreement[]>(await this.scoped(org).table("collective_agreements").select("id, name, code, archived").order("name"));
  }
  async createAgreement(org: OrganizationId, input: { name: string; code: string | null }, createdBy: string) {
    return check<Agreement>(await this.scoped(org).table("collective_agreements").insert({ ...input, created_by: createdBy }).select("id, name, code, archived").single());
  }
  async archiveAgreement(org: OrganizationId, id: string) {
    check(await this.scoped(org).table("collective_agreements").update({ archived: true }).eq("id", id));
  }

  async listManagers(org: OrganizationId, employeeId: string) {
    return check<Record<string, unknown>[]>(await this.scoped(org).table("employee_managers").select(MGR_COLS).eq("employee_id", employeeId).order("valid_from")).map(toManager);
  }
  async listAllManagers(org: OrganizationId) {
    return check<Record<string, unknown>[]>(await this.scoped(org).table("employee_managers").select(MGR_COLS).order("valid_from")).map(toManager);
  }
  async createManager(org: OrganizationId, m: Omit<ManagerLink, "id">, createdBy: string) {
    const row = { employee_id: m.employeeId, manager_employee_id: m.managerEmployeeId, kind: m.kind, level: m.level, valid_from: m.validFrom, valid_to: m.validTo, created_by: createdBy };
    return toManager(check(await this.scoped(org).table("employee_managers").insert(row).select(MGR_COLS).single()));
  }
  async endManager(org: OrganizationId, id: string, validTo: string) {
    return toManager(check(await this.scoped(org).table("employee_managers").update({ valid_to: validTo }).eq("id", id).select(MGR_COLS).single()));
  }

  async listCompensationItems(org: OrganizationId) {
    return check<Record<string, unknown>[]>(await this.scoped(org).table("compensation_items").select(ITEM_COLS).order("name")).map(toItem);
  }
  async createCompensationItem(org: OrganizationId, i: Omit<CompensationItem, "id" | "active">, createdBy: string) {
    const row = {
      kind: i.kind,
      name: i.name,
      code: i.code,
      mode: i.mode,
      amount: i.amount,
      employee_amount: i.employeeAmount,
      currency: i.currency,
      pay_period: i.payPeriod,
      every_n_months: i.everyNMonths,
      created_by: createdBy,
    };
    return toItem(check(await this.scoped(org).table("compensation_items").insert(row).select(ITEM_COLS).single()));
  }
  async deactivateCompensationItem(org: OrganizationId, id: string) {
    check(await this.scoped(org).table("compensation_items").update({ active: false }).eq("id", id));
  }
  async listEmployeeCompensations(org: OrganizationId, employeeId: string) {
    return check<Record<string, unknown>[]>(await this.scoped(org).table("employee_compensations").select(COMP_COLS).eq("employee_id", employeeId).order("valid_from")).map(toComp);
  }
  async assignCompensation(org: OrganizationId, a: Omit<CompensationAssignment, "id">, createdBy: string) {
    const row = { employee_id: a.employeeId, item_id: a.itemId, amount: a.amount, valid_from: a.validFrom, valid_to: a.validTo, created_by: createdBy };
    return toComp(check(await this.scoped(org).table("employee_compensations").insert(row).select(COMP_COLS).single()));
  }
  async endCompensation(org: OrganizationId, id: string, validTo: string) {
    return toComp(check(await this.scoped(org).table("employee_compensations").update({ valid_to: validTo }).eq("id", id).select(COMP_COLS).single()));
  }

  async listCustomFields(org: OrganizationId) {
    return check<Record<string, unknown>[]>(await this.scoped(org).table("custom_field_definitions").select(CF_COLS).order("name")).map(toField);
  }
  async createCustomField(org: OrganizationId, d: Omit<CustomFieldDefinition, "id" | "archived">, createdBy: string) {
    return toField(check(await this.scoped(org).table("custom_field_definitions").insert({ ...d, created_by: createdBy }).select(CF_COLS).single()));
  }
  async archiveCustomField(org: OrganizationId, id: string) {
    check(await this.scoped(org).table("custom_field_definitions").update({ archived: true }).eq("id", id));
  }
  async getCustomValues(org: OrganizationId, employeeId: string) {
    const rows = check<{ field_id: string; value: string | null }[]>(await this.scoped(org).table("employee_custom_values").select("field_id, value").eq("employee_id", employeeId));
    return Object.fromEntries(rows.map((r) => [r.field_id, r.value]));
  }
  async setCustomValues(org: OrganizationId, employeeId: string, values: Record<string, string | null>, updatedBy: string) {
    const now = new Date().toISOString();
    const rows = Object.entries(values).map(([field_id, value]) => ({ employee_id: employeeId, field_id, value, updated_by: updatedBy, updated_at: now }));
    if (rows.length) check(await this.scoped(org).table("employee_custom_values").upsert(rows, { onConflict: "org_id,employee_id,field_id" }));
  }
}
