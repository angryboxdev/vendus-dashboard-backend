import { PeopleValidationError } from "../errors.js";

/**
 * Ficha do colaborador no Novo RH (sobre `hr_employees`, ADR-0025).
 * Obrigatórios (D4 — mínimo legal): nome, apelido, NIF, data de admissão,
 * centro principal. O resto é opcional e regido pela privacidade por campo.
 */
export interface Employee {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  nif: string | null;
  email: string | null;
  phone: string | null;
  personalEmail: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  birthDate: string | null;
  gender: string | null;
  nationality: string | null;
  niss: string | null;
  idCardNumber: string | null;
  iban: string | null;
  hireDate: string | null;
  primaryLocationId: string | null;
  positionId: string | null;
  status: "active" | "inactive";
  currency: string;
  payPeriod: "monthly" | "biweekly" | "weekly";
  baseSalary: number | null;
  hourlyRate: number | null;
  deactivatedAt: string | null;
  deactivationReason: string | null;
  userId: string | null;
  version: number;
}

/** Campos editáveis pelo Novo RH (sem id, estado, versão, conta). */
export const EDITABLE_FIELDS = [
  "firstName",
  "lastName",
  "nif",
  "email",
  "phone",
  "personalEmail",
  "address",
  "postalCode",
  "city",
  "country",
  "birthDate",
  "gender",
  "nationality",
  "niss",
  "idCardNumber",
  "iban",
  "hireDate",
  "primaryLocationId",
  "positionId",
  "currency",
  "payPeriod",
  "baseSalary",
  "hourlyRate",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];
export type EmployeeInput = Partial<Pick<Employee, EditableField>>;

/**
 * Campo da ficha → chave do catálogo de privacidade por campo (módulo access,
 * `field-privacy.ts`). Campos fora do mapa são sempre visíveis.
 */
export const PRIVACY_KEY: Partial<Record<EditableField, string>> = {
  nif: "identification.nif",
  iban: "identification.iban",
  niss: "identification.niss",
  idCardNumber: "identification.id_document",
  address: "personal.address",
  postalCode: "personal.address",
  city: "personal.address",
  country: "personal.address",
  birthDate: "personal.birth_date",
  gender: "personal.gender",
  nationality: "personal.nationality",
  phone: "personal.phone",
  personalEmail: "personal.email",
  baseSalary: "work.salary",
  hourlyRate: "work.salary",
};

/** Alterar estes exige motivo (Eng. Reversa 12.4: "motivo obrigatório para campos sensíveis"). */
export const SENSITIVE_FIELDS: EditableField[] = ["nif", "iban", "niss", "idCardNumber", "baseSalary", "hourlyRate"];

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/;

/** NIF/NIE/DNI normalizado: maiúsculas, sem espaços nem pontos/hífenes. */
export function normalizeDocument(raw: string): string {
  return raw.toUpperCase().replace(/[\s.\-]/g, "");
}

function clean(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** Normaliza e valida os campos presentes no pedido (os ausentes não mexem). */
export function normalizeInput(raw: Record<string, unknown>): EmployeeInput {
  const out: EmployeeInput = {};
  const fail = (field: string, msg: string): never => {
    throw new PeopleValidationError(msg, field);
  };
  for (const f of EDITABLE_FIELDS) {
    if (!(f in raw)) continue;
    const v = raw[f];
    switch (f) {
      case "baseSalary":
      case "hourlyRate": {
        if (v === null || v === "") out[f] = null;
        else {
          const n = Number(v);
          if (!Number.isFinite(n) || n < 0) fail(f, "Valor inválido.");
          out[f] = Math.round(n * 100) / 100;
        }
        break;
      }
      case "payPeriod": {
        const s = clean(v) ?? "monthly";
        if (!["monthly", "biweekly", "weekly"].includes(s)) fail(f, "Periodicidade inválida.");
        out.payPeriod = s as Employee["payPeriod"];
        break;
      }
      case "currency": {
        const s = (clean(v) ?? "EUR").toUpperCase();
        if (!/^[A-Z]{3}$/.test(s)) fail(f, "Moeda inválida (ex.: EUR).");
        out.currency = s;
        break;
      }
      default: {
        let s = clean(v);
        if (s && (f === "nif" || f === "niss" || f === "idCardNumber")) s = normalizeDocument(s);
        if (s && f === "iban") {
          s = s.replace(/\s/g, "").toUpperCase();
          if (!IBAN.test(s)) fail(f, "IBAN inválido.");
        }
        if (s && (f === "email" || f === "personalEmail") && !EMAIL.test(s)) fail(f, "E-mail inválido.");
        if (s && (f === "birthDate" || f === "hireDate") && !DATE.test(s)) fail(f, "Data inválida.");
        if (s && s.length > 200) fail(f, "Texto demasiado longo.");
        (out as Record<string, unknown>)[f] = s;
      }
    }
  }
  if (out.nif && !/^[A-Z0-9]{5,20}$/.test(out.nif)) fail("nif", "Número de identificação inválido.");
  return out;
}

/** RE-1 + D4: obrigatórios ao criar (e ao editar, sobre o estado final). */
export function requireMandatory(e: EmployeeInput): void {
  const missing: [keyof EmployeeInput, string][] = [
    ["firstName", "O nome é obrigatório."],
    ["lastName", "O apelido é obrigatório."],
    ["nif", "O número de identificação (NIF) é obrigatório."],
    ["hireDate", "A data de admissão é obrigatória."],
    ["primaryLocationId", "O centro principal é obrigatório."],
  ];
  for (const [field, msg] of missing) if (!e[field]) throw new PeopleValidationError(msg, field);
}

/** Campos obrigatórios em falta numa ficha existente (fichas antigas "a completar"). */
export function missingMandatory(e: Employee): string[] {
  const out: string[] = [];
  if (!e.firstName) out.push("firstName");
  if (!e.lastName) out.push("lastName");
  if (!e.nif) out.push("nif");
  if (!e.hireDate) out.push("hireDate");
  if (!e.primaryLocationId) out.push("primaryLocationId");
  return out;
}

export const fullNameOf = (first: string | null | undefined, last: string | null | undefined, fallback: string) =>
  [first, last].filter(Boolean).join(" ").trim() || fallback;
