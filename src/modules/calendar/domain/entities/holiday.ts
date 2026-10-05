import { InvalidCalendarEntryError } from "../errors.js";

/** Nacional, Municipal/Local ou Personalizado (task §6). */
export type HolidayType = "national" | "municipal" | "custom";

export interface HolidayProps {
  id: string;
  /** AAAA-MM-DD. */
  date: string;
  name: string;
  type: HolidayType;
  /** `null` = empresa inteira; senão só esse Local. */
  locationId: string | null;
}

export interface HolidayDetails {
  date: string;
  name: string;
  type: HolidayType;
  locationId: string | null;
}

const TYPES: HolidayType[] = ["national", "municipal", "custom"];

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function clean(details: HolidayDetails): HolidayDetails {
  const name = details.name.trim();
  if (!isIsoDate(details.date)) throw new InvalidCalendarEntryError("Data inválida");
  if (name.length === 0) throw new InvalidCalendarEntryError("Nome do feriado é obrigatório");
  if (name.length > 120) throw new InvalidCalendarEntryError("Nome do feriado: máximo 120 caracteres");
  if (!TYPES.includes(details.type)) throw new InvalidCalendarEntryError("Tipo de feriado inválido");
  return { date: details.date, name, type: details.type, locationId: details.locationId };
}

/**
 * Chave de deduplicação da task §6 — tenant (implícito no repositório) +
 * data + tipo + âmbito/local. A mesma regra que o índice único
 * `hr_public_holidays_dedupe_idx`.
 */
export function holidayKey(h: { date: string; type: HolidayType; locationId: string | null }): string {
  return `${h.date}|${h.type}|${h.locationId ?? "company"}`;
}

/**
 * Feriado — conceito laboral (task §6), distinto de um evento empresarial.
 * Vive na tabela já existente `hr_public_holidays`. Imutável.
 */
export class Holiday {
  private constructor(private readonly props: HolidayProps) {}

  get id(): string {
    return this.props.id;
  }
  get date(): string {
    return this.props.date;
  }
  get name(): string {
    return this.props.name;
  }
  get type(): HolidayType {
    return this.props.type;
  }
  get locationId(): string | null {
    return this.props.locationId;
  }
  get key(): string {
    return holidayKey(this.props);
  }

  static create(id: string, details: HolidayDetails): Holiday {
    return new Holiday({ id, ...clean(details) });
  }

  static reconstitute(props: HolidayProps): Holiday {
    return new Holiday({ ...props });
  }

  update(changes: Partial<HolidayDetails>): Holiday {
    return new Holiday({ id: this.props.id, ...clean({ ...this.toProps(), ...changes }) });
  }

  toProps(): HolidayProps {
    return { ...this.props };
  }
}
