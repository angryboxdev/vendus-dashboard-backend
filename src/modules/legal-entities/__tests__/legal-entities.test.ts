import { mintOrganizationId } from "../../../kernel/organization-id.js";
import { LegalEntitiesUseCases } from "../application/use-cases/legal-entities.use-cases.js";
import { validEsCif, validEsNie, validEsNif, validPtNif, type LegalEntityInput } from "../domain/entities/legal-entity.js";
import { FakeLegalCtx, FakeLegalRepo, PT } from "./fakes.js";

const ORG = mintOrganizationId("org-a");
const RH = { email: "rh@demo.invalid" };

const ES: LegalEntityInput = { name: "Entidad ES Demo", country: "ES", taxIdType: "cif", taxId: "B-12345674", socialSecurityId: "33000000000", billingEmail: "facturacion@demo.invalid", street: "Calle Ejemplo 1", postalCode: "33201", city: "Gijón", region: "Asturias", phone: null };

function setup() {
  const repo = new FakeLegalRepo();
  const ctx = new FakeLegalCtx();
  return { repo, ctx, uc: new LegalEntitiesUseCases(repo, ctx) };
}

describe("Entidades legais (FE-092)", () => {
  test("dígitos de controlo: NIF PT, DNI, NIE e CIF", () => {
    expect(validPtNif("123456789")).toBe(true);
    expect(validPtNif("123456780")).toBe(false);
    expect(validEsNif("12345678Z")).toBe(true);
    expect(validEsNif("12345678A")).toBe(false);
    expect(validEsNie("X1234567L")).toBe(true);
    expect(validEsNie("X1234567A")).toBe(false);
    expect(validEsCif("B12345674")).toBe(true);
    expect(validEsCif("B12345675")).toBe(false);
    // P (organismo público) só aceita letra: controlo 4 → "D".
    expect(validEsCif("P1234567D")).toBe(true);
    expect(validEsCif("P12345674")).toBe(false);
  });

  test("criar normaliza; NIF duplicado no mesmo país é 409 com a entidade existente", async () => {
    const { uc } = setup();
    const pt = await uc.create(ORG, RH, PT);
    expect(pt).toMatchObject({ taxId: "123456789", billingEmail: "faturacao@demo.invalid", phone: "+351220000000" });
    await expect(uc.create(ORG, RH, { ...PT, name: "Outra" })).rejects.toMatchObject({ code: "conflict", field: "taxId", extra: { existingId: pt.id } });
    await expect(uc.create(ORG, RH, { ...PT, taxId: "123456780" })).rejects.toMatchObject({ field: "taxId" });
    await expect(uc.create(ORG, RH, { ...ES, postalCode: "3320" })).rejects.toMatchObject({ field: "postalCode" });
    await expect(uc.create(ORG, RH, { ...ES, socialSecurityId: "123" })).rejects.toMatchObject({ field: "socialSecurityId" });
    await expect(uc.create(ORG, RH, { ...PT, taxId: "12345678Z", taxIdType: "nie" })).rejects.toMatchObject({ field: "taxIdType" });
    expect((await uc.create(ORG, RH, ES)).taxId).toBe("B12345674");
  });

  test("editar pede motivo; em uso não muda de país; dados fiscais em uso ficam auditados à parte", async () => {
    const { uc, ctx } = setup();
    const pt = await uc.create(ORG, RH, PT);
    await expect(uc.update(ORG, RH, pt.id, { city: "Gaia" }, "")).rejects.toMatchObject({ field: "reason" });
    await uc.setLocationEntity(ORG, RH, "porto", pt.id);
    ctx.contracts = 4;
    expect(await uc.usage(ORG, pt.id)).toEqual({ locations: 1, contracts: 4 });
    await expect(uc.update(ORG, RH, pt.id, { ...ES }, "Mudança de país")).rejects.toMatchObject({ code: "in_use", field: "country", extra: { locations: 1, contracts: 4 } });
    await uc.update(ORG, RH, pt.id, { socialSecurityId: "20000000001" }, "Correção do NISS");
    expect(ctx.audits.at(-1)).toEqual({ action: "legal_entities.update_fiscal_in_use", reason: "Correção do NISS" });
  });

  test("arquivar só sem uso (409 com as contagens); arquivada não se escolhe num centro; reativar", async () => {
    const { uc, ctx } = setup();
    const pt = await uc.create(ORG, RH, PT);
    await uc.setLocationEntity(ORG, RH, "porto", pt.id);
    ctx.contracts = 2;
    await expect(uc.archive(ORG, RH, pt.id, "Fecho da empresa")).rejects.toMatchObject({ code: "in_use", extra: { locations: 1, contracts: 2 } });
    await uc.setLocationEntity(ORG, RH, "porto", null);
    expect((await uc.archive(ORG, RH, pt.id, "Fecho da empresa")).status).toBe("archived");
    expect(await uc.list(ORG)).toEqual([]);
    expect((await uc.list(ORG, { status: "all", q: "123 456" })).map((e) => e.id)).toEqual([pt.id]);
    await expect(uc.setLocationEntity(ORG, RH, "gijon", pt.id)).rejects.toMatchObject({ code: "conflict" });
    await uc.restore(ORG, RH, pt.id);
    await uc.setLocationEntity(ORG, RH, "gijon", pt.id);
    expect((await uc.locations(ORG)).find((l) => l.id === "gijon")!.legalEntityId).toBe(pt.id);
    await expect(uc.setLocationEntity(ORG, RH, "lisboa", pt.id)).rejects.toMatchObject({ code: "not_found" });
  });
});
