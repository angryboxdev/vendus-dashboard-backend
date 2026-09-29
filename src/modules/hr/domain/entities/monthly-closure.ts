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
  /** Foto do "Por colaborador"/Fecho mensal no momento exato do fecho (task "Simplificar Assiduidade", secção 18: "criar snapshot do período") — protege os dados consolidados de recomputações futuras enquanto o período estiver fechado. `null` enquanto o período nunca foi fechado. */
  readonly snapshot: unknown | null;

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
    snapshot: unknown | null;
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
    this.snapshot = props.snapshot;
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
    snapshot: unknown | null;
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
      snapshot: null,
    });
  }

  get isClosed(): boolean {
    return this.status === "closed";
  }

  close(actor: string, now: string, snapshot: unknown): MonthlyClosure {
    return new MonthlyClosure({ ...this.toProps(), status: "closed", closedBy: actor, closedAt: now, snapshot });
  }

  /** O snapshot do fecho anterior nunca é apagado ao reabrir — só deixa de ser servido (o use case volta a calcular ao vivo enquanto o período estiver aberto); um novo fecho grava um snapshot novo. */
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
      snapshot: this.snapshot,
    };
  }
}
