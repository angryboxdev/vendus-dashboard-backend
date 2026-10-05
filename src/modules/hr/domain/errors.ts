export class InvalidEmployeeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEmployeeError";
  }
}

export class EmployeeNotFoundError extends Error {
  constructor(id: string) {
    super(`Funcionário não encontrado: ${id}`);
    this.name = "EmployeeNotFoundError";
  }
}

export class EmployeeDocumentNotFoundError extends Error {
  constructor(id: string) {
    super(`Documento não encontrado: ${id}`);
    this.name = "EmployeeDocumentNotFoundError";
  }
}

// Erros do motor de documentos — vivem no módulo `documents` (Base Organizacional, ticket 03);
// re-exportados aqui para os use cases/controllers do RH que já os usam.
export {
  DocumentCategoryAlreadyExistsError,
  DocumentNotCurrentError,
  DocumentCategoryConfigNotFoundError,
  DocumentCategoryConfigAlreadyExistsError,
  DocumentPeriodAlreadyExistsError,
  InvalidDocumentError,
} from "../../documents/domain/errors.js";

// ── RH-03 — Escalas & Turnos ────────────────────────────────────────────────

export class InvalidWorkShiftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWorkShiftError";
  }
}

export class WorkShiftNotFoundError extends Error {
  constructor(id: string) {
    super(`Turno não encontrado: ${id}`);
    this.name = "WorkShiftNotFoundError";
  }
}

/** Um turno com presença já registada não pode ser apagado — apagar arrastaria (cascade) a evidência de presença. Corrigir/apagar a presença primeiro. */
export class WorkShiftHasAttendanceError extends Error {
  constructor(id: string) {
    super(`Turno ${id} já tem presença registada — remove a conferência antes de apagar o turno`);
    this.name = "WorkShiftHasAttendanceError";
  }
}

/** Dois turnos do mesmo colaborador, no mesmo dia, com horários sobrepostos. */
export class ShiftOverlapError extends Error {
  constructor(employeeId: string, workDate: string) {
    super(`Já existe um turno sobreposto para este colaborador em ${workDate}`);
    this.name = "ShiftOverlapError";
  }
}

export class InvalidBaseScheduleTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBaseScheduleTemplateError";
  }
}

export class InvalidShiftRotationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidShiftRotationError";
  }
}

export class ShiftRotationNotFoundError extends Error {
  constructor(id: string) {
    super(`Rotação não encontrada: ${id}`);
    this.name = "ShiftRotationNotFoundError";
  }
}

// ── "Novo turno" — padrão semanal / séries recorrentes ──────────────────────

export class InvalidRecurrenceSpecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRecurrenceSpecError";
  }
}

/** Pedido "este e os seguintes"/"toda a série" sobre um turno que não pertence a nenhuma série (avulso, ou já destacado por edição individual). */
export class WorkShiftNotInSeriesError extends Error {
  constructor(id: string) {
    super(`Turno ${id} não pertence a nenhuma série — usa "Somente este turno"`);
    this.name = "WorkShiftNotInSeriesError";
  }
}

// ── Fase 2 — Assiduidade, Correções e Fecho Mensal ──────────────────────────

/** Toda correção manual de assiduidade exige um motivo — nunca acontece "automaticamente" (task Fase 2, secção 12). */
export class AttendanceCorrectionReasonRequiredError extends Error {
  constructor() {
    super("O motivo da correção é obrigatório");
    this.name = "AttendanceCorrectionReasonRequiredError";
  }
}

/** Tentativa de corrigir assiduidade ou editar dados de um mês já fechado — reabrir primeiro (role mais alto). */
export class MonthlyClosureLockedError extends Error {
  constructor(year: number, month: number) {
    super(`O período ${String(month).padStart(2, "0")}/${year} está fechado — reabre-o antes de corrigir`);
    this.name = "MonthlyClosureLockedError";
  }
}

/** Fechar um período com pendências críticas por resolver (secção 21). */
export class MonthlyClosureHasBlockersError extends Error {
  constructor(count: number) {
    super(`${count} pendência${count === 1 ? "" : "s"} impede${count === 1 ? "" : "m"} o fecho`);
    this.name = "MonthlyClosureHasBlockersError";
  }
}

export class MonthlyClosureNotFoundError extends Error {
  constructor(year: number, month: number) {
    super(`Não há fecho para o período ${String(month).padStart(2, "0")}/${year}`);
    this.name = "MonthlyClosureNotFoundError";
  }
}

/** Reabertura sem motivo explícito (secção 23). */
export class MonthlyClosureReopenReasonRequiredError extends Error {
  constructor() {
    super("O motivo da reabertura é obrigatório");
    this.name = "MonthlyClosureReopenReasonRequiredError";
  }
}

// ── Base Organizacional — Cargos (ticket 07) e Local principal (ticket 08) ──

export class PositionNotFoundError extends Error {
  constructor(id: string) {
    super(`Cargo não encontrado: ${id}`);
    this.name = "PositionNotFoundError";
  }
}

export class InvalidPositionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPositionError";
  }
}

/** Já existe um cargo com o mesmo nome normalizado ("Preparador" = "preparador" = " PREPARADOR "). */
export class DuplicatePositionNameError extends Error {
  constructor(name: string) {
    super(`Já existe um cargo com o nome "${name}"`);
    this.name = "DuplicatePositionNameError";
  }
}

/** Atribuir a um colaborador um cargo inativo — quem já o tinha mantém-no, mas nunca se atribui de novo. */
export class InactivePositionError extends Error {
  constructor(name: string) {
    super(`O cargo "${name}" está inativo e não pode ser atribuído`);
    this.name = "InactivePositionError";
  }
}

/** Local inexistente na organização, ou inativo numa nova atribuição. */
export class InvalidEmployeeLocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEmployeeLocationError";
  }
}

// ── RH 2.0 — Modelos de turno ───────────────────────────────────────────────

export class InvalidShiftTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidShiftTemplateError";
  }
}

export class ShiftTemplateNotFoundError extends Error {
  constructor(id: string) {
    super(`Modelo de turno não encontrado: ${id}`);
    this.name = "ShiftTemplateNotFoundError";
  }
}

/** Já existe um modelo com o mesmo nome normalizado ("Manhã 1" = "manhã 1"). */
export class DuplicateShiftTemplateNameError extends Error {
  constructor(name: string) {
    super(`Já existe um modelo de turno com o nome "${name}"`);
    this.name = "DuplicateShiftTemplateNameError";
  }
}

/** Pedido de aplicação de modelo inválido (datas, público, modelo inativo…). */
export class InvalidTemplateApplicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTemplateApplicationError";
  }
}

// ── RH 2.0 — Automatizações ─────────────────────────────────────────────────

export class InvalidShiftAutomationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidShiftAutomationError";
  }
}

export class ShiftAutomationNotFoundError extends Error {
  constructor(id: string) {
    super(`Automatização não encontrada: ${id}`);
    this.name = "ShiftAutomationNotFoundError";
  }
}
