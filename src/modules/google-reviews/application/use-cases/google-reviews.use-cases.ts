import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { LocationRating, PlaceReview, PlaceSummary } from "../../domain/entities/google-reviews.js";
import type { GooglePlacesGateway, GoogleReviewsAuditPort, LocationsSourcePort, PlaceLinkRepositoryPort } from "../../domain/ports/out/google-reviews.ports.js";
import { normalizeQuery, weightedAverage } from "../../domain/services/ratings.service.js";

export class GoogleReviewsError extends Error {
  constructor(
    message: string,
    readonly code: "not_configured" | "validation" | "not_found",
  ) {
    super(message);
    this.name = "GoogleReviewsError";
  }
}

/** Avaliações mudam devagar: 6 h de cache por lugar (menos pedidos ao Google). */
export const RATINGS_TTL_MS = 6 * 3_600_000;

/**
 * Avaliações Google por local. A ligação local → lugar é da organização; os
 * dados (nota, número, avaliações) são públicos do Google e ficam em cache
 * por lugar. Falhas do Google nunca partem o Dashboard: o local fica
 * "indisponível agora".
 */
export class GoogleReviewsUseCases {
  private readonly cache = new Map<string, { at: number; value: Promise<unknown> }>();

  constructor(
    private readonly gateway: GooglePlacesGateway | null,
    private readonly links: PlaceLinkRepositoryPort,
    private readonly locations: LocationsSourcePort,
    private readonly audit: GoogleReviewsAuditPort,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get configured(): boolean {
    return !!this.gateway;
  }

  private cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < RATINGS_TTL_MS) return hit.value as Promise<T>;
    const value = load();
    this.cache.set(key, { at: this.now(), value });
    value.catch(() => this.cache.delete(key));
    return value;
  }

  private requireGateway(): GooglePlacesGateway {
    if (!this.gateway) throw new GoogleReviewsError("Integração Google ainda não configurada.", "not_configured");
    return this.gateway;
  }

  /** Resumo para o Dashboard: nota por local ligado e a média ponderada. */
  async overview(org: OrganizationId) {
    const [links, locs] = await Promise.all([this.links.list(org), this.locations.locations(org)]);
    const name = new Map(locs.map((l) => [l.id, l.name]));
    const rows: LocationRating[] = await Promise.all(
      links
        .filter((l) => name.has(l.locationId))
        .map(async (l) => {
          const base = { locationId: l.locationId, locationName: name.get(l.locationId)!, placeId: l.placeId, placeName: l.placeName };
          if (!this.gateway) return { ...base, rating: null, userRatingCount: null, googleMapsUri: null, unavailable: true };
          try {
            const d = await this.cached<PlaceSummary>(`details:${l.placeId}`, () => this.gateway!.details(l.placeId));
            return { ...base, rating: d.rating, userRatingCount: d.userRatingCount, googleMapsUri: d.googleMapsUri, unavailable: false };
          } catch {
            return { ...base, rating: null, userRatingCount: null, googleMapsUri: null, unavailable: true };
          }
        }),
    );
    rows.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.locationName.localeCompare(b.locationName, "pt"));
    const unlinked = locs.filter((l) => !links.some((x) => x.locationId === l.id)).map((l) => ({ locationId: l.id, locationName: l.name }));
    return { configured: this.configured, average: weightedAverage(rows), locations: rows, unlinked };
  }

  /** Procurar o lugar no Google (para ligar a um local). */
  async search(text: string) {
    const q = normalizeQuery(text);
    if (!q) throw new GoogleReviewsError("Escreva entre 3 e 120 caracteres.", "validation");
    return this.requireGateway().search(q);
  }

  async link(org: OrganizationId, actor: string, locationId: string, input: { placeId: string; placeName: string }) {
    this.requireGateway();
    if (!(await this.locations.locations(org)).some((l) => l.id === locationId)) throw new GoogleReviewsError("Local não encontrado.", "not_found");
    const placeId = input.placeId.trim();
    const placeName = input.placeName.trim();
    if (placeId.length < 3 || placeId.length > 300 || !placeName) throw new GoogleReviewsError("Lugar inválido.", "validation");
    const before = (await this.links.list(org)).find((l) => l.locationId === locationId) ?? null;
    await this.links.upsert(org, { locationId, placeId, placeName: placeName.slice(0, 200) }, actor);
    await this.audit.record(org, { actor, action: "google_reviews.link", resourceId: locationId, before, after: { placeId, placeName } });
    return this.overview(org);
  }

  async unlink(org: OrganizationId, actor: string, locationId: string) {
    const before = (await this.links.list(org)).find((l) => l.locationId === locationId) ?? null;
    if (!before) return this.overview(org);
    await this.links.remove(org, locationId);
    await this.audit.record(org, { actor, action: "google_reviews.unlink", resourceId: locationId, before, after: null });
    return this.overview(org);
  }

  /** Avaliações completas de um local (só a pedido). */
  async reviews(org: OrganizationId, locationId: string): Promise<{ placeName: string; googleMapsUri: string | null; reviews: PlaceReview[] }> {
    const g = this.requireGateway();
    const link = (await this.links.list(org)).find((l) => l.locationId === locationId);
    if (!link) throw new GoogleReviewsError("Este local ainda não está ligado ao Google.", "not_found");
    const [reviews, details] = await Promise.all([
      this.cached<PlaceReview[]>(`reviews:${link.placeId}`, () => g.reviews(link.placeId)),
      this.cached<PlaceSummary>(`details:${link.placeId}`, () => g.details(link.placeId)).catch(() => null),
    ]);
    return { placeName: link.placeName, googleMapsUri: details?.googleMapsUri ?? null, reviews };
  }
}
