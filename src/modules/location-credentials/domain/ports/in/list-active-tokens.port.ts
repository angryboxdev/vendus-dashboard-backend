import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface ListActiveTokensCommand {
  organizationId: OrganizationId;
  locationId: string;
}

/** Issue date only — no per-device naming, there is no Device entity (D3). */
export interface LocationTokenDto {
  id: string;
  issuedAt: Date;
}

export interface ListActiveTokensPort {
  execute(command: ListActiveTokensCommand): Promise<LocationTokenDto[]>;
}
