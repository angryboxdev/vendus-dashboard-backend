import { InvalidOrganizationProfileError, type OrganizationFieldError } from "../errors.js";
import {
  isValidCountryCode,
  isValidEmail,
  isValidPhone,
  isValidPortugueseNif,
  isValidPortugueseNiss,
  isValidPortuguesePostalCode,
  isValidTimezone,
  normalizeTaxId,
  normalizeWebsite,
} from "../services/organization-profile-validation.service.js";

export type OrganizationStatus = "active" | "inactive";

export interface OrganizationProfileProps {
  id: string;
  /** Nome comercial (coluna `name`, já existente). */
  name: string;
  /** Razão social — nullable só para organizações provisionadas antes desta task. */
  legalName: string | null;
  nif: string;
  niss: string | null;
  /** Morada fiscal (coluna `address`, já existente). */
  address: string | null;
  postalCode: string | null;
  city: string | null;
  /** ISO 3166-1 alpha-2. */
  country: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  /** Fuso IANA de referência da organização (cada Location tem também o seu). */
  timezone: string;
  logoStoragePath: string | null;
  status: OrganizationStatus;
  updatedAt: string;
}

/** Campos editáveis pela UI — `id`, `status`, logotipo e `updatedAt` nunca entram aqui. */
export type OrganizationProfileChanges = Partial<
  Pick<
    OrganizationProfileProps,
    | "name"
    | "legalName"
    | "nif"
    | "niss"
    | "address"
    | "postalCode"
    | "city"
    | "country"
    | "email"
    | "phone"
    | "website"
    | "timezone"
  >
>;

function trimOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * A "Empresa" de Empresa & Estrutura — a `Organization` já existente
 * (CONTEXT.md), vista como entidade legal. Imutável: `update()` devolve uma
 * nova instância já validada, nunca altera a atual (o use case precisa do
 * "antes" intacto para a auditoria).
 */
export class OrganizationProfile {
  private constructor(private readonly props: OrganizationProfileProps) {}

  get id(): string {
    return this.props.id;
  }

  get logoStoragePath(): string | null {
    return this.props.logoStoragePath;
  }

  /**
   * Aplica alterações parciais e valida o resultado completo. Razão social
   * passa a ser obrigatória a partir da primeira edição — uma organização
   * antiga sem ela só falha quando alguém a tenta gravar sem a preencher.
   */
  update(changes: OrganizationProfileChanges, now: Date): OrganizationProfile {
    const merged: OrganizationProfileProps = { ...this.props };

    if (changes.name !== undefined) merged.name = changes.name.trim();
    if (changes.legalName !== undefined) merged.legalName = trimOrNull(changes.legalName);
    if (changes.nif !== undefined) merged.nif = normalizeTaxId(changes.nif);
    if (changes.niss !== undefined) {
      const niss = trimOrNull(changes.niss);
      merged.niss = niss === null ? null : normalizeTaxId(niss);
    }
    if (changes.address !== undefined) merged.address = trimOrNull(changes.address);
    if (changes.postalCode !== undefined) merged.postalCode = trimOrNull(changes.postalCode);
    if (changes.city !== undefined) merged.city = trimOrNull(changes.city);
    if (changes.country !== undefined) merged.country = changes.country.trim().toUpperCase();
    if (changes.email !== undefined) merged.email = trimOrNull(changes.email)?.toLowerCase() ?? null;
    if (changes.phone !== undefined) merged.phone = trimOrNull(changes.phone);
    if (changes.website !== undefined) merged.website = trimOrNull(changes.website);
    if (changes.timezone !== undefined) merged.timezone = changes.timezone.trim();

    const errors: OrganizationFieldError[] = [];
    const isPortugal = merged.country === "PT";

    if (merged.name.length === 0) errors.push({ field: "name", message: "obrigatório" });
    if (merged.legalName === null) errors.push({ field: "legalName", message: "obrigatório" });
    if (merged.nif.length === 0) {
      errors.push({ field: "nif", message: "obrigatório" });
    } else if (isPortugal && !isValidPortugueseNif(merged.nif)) {
      errors.push({ field: "nif", message: "NIF português inválido" });
    }
    if (merged.niss !== null && isPortugal && !isValidPortugueseNiss(merged.niss)) {
      errors.push({ field: "niss", message: "NISS deve ter 11 dígitos" });
    }
    if (merged.postalCode !== null && isPortugal && !isValidPortuguesePostalCode(merged.postalCode)) {
      errors.push({ field: "postalCode", message: "formato NNNN-NNN" });
    }
    if (!isValidCountryCode(merged.country)) errors.push({ field: "country", message: "código de país inválido" });
    if (merged.email !== null && !isValidEmail(merged.email)) errors.push({ field: "email", message: "email inválido" });
    if (merged.phone !== null && !isValidPhone(merged.phone)) errors.push({ field: "phone", message: "telefone inválido" });
    if (merged.website !== null) {
      const normalized = normalizeWebsite(merged.website);
      if (normalized === null) errors.push({ field: "website", message: "website inválido" });
      else merged.website = normalized;
    }
    if (!isValidTimezone(merged.timezone)) errors.push({ field: "timezone", message: "fuso horário inválido" });

    if (errors.length > 0) throw new InvalidOrganizationProfileError(errors);

    merged.updatedAt = now.toISOString();
    return new OrganizationProfile(merged);
  }

  withLogo(storagePath: string, now: Date): OrganizationProfile {
    return new OrganizationProfile({ ...this.props, logoStoragePath: storagePath, updatedAt: now.toISOString() });
  }

  toProps(): OrganizationProfileProps {
    return { ...this.props };
  }

  /** Dados persistidos já foram validados na escrita — não se revalida (organizações antigas podem ter campos em falta). */
  static reconstitute(props: OrganizationProfileProps): OrganizationProfile {
    return new OrganizationProfile({ ...props });
  }
}
