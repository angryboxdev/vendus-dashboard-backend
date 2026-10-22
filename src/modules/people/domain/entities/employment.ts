import { PeopleValidationError } from "../errors.js";

/** Contratos (Eng. Reversa 2.3, 13.1 `contract`), convénios (C3.10), responsáveis, remuneração (C3.8), campos personalizados (C3.9). */

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const CONTRACT_TYPES = ["permanent", "fixed_term", "temporary", "internship", "other"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export interface Contract {
  id: string;
  employeeId: string;
  contractType: ContractType;
  code: string | null;
  startDate: string;
  endDate: string | null;
  seniorityDate: string | null;
  probationEnd: string | null;
  weeklyHours: number | null;
  fte: number | null;
  agreementId: string | null;
  remote: boolean;
  comment: string | null;
  status: "active" | "cancelled";
  version: number;
}
export type ContractInput = Omit<Contract, "id" | "employeeId" | "status" | "version">;

export function validateContract(c: ContractInput): void {
  const fail = (field: string, msg: string): never => {
    throw new PeopleValidationError(msg, field);
  };
  if (!CONTRACT_TYPES.includes(c.contractType)) fail("contractType", "Tipo de contrato inválido.");
  if (!c.startDate || !DATE.test(c.startDate)) fail("startDate", "A data de início é obrigatória.");
  if (c.endDate && (!DATE.test(c.endDate) || c.endDate < c.startDate)) fail("endDate", "A data de fim tem de ser depois do início.");
  if (c.probationEnd && (!DATE.test(c.probationEnd) || c.probationEnd < c.startDate)) fail("probationEnd", "O fim do período experimental tem de ser depois do início.");
  if (c.seniorityDate && !DATE.test(c.seniorityDate)) fail("seniorityDate", "Data de antiguidade inválida.");
  if (c.weeklyHours !== null && !(c.weeklyHours > 0 && c.weeklyHours <= 80)) fail("weeklyHours", "Horas semanais entre 0 e 80.");
  if (c.fte !== null && !(c.fte > 0 && c.fte <= 1)) fail("fte", "FTE entre 0 e 1.");
  if (c.code && c.code.length > 40) fail("code", "Código até 40 caracteres.");
  if (c.comment && c.comment.length > 500) fail("comment", "Comentário até 500 caracteres.");
}

const periodsOverlap = (a: { startDate: string; endDate: string | null }, b: { startDate: string; endDate: string | null }) =>
  (a.endDate === null || b.startDate <= a.endDate) && (b.endDate === null || a.startDate <= b.endDate);

/**
 * Horas semanais do contrato vigente em `date`, por colaborador (lista de
 * pessoas: «40h semana»). Só contratos ativos que cobrem o dia; havendo mais
 * do que um (não devia — TK-9), vale o que começou mais tarde.
 */
export function weeklyHoursOn(contracts: Pick<Contract, "employeeId" | "startDate" | "endDate" | "weeklyHours" | "status">[], date: string): Map<string, number | null> {
  const best = new Map<string, { startDate: string; weeklyHours: number | null }>();
  for (const c of contracts) {
    if (c.status !== "active" || c.startDate > date || (c.endDate !== null && c.endDate < date)) continue;
    const prev = best.get(c.employeeId);
    if (!prev || c.startDate > prev.startDate) best.set(c.employeeId, { startDate: c.startDate, weeklyHours: c.weeklyHours });
  }
  return new Map([...best].map(([id, v]) => [id, v.weeklyHours]));
}

/** TK-9: contratos ativos do mesmo colaborador não se sobrepõem. */
export function contractOverlaps(existing: Contract[], next: { startDate: string; endDate: string | null }, ignoreId?: string): Contract | null {
  return existing.find((c) => c.status === "active" && c.id !== ignoreId && periodsOverlap(c, next)) ?? null;
}

export interface Agreement {
  id: string;
  name: string;
  code: string | null;
  archived: boolean;
}

export const MANAGER_KINDS = ["direct", "approver_time", "approver_leave"] as const;
export type ManagerKind = (typeof MANAGER_KINDS)[number];

export interface ManagerLink {
  id: string;
  employeeId: string;
  managerEmployeeId: string;
  kind: ManagerKind;
  level: number;
  validFrom: string;
  validTo: string | null;
}

/** Responsáveis diretos em simultâneo (co-chefia). */
export const MAX_DIRECT = 3;

export function validateManager(m: Omit<ManagerLink, "id">, existing: ManagerLink[]): void {
  if (m.managerEmployeeId === m.employeeId) throw new PeopleValidationError("Um colaborador não pode ser responsável de si próprio.", "managerEmployeeId");
  if (!MANAGER_KINDS.includes(m.kind)) throw new PeopleValidationError("Tipo de responsável inválido.", "kind");
  if (m.kind === "direct" && m.level !== 1) throw new PeopleValidationError("O responsável direto só tem um nível.", "level");
  if (!(m.level >= 1 && m.level <= 3)) throw new PeopleValidationError("Nível entre 1 e 3.", "level");
  if (!DATE.test(m.validFrom) || (m.validTo !== null && (!DATE.test(m.validTo) || m.validTo < m.validFrom))) throw new PeopleValidationError("Vigência inválida.", "validFrom");
  const overlapping = existing.filter(
    (x) =>
      x.kind === m.kind &&
      x.level === m.level &&
      (x.validTo === null || m.validFrom <= x.validTo) &&
      (m.validTo === null || x.validFrom <= m.validTo),
  );
  // Chefia direta partilhada (co-chefia, ex.: dois sócios): até MAX_DIRECT em simultâneo, sem repetir a mesma pessoa.
  if (m.kind === "direct") {
    if (overlapping.some((x) => x.managerEmployeeId === m.managerEmployeeId)) throw new PeopleValidationError("Este responsável direto já está atribuído nesse período.", "managerEmployeeId");
    if (overlapping.length >= MAX_DIRECT) throw new PeopleValidationError(`No máximo ${MAX_DIRECT} responsáveis diretos em simultâneo.`, "managerEmployeeId");
    return;
  }
  if (overlapping.length) throw new PeopleValidationError("Já existe um responsável deste tipo e nível nesse período. Termine o atual primeiro.", "kind");
}

/** Chefia direta em vigor num dia (organograma). */
export const directOn = (links: ManagerLink[], date: string) =>
  links.filter((m) => m.kind === "direct" && m.validFrom <= date && (m.validTo === null || date <= m.validTo));

/**
 * Mudar a chefia direta de `employeeId` para `managerId` criaria um ciclo?
 * (o novo responsável já está, direta ou indiretamente, abaixo do colaborador).
 */
export function createsCycle(active: ManagerLink[], employeeId: string, managerId: string): boolean {
  const up = new Map(active.map((m) => [m.employeeId, m.managerEmployeeId]));
  const seen = new Set<string>();
  for (let cur: string | undefined = managerId; cur; cur = up.get(cur)) {
    if (cur === employeeId) return true;
    if (seen.has(cur)) return false;
    seen.add(cur);
  }
  return false;
}

export type CompensationKind = "complement" | "benefit";
export type PayPeriod = "monthly" | "biweekly" | "weekly";

export interface CompensationItem {
  id: string;
  kind: CompensationKind;
  name: string;
  code: string | null;
  mode: "fixed" | "variable" | "employee" | "services" | "copayment";
  amount: number;
  employeeAmount: number | null;
  currency: string;
  payPeriod: PayPeriod;
  everyNMonths: number;
  active: boolean;
}

export interface CompensationAssignment {
  id: string;
  employeeId: string;
  itemId: string;
  amount: number | null;
  validFrom: string;
  validTo: string | null;
}

export function validateCompensationItem(i: Omit<CompensationItem, "id" | "active">): void {
  const fail = (field: string, msg: string): never => {
    throw new PeopleValidationError(msg, field);
  };
  if (!i.name.trim() || i.name.length > 120) fail("name", "O nome é obrigatório (máx. 120).");
  const modes = i.kind === "complement" ? ["fixed", "variable"] : i.kind === "benefit" ? ["employee", "services", "copayment"] : [];
  if (!modes.includes(i.mode)) fail("mode", "Forma inválida para este tipo.");
  if (!(i.amount >= 0)) fail("amount", "Valor inválido.");
  if (i.employeeAmount !== null && !(i.employeeAmount >= 0)) fail("employeeAmount", "Valor inválido.");
  if (!/^[A-Z]{3}$/.test(i.currency)) fail("currency", "Moeda inválida.");
  if (!["monthly", "biweekly", "weekly"].includes(i.payPeriod)) fail("payPeriod", "Periodicidade inválida.");
  if (!(Number.isInteger(i.everyNMonths) && i.everyNMonths >= 1 && i.everyNMonths <= 12)) fail("everyNMonths", "Recorrência entre 1 e 12 meses.");
}

/**
 * CF-14 / C3.8: complemento só para quem tem a mesma moeda; benefício também
 * com o mesmo período de pagamento do salário. Devolve a regra violada ou null.
 */
export function compensationRuleViolation(item: CompensationItem, employee: { currency: string; payPeriod: PayPeriod }): string | null {
  if (item.currency !== employee.currency) return `A moeda do ${item.kind === "complement" ? "complemento" : "benefício"} (${item.currency}) é diferente da do colaborador (${employee.currency}).`;
  if (item.kind === "benefit" && item.payPeriod !== employee.payPeriod) return "O benefício tem um período de pagamento diferente do salário do colaborador.";
  return null;
}

export interface CustomFieldDefinition {
  id: string;
  section: "personal" | "work" | "custom";
  name: string;
  format: "text" | "options";
  options: string[];
  sensitive: boolean;
  archived: boolean;
}

export function validateCustomFieldDefinition(d: Omit<CustomFieldDefinition, "id" | "archived">): void {
  if (!["personal", "work", "custom"].includes(d.section)) throw new PeopleValidationError("Secção inválida.", "section");
  if (!d.name.trim() || d.name.length > 80) throw new PeopleValidationError("O nome é obrigatório (máx. 80).", "name");
  if (!["text", "options"].includes(d.format)) throw new PeopleValidationError("Formato inválido.", "format");
  if (d.format === "options" && (d.options.length < 2 || d.options.some((o) => !o.trim() || o.length > 80))) {
    throw new PeopleValidationError("Um campo de opções precisa de pelo menos 2 opções.", "options");
  }
}

export function validateCustomValue(d: CustomFieldDefinition, value: string | null): void {
  if (value === null) return;
  if (value.length > 1000) throw new PeopleValidationError(`${d.name}: até 1000 caracteres.`, d.id);
  if (d.format === "options" && !d.options.includes(value)) throw new PeopleValidationError(`${d.name}: opção inválida.`, d.id);
}
