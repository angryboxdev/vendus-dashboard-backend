import { InvalidDeliveryDayRuleError, InvalidDeliveryWeekdayError } from "../errors.js";

/** Regra de um dia de entrega: até quando se encomenda para esse dia e uma observação. */
export interface DeliveryDayRule {
  /** Dia de entrega (ISO, 1=Segunda … 7=Domingo). */
  weekday: number;
  /** Dia em que se tem de encomendar; `null` = dia anterior à entrega. */
  orderWeekday: number | null;
  /** HH:mm; `null` = usa a hora limite geral do calendário. */
  orderTime: string | null;
  notes: string | null;
}

interface SupplierDeliveryScheduleProps {
  id: string;
  supplierId: string;
  locationId: string;
  /** ISO weekday, 1=Segunda … 7=Domingo; `null`/`[]` = sem calendário configurado (nunca um compromisso, só informativo). */
  weekdays: number[] | null;
  /** HH:mm, `null` = sem hora limite. */
  cutoffTime: string | null;
  active: boolean;
  /** Uma regra no máximo por dia de entrega, sempre de um dia que está em `weekdays`. */
  dayRules: DeliveryDayRule[];
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertSupplierDeliveryScheduleData {
  weekdays: number[] | null;
  cutoffTime?: string | null;
  active?: boolean;
  /** Ausente = mantém as regras atuais (só as dos dias que continuam selecionados). */
  dayRules?: DeliveryDayRule[];
}

const NOTES_MAX = 200;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const isWeekday = (day: unknown): day is number => Number.isInteger(day) && (day as number) >= 1 && (day as number) <= 7;

function validateWeekdays(weekdays: number[] | null): void {
  if (!weekdays) return;
  for (const day of weekdays) {
    if (!isWeekday(day)) throw new InvalidDeliveryWeekdayError(day);
  }
}

/** Valida as regras e deixa só as dos dias de entrega selecionados (tirar um dia apaga a sua regra). */
function normalizeDayRules(rules: DeliveryDayRule[], weekdays: number[] | null): DeliveryDayRule[] {
  const selected = new Set(weekdays ?? []);
  const seen = new Set<number>();
  const result: DeliveryDayRule[] = [];
  for (const rule of rules) {
    if (!isWeekday(rule.weekday)) throw new InvalidDeliveryWeekdayError(rule.weekday);
    if (rule.orderWeekday !== null && !isWeekday(rule.orderWeekday)) throw new InvalidDeliveryWeekdayError(rule.orderWeekday);
    if (rule.orderTime !== null && !TIME_RE.test(rule.orderTime)) throw new InvalidDeliveryDayRuleError(`hora «${rule.orderTime}» (use HH:mm)`);
    const notes = rule.notes?.trim() || null;
    if (notes && notes.length > NOTES_MAX) throw new InvalidDeliveryDayRuleError(`observação com mais de ${NOTES_MAX} caracteres`);
    if (seen.has(rule.weekday)) throw new InvalidDeliveryDayRuleError(`dia ${rule.weekday} repetido`);
    seen.add(rule.weekday);
    if (selected.has(rule.weekday)) result.push({ weekday: rule.weekday, orderWeekday: rule.orderWeekday, orderTime: rule.orderTime, notes });
  }
  return result.sort((a, b) => a.weekday - b.weekday);
}

/**
 * Calendário de entrega de um fornecedor numa loja (secção 5 da task —
 * puramente informativo, nunca um compromisso/SLA rastreado). Uma linha
 * por `(supplier_id, location_id)`.
 */
export class SupplierDeliverySchedule {
  private constructor(private readonly props: SupplierDeliveryScheduleProps) {}

  static create(props: {
    supplierId: string;
    locationId: string;
    weekdays: number[] | null;
    cutoffTime?: string | null;
    active?: boolean;
    dayRules?: DeliveryDayRule[];
  }): SupplierDeliverySchedule {
    validateWeekdays(props.weekdays);
    const now = new Date();
    return new SupplierDeliverySchedule({
      id: crypto.randomUUID(),
      supplierId: props.supplierId,
      locationId: props.locationId,
      weekdays: props.weekdays,
      cutoffTime: props.cutoffTime ?? null,
      active: props.active ?? true,
      dayRules: normalizeDayRules(props.dayRules ?? [], props.weekdays),
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
      dayRules: normalizeDayRules(data.dayRules ?? this.props.dayRules, data.weekdays),
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
    return { ...this.props, dayRules: this.props.dayRules.map((r) => ({ ...r })) };
  }
}
