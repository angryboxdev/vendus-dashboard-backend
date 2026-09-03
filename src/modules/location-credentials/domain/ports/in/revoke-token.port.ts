import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface RevokeTokenCommand {
  organizationId: OrganizationId;
  tokenId: string;
}

export interface RevokeTokenPort {
  execute(command: RevokeTokenCommand): Promise<void>;
}
