import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface GeneratePairingCodeCommand {
  organizationId: OrganizationId;
  locationId: string;
}

export interface GeneratePairingCodeResult {
  code: string;
  expiresAt: Date;
}

export interface GeneratePairingCodePort {
  execute(command: GeneratePairingCodeCommand): Promise<GeneratePairingCodeResult>;
}
