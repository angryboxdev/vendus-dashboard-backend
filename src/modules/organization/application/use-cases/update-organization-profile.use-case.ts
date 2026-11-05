import type {
  OrganizationProfileDTO,
  UpdateOrganizationProfileCommand,
  UpdateOrganizationProfilePort,
} from "../../domain/ports/in/organization-profile.ports.js";
import type { OrganizationAuditLogPort } from "../../domain/ports/out/organization-audit-log.port.js";
import type { OrganizationFileStoragePort } from "../../domain/ports/out/organization-file-storage.port.js";
import type { OrganizationProfileRepositoryPort } from "../../domain/ports/out/organization-profile-repository.port.js";
import type { CompanyIssuerSyncPort, IssuerSyncResult } from "../../domain/ports/out/company-issuer-sync.port.js";
import { companyIssuerData } from "../../domain/services/company-issuer.service.js";
import { loadProfileOrThrow, toOrganizationProfileDto } from "./shared.js";

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
    return this.issuerSync ? { ...dto, issuerSync: await this.syncIssuer(command, updated.toProps()) } : dto;
  }

  /** A Empresa é o emitente das faturas: cria/atualiza a entidade legal. Falhar aqui não desfaz a gravação. */
  private async syncIssuer(command: UpdateOrganizationProfileCommand, props: Parameters<typeof companyIssuerData>[0]): Promise<IssuerSyncResult> {
    const r = companyIssuerData(props);
    if ("missing" in r) return { status: "incomplete", missing: r.missing };
    try {
      await this.issuerSync!.sync(command.organizationId, command.actor, r.data);
      return { status: "synced" };
    } catch (e) {
      return { status: "failed", message: e instanceof Error ? e.message : "Erro a atualizar o emitente" };
    }
  }
}
