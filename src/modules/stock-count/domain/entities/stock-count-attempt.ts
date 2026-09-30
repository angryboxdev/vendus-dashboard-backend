interface StockCountAttemptProps {
  id: string;
  organizationId: string;
  countLineId: string;
  attemptNumber: number;
  countStartedAt: Date;
  countedAt: Date;
  /** Quantidade contada nesta tentativa (soma já convertida à unidade base). Nunca `null` para uma tentativa submetida — "vazio" é o `not_counted` da LINHA, não desta tentativa (secção 15). */
  countedQuantity: number;
  systemQuantityAtCount: number;
  /** Fingerprint local — `COUNT(*)` de `stock_movements` para item+local até `countStartedAt` (nunca uma sequência global, ver README). */
  ledgerVersionAtCount: number;
  movementsDuringCount: boolean;
  countedBy: string;
  /** `true` para a "tentativa manual" criada implicitamente por `resolveManually` (secção 36). */
  isManual: boolean;
  reasonNullable: string | null;
  createdAt: Date;
}

export interface CreateStockCountAttemptProps {
  organizationId: string;
  countLineId: string;
  attemptNumber: number;
  countStartedAt: Date;
  countedQuantity: number;
  systemQuantityAtCount: number;
  ledgerVersionAtCount: number;
  movementsDuringCount: boolean;
  countedBy: string;
  isManual?: boolean;
  reasonNullable?: string | null;
}

/**
 * Imutável depois de criada — nunca há método de mutação aqui. Cada
 * tentativa guarda o SEU PRÓPRIO `systemQuantityAtCount` — recontagens
 * nunca comparam números brutos entre tentativas diferentes, sempre contra
 * o snapshot da própria tentativa (secção 26/27).
 */
export class StockCountAttempt {
  private constructor(private readonly props: StockCountAttemptProps) {}

  static create(props: CreateStockCountAttemptProps): StockCountAttempt {
    return new StockCountAttempt({
      id: crypto.randomUUID(),
      organizationId: props.organizationId,
      countLineId: props.countLineId,
      attemptNumber: props.attemptNumber,
      countStartedAt: props.countStartedAt,
      countedAt: new Date(),
      countedQuantity: props.countedQuantity,
      systemQuantityAtCount: props.systemQuantityAtCount,
      ledgerVersionAtCount: props.ledgerVersionAtCount,
      movementsDuringCount: props.movementsDuringCount,
      countedBy: props.countedBy,
      isManual: props.isManual ?? false,
      reasonNullable: props.reasonNullable ?? null,
      createdAt: new Date(),
    });
  }

  static reconstitute(props: StockCountAttemptProps): StockCountAttempt {
    return new StockCountAttempt(props);
  }

  get id(): string {
    return this.props.id;
  }

  get countLineId(): string {
    return this.props.countLineId;
  }

  get attemptNumber(): number {
    return this.props.attemptNumber;
  }

  get countedQuantity(): number {
    return this.props.countedQuantity;
  }

  get systemQuantityAtCount(): number {
    return this.props.systemQuantityAtCount;
  }

  get movementsDuringCount(): boolean {
    return this.props.movementsDuringCount;
  }

  toProps(): StockCountAttemptProps {
    return { ...this.props };
  }
}
