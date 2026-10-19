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

describe("Avaliações Google — demonstração (fictícias)", () => {
  const NOW = Date.parse("2026-10-19T15:00:00Z");
  const demoUc = (gateway: GooglePlacesGateway | null) => {
    let t = NOW;
    const uc = new GoogleReviewsUseCases(
      gateway,
      new FakeLinks(),
      { locations: async () => [{ id: "l1", name: "Centro Demo Porto" }, { id: "l2", name: "Centro Demo Braga" }] },
      { record: async () => {} },
      () => t,
      { isDemo: async (org) => org === ORG },
    );
    return { uc, advance: (ms: number) => (t += ms) };
  };

  test("todos os centros com nota e avaliações fictícias, sem chave e sem chamar o Google", async () => {
    const { uc } = demoUc(null);
    const o = await uc.overview(ORG);
    expect(o.configured).toBe(true);
    expect(o.unlinked).toEqual([]);
    expect(o.locations).toHaveLength(2);
    for (const l of o.locations) {
      expect(l.rating).toBeGreaterThanOrEqual(4.2);
      expect(l.rating).toBeLessThanOrEqual(4.8);
      expect(l.userRatingCount).toBeGreaterThan(100);
    }
    expect(o.average.rating).not.toBeNull();
  });

  test("as 5 mais recentes de um centro, da mais nova para a mais antiga; vão chegando novas com o tempo", async () => {
    const { uc, advance } = demoUc(null);
    const first = await uc.reviews(ORG, "l1");
    expect(first.reviews).toHaveLength(5);
    const times = first.reviews.map((r) => r.publishTime!);
    expect([...times].sort().reverse()).toEqual(times);
    expect(first.reviews.every((r) => r.author && r.text && r.rating! >= 1 && r.rating! <= 5 && r.relativeTime!.startsWith("há "))).toBe(true);
    // Mesmo instante → mesmo resultado; umas horas depois há avaliações novas no topo.
    expect((await uc.reviews(ORG, "l1")).reviews).toEqual(first.reviews);
    advance(6 * 3_600_000);
    const later = await uc.reviews(ORG, "l1");
    expect(later.reviews[0]!.publishTime! > first.reviews[0]!.publishTime!).toBe(true);
    await expect(uc.reviews(ORG, "nao-existe")).rejects.toMatchObject({ code: "not_found" });
  });

  test("a organização real continua no Google", async () => {
    const { uc } = demoUc(null);
    expect((await uc.overview(OTHER)).configured).toBe(false);
  });
});
