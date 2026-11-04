import { dec } from "../../../../kernel/money/decimal.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { InvoicingUseCases } from "../../application/use-cases/invoicing.use-cases.js";
import { InvoicingNotFoundError, InvoicingRuleError } from "../../domain/errors.js";
import { FakeInvoicingStore, FakeIssuers, FixedClock, ISSUER } from "../fakes/fakes.js";

const ORG = mintOrganizationId("b6999cff-79b2-4583-b8b4-a744b3ace748");
const NOW = { systemEntryDate: "2027-04-02T09:00:00", date: "2027-04-02", instant: "2027-04-02T08:00:00.000Z" };

function setup(over: { issuers?: FakeIssuers; software?: { productName: string; producerTaxId: string | null; producerName: string | null; version: string } } = {}) {
  const store = new FakeInvoicingStore();
  const uc = new InvoicingUseCases({
    store,
    certificateNumber: null,
    signingAvailable: true,
    simplifiedInvoiceLimitNet: dec("100"),
    issuers: over.issuers ?? new FakeIssuers(),
    clock: new FixedClock(NOW),
    software: over.software ?? { productName: "Mezza", producerTaxId: null, producerName: null, version: "1.0.0" },
  });
  return { store, uc };
}

const query = { legalEntityId: "le-1", from: "2027-03-01", to: "2027-03-31", includeTraining: false };

describe("exportar SAF-T (PT)", () => {
  it("gera o ficheiro do período: emitente, produtor (por omissão, o emitente), certificado 0 e nome do ficheiro", async () => {
    const { uc, store } = setup();

    const out = await uc.exportSaft(ORG, "a1b2c3d4-e5f6-4789-8abc-def012345678", query);

    expect(out.fileName).toBe("SAFT_599999999_2027-03-01_2027-03-31.xml");
    expect(out.xml).toContain("<TaxRegistrationNumber>599999999</TaxRegistrationNumber>");
    expect(out.xml).toContain("<DateCreated>2027-04-02</DateCreated>");
    expect(out.xml).toContain("<ProductCompanyTaxID>599999999</ProductCompanyTaxID><SoftwareCertificateNumber>0</SoftwareCertificateNumber>");
    expect(out.xml).toContain(`<ProductID>Mezza/${ISSUER.name}</ProductID><ProductVersion>1.0.0</ProductVersion>`);
    expect(store.saftQueries).toEqual([query]);
    // Cada exportação fica registada (quem, que período, quantos documentos).
    expect(store.events).toEqual([
      { actor: "a1b2c3d4e5f647898abcdef0123456", action: "saft.exported", details: { legalEntityId: "le-1", from: "2027-03-01", to: "2027-03-31", includeTraining: false, documents: 0 } },
    ]);
  });

  it("produtor configurado aparece no cabeçalho", async () => {
    const { uc } = setup({ software: { productName: "Mezza", producerTaxId: "500000000", producerName: "Mezza, Lda", version: "2.3.1" } });
    const out = await uc.exportSaft(ORG, "u1", query);
    expect(out.xml).toContain("<ProductCompanyTaxID>500000000</ProductCompanyTaxID>");
    expect(out.xml).toContain("<ProductID>Mezza/Mezza, Lda</ProductID><ProductVersion>2.3.1</ProductVersion>");
  });

  it("período: datas válidas, início antes do fim e um só ano fiscal", async () => {
    const { uc } = setup();
    await expect(uc.exportSaft(ORG, "u1", { ...query, from: "2027-3-1" })).rejects.toBeInstanceOf(InvoicingRuleError);
    await expect(uc.exportSaft(ORG, "u1", { ...query, to: "2027-02-31" })).rejects.toBeInstanceOf(InvoicingRuleError);
    await expect(uc.exportSaft(ORG, "u1", { ...query, from: "2027-04-01" })).rejects.toBeInstanceOf(InvoicingRuleError);
    await expect(uc.exportSaft(ORG, "u1", { ...query, from: "2026-12-01" })).rejects.toThrow(/ano/);
  });

  it("emitente inexistente → não encontrado", async () => {
    const { uc } = setup({ issuers: new FakeIssuers(null) });
    await expect(uc.exportSaft(ORG, "u1", query)).rejects.toBeInstanceOf(InvoicingNotFoundError);
  });
});
