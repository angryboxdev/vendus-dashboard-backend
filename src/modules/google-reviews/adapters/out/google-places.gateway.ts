import type { PlaceCandidate, PlaceReview, PlaceSummary } from "../../domain/entities/google-reviews.js";
import type { GooglePlacesGateway } from "../../domain/ports/out/google-reviews.ports.js";

const BASE = "https://places.googleapis.com/v1";
/** Sem resposta em 6 s: o Dashboard segue sem as avaliações. */
const TIMEOUT_MS = 6_000;

type Json = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : null);
const num = (v: unknown) => (typeof v === "number" ? v : null);
const text = (v: unknown) => str((v as Json | undefined)?.text);

/**
 * Google Places API (New): só os campos necessários (FieldMask) — custo e
 * dados mínimos. A chave vai no cabeçalho, nunca na URL nem no browser.
 */
export class HttpGooglePlacesGateway implements GooglePlacesGateway {
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private async call(path: string, fieldMask: string, init: { method?: string; body?: unknown } = {}): Promise<Json> {
    const res = await this.fetchFn(`${BASE}${path}`, {
      method: init.method ?? "GET",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": this.apiKey, "X-Goog-FieldMask": fieldMask },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      // Mensagem do Google sem a chave (nunca a repetir em logs).
      const detail = await res.text().catch(() => "");
      throw new Error(`Google Places ${res.status}: ${detail.slice(0, 200)}`);
    }
    return (await res.json()) as Json;
  }

  async search(q: string): Promise<PlaceCandidate[]> {
    const out = await this.call("/places:searchText", "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount", {
      method: "POST",
      body: { textQuery: q, languageCode: "pt", maxResultCount: 6 },
    });
    return ((out.places as Json[] | undefined) ?? []).map((p) => ({
      placeId: String(p.id),
      name: text(p.displayName) ?? "—",
      address: str(p.formattedAddress),
      rating: num(p.rating),
      userRatingCount: num(p.userRatingCount),
    }));
  }

  async details(placeId: string): Promise<PlaceSummary> {
    const p = await this.call(`/places/${encodeURIComponent(placeId)}?languageCode=pt`, "id,displayName,rating,userRatingCount,googleMapsUri");
    return { placeId, name: text(p.displayName) ?? "—", rating: num(p.rating), userRatingCount: num(p.userRatingCount), googleMapsUri: str(p.googleMapsUri) };
  }

  async reviews(placeId: string): Promise<PlaceReview[]> {
    const p = await this.call(`/places/${encodeURIComponent(placeId)}?languageCode=pt`, "reviews");
    return ((p.reviews as Json[] | undefined) ?? []).map((r) => {
      const a = (r.authorAttribution ?? {}) as Json;
      return {
        author: str(a.displayName) ?? "Utilizador Google",
        authorUri: str(a.uri),
        rating: num(r.rating),
        text: text(r.text) ?? text(r.originalText),
        relativeTime: str(r.relativePublishTimeDescription),
        publishTime: str(r.publishTime),
      };
    });
  }
}
