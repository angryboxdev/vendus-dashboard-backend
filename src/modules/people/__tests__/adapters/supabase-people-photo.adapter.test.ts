import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { SupabasePeoplePhotoAdapter } from "../../adapters/out/supabase-people-photo.adapter.js";

const ORG = mintOrganizationId("org-test");

describe("SupabasePeoplePhotoAdapter", () => {
  test("assina as fotos do bucket; as da demonstração apontam para os ficheiros estáticos; falhas ficam sem foto", async () => {
    const signed: string[] = [];
    const adapter = new SupabasePeoplePhotoAdapter(async (path) => {
      if (path === "org/missing.jpg") throw new Error("not found");
      signed.push(path);
      return `https://signed/${path}`;
    });
    const urls = await adapter.urls(ORG, ["org/a.jpg", "demo-avatars/07.png", "org/missing.jpg"]);
    expect(Object.fromEntries(urls)).toEqual({ "org/a.jpg": "https://signed/org/a.jpg", "demo-avatars/07.png": "/demo-avatars/07.png" });
    expect(signed).toEqual(["org/a.jpg"]);
  });
});
