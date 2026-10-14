import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { PlaceLink } from "../../domain/entities/google-reviews.js";
import type { PlaceLinkRepositoryPort } from "../../domain/ports/out/google-reviews.ports.js";

type Res = { data: unknown; error: { message: string } | null };
function check<T>(res: Res): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Ligação local → lugar no Google (`location_google_places`). */
export class SupabasePlaceLinksRepository implements PlaceLinkRepositoryPort {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  async list(org: OrganizationId): Promise<PlaceLink[]> {
    const rows = check<{ location_id: string; place_id: string; place_name: string }[]>(await this.scoped(org).table("location_google_places").select("location_id, place_id, place_name"));
    return rows.map((r) => ({ locationId: r.location_id, placeId: r.place_id, placeName: r.place_name }));
  }
  async upsert(org: OrganizationId, link: PlaceLink, by: string): Promise<void> {
    check(
      await this.scoped(org)
        .table("location_google_places")
        .upsert({ location_id: link.locationId, place_id: link.placeId, place_name: link.placeName, updated_by: by, updated_at: new Date().toISOString() }, { onConflict: "org_id,location_id" }),
    );
  }
  async remove(org: OrganizationId, locationId: string): Promise<void> {
    check(await this.scoped(org).table("location_google_places").delete().eq("location_id", locationId));
  }
}
