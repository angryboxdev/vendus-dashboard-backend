import type { OrganizationId } from "../../../../kernel/organization-id.js";
import {
  EDITABLE_FIELDS,
  fullNameOf,
  missingMandatory,
  normalizeInput,
  PRIVACY_KEY,
  requireMandatory,
  SENSITIVE_FIELDS,
  type EditableField,
  type Employee,
  type EmployeeInput,
} from "../../domain/entities/employee.js";
import { PeopleConflictError, PeopleForbiddenError, PeopleNotFoundError, PeopleValidationError } from "../../domain/errors.js";
import type { EmployeeView, ImportResult, Viewer } from "../../domain/ports/in/people.ports.js";
import type { PeopleAccountPort, PeopleAuditPort, PeopleClockPort, PeoplePhotoPort, PeopleRepositoryPort } from "../../domain/ports/out/people.ports.js";
import { parseCsv, toCsv } from "../../domain/services/csv.js";

/** Colunas exportáveis (RE-3): só saem as que quem exporta pode ver. */
export const EXPORT_COLUMNS: { key: EditableField | "fullName" | "status"; label: string }[] = [
  { key: "fullName", label: "Nome completo" },
  { key: "firstName", label: "Nome" },
  { key: "lastName", label: "Apelido" },
  { key: "nif", label: "NIF" },
  { key: "email", label: "E-mail" },
  { key: "phone", label: "Telefone" },
  { key: "personalEmail", label: "E-mail pessoal" },
  { key: "hireDate", label: "Data de admissão" },
  { key: "primaryLocationId", label: "Centro principal" },
  { key: "status", label: "Estado" },
  { key: "birthDate", label: "Data de nascimento" },
  { key: "nationality", label: "Nacionalidade" },
  { key: "address", label: "Morada" },
  { key: "postalCode", label: "Código postal" },
  { key: "city", label: "Localidade" },
  { key: "niss", label: "NISS" },
  { key: "iban", label: "IBAN" },
  { key: "baseSalary", label: "Salário base" },
];

/** Colunas da importação (cabeçalho do modelo CSV). */
export const IMPORT_COLUMNS: { header: string; field: EditableField }[] = [
  { header: "nome", field: "firstName" },
  { header: "apelido", field: "lastName" },
  { header: "nif", field: "nif" },
  { header: "data_admissao", field: "hireDate" },
  { header: "centro", field: "primaryLocationId" },
  { header: "email", field: "email" },
  { header: "telefone", field: "phone" },
  { header: "iban", field: "iban" },
  { header: "niss", field: "niss" },
];
const MAX_IMPORT_ROWS = 500;

const canView = (viewer: Viewer, field: string) => {
  const key = PRIVACY_KEY[field as EditableField];
  return !key || viewer.isAdmin || viewer.field(key).view;
};
const canEdit = (viewer: Viewer, field: EditableField) => {
  const key = PRIVACY_KEY[field];
  return !key || viewer.isAdmin || viewer.field(key).edit;
};

/** Auditoria sem os valores sensíveis (minimização): fica "alterado". */
function auditSafe(e: Partial<Employee> | null): Record<string, unknown> | null {
  if (!e) return null;
  const out: Record<string, unknown> = { ...e };
  for (const f of SENSITIVE_FIELDS) if (f in out && out[f] !== null && out[f] !== undefined) out[f] = "[registado]";
  return out;
}

export class PeopleUseCases {
  constructor(
    private readonly repo: PeopleRepositoryPort,
    private readonly accounts: PeopleAccountPort,
    private readonly audit: PeopleAuditPort,
    private readonly clock: PeopleClockPort,
    /** Sem adapter de fotos, `photoUrl` sai sempre null. */
    private readonly photos: PeoplePhotoPort | null = null,
  ) {}

  view(viewer: Viewer, e: Employee, photoUrl: string | null = null): EmployeeView {
    const hidden: string[] = [];
    const { photoPath: _path, ...rest } = e;
    const out: Record<string, unknown> = { ...rest, photoUrl };
    for (const f of EDITABLE_FIELDS) {
      if (!canView(viewer, f)) {
        out[f] = null;
        hidden.push(f);
      }
    }
    return { ...(out as unknown as Omit<EmployeeView, "hidden" | "missing">), hidden, missing: missingMandatory(e) };
  }

  /** URLs das fotos de uma vez (um pedido ao armazenamento por lista). */
  private async photoUrls(org: OrganizationId, rows: Employee[]): Promise<Map<string, string>> {
    const paths = [...new Set(rows.map((e) => e.photoPath).filter((p): p is string => !!p))];
    if (!this.photos || paths.length === 0) return new Map();
    return this.photos.urls(org, paths);
  }

  private async visible(org: OrganizationId, viewer: Viewer, e: Employee | null): Promise<Employee> {
    if (!e || !(await viewer.canSee(e.id, await this.clock.today(org)))) throw new PeopleNotFoundError();
    return e;
  }

  async list(org: OrganizationId, viewer: Viewer, filter: { status?: "active" | "inactive" | "all"; q?: string; locationId?: string }): Promise<EmployeeView[]> {
    const today = await this.clock.today(org);
    const rows = await this.repo.list(org, { status: filter.status ?? "active", ...(filter.q && { q: filter.q }), ...(filter.locationId && { locationId: filter.locationId }) });
    const seen: Employee[] = [];
    for (const e of rows) if (await viewer.canSee(e.id, today)) seen.push(e);
    const urls = await this.photoUrls(org, seen);
    return seen.map((e) => this.view(viewer, e, (e.photoPath && urls.get(e.photoPath)) ?? null));
  }

  async get(org: OrganizationId, viewer: Viewer, id: string): Promise<EmployeeView> {
    const e = await this.visible(org, viewer, await this.repo.get(org, id));
    const urls = await this.photoUrls(org, [e]);
    return this.view(viewer, e, (e.photoPath && urls.get(e.photoPath)) ?? null);
  }

  private assertEditable(viewer: Viewer, input: EmployeeInput): void {
    for (const f of Object.keys(input) as EditableField[]) {
      if (!canEdit(viewer, f)) throw new PeopleForbiddenError("Sem permissão para alterar este campo.", f);
    }
  }

  private async assertUniqueNif(org: OrganizationId, nif: string | null | undefined, selfId?: string): Promise<void> {
    if (!nif) return;
    const other = await this.repo.findIdByNif(org, nif);
    if (other && other !== selfId) throw new PeopleConflictError("Já existe um colaborador com este número de identificação.", "duplicate_document", "nif");
  }

  /** Aceita o id ou o código do centro; devolve o id. */
  private async resolveLocation(org: OrganizationId, input: EmployeeInput): Promise<void> {
    if (!input.primaryLocationId) return;
    const id = await this.repo.locationIdByCode(org, input.primaryLocationId);
    if (!id) throw new PeopleValidationError("Centro não encontrado.", "primaryLocationId");
    input.primaryLocationId = id;
  }

  async create(org: OrganizationId, viewer: Viewer, raw: Record<string, unknown>): Promise<EmployeeView> {
    const input = normalizeInput(raw);
    requireMandatory(input);
    this.assertEditable(viewer, input);
    await this.assertUniqueNif(org, input.nif);
    await this.resolveLocation(org, input);
    const created = await this.repo.create(org, { ...input, fullName: fullNameOf(input.firstName, input.lastName, "") });
    await this.audit.record(org, { actor: viewer.actor, action: "people.employee.create", resourceType: "employee", resourceId: created.id, before: null, after: auditSafe(created), reason: null });
    return this.view(viewer, created);
  }

  async update(org: OrganizationId, viewer: Viewer, id: string, raw: Record<string, unknown>, expectedVersion: number, reason: string | null): Promise<EmployeeView> {
    const current = await this.visible(org, viewer, await this.repo.get(org, id));
    const input = normalizeInput(raw);
    this.assertEditable(viewer, input);
    await this.resolveLocation(org, input);
    // O centro muda por transferência (histórico com data de efeito — TK-10), não por edição.
    if (input.primaryLocationId !== undefined && input.primaryLocationId !== current.primaryLocationId && current.primaryLocationId) {
      throw new PeopleValidationError("Para mudar de centro use a transferência (com data de efeito).", "primaryLocationId");
    }
    const merged = { ...current, ...input };
    requireMandatory(merged);
    const touchesSensitive = SENSITIVE_FIELDS.some((f) => f in input && (input[f] ?? null) !== (current[f] ?? null));
    if (touchesSensitive && !reason?.trim()) throw new PeopleValidationError("Alterar identificação, IBAN ou remuneração exige motivo.", "reason");
    if (input.nif !== undefined) await this.assertUniqueNif(org, input.nif, id);
    const data = { ...input, ...((input.firstName !== undefined || input.lastName !== undefined) && { fullName: fullNameOf(merged.firstName, merged.lastName, current.fullName) }) };
    const updated = await this.repo.update(org, id, data, expectedVersion);
    if (!updated) throw new PeopleConflictError("A ficha foi alterada entretanto. Recarregue e tente de novo.", "version_conflict");
    const changed = Object.keys(input) as EditableField[];
    await this.audit.record(org, {
      actor: viewer.actor,
      action: "people.employee.update",
      resourceType: "employee",
      resourceId: id,
      before: auditSafe(Object.fromEntries(changed.map((f) => [f, current[f]]))),
      after: auditSafe(Object.fromEntries(changed.map((f) => [f, updated[f]]))),
      reason: reason?.trim() || null,
    });
    return this.view(viewer, updated);
  }

  /** RE-4: desativar mantém os dados, tira o acesso e revoga as sessões da conta ligada. */
  async deactivate(org: OrganizationId, viewer: Viewer, id: string, reason: string, expectedVersion: number): Promise<EmployeeView> {
    const current = await this.visible(org, viewer, await this.repo.get(org, id));
    if (!reason.trim()) throw new PeopleValidationError("O motivo é obrigatório.", "reason");
    if (current.status === "inactive") return this.view(viewer, current);
    const updated = await this.repo.setStatus(org, id, { status: "inactive", deactivatedAt: new Date().toISOString(), reason: reason.trim() }, expectedVersion);
    if (!updated) throw new PeopleConflictError("A ficha foi alterada entretanto. Recarregue e tente de novo.", "version_conflict");
    if (current.userId) await this.accounts.disableLinkedUser(org, current.userId, viewer.actor);
    await this.audit.record(org, { actor: viewer.actor, action: "people.employee.deactivate", resourceType: "employee", resourceId: id, before: { status: "active" }, after: { status: "inactive" }, reason: reason.trim() });
    return this.view(viewer, updated);
  }

  async reactivate(org: OrganizationId, viewer: Viewer, id: string, reason: string, expectedVersion: number): Promise<EmployeeView> {
    const current = await this.visible(org, viewer, await this.repo.get(org, id));
    if (!reason.trim()) throw new PeopleValidationError("O motivo é obrigatório.", "reason");
    if (current.status === "active") return this.view(viewer, current);
    const updated = await this.repo.setStatus(org, id, { status: "active", deactivatedAt: null, reason: null }, expectedVersion);
    if (!updated) throw new PeopleConflictError("A ficha foi alterada entretanto. Recarregue e tente de novo.", "version_conflict");
    await this.audit.record(org, { actor: viewer.actor, action: "people.employee.reactivate", resourceType: "employee", resourceId: id, before: { status: "inactive" }, after: { status: "active" }, reason: reason.trim() });
    return this.view(viewer, updated);
  }

  /** RE-3 + RE-34: só colunas que quem exporta pode ver e só colaboradores no seu âmbito. */
  async exportCsv(org: OrganizationId, viewer: Viewer, opts: { columns?: string[]; includeInactive?: boolean }): Promise<{ csv: string; columns: string[] }> {
    if (!viewer.isAdmin && !viewer.canExport) throw new PeopleForbiddenError("Sem permissão para exportar colaboradores.");
    const wanted = opts.columns?.length ? EXPORT_COLUMNS.filter((c) => opts.columns!.includes(c.key)) : EXPORT_COLUMNS;
    const cols = wanted.filter((c) => canView(viewer, c.key));
    const people = await this.list(org, viewer, { status: opts.includeInactive ? "all" : "active" });
    const rows = people.map((p) => cols.map((c) => (c.key === "status" ? (p.status === "active" ? "Ativo" : "Inativo") : (p as unknown as Record<string, unknown>)[c.key])));
    await this.audit.record(org, { actor: viewer.actor, action: "people.export", resourceType: "employee", resourceId: null, before: null, after: { rows: rows.length, columns: cols.map((c) => c.key) }, reason: null });
    return { csv: toCsv(cols.map((c) => c.label), rows), columns: cols.map((c) => c.key) };
  }

  /** Importação CSV: valida tudo primeiro; só grava se não houver erros e não for simulação. */
  async importCsv(org: OrganizationId, viewer: Viewer, text: string, dryRun: boolean): Promise<ImportResult> {
    const { header, rows } = parseCsv(text);
    const required = IMPORT_COLUMNS.filter((c) => ["firstName", "lastName", "nif", "hireDate", "primaryLocationId"].includes(c.field)).map((c) => c.header);
    const missingCols = required.filter((h) => !header.includes(h));
    if (missingCols.length) throw new PeopleValidationError(`Faltam colunas no ficheiro: ${missingCols.join(", ")}.`, "csv");
    if (rows.length === 0) throw new PeopleValidationError("O ficheiro não tem linhas.", "csv");
    if (rows.length > MAX_IMPORT_ROWS) throw new PeopleValidationError(`Máximo de ${MAX_IMPORT_ROWS} linhas por importação.`, "csv");

    const seenNif = new Set<string>();
    const prepared: { line: number; input: EmployeeInput; errors: string[] }[] = [];
    for (const [i, row] of rows.entries()) {
      const line = i + 2;
      const errors: string[] = [];
      let input: EmployeeInput = {};
      try {
        const raw: Record<string, unknown> = {};
        for (const c of IMPORT_COLUMNS) if (c.header in row) raw[c.field] = row[c.header];
        input = normalizeInput(raw);
        if (input.primaryLocationId) {
          const loc = await this.repo.locationIdByCode(org, input.primaryLocationId);
          if (!loc) errors.push(`Centro "${input.primaryLocationId}" não existe.`);
          else input.primaryLocationId = loc;
        }
        requireMandatory(input);
        this.assertEditable(viewer, input);
        if (input.nif) {
          if (seenNif.has(input.nif)) errors.push("NIF repetido no ficheiro.");
          seenNif.add(input.nif);
          if (await this.repo.findIdByNif(org, input.nif)) errors.push("Já existe um colaborador com este NIF.");
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "Linha inválida.");
      }
      prepared.push({ line, input, errors });
    }
    const valid = prepared.filter((p) => p.errors.length === 0);
    let created = 0;
    if (!dryRun && valid.length === prepared.length) {
      for (const p of prepared) {
        const e = await this.repo.create(org, { ...p.input, fullName: fullNameOf(p.input.firstName, p.input.lastName, "") });
        created++;
        await this.audit.record(org, { actor: viewer.actor, action: "people.employee.import", resourceType: "employee", resourceId: e.id, before: null, after: auditSafe(e), reason: null });
      }
    }
    return {
      dryRun,
      total: prepared.length,
      valid: valid.length,
      created,
      rows: prepared.map((p) => ({ line: p.line, ok: p.errors.length === 0, errors: p.errors, name: fullNameOf(p.input.firstName, p.input.lastName, "—") })),
    };
  }
}
