import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { OrganizationProfileChanges, OrganizationStatus } from "../../entities/organization-profile.js";
import type { OrganizationAuditLogRecordDTO } from "../out/organization-audit-log.port.js";

export interface OrganizationProfileDTO {
  id: string;
  name: string;
  legalName: string | null;
  nif: string;
  niss: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  timezone: string;
  /** URL assinado temporário (1 h) — nunca o caminho interno do storage. */
  logoUrl: string | null;
  status: OrganizationStatus;
  updatedAt: string;
}

// ── Ler ───────────────────────────────────────────────────────────────────

export interface GetOrganizationProfileQuery {
  organizationId: OrganizationId;
}

export interface GetOrganizationProfilePort {
  execute(query: GetOrganizationProfileQuery): Promise<OrganizationProfileDTO>;
}

// ── Editar ────────────────────────────────────────────────────────────────

export interface UpdateOrganizationProfileCommand {
  organizationId: OrganizationId;
  actor: string;
  changes: OrganizationProfileChanges;
}

export interface UpdateOrganizationProfilePort {
  execute(command: UpdateOrganizationProfileCommand): Promise<OrganizationProfileDTO>;
}

// ── Logotipo ──────────────────────────────────────────────────────────────

export interface UploadOrganizationLogoCommand {
  organizationId: OrganizationId;
  actor: string;
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export interface UploadOrganizationLogoPort {
  execute(command: UploadOrganizationLogoCommand): Promise<OrganizationProfileDTO>;
}

// ── Histórico ─────────────────────────────────────────────────────────────

export interface ListOrganizationHistoryQuery {
  organizationId: OrganizationId;
}

export interface ListOrganizationHistoryPort {
  execute(query: ListOrganizationHistoryQuery): Promise<OrganizationAuditLogRecordDTO[]>;
}
