import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface ListActiveTokensCommand {
  organizationId: OrganizationId;
  locationId: string;
}

/**
 * Issue date and the location's own name — no per-device naming, there is
 * no Device entity (D3). `locationName` is looked up once per call, not
 * stored on `LocationToken` itself; see `ListActiveTokensUseCase`.
 */
export interface LocationTokenDto {
  id: string;
  issuedAt: Date;
  locationName: string;
}

export interface ListActiveTokensPort {
  execute(command: ListActiveTokensCommand): Promise<LocationTokenDto[]>;
}
