import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { OrganizationProfile, type OrganizationProfileProps } from "../../domain/entities/organization-profile.js";
import type { OrganizationProfileRepositoryPort } from "../../domain/ports/out/organization-profile-repository.port.js";
import type { OrganizationFileStoragePort } from "../../domain/ports/out/organization-file-storage.port.js";
import type {
  OrganizationAuditLogEntry,
  OrganizationAuditLogPort,
  OrganizationAuditLogRecordDTO,
} from "../../domain/ports/out/organization-audit-log.port.js";

/** Dados fictícios — NIF válido de teste (dígito de controlo correto), nunca dados reais. */
export function profileProps(overrides: Partial<OrganizationProfileProps> = {}): OrganizationProfileProps {
  return {
    id: "org-test",
    name: "Pizzaria Exemplo",
    legalName: null,
    nif: "123456789",
    niss: null,
    address: "Rua de Teste, 1",
    postalCode: null,
    city: null,
    country: "PT",
    email: null,
    phone: null,
    website: null,
    timezone: "Europe/Lisbon",
    logoStoragePath: null,
    status: "active",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Uma organização por repositório — a `Organization` é o próprio tenant. */
export class FakeOrganizationProfileRepository implements OrganizationProfileRepositoryPort {
  readonly store = new Map<string, OrganizationProfile>();

  seed(props: OrganizationProfileProps): void {
    this.store.set(props.id, OrganizationProfile.reconstitute(props));
  }

  async findById(organizationId: OrganizationId): Promise<OrganizationProfile | null> {
    return this.store.get(organizationId) ?? null;
  }

  async save(organizationId: OrganizationId, profile: OrganizationProfile): Promise<void> {
    this.store.set(organizationId, profile);
  }
}

export class FakeOrganizationFileStorage implements OrganizationFileStoragePort {
  readonly stored: { path: string; filename: string; mimeType: string }[] = [];

  async store(_buffer: Buffer, filename: string, mimeType: string, organizationId: OrganizationId): Promise<string> {
    const path = `${organizationId}/logo/${this.stored.length + 1}/${filename}`;
    this.stored.push({ path, filename, mimeType });
    return path;
  }

  async getSignedUrl(storagePath: string): Promise<string> {
    return `https://signed.test/${storagePath}`;
  }
}

export class FakeOrganizationAuditLog implements OrganizationAuditLogPort {
  readonly entries: OrganizationAuditLogEntry[] = [];

  async record(entry: OrganizationAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }

  async findByEntityId(organizationId: OrganizationId, entityId: string): Promise<OrganizationAuditLogRecordDTO[]> {
    return this.entries
      .filter((e) => e.organizationId === organizationId && e.entityId === entityId)
      .map((e, i) => ({
        id: `audit-${i}`,
        createdAt: "2026-01-01T00:00:00.000Z",
        entityType: e.entityType,
        entityId: e.entityId,
        action: e.action,
        actor: e.actor,
        before: e.before ?? null,
        after: e.after ?? null,
        reason: e.reason ?? null,
      }));
  }
}
