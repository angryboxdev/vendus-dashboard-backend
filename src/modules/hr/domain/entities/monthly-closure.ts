/**
 * Fecho mensal de assiduidade (Fase 2) — por organização inteira
 * (confirmado com o utilizador, nunca por local). Ausência de linha na BD
 * = período em aberto por omissão (mesmo espírito de `hr_shift_attendance`:
 * "ausência de linha = conferência pendente"), por isso `reconstitute`
 * nunca é chamado para um período nunca fechado — o repositório devolve
 * `null` nesse caso e o use case trata isso como aberto.
 */
export class MonthlyClosure {
  readonly id: string;
  readonly organizationId: string;
  readonly year: number;
  readonly month: number;
  readonly status: "open" | "closed";
  readonly closedBy: string | null;
  readonly closedAt: string | null;
  readonly reopenedBy: string | null;
  readonly reopenedAt: string | null;
  readonly reopenReason: string | null;
  readonly createdAt: string;

  private constructor(props: {
    id: string;
    organizationId: string;
    year: number;
    month: number;
    status: "open" | "closed";
    closedBy: string | null;
    closedAt: string | null;
    reopenedBy: string | null;
    reopenedAt: string | null;
    reopenReason: string | null;
    createdAt: string;
  }) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.year = props.year;
    this.month = props.month;
    this.status = props.status;
    this.closedBy = props.closedBy;
    this.closedAt = props.closedAt;
    this.reopenedBy = props.reopenedBy;
    this.reopenedAt = props.reopenedAt;
    this.reopenReason = props.reopenReason;
    this.createdAt = props.createdAt;
  }

  static reconstitute(props: {
    id: string;
    organizationId: string;
    year: number;
    month: number;
    status: "open" | "closed";
    closedBy: string | null;
    closedAt: string | null;
    reopenedBy: string | null;
    reopenedAt: string | null;
    reopenReason: string | null;
    createdAt: string;
  }): MonthlyClosure {
    return new MonthlyClosure(props);
  }

  static openDefault(organizationId: string, year: number, month: number): MonthlyClosure {
    return new MonthlyClosure({
      id: "",
      organizationId,
      year,
      month,
      status: "open",
      closedBy: null,
      closedAt: null,
      reopenedBy: null,
      reopenedAt: null,
      reopenReason: null,
      createdAt: "",
    });
  }

  get isClosed(): boolean {
    return this.status === "closed";
  }

  close(actor: string, now: string): MonthlyClosure {
    return new MonthlyClosure({ ...this.toProps(), status: "closed", closedBy: actor, closedAt: now });
  }

  reopen(actor: string, reason: string, now: string): MonthlyClosure {
    return new MonthlyClosure({ ...this.toProps(), status: "open", reopenedBy: actor, reopenedAt: now, reopenReason: reason });
  }

  toProps() {
    return {
      id: this.id,
      organizationId: this.organizationId,
      year: this.year,
      month: this.month,
      status: this.status,
      closedBy: this.closedBy,
      closedAt: this.closedAt,
      reopenedBy: this.reopenedBy,
      reopenedAt: this.reopenedAt,
      reopenReason: this.reopenReason,
      createdAt: this.createdAt,
    };
  }
}
