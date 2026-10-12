import type { OrganizationId } from "../../../../kernel/organization-id.js";
import {
  compensationRuleViolation,
  contractOverlaps,
  validateCompensationItem,
  validateContract,
  validateCustomFieldDefinition,
  validateCustomValue,
  validateManager,
  type CompensationItem,
  type ContractInput,
  type CustomFieldDefinition,
  type ManagerLink,
} from "../../domain/entities/employment.js";
import { PeopleConflictError, PeopleForbiddenError, PeopleNotFoundError, PeopleRuleViolation, PeopleValidationError } from "../../domain/errors.js";
import type { Viewer } from "../../domain/ports/in/people.ports.js";
import type { PeopleAuditPort, PeopleClockPort, PeopleRepositoryPort } from "../../domain/ports/out/people.ports.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const lower = (s: string) => s.toLocaleLowerCase("pt");

/** Contratos (TK-9), convénios, responsáveis, complementos/benefícios (CF-14), campos personalizados. */
export class EmploymentUseCases {
  constructor(
    private readonly repo: PeopleRepositoryPort,
    private readonly audit: PeopleAuditPort,
    private readonly clock: PeopleClockPort,
  ) {}

  private async employee(org: OrganizationId, viewer: Viewer, id: string) {
    const e = await this.repo.get(org, id);
    if (!e || !(await viewer.canSee(id, await this.clock.today(org)))) throw new PeopleNotFoundError();
    return e;
  }

  // ── Contratos ───────────────────────────────────────────────────────
  async listContracts(org: OrganizationId, viewer: Viewer, employeeId: string) {
    await this.employee(org, viewer, employeeId);
    return this.repo.listContracts(org, employeeId);
  }

  private async checkAgreement(org: OrganizationId, agreementId: string | null) {
    if (agreementId && !(await this.repo.listAgreements(org)).some((a) => a.id === agreementId && !a.archived)) {
      throw new PeopleValidationError("Convénio não encontrado.", "agreementId");
    }
  }

  async createContract(org: OrganizationId, viewer: Viewer, employeeId: string, input: ContractInput) {
    await this.employee(org, viewer, employeeId);
    validateContract(input);
    await this.checkAgreement(org, input.agreementId);
    const clash = contractOverlaps(await this.repo.listContracts(org, employeeId), input);
    if (clash) throw new PeopleConflictError(`Sobrepõe-se ao contrato que começa a ${clash.startDate}. Termine-o primeiro.`, "contract_overlap", "startDate");
    const c = await this.repo.createContract(org, employeeId, input, viewer.actor);
    await this.audit.record(org, { actor: viewer.actor, action: "people.contract.create", resourceType: "employee", resourceId: employeeId, before: null, after: c, reason: null });
    return c;
  }

  async updateContract(org: OrganizationId, viewer: Viewer, employeeId: string, contractId: string, input: ContractInput, expectedVersion: number, reason: string) {
    await this.employee(org, viewer, employeeId);
    const all = await this.repo.listContracts(org, employeeId);
    const cur = all.find((c) => c.id === contractId);
    if (!cur) throw new PeopleNotFoundError("Contrato não encontrado.");
    if (cur.status !== "active") throw new PeopleValidationError("Contrato anulado não se altera.", "status");
    if (!reason.trim()) throw new PeopleValidationError("O motivo é obrigatório.", "reason");
    validateContract(input);
    await this.checkAgreement(org, input.agreementId);
    const clash = contractOverlaps(all, input, contractId);
    if (clash) throw new PeopleConflictError(`Sobrepõe-se ao contrato que começa a ${clash.startDate}.`, "contract_overlap", "startDate");
    const updated = await this.repo.updateContract(org, contractId, input, expectedVersion);
    if (!updated) throw new PeopleConflictError("O contrato foi alterado entretanto.", "version_conflict");
    await this.audit.record(org, { actor: viewer.actor, action: "people.contract.update", resourceType: "employee", resourceId: employeeId, before: cur, after: updated, reason: reason.trim() });
    return updated;
  }

  async cancelContract(org: OrganizationId, viewer: Viewer, employeeId: string, contractId: string, expectedVersion: number, reason: string) {
    await this.employee(org, viewer, employeeId);
    const cur = (await this.repo.listContracts(org, employeeId)).find((c) => c.id === contractId);
    if (!cur) throw new PeopleNotFoundError("Contrato não encontrado.");
    if (!reason.trim()) throw new PeopleValidationError("O motivo é obrigatório.", "reason");
    const cancelled = await this.repo.cancelContract(org, contractId, expectedVersion);
    if (!cancelled) throw new PeopleConflictError("O contrato foi alterado entretanto.", "version_conflict");
    await this.audit.record(org, { actor: viewer.actor, action: "people.contract.cancel", resourceType: "employee", resourceId: employeeId, before: cur, after: cancelled, reason: reason.trim() });
    return cancelled;
  }

  // ── Centros (catálogo) ────────────────────────────────────────────
  listLocations(org: OrganizationId) {
    return this.repo.listLocations(org);
  }

  // ── Convénios ───────────────────────────────────────────────────────
  listAgreements(org: OrganizationId) {
    return this.repo.listAgreements(org);
  }

  async createAgreement(org: OrganizationId, actor: string, input: { name: string; code: string | null }) {
    const name = input.name.trim();
    if (!name || name.length > 160) throw new PeopleValidationError("O nome é obrigatório.", "name");
    if ((await this.repo.listAgreements(org)).some((a) => !a.archived && lower(a.name) === lower(name))) throw new PeopleValidationError("Já existe um convénio com este nome.", "name");
    const a = await this.repo.createAgreement(org, { name, code: input.code?.trim() || null }, actor);
    await this.audit.record(org, { actor, action: "people.agreement.create", resourceType: "collective_agreement", resourceId: a.id, before: null, after: a, reason: null });
    return a;
  }

  async archiveAgreement(org: OrganizationId, actor: string, id: string) {
    await this.repo.archiveAgreement(org, id);
    await this.audit.record(org, { actor, action: "people.agreement.archive", resourceType: "collective_agreement", resourceId: id, before: null, after: { archived: true }, reason: null });
  }

  // ── Responsáveis ────────────────────────────────────────────────────
  async listManagers(org: OrganizationId, viewer: Viewer, employeeId: string) {
    await this.employee(org, viewer, employeeId);
    return this.repo.listManagers(org, employeeId);
  }

  async addManager(org: OrganizationId, viewer: Viewer, input: Omit<ManagerLink, "id">) {
    await this.employee(org, viewer, input.employeeId);
    if (!(await this.repo.get(org, input.managerEmployeeId))) throw new PeopleValidationError("Responsável não encontrado.", "managerEmployeeId");
    validateManager(input, await this.repo.listManagers(org, input.employeeId));
    const m = await this.repo.createManager(org, input, viewer.actor);
    await this.audit.record(org, { actor: viewer.actor, action: "people.manager.add", resourceType: "employee", resourceId: input.employeeId, before: null, after: m, reason: null });
    return m;
  }

  async endManager(org: OrganizationId, viewer: Viewer, employeeId: string, linkId: string, validTo: string) {
    await this.employee(org, viewer, employeeId);
    const cur = (await this.repo.listManagers(org, employeeId)).find((m) => m.id === linkId);
    if (!cur) throw new PeopleNotFoundError("Responsável não encontrado.");
    if (!DATE.test(validTo) || validTo < cur.validFrom || (cur.validTo !== null && validTo > cur.validTo)) throw new PeopleValidationError("Só pode encurtar a vigência.", "validTo");
    const m = await this.repo.endManager(org, linkId, validTo);
    await this.audit.record(org, { actor: viewer.actor, action: "people.manager.end", resourceType: "employee", resourceId: employeeId, before: cur, after: m, reason: null });
    return m;
  }

  // ── Complementos e benefícios ───────────────────────────────────────
  listCompensationItems(org: OrganizationId) {
    return this.repo.listCompensationItems(org);
  }

  async createCompensationItem(org: OrganizationId, actor: string, input: Omit<CompensationItem, "id" | "active">) {
    validateCompensationItem(input);
    if ((await this.repo.listCompensationItems(org)).some((i) => i.active && i.kind === input.kind && lower(i.name) === lower(input.name.trim()))) {
      throw new PeopleValidationError("Já existe um item com este nome.", "name");
    }
    const item = await this.repo.createCompensationItem(org, { ...input, name: input.name.trim() }, actor);
    await this.audit.record(org, { actor, action: "people.compensation_item.create", resourceType: "compensation_item", resourceId: item.id, before: null, after: item, reason: null });
    return item;
  }

  async deactivateCompensationItem(org: OrganizationId, actor: string, id: string) {
    await this.repo.deactivateCompensationItem(org, id);
    await this.audit.record(org, { actor, action: "people.compensation_item.deactivate", resourceType: "compensation_item", resourceId: id, before: null, after: { active: false }, reason: null });
  }

  async listEmployeeCompensations(org: OrganizationId, viewer: Viewer, employeeId: string) {
    await this.employee(org, viewer, employeeId);
    if (!viewer.isAdmin && !viewer.field("work.salary").view) throw new PeopleForbiddenError("Sem permissão para ver remunerações.", "work.salary");
    return this.repo.listEmployeeCompensations(org, employeeId);
  }

  async assignCompensation(org: OrganizationId, viewer: Viewer, input: { employeeId: string; itemId: string; amount: number | null; validFrom: string; validTo: string | null }) {
    const employee = await this.employee(org, viewer, input.employeeId);
    if (!viewer.isAdmin && !viewer.field("work.salary").edit) throw new PeopleForbiddenError("Sem permissão para alterar remunerações.", "work.salary");
    const item = (await this.repo.listCompensationItems(org)).find((i) => i.id === input.itemId && i.active);
    if (!item) throw new PeopleValidationError("Complemento ou benefício não encontrado.", "itemId");
    if (!DATE.test(input.validFrom) || (input.validTo !== null && (!DATE.test(input.validTo) || input.validTo < input.validFrom))) throw new PeopleValidationError("Vigência inválida.", "validFrom");
    if (input.amount !== null && !(input.amount >= 0)) throw new PeopleValidationError("Valor inválido.", "amount");
    const rule = compensationRuleViolation(item, employee);
    if (rule) throw new PeopleRuleViolation(rule, item.kind === "complement" ? "currency_mismatch" : "benefit_mismatch");
    const a = await this.repo.assignCompensation(org, input, viewer.actor);
    await this.audit.record(org, { actor: viewer.actor, action: "people.compensation.assign", resourceType: "employee", resourceId: input.employeeId, before: null, after: { itemId: item.id, validFrom: a.validFrom }, reason: null });
    return a;
  }

  async endCompensation(org: OrganizationId, viewer: Viewer, employeeId: string, assignmentId: string, validTo: string) {
    await this.employee(org, viewer, employeeId);
    if (!viewer.isAdmin && !viewer.field("work.salary").edit) throw new PeopleForbiddenError("Sem permissão para alterar remunerações.", "work.salary");
    const cur = (await this.repo.listEmployeeCompensations(org, employeeId)).find((a) => a.id === assignmentId);
    if (!cur) throw new PeopleNotFoundError("Atribuição não encontrada.");
    if (!DATE.test(validTo) || validTo < cur.validFrom || (cur.validTo !== null && validTo > cur.validTo)) throw new PeopleValidationError("Só pode encurtar a vigência.", "validTo");
    const a = await this.repo.endCompensation(org, assignmentId, validTo);
    await this.audit.record(org, { actor: viewer.actor, action: "people.compensation.end", resourceType: "employee", resourceId: employeeId, before: { validTo: cur.validTo }, after: { validTo }, reason: null });
    return a;
  }

  // ── Campos personalizados ───────────────────────────────────────────
  listCustomFields(org: OrganizationId) {
    return this.repo.listCustomFields(org);
  }

  async createCustomField(org: OrganizationId, actor: string, input: Omit<CustomFieldDefinition, "id" | "archived">) {
    const d = { ...input, name: input.name.trim(), options: input.options.map((o) => o.trim()).filter(Boolean) };
    validateCustomFieldDefinition(d);
    if ((await this.repo.listCustomFields(org)).some((f) => !f.archived && lower(f.name) === lower(d.name))) throw new PeopleValidationError("Já existe um campo com este nome.", "name");
    const f = await this.repo.createCustomField(org, d, actor);
    await this.audit.record(org, { actor, action: "people.custom_field.create", resourceType: "custom_field", resourceId: f.id, before: null, after: f, reason: null });
    return f;
  }

  async archiveCustomField(org: OrganizationId, actor: string, id: string) {
    await this.repo.archiveCustomField(org, id);
    await this.audit.record(org, { actor, action: "people.custom_field.archive", resourceType: "custom_field", resourceId: id, before: null, after: { archived: true }, reason: null });
  }

  /** Valores visíveis: campos sensíveis só com `hr.sensitive_data`. */
  async getCustomValues(org: OrganizationId, viewer: Viewer, employeeId: string) {
    await this.employee(org, viewer, employeeId);
    const [defs, values] = await Promise.all([this.repo.listCustomFields(org), this.repo.getCustomValues(org, employeeId)]);
    return defs
      .filter((d) => !d.archived)
      .map((d) => {
        const hidden = d.sensitive && !viewer.isAdmin && !viewer.canSensitive;
        return { field: d, value: hidden ? null : (values[d.id] ?? null), hidden };
      });
  }

  async setCustomValues(org: OrganizationId, viewer: Viewer, employeeId: string, values: Record<string, string | null>) {
    await this.employee(org, viewer, employeeId);
    const defs = (await this.repo.listCustomFields(org)).filter((d) => !d.archived);
    const clean: Record<string, string | null> = {};
    for (const [id, raw] of Object.entries(values)) {
      const d = defs.find((x) => x.id === id);
      if (!d) throw new PeopleValidationError("Campo personalizado desconhecido.", id);
      if (d.sensitive && !viewer.isAdmin && !viewer.canSensitive) throw new PeopleForbiddenError(`Sem permissão para alterar "${d.name}".`, id);
      const v = raw === null ? null : String(raw).trim() || null;
      validateCustomValue(d, v);
      clean[id] = v;
    }
    const before = await this.repo.getCustomValues(org, employeeId);
    await this.repo.setCustomValues(org, employeeId, clean, viewer.actor);
    const safe = (m: Record<string, string | null>) => Object.fromEntries(Object.keys(clean).map((k) => [k, defs.find((d) => d.id === k)?.sensitive ? "[registado]" : (m[k] ?? null)]));
    await this.audit.record(org, { actor: viewer.actor, action: "people.custom_values.set", resourceType: "employee", resourceId: employeeId, before: safe(before), after: safe(clean), reason: null });
    return this.getCustomValues(org, viewer, employeeId);
  }
}
