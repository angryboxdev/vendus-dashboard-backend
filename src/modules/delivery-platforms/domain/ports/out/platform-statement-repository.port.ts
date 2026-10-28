import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { DeliveryPlatform, PlatformStatement } from "../../entities/platform-statement.js";

/** Extrato gravado, com o ficheiro de origem e quem/quando importou. */
export interface StoredPlatformStatement extends PlatformStatement {
  id: string;
  fileName: string;
  importedBy: string | null;
  importedAt: string;
}

export interface PlatformStatementRepositoryPort {
  /** Grava o extrato; se já existir um com a mesma plataforma e número, substitui-o. */
  save(
    organizationId: OrganizationId,
    statement: PlatformStatement,
    meta: { fileName: string; importedBy: string | null },
  ): Promise<{ replaced: boolean }>;
  /** Extratos cujo período toca o intervalo [from, to] (YYYY-MM-DD), opcionalmente de uma plataforma. */
  listOverlapping(organizationId: OrganizationId, from: string, to: string, platform?: DeliveryPlatform): Promise<StoredPlatformStatement[]>;
}
