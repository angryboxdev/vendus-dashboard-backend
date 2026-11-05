import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { OrganizationProfileProps } from "../../domain/entities/organization-profile.js";
import type { SyncCompanyIssuerCommand, SyncCompanyIssuerPort } from "../../domain/ports/in/organization-profile.ports.js";
import type { CompanyIssuerSyncPort, IssuerSyncResult } from "../../domain/ports/out/company-issuer-sync.port.js";
import type { OrganizationProfileRepositoryPort } from "../../domain/ports/out/organization-profile-repository.port.js";
import { companyIssuerData } from "../../domain/services/company-issuer.service.js";
import { loadProfileOrThrow } from "./shared.js";

/** Cria/atualiza o emitente das faturas a partir dos dados da Empresa. Nunca lança: devolve o resultado. */
export async function runIssuerSync(port: CompanyIssuerSyncPort, organizationId: OrganizationId, actor: string, props: OrganizationProfileProps): Promise<IssuerSyncResult> {
  const r = companyIssuerData(props);
  if ("missing" in r) return { status: "incomplete", missing: r.missing };
  try {
    await port.sync(organizationId, actor, r.data);
    return { status: "synced" };
  } catch (e) {
    return { status: "failed", message: e instanceof Error ? e.message : "Erro a atualizar o emitente" };
  }
}

/** «Usar os dados da Empresa» (Faturação → Séries): sincroniza sem ter de editar a Empresa. */
export class SyncCompanyIssuerUseCase implements SyncCompanyIssuerPort {
  constructor(
    private readonly repository: OrganizationProfileRepositoryPort,
    private readonly issuerSync: CompanyIssuerSyncPort | null,
  ) {}

  async execute(command: SyncCompanyIssuerCommand): Promise<IssuerSyncResult> {
    if (!this.issuerSync) return { status: "failed", message: "Emitente das faturas não está ligado neste servidor" };
    const profile = await loadProfileOrThrow(this.repository, command.organizationId);
    return runIssuerSync(this.issuerSync, command.organizationId, command.actor, profile.toProps());
  }
}
