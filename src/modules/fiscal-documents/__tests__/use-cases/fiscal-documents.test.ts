import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { FiscalDocumentsUseCases } from "../../application/use-cases/fiscal-documents.use-cases.js";
import type { FiscalIdentityInput } from "../../domain/entities/fiscal-identity.js";
import { fiscalKeyOf, isValidPtNif, normalizeSeriesNumber, normalizeTaxId } from "../../domain/services/fiscal-key.service.js";
import { FakeFiscalAudit, FakeFiscalRepo } from "../fakes/fake-fiscal.js";

const ORG = mintOrganizationId("org-a");
const OTHER = mintOrganizationId("org-b");
// NIF fictício com dígito de controlo válido (dados controlados).
const NIF = "503504564";
const doc = (over: Partial<FiscalIdentityInput> = {}): FiscalIdentityInput => ({ buyerLegalEntityId: null, issuerTaxId: `PT ${NIF}`, issuerCountry: null, documentType: "invoice", seriesNumber: "FT 2026/64311", atcud: null, ...over });

function setup() {
  const repo = new FakeFiscalRepo();
  const audit = new FakeFiscalAudit();
  return { repo, audit, uc: new FiscalDocumentsUseCases(repo, audit) };
}

describe("Identidade fiscal — regras", () => {
  test("NIF: PT só com dígito de controlo válido; prefixo de país; estrangeiro com país explícito; nunca inventa", () => {
    expect(isValidPtNif(NIF)).toBe(true);
    expect(isValidPtNif("503504565")).toBe(false);
    expect(normalizeTaxId("PT 503.504.564", null)).toEqual({ country: "PT", taxId: NIF });
    expect(normalizeTaxId(NIF, null)).toEqual({ country: "PT", taxId: NIF });
    expect(normalizeTaxId("ESB12345678", null)).toEqual({ country: "ES", taxId: "B12345678" });
    expect(normalizeTaxId("B12345678", null)).toBeNull(); // sem país e não é NIF PT → incompleto
    expect(normalizeTaxId("B12345678", "ES")).toEqual({ country: "ES", taxId: "B12345678" });
  });

  test("série/número: texto preservado, só maiúsculas/espaços; zeros e separadores contam; nunca inteiro", () => {
    expect(normalizeSeriesNumber("  ft   2026/64311 ")).toBe("FT 2026/64311");
    expect(normalizeSeriesNumber("FT 2026/064311")).not.toBe(normalizeSeriesNumber("FT 2026/64311"));
    expect(normalizeSeriesNumber("FT A/1")).not.toBe(normalizeSeriesNumber("FT B/1"));
    expect(fiscalKeyOf(doc({ seriesNumber: null }))).toEqual({ missing: ["series_number"] });
    expect(fiscalKeyOf(doc({ issuerTaxId: null }))).toEqual({ missing: ["issuer_tax_id"] });
  });
});

describe("Identidade fiscal — Financeiro e Stock", () => {
  test("importação repetida devolve a mesma identidade; outra fatura com o mesmo documento é recusada e aponta o original", async () => {
    const { uc, repo } = setup();
    const a = await uc.claimForInvoice(ORG, "u", doc(), "inv-1");
    const again = await uc.claimForInvoice(ORG, "u", doc(), "inv-1");
    expect(a.ok && again.ok && a.identity.id === again.identity.id).toBe(true);
    const copy = await uc.claimForInvoice(ORG, "u", doc({ seriesNumber: "ft 2026/64311" }), "inv-2");
    expect(copy).toMatchObject({ ok: false, resolution: { kind: "existing_finance", identity: { invoiceId: "inv-1" } } });
    expect(repo.rows).toHaveLength(1);
  });

  test("pedidos simultâneos (duas faturas e uma importação do Stock) → uma só identidade", async () => {
    const { uc, repo } = setup();
    const results = await Promise.all([uc.claimForInvoice(ORG, "u", doc(), "inv-1"), uc.claimForInvoice(ORG, "u", doc(), "inv-2"), uc.claimForStockImport(ORG, "u", doc(), "imp-1")]);
    expect(repo.rows).toHaveLength(1);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  test("séries diferentes com números semelhantes: possível duplicado para comparar à mão (não funde); depois de comparado, aceita", async () => {
    const { uc, repo } = setup();
    await uc.claimForInvoice(ORG, "u", doc(), "inv-1");
    const r = await uc.claimForInvoice(ORG, "u", doc({ seriesNumber: "FT 2026/064311" }), "inv-2");
    expect(r).toMatchObject({ ok: false, resolution: { kind: "possible_duplicate", candidates: [{ invoiceId: "inv-1" }] } });
    expect((await uc.claimForInvoice(ORG, "u", doc({ seriesNumber: "FT 2026/064311" }), "inv-2", { notADuplicate: true })).ok).toBe(true);
    expect(repo.rows).toHaveLength(2);
    // Mesmo número noutra série/NC é outro documento.
    expect((await uc.claimForInvoice(ORG, "u", doc({ documentType: "credit_note" }), "inv-3")).ok).toBe(true);
  });

  test("identidade incompleta fica em revisão (sem reservar)", async () => {
    const { uc, repo } = setup();
    expect(await uc.claimForInvoice(ORG, "u", doc({ issuerTaxId: "123" }), "inv-1")).toEqual({ ok: false, resolution: { kind: "incomplete", missing: ["issuer_country"] } });
    expect(repo.rows).toHaveLength(0);
  });

  test("já existe só no Stock: Financeiro recusa por omissão e completa o lançamento existente quando escolhido", async () => {
    const { uc, audit } = setup();
    const s = await uc.claimForStockImport(ORG, "u", doc(), "imp-1");
    const r = await uc.claimForInvoice(ORG, "u", doc(), "inv-1");
    expect(r).toMatchObject({ ok: false, resolution: { kind: "existing_stock_only" } });
    const done = await uc.claimForInvoice(ORG, "u", doc(), "inv-1", { completeStockIdentityId: s.ok ? s.identity.id : "" });
    expect(done).toMatchObject({ ok: true, linkedToStock: true, identity: { invoiceId: "inv-1", stockImportId: "imp-1" } });
    expect(audit.entries.map((e) => e.action)).toEqual(["fiscal_identity.create", "fiscal_identity.complete_from_stock"]);
  });

  test("já existe no Financeiro: o Stock não volta a importar o mesmo documento", async () => {
    const { uc } = setup();
    await uc.claimForInvoice(ORG, "u", doc(), "inv-1");
    expect(await uc.claimForStockImport(ORG, "u", doc(), "imp-1")).toMatchObject({ ok: false, resolution: { kind: "existing_finance" } });
  });

  test("corrigir o número da própria fatura muda a chave; não pode ficar com a de outro documento", async () => {
    const { uc } = setup();
    await uc.claimForInvoice(ORG, "u", doc({ seriesNumber: "FT 1/1" }), "inv-1");
    await uc.claimForInvoice(ORG, "u", doc({ seriesNumber: "FT 1/2" }), "inv-2");
    expect((await uc.claimForInvoice(ORG, "u", doc({ seriesNumber: "FT 1/3" }), "inv-1")).ok).toBe(true);
    expect(await uc.claimForInvoice(ORG, "u", doc({ seriesNumber: "FT 1/2" }), "inv-1")).toMatchObject({ ok: false, resolution: { kind: "existing_finance", identity: { invoiceId: "inv-2" } } });
  });

  test("isolamento por organização e entidade compradora", async () => {
    const { uc } = setup();
    await uc.claimForInvoice(ORG, "u", doc(), "inv-1");
    expect((await uc.claimForInvoice(OTHER, "u", doc(), "inv-9")).ok).toBe(true);
    expect((await uc.claimForInvoice(ORG, "u", doc({ buyerLegalEntityId: "le-2" }), "inv-8")).ok).toBe(true);
  });

  test("apagar fatura liberta a chave só se nunca chegou ao Stock", async () => {
    const { uc, repo } = setup();
    await uc.claimForInvoice(ORG, "u", doc(), "inv-1");
    await uc.releaseInvoice(ORG, "u", "inv-1");
    expect(repo.rows).toHaveLength(0);
    const s = await uc.claimForStockImport(ORG, "u", doc(), "imp-1");
    await uc.claimForInvoice(ORG, "u", doc(), "inv-2", { completeStockIdentityId: s.ok ? s.identity.id : "" });
    await uc.releaseInvoice(ORG, "u", "inv-2");
    expect(repo.rows).toHaveLength(1);
  });
});

describe("Migração do histórico (simulação primeiro)", () => {
  const hist = [
    { origin: "finance" as const, id: "inv-a", input: doc(), createdAt: "2026-01-01", label: "FT 2026/64311" },
    { origin: "finance" as const, id: "inv-b", input: doc({ seriesNumber: "FT 2026/64311 " }), createdAt: "2026-01-02", label: "FT 2026/64311 (cópia)" },
    { origin: "stock" as const, id: "imp-a", input: doc(), createdAt: "2026-01-03", label: "Importação Stock" },
    { origin: "finance" as const, id: "inv-c", input: doc({ seriesNumber: "FT 2026/99" }), createdAt: "2026-01-04", label: "FT 2026/99" },
    { origin: "finance" as const, id: "inv-d", input: doc({ issuerTaxId: null }), createdAt: "2026-01-05", label: "Sem NIF" },
  ];

  test("simulação não escreve; relata duplicados (sem fundir) e incompletos", async () => {
    const { uc, repo } = setup();
    const r = await uc.backfill(ORG, "admin", hist, true);
    expect(repo.rows).toHaveLength(0);
    expect(r).toMatchObject({ dryRun: true, scanned: 5, registered: 2, alreadyRegistered: 0 });
    expect(r.duplicates.map((d) => d.documents.map((x) => x.id))).toEqual([["inv-a", "inv-b", "imp-a"]]);
    expect(r.incomplete.map((i) => i.id)).toEqual(["inv-d"]);
  });

  test("execução real: o mais antigo fica com a chave, fatura e importação do mesmo documento ficam ligadas; repetir é idempotente", async () => {
    const { uc, repo } = setup();
    await uc.backfill(ORG, "admin", hist, false);
    expect(repo.rows.map((r) => [r.invoiceId, r.stockImportId])).toEqual([
      ["inv-a", "imp-a"],
      ["inv-c", null],
    ]);
    const again = await uc.backfill(ORG, "admin", hist, false);
    expect(again).toMatchObject({ registered: 0, alreadyRegistered: 2 });
    expect(repo.rows).toHaveLength(2);
  });
});
