import { dec } from "../../../../kernel/money/decimal.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { InvoicingUseCases } from "../../application/use-cases/invoicing.use-cases.js";
import { InvoicingNotFoundError, InvoicingRuleError } from "../../domain/errors.js";
import type { StoredDocument } from "../../domain/ports/out/invoicing-store.port.js";
import { FakeInvoicingStore } from "../fakes/fakes.js";

const ORG = mintOrganizationId("b6999cff-79b2-4583-b8b4-a744b3ace748");

function setup(certificateNumber: string | null = null) {
  const store = new FakeInvoicingStore();
  const uc = new InvoicingUseCases({ store, certificateNumber, signingAvailable: true, simplifiedInvoiceLimitNet: dec("100") });
  return { store, uc };
}

const newSeries = { legalEntityId: "le-1", locationId: null, documentType: "FS" as const, seriesId: "L01-2027", mode: "training" as const };

describe("séries", () => {
  it("cria série de formação vazia e por comunicar", async () => {
    const { uc } = setup();
    await expect(uc.createSeries(ORG, "ana", newSeries)).resolves.toMatchObject({ seriesId: "L01-2027", mode: "training", lastSequence: 0, validationCode: null });
  });

  it("recusa série normal antes do certificado e identificadores inválidos", async () => {
    const { uc } = setup();
    await expect(uc.createSeries(ORG, "ana", { ...newSeries, mode: "normal" })).rejects.toThrow(/certificado/);
    await expect(uc.createSeries(ORG, "ana", { ...newSeries, seriesId: "AT2027" })).rejects.toBeInstanceOf(InvoicingRuleError);
    await expect(uc.createSeries(ORG, "ana", { ...newSeries, documentType: "RC" as never })).rejects.toBeInstanceOf(InvoicingRuleError);
  });

  it("regista o código de validação da AT (mín. 8 caracteres, sem espaços nem «-»)", async () => {
    const { uc, store } = setup();
    const s = await uc.createSeries(ORG, "ana", newSeries);
    await expect(uc.setValidationCode(ORG, s.ref, "ABC")).rejects.toBeInstanceOf(InvoicingRuleError);
    await uc.setValidationCode(ORG, s.ref, " cdf7t5hd ");
    expect(store.series.get(s.ref)!.validationCode).toBe("CDF7T5HD");
  });
});

describe("anulação", () => {
  it("só com motivo da lista fechada", async () => {
    const { uc, store } = setup();
    await uc.cancel(ORG, "ana", "doc-1", "wrong-customer-tax-id", "pedido do cliente");
    expect(store.cancelled).toEqual([{ documentId: "doc-1", reason: "NIF do adquirente errado - pedido do cliente", actor: "ana" }]);
    await expect(uc.cancel(ORG, "ana", "doc-1", "valor-errado" as never)).rejects.toBeInstanceOf(InvoicingRuleError);
  });
});

describe("documento (2.ª via)", () => {
  const hash = "v" + "x".repeat(9) + "o" + "x".repeat(9) + "6" + "x".repeat(9) + "e" + "x".repeat(140) + "=";
  const stored = { id: "d1", documentType: "FS", seriesMode: "training", softwareCertificateNumber: "0", hash, atcud: "CDF7T5HD-1" } as StoredDocument;

  it("devolve o documento gravado com as menções fiscais e o ATCUD a imprimir", async () => {
    const { uc, store } = setup();
    store.getDocument = async () => stored;
    await expect(uc.getDocument(ORG, "d1")).resolves.toMatchObject({
      id: "d1",
      printed: { atcud: "ATCUD:CDF7T5HD-1", mentions: ["vo6e", "DOCUMENTO DE TESTE – SEM VALOR FISCAL", "Documento emitido para fins de Formação"] },
    });
  });

  it("inexistente → não encontrado", async () => {
    const { uc } = setup();
    await expect(uc.getDocument(ORG, "x")).rejects.toBeInstanceOf(InvoicingNotFoundError);
  });
});

describe("configuração para o ecrã", () => {
  it("diz se está certificado, os limites, taxas, motivos de isenção e de anulação", () => {
    const { uc } = setup();
    const meta = uc.meta();
    expect(meta).toMatchObject({ certified: false, certificateNumber: "0", signingAvailable: true, simplifiedInvoiceLimitNet: "100" });
    expect(meta.exemptions.map((e) => e.code)).toEqual(["M10", "M99"]);
    expect(meta.vatRates).toContainEqual({ region: "PT", code: "INT", percentage: "13" });
    expect(meta.cancelReasons).toHaveLength(3);
  });
});
