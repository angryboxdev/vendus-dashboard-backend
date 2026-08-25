import { OrganizationNotFoundError } from "../../domain/errors.js";
import type { OrganizationIdentityPort } from "../../domain/ports/out/organization-identity.port.js";
import type {
  GetOrganizationIdentityCommand,
  GetOrganizationIdentityPort,
} from "../../domain/ports/in/organization-identity.ports.js";
import type { OrganizationIdentity } from "../../domain/entities/organization-identity.js";

export class GetOrganizationIdentityUseCase implements GetOrganizationIdentityPort {
  constructor(private readonly repository: OrganizationIdentityPort) {}

  async execute(command: GetOrganizationIdentityCommand): Promise<OrganizationIdentity> {
    const organization = await this.repository.findById(command.orgId);
    if (!organization) throw new OrganizationNotFoundError(command.orgId);
    return organization;
  }
}
