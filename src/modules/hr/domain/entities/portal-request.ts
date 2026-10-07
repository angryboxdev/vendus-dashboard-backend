/**
 * Pedido feito pelo colaborador no Portal (ticket 12):
 * - `justify_absence` — justificar uma falta/atraso num turno passado; decide o RH;
 * - `day_off` — pedir folga num período futuro; decide o gerente (escalas).
 * Aprovar cria a ausência correspondente; a escala nunca é mexida
 * automaticamente (o gerente ajusta à mão). Só se cancela enquanto pendente.
 */
export type PortalRequestKind = "justify_absence" | "day_off";
export type PortalRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export const REQUEST_REASONS: Record<PortalRequestKind, Record<string, string>> = {
  justify_absence: {
    medical: "Consulta ou atestado médico",
    sick: "Doença",
    family: "Assunto familiar",
    transport: "Problema de transporte",
    other: "Outro motivo",
  },
  day_off: {
    personal: "Assunto pessoal",
    family: "Assunto familiar",
    medical: "Consulta médica",
    study: "Estudos / exame",
    other: "Outro motivo",
  },
};

export interface RequestAttachment {
  path: string;
  name: string;
  mime: string;
}

export interface PortalRequestProps {
  id: string;
  employeeId: string;
  kind: PortalRequestKind;
  status: PortalRequestStatus;
  workShiftId: string | null;
  startDate: string;
  endDate: string;
  reasonCode: string;
  reasonText: string | null;
  attachment: RequestAttachment | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  leaveRequestId: string | null;
  createdAt: string;
}

export class InvalidPortalRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPortalRequestError";
  }
}

export class PortalRequestNotPendingError extends Error {
  constructor() {
    super("Este pedido já foi decidido ou cancelado.");
    this.name = "PortalRequestNotPendingError";
  }
}

/** Folga: período máximo de uma vez (o resto pede-se como férias ao RH). */
export const MAX_DAY_OFF_DAYS = 7;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const daysBetween = (a: string, b: string) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;

export class PortalRequest {
  private constructor(private readonly props: PortalRequestProps) {}

  static reconstitute(props: PortalRequestProps): PortalRequest {
    return new PortalRequest({ ...props });
  }

  private static reason(kind: PortalRequestKind, code: string, text: string | null): { reasonCode: string; reasonText: string | null } {
    if (!REQUEST_REASONS[kind][code]) throw new InvalidPortalRequestError("Escolha um motivo.");
    const clean = text?.trim() || null;
    if (code === "other" && !clean) throw new InvalidPortalRequestError("Descreva o motivo.");
    if (clean && clean.length > 500) throw new InvalidPortalRequestError("O texto do motivo tem no máximo 500 caracteres.");
    return { reasonCode: code, reasonText: clean };
  }

  static justifyAbsence(p: {
    employeeId: string;
    workShiftId: string;
    workDate: string;
    reasonCode: string;
    reasonText: string | null;
    attachment: RequestAttachment | null;
    today: string;
  }): PortalRequest {
    if (p.workDate > p.today) throw new InvalidPortalRequestError("Só pode justificar turnos que já começaram.");
    return new PortalRequest({
      id: crypto.randomUUID(),
      employeeId: p.employeeId,
      kind: "justify_absence",
      status: "pending",
      workShiftId: p.workShiftId,
      startDate: p.workDate,
      endDate: p.workDate,
      ...PortalRequest.reason("justify_absence", p.reasonCode, p.reasonText),
      attachment: p.attachment,
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      leaveRequestId: null,
      createdAt: new Date().toISOString(),
    });
  }

  static dayOff(p: { employeeId: string; startDate: string; endDate: string; reasonCode: string; reasonText: string | null; today: string }): PortalRequest {
    if (!ISO.test(p.startDate) || !ISO.test(p.endDate) || p.endDate < p.startDate) throw new InvalidPortalRequestError("Datas inválidas.");
    if (p.startDate < p.today) throw new InvalidPortalRequestError("A folga tem de ser a partir de hoje.");
    if (daysBetween(p.startDate, p.endDate) + 1 > MAX_DAY_OFF_DAYS) {
      throw new InvalidPortalRequestError(`Uma folga tem no máximo ${MAX_DAY_OFF_DAYS} dias seguidos — para mais, fale com o RH.`);
    }
    return new PortalRequest({
      id: crypto.randomUUID(),
      employeeId: p.employeeId,
      kind: "day_off",
      status: "pending",
      workShiftId: null,
      startDate: p.startDate,
      endDate: p.endDate,
      ...PortalRequest.reason("day_off", p.reasonCode, p.reasonText),
      attachment: null,
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      leaveRequestId: null,
      createdAt: new Date().toISOString(),
    });
  }

  get id() { return this.props.id; }
  get employeeId() { return this.props.employeeId; }
  get kind() { return this.props.kind; }
  get status() { return this.props.status; }
  get workShiftId() { return this.props.workShiftId; }
  get startDate() { return this.props.startDate; }
  get endDate() { return this.props.endDate; }
  get attachment() { return this.props.attachment; }

  /** Dias de calendário abrangidos (inclusive). */
  get days(): number {
    return daysBetween(this.props.startDate, this.props.endDate) + 1;
  }

  /** Ainda conta (pendente ou aprovado) — para não deixar pedir duas vezes o mesmo. */
  get isOpen(): boolean {
    return this.props.status === "pending" || this.props.status === "approved";
  }

  overlaps(startDate: string, endDate: string): boolean {
    return this.props.startDate <= endDate && startDate <= this.props.endDate;
  }

  approve(by: string, leaveRequestId: string, note: string | null, at: Date = new Date()): PortalRequest {
    if (this.props.status !== "pending") throw new PortalRequestNotPendingError();
    return new PortalRequest({ ...this.props, status: "approved", decidedBy: by, decidedAt: at.toISOString(), decisionNote: note?.trim() || null, leaveRequestId });
  }

  reject(by: string, note: string, at: Date = new Date()): PortalRequest {
    if (this.props.status !== "pending") throw new PortalRequestNotPendingError();
    if (!note.trim()) throw new InvalidPortalRequestError("Indique o motivo da rejeição — o colaborador vai vê-lo no Portal.");
    return new PortalRequest({ ...this.props, status: "rejected", decidedBy: by, decidedAt: at.toISOString(), decisionNote: note.trim() });
  }

  cancel(): PortalRequest {
    if (this.props.status !== "pending") throw new PortalRequestNotPendingError();
    return new PortalRequest({ ...this.props, status: "cancelled" });
  }

  toProps(): PortalRequestProps {
    return { ...this.props };
  }
}
