import { mintOrganizationId, type OrganizationId } from "../../../../kernel/organization-id.js";
import { HttpGooglePlacesGateway } from "../../adapters/out/google-places.gateway.js";
import { GoogleReviewsError, GoogleReviewsUseCases, RATINGS_TTL_MS } from "../../application/use-cases/google-reviews.use-cases.js";
import type { PlaceLink } from "../../domain/entities/google-reviews.js";
import type { GooglePlacesGateway, PlaceLinkRepositoryPort } from "../../domain/ports/out/google-reviews.ports.js";
import { weightedAverage } from "../../domain/services/ratings.service.js";

const ORG = mintOrganizationId("org-a");
const OTHER = mintOrganizationId("org-b");

class FakeLinks implements PlaceLinkRepositoryPort {
  rows = new Map<string, PlaceLink[]>();
  async list(org: OrganizationId) {
    return [...(this.rows.get(org) ?? [])];
  }
  async upsert(org: OrganizationId, link: PlaceLink) {
    this.rows.set(org, [...(this.rows.get(org) ?? []).filter((l) => l.locationId !== link.locationId), link]);
  }
  async remove(org: OrganizationId, locationId: string) {
    this.rows.set(org, (this.rows.get(org) ?? []).filter((l) => l.locationId !== locationId));
  }
}

class FakeGoogle implements GooglePlacesGateway {
  calls = 0;
  fail = new Set<string>();
  async search(q: string) {
    return [{ placeId: "p-porto", name: q, address: "Porto", rating: 4.6, userRatingCount: 200 }];
  }
  async details(placeId: string) {
    this.calls++;
    if (this.fail.has(placeId)) throw new Error("Google Places 503");
    return { placeId, name: placeId, rating: placeId === "p-porto" ? 4.8 : 4.2, userRatingCount: placeId === "p-porto" ? 300 : 100, googleMapsUri: `https://maps.google.com/?cid=${placeId}` };
  }
  async reviews() {
    return [{ author: "Cliente Teste", authorUri: null, rating: 5, text: "Muito bom", relativeTime: "há 1 semana", publishTime: null }];
  }
}

function setup(gateway: GooglePlacesGateway | null = new FakeGoogle()) {
  let t = 0;
  const links = new FakeLinks();
  const audit: string[] = [];
  const uc = new GoogleReviewsUseCases(
    gateway,
    links,
    { locations: async (org) => (org === ORG ? [{ id: "l1", name: "Loja Porto" }, { id: "l2", name: "Loja Maia" }, { id: "l3", name: "Loja Braga" }] : [{ id: "x1", name: "Outra" }]) },
    { record: async (_o, e) => void audit.push(e.action) },
    () => t,
  );
  return { uc, links, audit, advance: (ms: number) => (t += ms) };
}

describe("Avaliações Google", () => {
  test("sem chave: 'não configurado' no resumo e nas ações; o Dashboard continua", async () => {
    const { uc } = setup(null);
    expect((await uc.overview(ORG)).configured).toBe(false);
    await expect(uc.search("Loja Porto")).rejects.toMatchObject({ code: "not_configured" });
  });

  test("ligar locais: nota por local, média ponderada, locais por ligar; auditado; isolado por organização", async () => {
    const { uc, audit } = setup();
    await uc.link(ORG, "admin@demo.invalid", "l1", { placeId: "p-porto", placeName: "Loja Porto" });
    const o = await uc.link(ORG, "admin@demo.invalid", "l2", { placeId: "p-maia", placeName: "Loja Maia" });
    expect(o.locations.map((l) => [l.locationName, l.rating, l.userRatingCount])).toEqual([
      ["Loja Porto", 4.8, 300],
      ["Loja Maia", 4.2, 100],
    ]);
    expect(o.average).toEqual({ rating: 4.7, count: 400 });
    expect(o.unlinked.map((u) => u.locationName)).toEqual(["Loja Braga"]);
    expect(audit).toEqual(["google_reviews.link", "google_reviews.link"]);
    expect((await uc.overview(OTHER)).locations).toEqual([]);
    await expect(uc.link(ORG, "a", "nao-existe", { placeId: "p", placeName: "x" })).rejects.toBeInstanceOf(GoogleReviewsError);
  });

  test("cache de 6 h por lugar; uma falha do Google deixa só esse local indisponível", async () => {
    const g = new FakeGoogle();
    const { uc, advance } = setup(g);
    await uc.link(ORG, "a", "l1", { placeId: "p-porto", placeName: "Loja Porto" });
    await uc.link(ORG, "a", "l2", { placeId: "p-maia", placeName: "Loja Maia" });
    const calls = g.calls;
    await uc.overview(ORG);
    expect(g.calls).toBe(calls);
    advance(RATINGS_TTL_MS + 1);
    g.fail.add("p-maia");
    const o = await uc.overview(ORG);
    expect(o.locations.find((l) => l.locationId === "l2")!.unavailable).toBe(true);
    expect(o.locations.find((l) => l.locationId === "l1")!.rating).toBe(4.8);
  });

  test("avaliações só de locais ligados; desligar remove", async () => {
    const { uc } = setup();
    await expect(uc.reviews(ORG, "l1")).rejects.toMatchObject({ code: "not_found" });
    await uc.link(ORG, "a", "l1", { placeId: "p-porto", placeName: "Loja Porto" });
    expect((await uc.reviews(ORG, "l1")).reviews[0]!.author).toBe("Cliente Teste");
    expect((await uc.unlink(ORG, "a", "l1")).locations).toEqual([]);
  });

  test("pesquisa valida o texto; média ignora locais sem avaliações", async () => {
    const { uc } = setup();
    await expect(uc.search("ab")).rejects.toMatchObject({ code: "validation" });
    expect(weightedAverage([{ rating: null, userRatingCount: null }, { rating: 4, userRatingCount: 0 }])).toEqual({ rating: null, count: 0 });
  });
});

describe("HttpGooglePlacesGateway (Places API New)", () => {
  test("chave só no cabeçalho, FieldMask mínima; erros do Google sem a chave", async () => {
    const seen: { url: string; headers: Record<string, string>; body?: string }[] = [];
    const ok = (json: unknown) => new Response(JSON.stringify(json), { status: 200 });
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen.push({ url, headers: init.headers as Record<string, string>, body: init.body as string | undefined });
      if (url.includes("places:searchText")) return ok({ places: [{ id: "abc", displayName: { text: "Loja" }, formattedAddress: "Rua X", rating: 4.5, userRatingCount: 10 }] });
      if (url.includes("/places/bad")) return new Response("quota", { status: 429 });
      return ok({ id: "abc", displayName: { text: "Loja" }, rating: 4.5, userRatingCount: 10, googleMapsUri: "https://maps.google.com/x", reviews: [{ rating: 5, text: { text: "Ótimo" }, authorAttribution: { displayName: "Ana" }, relativePublishTimeDescription: "há 2 dias" }] });
    }) as unknown as typeof fetch;
    const g = new HttpGooglePlacesGateway("SEGREDO", fakeFetch);
    expect((await g.search("Loja Porto"))[0]).toMatchObject({ placeId: "abc", name: "Loja", rating: 4.5 });
    expect((await g.details("abc")).googleMapsUri).toBe("https://maps.google.com/x");
    expect((await g.reviews("abc"))[0]).toMatchObject({ author: "Ana", text: "Ótimo", rating: 5 });
    expect(seen.every((s) => s.headers["X-Goog-Api-Key"] === "SEGREDO" && !s.url.includes("SEGREDO"))).toBe(true);
    expect(seen[0]!.headers["X-Goog-FieldMask"]).toBe("places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount");
    const err = await g.details("bad").catch((e: Error) => e);
    expect(err.message).toContain("429");
    expect(err.message).not.toContain("SEGREDO");
  });
});
