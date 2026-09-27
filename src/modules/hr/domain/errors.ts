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

/**
 * Só existe uma versão "atual" por categoria de documento de cada vez —
 * enviar uma nova categoria quando já existe uma versão atual força o
 * chamador a usar a acção "Substituir" (nunca cria uma segunda linha
 * concorrente "atual" para a mesma categoria).
 */
export class DocumentCategoryAlreadyExistsError extends Error {
  constructor(category: string) {
    super(`Já existe um documento atual na categoria "${category}" — usa substituir em vez de enviar novo`);
    this.name = "DocumentCategoryAlreadyExistsError";
  }
}

/** Tentativa de substituir/remover uma versão que já não é a atual. */
export class DocumentNotCurrentError extends Error {
  constructor(id: string) {
    super(`Documento ${id} já não é a versão atual — não pode ser substituído/removido`);
    this.name = "DocumentNotCurrentError";
  }
}

/** Definição de categoria de documento (configuração, não instância enviada) não encontrada. */
export class DocumentCategoryConfigNotFoundError extends Error {
  constructor(id: string) {
    super(`Categoria de documento não encontrada: ${id}`);
    this.name = "DocumentCategoryConfigNotFoundError";
  }
}

/** Já existe uma categoria de documento configurada com este slug/label nesta organização. */
export class DocumentCategoryConfigAlreadyExistsError extends Error {
  constructor(slug: string) {
    super(`Já existe uma categoria de documento com este nome: "${slug}"`);
    this.name = "DocumentCategoryConfigAlreadyExistsError";
  }
}

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
