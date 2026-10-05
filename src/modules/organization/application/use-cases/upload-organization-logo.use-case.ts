import type {
  OrganizationProfileDTO,
  UploadOrganizationLogoCommand,
  UploadOrganizationLogoPort,
} from "../../domain/ports/in/organization-profile.ports.js";
import type { OrganizationAuditLogPort } from "../../domain/ports/out/organization-audit-log.port.js";
import type { OrganizationFileStoragePort } from "../../domain/ports/out/organization-file-storage.port.js";
import type { OrganizationProfileRepositoryPort } from "../../domain/ports/out/organization-profile-repository.port.js";
import { loadProfileOrThrow, toOrganizationProfileDto } from "./shared.js";

/**
 * Substitui o logotipo. O ficheiro anterior nunca é apagado do storage —
 * fica referenciado no `payload_before` da auditoria (task §1: dados
 * históricos não são apagados silenciosamente).
 */
export class UploadOrganizationLogoUseCase implements UploadOrganizationLogoPort {
  constructor(
    private readonly repository: OrganizationProfileRepositoryPort,
    private readonly storage: OrganizationFileStoragePort,
    private readonly auditLog: OrganizationAuditLogPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(command: UploadOrganizationLogoCommand): Promise<OrganizationProfileDTO> {
    const current = await loadProfileOrThrow(this.repository, command.organizationId);
    const storagePath = await this.storage.store(command.buffer, command.filename, command.mimeType, command.organizationId);
    const updated = current.withLogo(storagePath, this.now());

    await this.repository.save(command.organizationId, updated);
    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "organization",
      entityId: current.id,
      action: "logo_update",
      before: { logoStoragePath: current.logoStoragePath },
      after: { logoStoragePath: storagePath },
    });

    return toOrganizationProfileDto(updated, this.storage, command.organizationId);
  }
}
