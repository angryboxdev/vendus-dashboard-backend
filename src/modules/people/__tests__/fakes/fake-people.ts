import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Employee } from "../../domain/entities/employee.js";
import { normalizeDocument } from "../../domain/entities/employee.js";
import type { Agreement, CompensationAssignment, CompensationItem, Contract, ContractInput, CustomFieldDefinition, ManagerLink } from "../../domain/entities/employment.js";
import type { Viewer } from "../../domain/ports/in/people.ports.js";
import type { EmployeeWrite, PeopleRepositoryPort } from "../../domain/ports/out/people.ports.js";

const BLANK: Omit<Employee, "id" | "fullName" | "version"> = {
  firstName: null,
  lastName: null,
  nif: null,
  email: null,
  phone: null,
  personalEmail: null,
  address: null,
  postalCode: null,
  city: null,
  country: null,
  birthDate: null,
  gender: null,
  nationality: null,
  niss: null,
  idCardNumber: null,
  iban: null,
  hireDate: null,
  primaryLocationId: null,
  positionId: null,
  status: "active",
  currency: "EUR",
  payPeriod: "monthly",
  baseSalary: null,
  hourlyRate: null,
  deactivatedAt: null,
  deactivationReason: null,
  userId: null,
  photoPath: null,
};

/** Repositório em memória (dados fictícios — RGPD). */
export class FakePeopleRepo implements PeopleRepositoryPort {
  employees: Employee[] = [];
  contracts: Contract[] = [];
  agreements: Agreement[] = [];
  managers: ManagerLink[] = [];
  items: CompensationItem[] = [];
  comps: CompensationAssignment[] = [];
  fields: CustomFieldDefinition[] = [];
  values = new Map<string, Record<string, string | null>>();
  locations = new Map([
    ["PRT", "loc-porto"],
    ["BRG", "loc-braga"],
  ]);
  private n = 0;
  private id = (p: string) => `${p}${++this.n}`;

  seed(e: Partial<Employee> & { id: string }): Employee {
    const full: Employee = { ...BLANK, fullName: [e.firstName, e.lastName].filter(Boolean).join(" ") || "Sem nome", version: 1, ...e };
    this.employees.push(full);
    return full;
  }

  async list(_o: OrganizationId, f: { status: "active" | "inactive" | "all" }) {
    return this.employees.filter((e) => f.status === "all" || e.status === f.status).map((e) => ({ ...e }));
  }
  async get(_o: OrganizationId, id: string) {
    const e = this.employees.find((x) => x.id === id);
    return e ? { ...e } : null;
  }
  async findIdByNif(_o: OrganizationId, nif: string) {
    return this.employees.find((e) => e.nif && normalizeDocument(e.nif) === normalizeDocument(nif))?.id ?? null;
  }
  async create(_o: OrganizationId, d: EmployeeWrite & { fullName: string }) {
    return this.seed({ ...d, id: this.id("e") } as Partial<Employee> & { id: string });
  }
  async update(_o: OrganizationId, id: string, d: EmployeeWrite, v: number) {
    const e = this.employees.find((x) => x.id === id)!;
    if (e.version !== v) return null;
    Object.assign(e, d, { version: v + 1 });
    return { ...e };
  }
  async setStatus(_o: OrganizationId, id: string, s: { status: "active" | "inactive"; deactivatedAt: string | null; reason: string | null }, v: number) {
    const e = this.employees.find((x) => x.id === id)!;
    if (e.version !== v) return null;
    Object.assign(e, { status: s.status, deactivatedAt: s.deactivatedAt, deactivationReason: s.reason, version: v + 1 });
    return { ...e };
  }
  async locationIdByCode(_o: OrganizationId, code: string) {
    return this.locations.get(code) ?? ([...this.locations.values()].includes(code) ? code : null);
  }
  async listLocations(_o: OrganizationId) {
    return [...this.locations].map(([code, id]) => ({ id, name: code, code }));
  }
  async listPositions(_o: OrganizationId) {
    return [{ id: "pos-op", name: "Operador" }];
  }
  async listContracts(_o: OrganizationId, employeeId: string) {
    return this.contracts.filter((c) => c.employeeId === employeeId).map((c) => ({ ...c }));
  }
  async createContract(_o: OrganizationId, employeeId: string, input: ContractInput) {
    const c: Contract = { ...input, id: this.id("c"), employeeId, status: "active", version: 1 };
    this.contracts.push(c);
    return { ...c };
  }
  async updateContract(_o: OrganizationId, id: string, input: ContractInput, v: number) {
    const c = this.contracts.find((x) => x.id === id)!;
    if (c.version !== v) return null;
    Object.assign(c, input, { version: v + 1 });
    return { ...c };
  }
  async cancelContract(_o: OrganizationId, id: string, v: number) {
    const c = this.contracts.find((x) => x.id === id)!;
    if (c.version !== v) return null;
    Object.assign(c, { status: "cancelled", version: v + 1 });
    return { ...c };
  }
  async listAgreements() {
    return [...this.agreements];
  }
  async createAgreement(_o: OrganizationId, i: { name: string; code: string | null }) {
    const a = { id: this.id("ag"), name: i.name, code: i.code, archived: false };
    this.agreements.push(a);
    return a;
  }
  async archiveAgreement(_o: OrganizationId, id: string) {
    this.agreements.find((a) => a.id === id)!.archived = true;
  }
  async listManagers(_o: OrganizationId, employeeId: string) {
    return this.managers.filter((m) => m.employeeId === employeeId);
  }
  async createManager(_o: OrganizationId, i: Omit<ManagerLink, "id">) {
    const m = { ...i, id: this.id("m") };
    this.managers.push(m);
    return m;
  }
  async endManager(_o: OrganizationId, id: string, validTo: string) {
    const m = this.managers.find((x) => x.id === id)!;
    m.validTo = validTo;
    return { ...m };
  }
  async listCompensationItems() {
    return [...this.items];
  }
  async createCompensationItem(_o: OrganizationId, i: Omit<CompensationItem, "id" | "active">) {
    const it = { ...i, id: this.id("ci"), active: true };
    this.items.push(it);
    return it;
  }
  async deactivateCompensationItem(_o: OrganizationId, id: string) {
    this.items.find((i) => i.id === id)!.active = false;
  }
  async listEmployeeCompensations(_o: OrganizationId, employeeId: string) {
    return this.comps.filter((c) => c.employeeId === employeeId);
  }
  async assignCompensation(_o: OrganizationId, i: Omit<CompensationAssignment, "id">) {
    const a = { ...i, id: this.id("ca") };
    this.comps.push(a);
    return a;
  }
  async endCompensation(_o: OrganizationId, id: string, validTo: string) {
    const a = this.comps.find((c) => c.id === id)!;
    a.validTo = validTo;
    return { ...a };
  }
  async listCustomFields() {
    return [...this.fields];
  }
  async createCustomField(_o: OrganizationId, i: Omit<CustomFieldDefinition, "id" | "archived">) {
    const f = { ...i, id: this.id("cf"), archived: false };
    this.fields.push(f);
    return f;
  }
  async archiveCustomField(_o: OrganizationId, id: string) {
    this.fields.find((f) => f.id === id)!.archived = true;
  }
  async getCustomValues(_o: OrganizationId, employeeId: string) {
    return { ...(this.values.get(employeeId) ?? {}) };
  }
  async setCustomValues(_o: OrganizationId, employeeId: string, v: Record<string, string | null>) {
    this.values.set(employeeId, { ...(this.values.get(employeeId) ?? {}), ...v });
  }
}

/** Quem pede. Por omissão: RH sem acesso a IBAN/NIF/salário, âmbito total. */
export function viewer(over: Partial<Viewer> & { hidden?: string[]; readOnly?: string[]; scope?: string[] } = {}): Viewer {
  const hidden = new Set(over.hidden ?? []);
  const readOnly = new Set(over.readOnly ?? []);
  return {
    actor: "rh@demo.invalid",
    isAdmin: false,
    canExport: true,
    canSensitive: false,
    field: (k) => ({ view: !hidden.has(k), edit: !hidden.has(k) && !readOnly.has(k) }),
    canSee: async (id) => !over.scope || over.scope.includes(id),
    ...over,
  };
}
