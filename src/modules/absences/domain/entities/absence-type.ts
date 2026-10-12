import { AbsenceValidationError } from "../errors.js";

/**
 * Tipo de ausência (C5.3). Declara explicitamente unidade, contagem, limite
 * e renovação, acumulação, aprovação, privacidade, anexo, impacto no tempo e
 * interseção com o horário. Nenhum valor legal por omissão (D6).
 * Férias (`vacation`) usam as regras do calendário de férias do colaborador.
 */
export type AbsenceCategory = "vacation" | "permission" | "medical" | "compensation";
export type TimeImpact = "reduce_theoretical" | "count_as_worked" | "none";

export interface AbsenceType {
  id: string;
  name: string;
  code: string | null;
  color: string | null;
  category: AbsenceCategory;
  unit: "days" | "hours";
  counting: "working" | "calendar";
  /** null = sem limite. */
  limitAmount: number | null;
  renewal: "calendar_year" | "work_year";
  allowNegative: boolean;
  carryOver: boolean;
  requiresApproval: boolean;
  private: boolean;
  hiddenFromEmployee: boolean;
  attachment: "none" | "optional" | "required";
  timeImpact: TimeImpact;
  intersectSchedule: boolean;
  halfDay: boolean;
  minConsecutive: number | null;
  maxConsecutive: number | null;
  blockedDates: string[];
  paid: boolean;
  flowId: string | null;
  archived: boolean;
}

export type AbsenceTypeInput = Omit<AbsenceType, "id" | "archived">;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateType(t: AbsenceTypeInput): void {
  if (!t.name?.trim() || t.name.trim().length > 120) throw new AbsenceValidationError("O nome é obrigatório (máx. 120).", "name");
  if (!["vacation", "permission", "medical", "compensation"].includes(t.category)) throw new AbsenceValidationError("Categoria inválida.", "category");
  if (t.unit !== "days" && t.unit !== "hours") throw new AbsenceValidationError("Unidade inválida.", "unit");
  if (t.counting !== "working" && t.counting !== "calendar") throw new AbsenceValidationError("Contagem inválida.", "counting");
  if (t.unit === "hours" && t.counting === "calendar") throw new AbsenceValidationError("Ausências por horas contam só tempo de trabalho.", "counting");
  if (t.limitAmount !== null && (!Number.isFinite(t.limitAmount) || t.limitAmount < 0)) throw new AbsenceValidationError("Limite inválido.", "limitAmount");
  if (!["reduce_theoretical", "count_as_worked", "none"].includes(t.timeImpact)) throw new AbsenceValidationError("Impacto no tempo inválido.", "timeImpact");
  if (!["none", "optional", "required"].includes(t.attachment)) throw new AbsenceValidationError("Opção de anexo inválida.", "attachment");
  if (t.color !== null && !/^#[0-9a-fA-F]{6}$/.test(t.color)) throw new AbsenceValidationError("Cor inválida.", "color");
  if (t.minConsecutive !== null && t.maxConsecutive !== null && t.minConsecutive > t.maxConsecutive) throw new AbsenceValidationError("O mínimo não pode ser maior do que o máximo.", "minConsecutive");
  if (t.blockedDates.some((d) => !DATE.test(d))) throw new AbsenceValidationError("Datas bloqueadas inválidas.", "blockedDates");
  if (t.halfDay && t.unit === "hours") throw new AbsenceValidationError("Meio dia só existe em ausências por dias.", "halfDay");
}

/** Regras efetivas de um pedido: do tipo, ou do calendário de férias para férias. */
export interface LeaveRules {
  unit: "days" | "hours";
  counting: "working" | "calendar";
  limit: number | null;
  renewal: "calendar_year" | "work_year";
  allowNegative: boolean;
  carryOver: boolean;
  halfDay: boolean;
  minConsecutive: number | null;
  maxConsecutive: number | null;
  blockedDates: string[];
  seniority: { afterYears: number; extra: number }[];
  intersectSchedule: boolean;
}

/** Regras do calendário de férias (Fase 3) relevantes para pedidos. */
export interface VacationRules {
  unit: "days" | "hours";
  counting: "working" | "calendar";
  limited: boolean;
  maxAmount: number | null;
  renewal: "calendar_year" | "work_year" | "custom";
  seniorityRules: { afterYears: number; extra: number }[];
  cumulative: boolean;
  halfDay: boolean;
  allowNegative: boolean;
  minConsecutive: number | null;
  maxConsecutive: number | null;
  blockedDates: string[];
}

export function rulesFor(type: AbsenceType, vacation: VacationRules | null): LeaveRules {
  if (type.category === "vacation" && vacation) {
    return {
      unit: vacation.unit,
      counting: vacation.counting,
      limit: vacation.limited ? vacation.maxAmount : null,
      renewal: vacation.renewal === "work_year" ? "work_year" : "calendar_year",
      allowNegative: vacation.allowNegative,
      carryOver: vacation.cumulative,
      halfDay: vacation.halfDay,
      minConsecutive: vacation.minConsecutive,
      maxConsecutive: vacation.maxConsecutive,
      blockedDates: [...new Set([...vacation.blockedDates, ...type.blockedDates])],
      seniority: vacation.seniorityRules,
      intersectSchedule: type.intersectSchedule,
    };
  }
  return {
    unit: type.unit,
    counting: type.counting,
    limit: type.limitAmount,
    renewal: type.renewal,
    allowNegative: type.allowNegative,
    carryOver: type.carryOver,
    halfDay: type.halfDay,
    minConsecutive: type.minConsecutive,
    maxConsecutive: type.maxConsecutive,
    blockedDates: type.blockedDates,
    seniority: [],
    intersectSchedule: type.intersectSchedule,
  };
}
