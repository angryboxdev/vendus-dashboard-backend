import type {
  OrganizationProfileDTO,
  UpdateOrganizationProfileCommand,
  UpdateOrganizationProfilePort,
} from "../../domain/ports/in/organization-profile.ports.js";
import type { OrganizationAuditLogPort } from "../../domain/ports/out/organization-audit-log.port.js";
import type { OrganizationFileStoragePort } from "../../domain/ports/out/organization-file-storage.port.js";
import type { OrganizationProfileRepositoryPort } from "../../domain/ports/out/organization-profile-repository.port.js";
import type { CompanyIssuerSyncPort, IssuerSyncResult } from "../../domain/ports/out/company-issuer-sync.port.js";
import { loadProfileOrThrow, toOrganizationProfileDto } from "./shared.js";
import { runIssuerSync } from "./sync-company-issuer.use-case.js";

export class UpdateOrganizationProfileUseCase implements UpdateOrganizationProfilePort {
  constructor(
    private readonly repository: OrganizationProfileRepositoryPort,
    private readonly storage: OrganizationFileStoragePort,
    private readonly auditLog: OrganizationAuditLogPort,
    private readonly now: () => Date = () => new Date(),
    private readonly issuerSync: CompanyIssuerSyncPort | null = null,
  ) {}

  async execute(command: UpdateOrganizationProfileCommand): Promise<OrganizationProfileDTO & { issuerSync?: IssuerSyncResult }> {
    const current = await loadProfileOrThrow(this.repository, command.organizationId);
    const updated = current.update(command.changes, this.now());

    await this.repository.save(command.organizationId, updated);
    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "organization",
      entityId: current.id,
      action: "update",
      before: current.toProps(),
      after: updated.toProps(),
    });

    const dto = await toOrganizationProfileDto(updated, this.storage, command.organizationId);
    return this.issuerSync ? { ...dto, issuerSync: await runIssuerSync(this.issuerSync, command.organizationId, command.actor, updated.toProps()) } : dto;
  }

}
