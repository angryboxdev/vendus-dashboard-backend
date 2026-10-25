import { FillSupplierLogosUseCase } from "../../application/use-cases/fill-supplier-logos.use-case.js";
import type { SupplierSummary } from "../../domain/ports/out/supplier-lookup.port.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";

const ORG = mintOrganizationId("org-test");
const supplier = (id: string, logoUrl: string | null = null): SupplierSummary => ({
  id, name: `Fornecedor ${id}`, nif: null, defaultCostCenterGroupId: null, defaultCostCenterCategoryId: null, defaultFinancialType: null, logoUrl,
});

/** PDFs fictícios: o conteúdo diz se o «leitor» encontra logótipo («com-logo») ou não. */
function setup(suppliers: SupplierSummary[], pdfsBySupplier: Record<string, { invoiceId: string; content: string }[]>) {
  const written: { supplierId: string; logoUrl: string }[] = [];
  const read: string[] = [];
  const useCase = new FillSupplierLogosUseCase(
    {
      findById: async (_o, id) => suppliers.find((s) => s.id === id) ?? null,
      findAll: async () => suppliers,
    },
    { recentPdfAttachments: async (_o, supplierId, limit) => (pdfsBySupplier[supplierId] ?? []).slice(0, limit).map((p) => ({ invoiceId: p.invoiceId, url: `https://x/${p.invoiceId}.pdf` })) },
    {
      read: async (_o, url) => {
        read.push(url);
        const id = url.slice(url.lastIndexOf("/") + 1, -4);
        const content = Object.values(pdfsBySupplier).flat().find((p) => p.invoiceId === id)?.content;
        if (content === "ilegivel") throw new Error("PDF corrompido");
        return content ? Buffer.from(content) : null;
      },
    },
    { extractLogo: async (buf) => (buf.toString() === "com-logo" ? { png: Buffer.from("png"), width: 100, height: 40 } : null) },
    { store: async () => `https://x/logo-${written.length + 1}.png` },
    { setLogo: async (_o, supplierId, logoUrl) => { written.push({ supplierId, logoUrl }); } },
  );
  return { useCase, written, read };
}

describe("FillSupplierLogosUseCase", () => {
  it("fornecedor sem logótipo: grava o logótipo da fatura mais recente que o tenha", async () => {
    const { useCase, written } = setup([supplier("s1")], { s1: [{ invoiceId: "f2", content: "digitalizada" }, { invoiceId: "f1", content: "com-logo" }] });
    await expect(useCase.fillForSupplier(ORG, "s1")).resolves.toEqual({ filled: true, logoUrl: "https://x/logo-1.png" });
    expect(written).toEqual([{ supplierId: "s1", logoUrl: "https://x/logo-1.png" }]);
  });

  it("nunca substitui um logótipo existente (nem lê PDFs)", async () => {
    const { useCase, written, read } = setup([supplier("s1", "https://x/atual.png")], { s1: [{ invoiceId: "f1", content: "com-logo" }] });
    await expect(useCase.fillForSupplier(ORG, "s1")).resolves.toEqual({ filled: false });
    expect(written).toHaveLength(0);
    expect(read).toHaveLength(0);
  });

  it("a fatura indicada (a que se acabou de confirmar) é a primeira a ser lida", async () => {
    const { useCase, read } = setup([supplier("s1")], { s1: [{ invoiceId: "f2", content: "com-logo" }, { invoiceId: "f1", content: "com-logo" }] });
    await useCase.fillForSupplier(ORG, "s1", "f1");
    expect(read).toEqual(["https://x/f1.pdf"]);
  });

  it("PDF ilegível ou sem logótipo: tenta as seguintes e, sem nenhum, não grava nem falha", async () => {
    const { useCase, written } = setup([supplier("s1")], { s1: [{ invoiceId: "f1", content: "ilegivel" }, { invoiceId: "f2", content: "digitalizada" }] });
    await expect(useCase.fillForSupplier(ORG, "s1")).resolves.toEqual({ filled: false });
    expect(written).toHaveLength(0);
  });

  it("preenchimento da lista: só os sem logótipo, por lotes com cursor", async () => {
    const { useCase, written } = setup(
      [supplier("a"), supplier("b", "https://x/b.png"), supplier("c"), supplier("d")],
      { a: [{ invoiceId: "fa", content: "com-logo" }], c: [{ invoiceId: "fc", content: "digitalizada" }], d: [{ invoiceId: "fd", content: "com-logo" }] },
    );
    const first = await useCase.fillMissing(ORG, { batchSize: 2 });
    expect(first).toEqual({ processed: 2, filled: 1, next: "c" });
    const second = await useCase.fillMissing(ORG, { batchSize: 2, after: first.next! });
    expect(second).toEqual({ processed: 1, filled: 1, next: null });
    expect(written.map((w) => w.supplierId)).toEqual(["a", "d"]);
  });
});
