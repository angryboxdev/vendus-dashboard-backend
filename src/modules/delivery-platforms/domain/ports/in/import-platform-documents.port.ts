import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { DeliveryPlatform } from "../../entities/platform-statement.js";

export interface ImportedPlatformDocument {
  fileName: string;
  platform: DeliveryPlatform;
  documentNumber: string;
  periodFrom: string;
  periodTo: string;
  netPayoutCents: number;
  /** Já existia um documento com o mesmo número: foi substituído. */
  replaced: boolean;
}

export interface RejectedPlatformDocument {
  fileName: string;
  reason: string;
}

/**
 * Importa vários ficheiros de uma vez (extratos da Uber, da Glovo…). Cada ficheiro é tratado à parte:
 * os que se leem bem gravam-se; os outros voltam em `rejected` com o motivo.
 */
export interface ImportPlatformDocumentsPort {
  execute(input: {
    organizationId: OrganizationId;
    files: { name: string; content: Uint8Array }[];
    importedBy: string | null;
  }): Promise<{ imported: ImportedPlatformDocument[]; rejected: RejectedPlatformDocument[] }>;
}
