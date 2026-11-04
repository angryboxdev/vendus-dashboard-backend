import { dec, decToString } from "../../../../kernel/money/decimal.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { IssueDocumentUseCase, type IssueDocumentInput, type IssueLineInput } from "../../application/use-cases/issue-document.use-case.js";
import type { SeriesState } from "../../domain/entities/series.js";
import { InvoicingNotFoundError, InvoicingRuleError, InvoicingUnavailableError, IssueNeedsConfirmationError } from "../../domain/errors.js";
import { FakeInvoicingStore, FakeIssuers, FakeSigner, FixedClock } from "../fakes/fakes.js";

const ORG = mintOrganizationId("b6999cff-79b2-4583-b8b4-a744b3ace748");
const NOW = { systemEntryDate: "2027-03-10T12:00:00", date: "2027-03-10", instant: "2027-03-10T12:00:00.000Z" };

const pizza: IssueLineInput = {
  productCode: "PZ01",
  productType: "P",
  unit: "UN",
  description: "Pizza Margherita",
  quantity: "2",
  unitPrice: "12.50",
  tax: { region: "PT", rate: "INT" },
};
const beer: IssueLineInput = { ...pizza, productCode: "CV01", description: "Cerveja", quantity: "1", unitPrice: "3.00", tax: { region: "PT", rate: "NOR" } };

function series(type: SeriesState["documentType"], over: Partial<SeriesState> = {}): SeriesState {
  return {
    ref: `serie-${type}`,
    legalEntityId: "le-1",
    locationId: null,
    documentType: type,
    seriesId: "L01-2027",
    mode: "training",
    validationCode: "CDF7T5HD",
    lastSequence: 0,
    lastHash: null,
    lastDocumentDate: null,
    lastSystemEntryAt: null,
    ...over,
  };
}

function setup(opts: { certificateNumber?: string | null; signer?: FakeSigner | null; series?: SeriesState[] } = {}) {
  const store = new FakeInvoicingStore();
  for (const s of opts.series ?? [series("FS")]) store.series.set(s.ref, s);
  const signer = opts.signer === undefined ? new FakeSigner() : opts.signer;
  const useCase = new IssueDocumentUseCase({
    store,
    signer,
    clock: new FixedClock(NOW),
    issuers: new FakeIssuers(),
    certificateNumber: opts.certificateNumber ?? null,
    simplifiedInvoiceLimitNet: dec("100"),
  });
  return { store, signer, useCase };
}

const input = (over: Partial<IssueDocumentInput> = {}): IssueDocumentInput => ({ seriesRef: "serie-FS", lines: [pizza, beer], actor: "ana@example.invalid", ...over });

describe("emitir documento", () => {
  it("emite uma fatura simplificada a consumidor final, assinada e com QR (sem certificado: R:0)", async () => {
    const { useCase, store, signer } = setup();

    const out = await useCase.execute(ORG, input());

    expect(out).toEqual({ documentId: "doc-1", documentNumber: "FS L01-2027/1", atcud: "CDF7T5HD-1" });
    const r = store.saved[0]!;
    expect(signer.messages).toEqual(["2027-03-10;2027-03-10T12:00:00;FS L01-2027/1;28.00;"]);
    expect(r).toMatchObject({
      sequence: 1,
      documentDate: "2027-03-10",
      taxPointDate: "2027-03-10",
      systemEntryDate: "2027-03-10T12:00:00",
      systemEntryAt: "2027-03-10T12:00:00.000Z",
      softwareCertificateNumber: "0",
      customer: { customerId: "Consumidor final", taxId: "999999990" },
      issuer: { taxId: "599999999" },
      actor: "ana@example.invalid",
    });
    // 2 × 12,50 a 13 % → base 22,12 + IVA 2,88; 3,00 a 23 % → base 2,44 + IVA 0,56
    expect(r.qrPayload).toBe(
      `A:599999999*B:999999990*C:PT*D:FS*E:N*F:20270310*G:FS L01-2027/1*H:CDF7T5HD-1*I1:PT*I5:22.12*I6:2.88*I7:2.44*I8:0.56*N:3.44*O:28.00*Q:${r.hash[0]}${r.hash[10]}${r.hash[20]}${r.hash[30]}*R:0`,
    );
    expect(r.totals.lines[0]!.line.product).toEqual({ code: "PZ01", type: "P", unit: "UN" });
  });

  it("se outro terminal emitiu entretanto, recomeça com o estado novo da série", async () => {
    const { useCase, store } = setup();
    store.concurrentIssues = 1;

    const out = await useCase.execute(ORG, input());

    expect(out.documentNumber).toBe("FS L01-2027/2");
    expect(store.saved).toHaveLength(1);
    expect(store.saved[0]!.expected).toEqual({ lastSequence: 1, lastHash: "outro-1" });
  });

  it("antes do certificado não emite em séries normais", async () => {
    const { useCase } = setup({ series: [series("FS", { mode: "normal" })] });
    await expect(useCase.execute(ORG, input())).rejects.toBeInstanceOf(InvoicingRuleError);
  });

  it("com certificado imprime o n.º no QR", async () => {
    const { useCase, store } = setup({ certificateNumber: "2125", series: [series("FS", { mode: "normal" })] });
    await useCase.execute(ORG, input());
    expect(store.saved[0]!.softwareCertificateNumber).toBe("2125");
    expect(store.saved[0]!.qrPayload).toMatch(/\*R:2125$/);
  });

  it("data futura ou relógio atrasado exigem confirmação expressa", async () => {
    const { useCase, store } = setup();
    store.lastEntryAt = "2027-03-10T12:30:00.000Z";

    await expect(useCase.execute(ORG, input({ documentDate: "2027-03-11" }))).rejects.toEqual(
      new IssueNeedsConfirmationError(["future-document-date", "system-clock-behind"]),
    );
    await expect(useCase.execute(ORG, input({ documentDate: "2027-03-11", confirmWarnings: true }))).resolves.toMatchObject({ documentNumber: "FS L01-2027/1" });
  });

  it("fatura simplificada só até 100 € sem IVA (CIVA art. 40.º; refeições = prestação de serviços)", async () => {
    const { useCase } = setup();
    const big: IssueLineInput = { ...pizza, quantity: "10", unitPrice: "12.50" }; // 125,00 com IVA → 110,62 sem IVA
    await expect(useCase.execute(ORG, input({ lines: [big] }))).rejects.toThrow(/100/);
  });

  it("fatura-recibo exige o meio de pagamento", async () => {
    const { useCase } = setup({ series: [series("FR")] });
    await expect(useCase.execute(ORG, input({ seriesRef: "serie-FR" }))).rejects.toThrow(/pagamento/);
    await expect(useCase.execute(ORG, input({ seriesRef: "serie-FR", paymentMechanism: "CC" }))).resolves.toBeDefined();
  });

  it("linha isenta usa a menção oficial do código; motivo desligado é recusado", async () => {
    const { useCase, store } = setup();
    const deposit: IssueLineInput = { ...pizza, description: "Depósito de embalagem", quantity: "1", unitPrice: "0.10", tax: { region: "PT", exemptionCode: "M99" } };

    await useCase.execute(ORG, input({ lines: [pizza, deposit] }));
    expect(store.saved[0]!.totals.exemptions[0]).toMatchObject({ code: "M99", reason: "Não sujeito ou não tributado" });
    expect(store.saved[0]!.qrPayload).toContain("*L:0.10*");

    await expect(useCase.execute(ORG, input({ lines: [{ ...deposit, tax: { region: "PT", exemptionCode: "M30" } }] }))).rejects.toThrow(/não está ativo/);
  });

  it("cliente com NIF português inválido é recusado; válido fica gravado", async () => {
    const { useCase, store } = setup();
    await expect(useCase.execute(ORG, input({ customer: { taxId: "123456780", name: "Cliente" } }))).rejects.toThrow(/NIF/);

    await useCase.execute(ORG, input({ customer: { taxId: "123456789", name: "Cliente Lda", country: "PT" } }));
    expect(store.saved[0]!.customer).toMatchObject({ customerId: "123456789", taxId: "123456789", name: "Cliente Lda" });
    expect(store.saved[0]!.qrPayload).toContain("*B:123456789*");
  });

  it("NIF 999999990 é sempre «Consumidor final», seja qual for o nome enviado (Despacho 2.2.5)", async () => {
    const { useCase, store } = setup();
    await useCase.execute(ORG, input({ customer: { taxId: "999999990", name: "Qualquer nome" } }));
    expect(store.saved[0]!.customer).toEqual({ customerId: "Consumidor final", taxId: "999999990", name: "Consumidor final", country: "PT", address: null });
  });

  it("cliente: limites do SAF-T (nome ≤ 100, NIF ≤ 30, país ISO de 2 letras, morada)", async () => {
    const { useCase } = setup();
    const bad = [
      { taxId: "123456789", name: "x".repeat(101) },
      { taxId: "A".repeat(31), name: "Cliente", country: "ES" },
      { taxId: "B12345678", name: "Cliente", country: "Espanha" },
      { taxId: "123456789", name: "Cliente", address: { street: "", postalCode: "4000-001", city: "Porto", country: "PT" } },
    ];
    for (const customer of bad) await expect(useCase.execute(ORG, input({ customer }))).rejects.toBeInstanceOf(InvoicingRuleError);
  });

  it("valores não numéricos, tipo de produto ou meio de pagamento desconhecidos são erros de regra (não 500)", async () => {
    const { useCase } = setup({ series: [series("FS"), series("FR")] });
    for (const l of [{ ...pizza, quantity: "abc" }, { ...pizza, unitPrice: "1,5" }, { ...pizza, productType: "X" as never }, { ...pizza, description: "y".repeat(201) }, { ...pizza, description: "P" }, { ...pizza, description: "Pizza\u0007" }]) {
      await expect(useCase.execute(ORG, input({ lines: [l] }))).rejects.toBeInstanceOf(InvoicingRuleError);
    }
    await expect(useCase.execute(ORG, input({ seriesRef: "serie-FR", paymentMechanism: "XX" as never }))).rejects.toBeInstanceOf(InvoicingRuleError);
  });

  describe("notas de crédito (Despacho 1.4, 3.2.7, 3.3.7)", () => {
    const fs1 = { id: "fs-1", legalEntityId: "le-1", documentType: "FS" as const, seriesMode: "training" as const, customerTaxId: "999999990", documentNumber: "FS L01-2027/1", documentDate: "2027-03-09", status: "N" as const, grossTotal: dec("28.00") };

    it("não retifica documento de outro modo (formação vs. real) nem de outro cliente", async () => {
      const { useCase, store } = setup({ series: [series("NC")] });
      store.summaries.set("fs-n", { ...fs1, id: "fs-n", seriesMode: "normal" });
      store.summaries.set("fs-c", { ...fs1, id: "fs-c", customerTaxId: "123456789" });
      for (const documentId of ["fs-n", "fs-c"]) {
        await expect(useCase.execute(ORG, input({ seriesRef: "serie-NC", lines: [beer], references: [{ documentId, reason: "x" }] }))).rejects.toBeInstanceOf(InvoicingRuleError);
      }
    });

    it("exige o documento retificado e grava a referência com o número", async () => {
      const { useCase, store } = setup({ series: [series("NC")] });
      store.summaries.set(fs1.id, fs1);

      await expect(useCase.execute(ORG, input({ seriesRef: "serie-NC", lines: [beer] }))).rejects.toThrow(/retificado/);

      await useCase.execute(ORG, input({ seriesRef: "serie-NC", lines: [beer], references: [{ documentId: "fs-1", reason: "Devolução" }] }));
      expect(store.saved[0]!.referencesTo).toEqual([{ documentId: "fs-1", documentNumber: "FS L01-2027/1", reason: "Devolução" }]);
    });

    it("não credita mais do que falta creditar no documento", async () => {
      const { useCase, store } = setup({ series: [series("NC")] });
      store.summaries.set(fs1.id, fs1);
      store.credited.set(fs1.id, dec("26.00"));

      await expect(useCase.execute(ORG, input({ seriesRef: "serie-NC", lines: [beer], references: [{ documentId: "fs-1", reason: "Devolução" }] }))).rejects.toThrow(/creditar/);
    });

    it("não retifica documento anulado nem de outro emitente", async () => {
      const { useCase, store } = setup({ series: [series("NC")] });
      store.summaries.set(fs1.id, { ...fs1, status: "A" });
      store.summaries.set("fs-2", { ...fs1, id: "fs-2", legalEntityId: "le-2" });

      for (const documentId of ["fs-1", "fs-2", "nao-existe"]) {
        await expect(useCase.execute(ORG, input({ seriesRef: "serie-NC", lines: [beer], references: [{ documentId, reason: "x" }] }))).rejects.toBeInstanceOf(InvoicingRuleError);
      }
    });
  });

  describe("consultas de mesa (Despacho 1.2, 1.3)", () => {
    const cm = { id: "cm-1", legalEntityId: "le-1", documentType: "CM" as const, seriesMode: "training" as const, customerTaxId: "999999990", documentNumber: "CM L01-2027/7", documentDate: "2027-03-10", status: "N" as const, grossTotal: dec("28.00") };

    it("a fatura refere as consultas de mesa que fatura", async () => {
      const { useCase, store } = setup();
      store.summaries.set(cm.id, cm);

      await useCase.execute(ORG, input({ orderReferences: ["cm-1"] }));
      expect(store.saved[0]!.orderReferences).toEqual([{ documentId: "cm-1", documentNumber: "CM L01-2027/7" }]);
    });

    it("só se referem consultas de mesa ativas, e só a partir de faturas", async () => {
      const { useCase, store } = setup({ series: [series("FS"), series("CM")] });
      store.summaries.set(cm.id, { ...cm, status: "F" });
      await expect(useCase.execute(ORG, input({ orderReferences: ["cm-1"] }))).rejects.toBeInstanceOf(InvoicingRuleError);
      store.summaries.set(cm.id, cm);
      await expect(useCase.execute(ORG, input({ seriesRef: "serie-CM", orderReferences: ["cm-1"] }))).rejects.toBeInstanceOf(InvoicingRuleError);
    });
  });

  it("sem chave de assinatura configurada a emissão fica indisponível", async () => {
    const { useCase } = setup({ signer: null });
    await expect(useCase.execute(ORG, input())).rejects.toBeInstanceOf(InvoicingUnavailableError);
  });

  it("série inexistente → não encontrada", async () => {
    const { useCase } = setup();
    await expect(useCase.execute(ORG, input({ seriesRef: "nao-existe" }))).rejects.toBeInstanceOf(InvoicingNotFoundError);
  });

  it("valores exatos: o total assinado é o do documento", async () => {
    const { useCase, store } = setup();
    await useCase.execute(ORG, input({ lines: [{ ...pizza, quantity: "3", unitPrice: "1.333", discountPct: "10" }] }));
    expect(decToString(store.saved[0]!.totals.grossTotal)).toBe("3.6");
  });
});
