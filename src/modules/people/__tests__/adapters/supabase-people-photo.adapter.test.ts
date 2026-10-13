import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { SupabasePeoplePhotoAdapter } from "../../adapters/out/supabase-people-photo.adapter.js";

const ORG = mintOrganizationId("org-test");

describe("SupabasePeoplePhotoAdapter", () => {
  test("assina as fotos do bucket num só pedido; as da demonstração apontam para os ficheiros estáticos; as que falham ficam sem foto", async () => {
    const calls: string[][] = [];
    const adapter = new SupabasePeoplePhotoAdapter(async (paths) => {
      calls.push(paths);
      return new Map(paths.filter((p) => p !== "org/missing.jpg").map((p) => [p, `https://signed/${p}`]));
    });
    const urls = await adapter.urls(ORG, ["org/a.jpg", "demo-avatars/f-07.svg", "org/missing.jpg"]);
    expect(Object.fromEntries(urls)).toEqual({ "org/a.jpg": "https://signed/org/a.jpg", "demo-avatars/f-07.svg": "/demo-avatars/f-07.svg" });
    expect(calls).toEqual([["org/a.jpg", "org/missing.jpg"]]);
  });

  test("armazenamento em baixo: a lista continua, sem fotos assinadas", async () => {
    const adapter = new SupabasePeoplePhotoAdapter(async () => {
      throw new Error("storage down");
    });
    expect(Object.fromEntries(await adapter.urls(ORG, ["org/a.jpg", "demo-avatars/m-01.svg"]))).toEqual({ "demo-avatars/m-01.svg": "/demo-avatars/m-01.svg" });
  });
});
