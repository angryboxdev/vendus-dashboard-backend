import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface GeneratePairingCodeCommand {
  organizationId: OrganizationId;
  locationId: string;
  description?: string | null;
}

export interface GeneratePairingCodeResult {
  code: string;
  expiresAt: Date;
  description: string | null;
}

export interface GeneratePairingCodePort {
  execute(command: GeneratePairingCodeCommand): Promise<GeneratePairingCodeResult>;
}
