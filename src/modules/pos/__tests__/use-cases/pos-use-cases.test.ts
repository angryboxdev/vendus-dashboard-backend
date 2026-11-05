import { mintOrganizationId, type OrganizationId } from "../../../../kernel/organization-id.js";
import { LisbonDayClock } from "../../adapters/out/lisbon-day-clock.js";
import { PosUseCases } from "../../application/use-cases/pos.use-cases.js";
import type { NewPosProduct, PosProduct, PosSaleRecord, PosSettings } from "../../domain/entities/pos.js";
import { PosPinError, PosRuleError } from "../../domain/errors.js";
import type { InvoicingGatewayPort, PosEmployeesPort, PosStorePort } from "../../domain/ports/out/pos.ports.js";

const ORG = mintOrganizationId("b6999cff-79b2-4583-b8b4-a744b3ace748");
const ANA = { id: "11111111-1111-4111-8111-111111111111", name: "Ana Fictícia" };
const RUI = { id: "22222222-2222-4222-8222-222222222222", name: "Rui Fictício" };
const SERIES = { fr: "33333333-3333-4333-8333-333333333333", nc: "44444444-4444-4444-8444-444444444444" };

class FakeStore implements PosStorePort {
  products: PosProduct[] = [
    { id: "p1", ref: "VPIZ1", name: "Pizza Teste", category: "Grandes", priceCents: 1850, vatRate: 13, productType: "P", trackStock: false, imageUrl: null, active: true },
    { id: "p2", ref: "VREF2", name: "Refrigerante", category: "Bebidas", priceCents: 250, vatRate: 23, productType: "P", trackStock: true, imageUrl: null, active: true },
    { id: "p3", ref: "VOLD3", name: "Inativo", category: null, priceCents: 100, vatRate: 13, productType: "P", trackStock: false, imageUrl: null, active: false },
  ];
  settings: PosSettings = { invoiceSeriesRef: SERIES.fr, creditSeriesRef: SERIES.nc, managerEmployeeIds: [RUI.id] };
  sales: PosSaleRecord[] = [];
  upserted: NewPosProduct[] = [];
  async listProducts() {
    return this.products;
  }
  async productsByIds(_o: OrganizationId, ids: string[]) {
    return this.products.filter((p) => ids.includes(p.id));
  }
  async upsertProducts(_o: OrganizationId, p: NewPosProduct[]) {
    this.upserted = p;
    return { created: p.length, updated: 0 };
  }
  async updateProduct(_o: OrganizationId, id: string, patch: Partial<PosProduct>) {
    const p = this.products.find((x) => x.id === id)!;
    Object.assign(p, patch);
    return p;
  }
  async getSettings() {
    return this.settings;
  }
  async saveSettings(_o: OrganizationId, s: PosSettings) {
    this.settings = s;
  }
  async recordSale(_o: OrganizationId, r: Omit<PosSaleRecord, "id" | "createdAt">) {
    const rec = { ...r, id: `s${this.sales.length + 1}`, createdAt: "2027-03-10T12:00:00.000Z" };
    this.sales.push(rec);
    return rec;
  }
  async getSale(_o: OrganizationId, id: string) {
    return this.sales.find((s) => s.id === id) ?? null;
  }
  async salesBetween() {
    return this.sales;
  }
  async refundsOf(_o: OrganizationId, id: string) {
    return this.sales.filter((s) => s.refundOf === id);
  }
}

class FakeInvoicing implements InvoicingGatewayPort {
  issued: Array<{ kind: string; q: unknown }> = [];
  async issueInvoiceReceipt(_o: OrganizationId, q: Parameters<InvoicingGatewayPort["issueInvoiceReceipt"]>[1]) {
    this.issued.push({ kind: "FR", q });
    const total = q.lines.reduce((t, l) => t + Math.round(Number(l.unitPrice) * 100 * l.quantity * (1 - Number(l.discountPct ?? 0) / 100)), 0);
    return { documentId: `d${this.issued.length}`, documentNumber: `FR POS/${this.issued.length}`, totalCents: total };
  }
  async issueCreditNote(_o: OrganizationId, q: Parameters<InvoicingGatewayPort["issueCreditNote"]>[1]) {
    this.issued.push({ kind: "NC", q });
    const total = q.lines.reduce((t, l) => t + Math.round(Number(l.unitPrice) * 100 * l.quantity * (1 - Number(l.discountPct ?? 0) / 100)), 0);
    return { documentId: `n${this.issued.length}`, documentNumber: `NC POS/${this.issued.length}`, totalCents: total };
  }
  async documentCustomer() {
    return null;
  }
}

const employees: PosEmployeesPort = {
  findActiveByPin: async (_o, pin) => (pin === "1234" ? ANA : pin === "0000" ? RUI : null),
  listActive: async () => [ANA, RUI],
};

function setup() {
  const store = new FakeStore();
  const invoicing = new FakeInvoicing();
  const uc = new PosUseCases({ store, invoicing, employees, clock: new LisbonDayClock(() => new Date("2027-03-10T12:00:00Z")) });
  return { store, invoicing, uc };
}

describe("PIN", () => {
  it("entra com o PIN do quiosque; gestor pela configuração", async () => {
    const { uc } = setup();
    expect(await uc.login(ORG, "1234")).toEqual({ ...ANA, isManager: false });
    expect(await uc.login(ORG, "0000")).toEqual({ ...RUI, isManager: true });
    await expect(uc.login(ORG, "9999")).rejects.toBeInstanceOf(PosPinError);
  });

  it("10 PINs errados em 5 minutos bloqueiam (nem o certo entra)", async () => {
    const { uc } = setup();
    for (let i = 0; i < 10; i++) await expect(uc.login(ORG, "9999")).rejects.toThrow("PIN inválido");
    await expect(uc.login(ORG, "1234")).rejects.toThrow(/Demasiados/);
  });
});

describe("venda", () => {
  it("emite a FR na série do POS com as linhas, desconto e meio de pagamento; regista o troco", async () => {
    const { uc, invoicing, store } = setup();
    const sale = await uc.checkout(ORG, {
      pin: "1234",
      lines: [
        { productId: "p1", quantity: 2, discount: { kind: "pct", value: 10 } },
        { productId: "p2", quantity: 1 },
      ],
      payment: { method: "cash", givenCents: 4000 },
    });
    const fr = invoicing.issued[0]!.q as Parameters<InvoicingGatewayPort["issueInvoiceReceipt"]>[1];
    expect(fr).toMatchObject({ seriesRef: SERIES.fr, paymentMechanism: "NU", customer: null, actor: ANA.id });
    expect(fr.lines).toEqual([
      { productCode: "VPIZ1", productType: "P", description: "Pizza Teste", quantity: 2, unitPrice: "18.50", discountPct: "10", vatRate: 13 },
      { productCode: "VREF2", productType: "P", description: "Refrigerante", quantity: 1, unitPrice: "2.50", discountPct: null, vatRate: 23 },
    ]);
    expect(sale).toMatchObject({ kind: "sale", totalCents: 3580, givenCents: 4000, changeCents: 420, employeeName: ANA.name, paymentMethod: "cash" });
    expect(store.sales).toHaveLength(1);
  });

  it("dinheiro a menos, produto inativo, sem série ou sem método → recusado sem emitir", async () => {
    const { uc, invoicing, store } = setup();
    await expect(uc.checkout(ORG, { pin: "1234", lines: [{ productId: "p1", quantity: 1 }], payment: { method: "cash", givenCents: 1000 } })).rejects.toThrow(/menor do que o total/);
    await expect(uc.checkout(ORG, { pin: "1234", lines: [{ productId: "p3", quantity: 1 }], payment: { method: "card" } })).rejects.toThrow(/indisponível/);
    await expect(uc.checkout(ORG, { pin: "1234", lines: [{ productId: "p1", quantity: 1 }], payment: { method: "cheque" as never } })).rejects.toThrow(/método/);
    store.settings = { ...store.settings, invoiceSeriesRef: null };
    await expect(uc.checkout(ORG, { pin: "1234", lines: [{ productId: "p1", quantity: 1 }], payment: { method: "card" } })).rejects.toBeInstanceOf(PosRuleError);
    expect(invoicing.issued).toHaveLength(0);
  });

  it("cliente com NIF vai para a fatura; cartão → CD, MB Way → OU", async () => {
    const { uc, invoicing } = setup();
    await uc.checkout(ORG, { pin: "1234", lines: [{ productId: "p2", quantity: 1 }], payment: { method: "card" }, customer: { taxId: "123456789", name: "Cliente Fictício" } });
    await uc.checkout(ORG, { pin: "1234", lines: [{ productId: "p2", quantity: 1 }], payment: { method: "mbway" } });
    expect(invoicing.issued.map((i) => (i.q as { paymentMechanism: string; customer: unknown }).paymentMechanism)).toEqual(["CD", "OU"]);
    expect((invoicing.issued[0]!.q as { customer: unknown }).customer).toEqual({ taxId: "123456789", name: "Cliente Fictício" });
  });
});

describe("nota de crédito", () => {
  async function sold() {
    const s = setup();
    const sale = await s.uc.checkout(ORG, { pin: "1234", lines: [{ productId: "p2", quantity: 3 }], payment: { method: "card" } });
    return { ...s, sale };
  }

  it("só um gestor; motivo obrigatório; até à quantidade por devolver", async () => {
    const { uc, sale, invoicing } = await sold();
    await expect(uc.refund(ORG, sale.id, { pin: "1234", lines: [{ lineNumber: 1, quantity: 1 }], reason: "Devolução do cliente" })).rejects.toThrow("Só um gestor pode emitir notas de crédito");
    await expect(uc.refund(ORG, sale.id, { pin: "0000", lines: [{ lineNumber: 1, quantity: 1 }], reason: "" })).rejects.toThrow(/motivo/);
    const nc = await uc.refund(ORG, sale.id, { pin: "0000", lines: [{ lineNumber: 1, quantity: 2 }], reason: "Devolução do cliente" });
    expect(nc).toMatchObject({ kind: "refund", refundOf: sale.id, totalCents: 500, paymentMethod: "card", reason: "Devolução do cliente" });
    const q = invoicing.issued[1]!.q as Parameters<InvoicingGatewayPort["issueCreditNote"]>[1];
    expect(q).toMatchObject({ seriesRef: SERIES.nc, referenceDocumentId: sale.documentId, reason: "Devolução do cliente", actor: RUI.id });
    await expect(uc.refund(ORG, sale.id, { pin: "0000", lines: [{ lineNumber: 1, quantity: 2 }], reason: "Outra" })).rejects.toThrow("Refrigerante: só faltam devolver 1");
  });
});

describe("painel do dia", () => {
  it("vendas líquidas, NC, ticket médio e fecho por forma de pagamento", async () => {
    const { uc } = setup();
    const a = await uc.checkout(ORG, { pin: "1234", lines: [{ productId: "p1", quantity: 1 }], payment: { method: "card" } });
    await uc.checkout(ORG, { pin: "1234", lines: [{ productId: "p2", quantity: 2 }], payment: { method: "cash", givenCents: 500 } });
    await uc.refund(ORG, a.id, { pin: "0000", lines: [{ lineNumber: 1, quantity: 1 }], reason: "Artigo com defeito" });
    expect(await uc.summary(ORG)).toEqual({
      date: "2027-03-10",
      salesCount: 2,
      salesCents: 2350,
      refundsCount: 1,
      refundsCents: 1850,
      netCents: 500,
      averageTicketCents: 250,
      byPayment: { card: 0, cash: 500, mbway: 0 },
    });
  });
});

describe("produtos", () => {
  it("importa só as linhas válidas do CSV; editar valida o IVA", async () => {
    const { uc, store } = setup();
    const csv = 'Nome,Categoria,Referência,PVP,"IVA - Taxa"\n"Pizza X",Grandes,V1,"9,9000",13\n"Cupão",,V2,"0,0000",13';
    expect(await uc.importProducts(ORG, csv)).toEqual({ created: 1, updated: 0, skipped: 1 });
    expect(store.upserted.map((p) => p.ref)).toEqual(["V1"]);
    await expect(uc.updateProduct(ORG, "p1", { vatRate: 18 })).rejects.toThrow(/6, 13 ou 23/);
    expect(await uc.updateProduct(ORG, "p1", { priceCents: 1990, active: false })).toMatchObject({ priceCents: 1990, active: false });
  });

  it("configuração: gestores têm de ser funcionários ativos", async () => {
    const { uc } = setup();
    await expect(uc.saveSettings(ORG, { invoiceSeriesRef: SERIES.fr, creditSeriesRef: SERIES.nc, managerEmployeeIds: ["55555555-5555-4555-8555-555555555555"] })).rejects.toThrow(/Gestor/);
    expect(await uc.listEmployees(ORG)).toEqual([
      { ...ANA, isManager: false },
      { ...RUI, isManager: true },
    ]);
  });
});
