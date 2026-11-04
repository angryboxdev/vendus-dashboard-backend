import { sourceIdFor } from "../../domain/services/source-id.service.js";

describe("SourceID do utilizador (SAF-T: máx. 30; não reutilizável — Despacho 3.3.6)", () => {
  it("deriva do id do utilizador: UUID sem hífens, 30 caracteres, estável", () => {
    expect(sourceIdFor("a1b2c3d4-e5f6-4789-8abc-def012345678")).toBe("a1b2c3d4e5f647898abcdef0123456");
    expect(sourceIdFor("a1b2c3d4-e5f6-4789-8abc-def012345678")).toHaveLength(30);
  });

  it("ids curtos ficam iguais; vazio é recusado", () => {
    expect(sourceIdFor("sistema")).toBe("sistema");
    expect(() => sourceIdFor("  ")).toThrow();
  });
});
