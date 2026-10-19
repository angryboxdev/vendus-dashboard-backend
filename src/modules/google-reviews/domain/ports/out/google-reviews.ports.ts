import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { PlaceCandidate, PlaceLink, PlaceReview, PlaceSummary } from "../../entities/google-reviews.js";

/** Google Places (API New). A chave vive só no adaptador (servidor). */
export interface GooglePlacesGateway {
  search(text: string): Promise<PlaceCandidate[]>;
  details(placeId: string): Promise<PlaceSummary>;
  reviews(placeId: string): Promise<PlaceReview[]>;
}

export interface PlaceLinkRepositoryPort {
  list(org: OrganizationId): Promise<PlaceLink[]>;
  upsert(org: OrganizationId, link: PlaceLink, by: string): Promise<void>;
  remove(org: OrganizationId, locationId: string): Promise<void>;
}

/** Locais da organização (catálogo). */
export interface LocationsSourcePort {
  locations(org: OrganizationId): Promise<{ id: string; name: string }[]>;
}

/** A organização é a de demonstração? (lá as avaliações são fictícias). */
export interface DemoOrgCheckPort {
  isDemo(org: OrganizationId): Promise<boolean>;
}

export interface GoogleReviewsAuditPort {
  record(org: OrganizationId, e: { actor: string; action: string; resourceId: string; before: unknown; after: unknown }): Promise<void>;
}
