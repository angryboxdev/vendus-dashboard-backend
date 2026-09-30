import { InvalidDeliveryWeekdayError } from "../errors.js";

interface SupplierDeliveryScheduleProps {
  id: string;
  supplierId: string;
  locationId: string;
  /** ISO weekday, 1=Segunda … 7=Domingo; `null`/`[]` = sem calendário configurado (nunca um compromisso, só informativo). */
  weekdays: number[] | null;
  /** HH:mm, `null` = sem hora limite. */
  cutoffTime: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertSupplierDeliveryScheduleData {
  weekdays: number[] | null;
  cutoffTime?: string | null;
  active?: boolean;
}

function validateWeekdays(weekdays: number[] | null): void {
  if (!weekdays) return;
  for (const day of weekdays) {
    if (!Number.isInteger(day) || day < 1 || day > 7) throw new InvalidDeliveryWeekdayError(day);
  }
}

/**
 * Calendário de entrega de um fornecedor numa loja (secção 5 da task —
 * puramente informativo, nunca um compromisso/SLA rastreado). Uma linha
 * por `(supplier_id, location_id)`.
 */
export class SupplierDeliverySchedule {
  private constructor(private readonly props: SupplierDeliveryScheduleProps) {}

  static create(props: { supplierId: string; locationId: string; weekdays: number[] | null; cutoffTime?: string | null; active?: boolean }): SupplierDeliverySchedule {
    validateWeekdays(props.weekdays);
    const now = new Date();
    return new SupplierDeliverySchedule({
      id: crypto.randomUUID(),
      supplierId: props.supplierId,
      locationId: props.locationId,
      weekdays: props.weekdays,
      cutoffTime: props.cutoffTime ?? null,
      active: props.active ?? true,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: SupplierDeliveryScheduleProps): SupplierDeliverySchedule {
    return new SupplierDeliverySchedule(props);
  }

  update(data: UpsertSupplierDeliveryScheduleData): SupplierDeliverySchedule {
    validateWeekdays(data.weekdays);
    return new SupplierDeliverySchedule({
      ...this.props,
      weekdays: data.weekdays,
      cutoffTime: data.cutoffTime !== undefined ? data.cutoffTime : this.props.cutoffTime,
      active: data.active !== undefined ? data.active : this.props.active,
      updatedAt: new Date(),
    });
  }

  get id(): string {
    return this.props.id;
  }

  get supplierId(): string {
    return this.props.supplierId;
  }

  get locationId(): string {
    return this.props.locationId;
  }

  toProps(): SupplierDeliveryScheduleProps {
    return { ...this.props };
  }
}
