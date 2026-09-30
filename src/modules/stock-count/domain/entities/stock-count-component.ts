import { InvalidConversionFactorError, InvalidCountedQuantityError } from "../errors.js";

interface StockCountComponentProps {
  id: string;
  organizationId: string;
  attemptId: string;
  /** Zona onde este componente foi contado — nullable, nunca uma dimensão de saldo (secção 25). */
  countAreaId: string | null;
  quantity: number;
  unit: string;
  conversionFactor: number;
  baseQuantity: number;
  createdAt: Date;
}

export interface CreateStockCountComponentProps {
  organizationId: string;
  attemptId: string;
  countAreaId?: string | null;
  quantity: number;
  unit: string;
  conversionFactor: number;
}

/**
 * Um "pedaço" de uma tentativa de contagem, numa unidade (base ou
 * alternativa) e opcionalmente numa zona. `baseQuantity` é sempre calculado
 * aqui — `quantity × conversionFactor` — nunca confiado ao cliente
 * (secção 22 da task).
 */
export class StockCountComponent {
  private constructor(private readonly props: StockCountComponentProps) {}

  static create(props: CreateStockCountComponentProps): StockCountComponent {
    if (!Number.isFinite(props.quantity) || props.quantity < 0) {
      throw new InvalidCountedQuantityError("tem de ser um número não negativo e finito");
    }
    if (!Number.isFinite(props.conversionFactor) || props.conversionFactor <= 0) {
      throw new InvalidConversionFactorError(props.conversionFactor);
    }
    return new StockCountComponent({
      id: crypto.randomUUID(),
      organizationId: props.organizationId,
      attemptId: props.attemptId,
      countAreaId: props.countAreaId ?? null,
      quantity: props.quantity,
      unit: props.unit,
      conversionFactor: props.conversionFactor,
      baseQuantity: props.quantity * props.conversionFactor,
      createdAt: new Date(),
    });
  }

  static reconstitute(props: StockCountComponentProps): StockCountComponent {
    return new StockCountComponent(props);
  }

  get id(): string {
    return this.props.id;
  }

  get attemptId(): string {
    return this.props.attemptId;
  }

  get baseQuantity(): number {
    return this.props.baseQuantity;
  }

  toProps(): StockCountComponentProps {
    return { ...this.props };
  }
}
