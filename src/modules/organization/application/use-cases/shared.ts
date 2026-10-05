import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { OrganizationProfile } from "../../domain/entities/organization-profile.js";
import { OrganizationNotFoundError } from "../../domain/errors.js";
import type { OrganizationProfileDTO } from "../../domain/ports/in/organization-profile.ports.js";
import type { OrganizationFileStoragePort } from "../../domain/ports/out/organization-file-storage.port.js";
import type { OrganizationProfileRepositoryPort } from "../../domain/ports/out/organization-profile-repository.port.js";

export const LOGO_URL_TTL_SECONDS = 60 * 60;

export async function loadProfileOrThrow(
  repository: OrganizationProfileRepositoryPort,
  organizationId: OrganizationId,
): Promise<OrganizationProfile> {
  const profile = await repository.findById(organizationId);
  if (!profile) throw new OrganizationNotFoundError(organizationId);
  return profile;
}

export async function toOrganizationProfileDto(
  profile: OrganizationProfile,
  storage: OrganizationFileStoragePort,
  organizationId: OrganizationId,
): Promise<OrganizationProfileDTO> {
  const { logoStoragePath, ...props } = profile.toProps();
  const logoUrl = logoStoragePath ? await storage.getSignedUrl(logoStoragePath, LOGO_URL_TTL_SECONDS, organizationId) : null;
  return { ...props, logoUrl };
}
