import type {
  GetOrganizationProfilePort,
  GetOrganizationProfileQuery,
  OrganizationProfileDTO,
} from "../../domain/ports/in/organization-profile.ports.js";
import type { OrganizationFileStoragePort } from "../../domain/ports/out/organization-file-storage.port.js";
import type { OrganizationProfileRepositoryPort } from "../../domain/ports/out/organization-profile-repository.port.js";
import { loadProfileOrThrow, toOrganizationProfileDto } from "./shared.js";

export class GetOrganizationProfileUseCase implements GetOrganizationProfilePort {
  constructor(
    private readonly repository: OrganizationProfileRepositoryPort,
    private readonly storage: OrganizationFileStoragePort,
  ) {}

  async execute(query: GetOrganizationProfileQuery): Promise<OrganizationProfileDTO> {
    const profile = await loadProfileOrThrow(this.repository, query.organizationId);
    return toOrganizationProfileDto(profile, this.storage, query.organizationId);
  }
}
