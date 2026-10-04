import { InvalidLocationError, type LocationFieldError } from "../errors.js";

export interface LocationProps {
  id: string;
  name: string;
  /** Código interno opcional, único por organização quando preenchido. */
  code: string | null;
  timezone: string;
  isActive: boolean;
  address?: string | null;
  postalCode?: string | null;
  /** Localidade. */
  city?: string | null;
  /** Município — relevante para feriados municipais (ticket 04). */
  municipality?: string | null;
  /** ISO 3166-1 alpha-2. */
  country?: string;
  phone?: string | null;
  updatedAt?: string;
}

/** Campos editáveis pela UI — estado (ativo/inativo) muda só por `activate`/`deactivate`. */
export interface LocationDetails {
  name: string;
  code: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  municipality: string | null;
  country: string;
  timezone: string;
  phone: string | null;
}

export type LocationChanges = Partial<LocationDetails>;

const DEFAULT_COUNTRY = "PT";

function trimOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("pt-PT", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function normalize(details: LocationDetails): LocationDetails {
  return {
    name: details.name.trim(),
    code: trimOrNull(details.code)?.toUpperCase() ?? null,
    address: trimOrNull(details.address),
    postalCode: trimOrNull(details.postalCode),
    city: trimOrNull(details.city),
    municipality: trimOrNull(details.municipality),
    country: details.country.trim().toUpperCase(),
    timezone: details.timezone.trim(),
    phone: trimOrNull(details.phone),
  };
}

/** Só regras de formato que conhecemos com certeza (código postal português NNNN-NNN). */
function validate(details: LocationDetails): void {
  const errors: LocationFieldError[] = [];
  if (details.name.length === 0) errors.push({ field: "name", message: "obrigatório" });
  else if (details.name.length > 120) errors.push({ field: "name", message: "máximo 120 caracteres" });
  if (details.code !== null && !/^[A-Z0-9_-]{1,20}$/.test(details.code)) {
    errors.push({ field: "code", message: "até 20 letras, números, - ou _" });
  }
  if (!/^[A-Z]{2}$/.test(details.country)) errors.push({ field: "country", message: "código de país inválido" });
  if (details.postalCode !== null && details.country === "PT" && !/^\d{4}-\d{3}$/.test(details.postalCode)) {
    errors.push({ field: "postalCode", message: "formato NNNN-NNN" });
  }
  if (details.phone !== null && !/^\+?[0-9 ()-]{6,20}$/.test(details.phone)) errors.push({ field: "phone", message: "telefone inválido" });
  if (!isValidTimezone(details.timezone)) errors.push({ field: "timezone", message: "fuso horário inválido" });
  if (errors.length > 0) throw new InvalidLocationError(errors);
}

/**
 * Um Local físico/operacional da organização (CONTEXT.md: Location) —
 * transversal: RH, Stock, Financeiro e restantes módulos referenciam-no por
 * `location_id`, nunca por texto. Imutável: cada operação devolve uma nova
 * instância (o use case precisa do "antes" para a auditoria). Nunca é
 * apagado — só inativado.
 */
export class Location {
  readonly id: string;
  readonly name: string;
  readonly code: string | null;
  readonly timezone: string;
  readonly isActive: boolean;
  readonly address: string | null;
  readonly postalCode: string | null;
  readonly city: string | null;
  readonly municipality: string | null;
  readonly country: string;
  readonly phone: string | null;
  readonly updatedAt: string | null;

  private constructor(props: LocationProps) {
    this.id = props.id;
    this.name = props.name;
    this.code = props.code;
    this.timezone = props.timezone;
    this.isActive = props.isActive;
    this.address = props.address ?? null;
    this.postalCode = props.postalCode ?? null;
    this.city = props.city ?? null;
    this.municipality = props.municipality ?? null;
    this.country = props.country ?? DEFAULT_COUNTRY;
    this.phone = props.phone ?? null;
    this.updatedAt = props.updatedAt ?? null;
  }

  static create(id: string, details: LocationDetails, now: Date): Location {
    const normalized = normalize(details);
    validate(normalized);
    return new Location({ id, ...normalized, isActive: true, updatedAt: now.toISOString() });
  }

  /** Dados persistidos já foram validados na escrita (ou vêm do provisioning) — não se revalida. */
  static reconstitute(props: LocationProps): Location {
    return new Location(props);
  }

  details(): LocationDetails {
    return {
      name: this.name,
      code: this.code,
      address: this.address,
      postalCode: this.postalCode,
      city: this.city,
      municipality: this.municipality,
      country: this.country,
      timezone: this.timezone,
      phone: this.phone,
    };
  }

  update(changes: LocationChanges, now: Date): Location {
    const merged: LocationDetails = { ...this.details() };
    for (const key of Object.keys(changes) as (keyof LocationDetails)[]) {
      const value = changes[key];
      if (value !== undefined) (merged as unknown as Record<string, string | null>)[key] = value;
    }
    const normalized = normalize(merged);
    validate(normalized);
    return new Location({ ...this.toProps(), ...normalized, updatedAt: now.toISOString() });
  }

  /** Inativar só muda o estado — todas as relações históricas (`location_id`) continuam válidas. */
  deactivate(now: Date): Location {
    return new Location({ ...this.toProps(), isActive: false, updatedAt: now.toISOString() });
  }

  activate(now: Date): Location {
    return new Location({ ...this.toProps(), isActive: true, updatedAt: now.toISOString() });
  }

  toProps(): Required<LocationProps> {
    return {
      id: this.id,
      ...this.details(),
      isActive: this.isActive,
      updatedAt: this.updatedAt ?? "",
    };
  }
}
