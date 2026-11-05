import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { PAYMENT_METHODS, POS_VAT_RATES, SAFT_PAYMENT, type PaymentMethod, type PosEmployee, type PosProduct, type PosSaleRecord, type PosSettings, type SoldLine } from "../../domain/entities/pos.js";
import { PosNotFoundError, PosPinError, PosRuleError } from "../../domain/errors.js";
import type { CheckoutInput, DaySummary, PosEmployeeOption, PosPort, RefundInput } from "../../domain/ports/in/pos.port.js";
import type { InvoiceLine, InvoicingGatewayPort, PosClockPort, PosEmployeesPort, PosStorePort } from "../../domain/ports/out/pos.ports.js";
import { centsToEuros, priceSale } from "../../domain/services/sale-pricing.service.js";
import { previewVendusCsv } from "../../domain/services/vendus-csv.service.js";

export interface PosDeps {
  store: PosStorePort;
  invoicing: InvoicingGatewayPort;
  employees: PosEmployeesPort;
  clock: PosClockPort;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PIN = /^\d{4,8}$/;

const toInvoiceLine = (l: SoldLine, quantity = l.quantity): InvoiceLine => ({
  productCode: l.ref,
  productType: l.productType,
  description: l.name,
  quantity,
  unitPrice: centsToEuros(l.unitPriceCents),
  discountPct: l.discountPct,
  vatRate: l.vatRate,
});

/** PIN de 4 dígitos: no máximo 10 errados por organização em 5 minutos (uma instância do servidor). */
const PIN_MAX_FAILURES = 10;
const PIN_WINDOW_MS = 5 * 60_000;

export class PosUseCases implements PosPort {
  private readonly pinFailures = new Map<string, number[]>();

  constructor(private readonly deps: PosDeps) {}

  listProducts(org: OrganizationId, opts: { activeOnly?: boolean } = {}) {
    return this.deps.store.listProducts(org, opts);
  }

  previewImport(csv: string) {
    try {
      return previewVendusCsv(csv);
    } catch (e) {
      throw new PosRuleError(e instanceof Error ? e.message : "Ficheiro inválido");
    }
  }

  async importProducts(org: OrganizationId, csv: string) {
    const preview = this.previewImport(csv);
    const products = preview.rows.flatMap((r) => (r.status === "import" && r.product ? [r.product] : []));
    if (products.length === 0) throw new PosRuleError("Nenhum produto para importar");
    const out = await this.deps.store.upsertProducts(org, products);
    return { ...out, skipped: preview.skipped };
  }

  async updateProduct(org: OrganizationId, id: string, patch: { name?: string; category?: string | null; priceCents?: number; vatRate?: number; active?: boolean }) {
    if (patch.name !== undefined && (patch.name.trim().length < 2 || patch.name.length > 200)) throw new PosRuleError("Nome com 2 a 200 caracteres");
    if (patch.priceCents !== undefined && (!Number.isInteger(patch.priceCents) || patch.priceCents < 0 || patch.priceCents > 1_000_000)) throw new PosRuleError("Preço inválido");
    if (patch.vatRate !== undefined && !(POS_VAT_RATES as readonly number[]).includes(patch.vatRate)) throw new PosRuleError("IVA tem de ser 6, 13 ou 23 %");
    const clean = {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.category !== undefined ? { category: patch.category?.trim() || null } : {}),
      ...(patch.priceCents !== undefined ? { priceCents: patch.priceCents } : {}),
      ...(patch.vatRate !== undefined ? { vatRate: patch.vatRate as PosProduct["vatRate"] } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
    };
    return this.deps.store.updateProduct(org, id, clean);
  }

  getSettings(org: OrganizationId) {
    return this.deps.store.getSettings(org);
  }

  async saveSettings(org: OrganizationId, s: PosSettings) {
    const active = new Set((await this.deps.employees.listActive(org)).map((e) => e.id));
    const managers = [...new Set(s.managerEmployeeIds)];
    if (managers.some((id) => !active.has(id))) throw new PosRuleError("Gestor desconhecido ou inativo");
    const clean = { invoiceSeriesRef: s.invoiceSeriesRef || null, creditSeriesRef: s.creditSeriesRef || null, managerEmployeeIds: managers };
    await this.deps.store.saveSettings(org, clean);
    return clean;
  }

  async listEmployees(org: OrganizationId): Promise<PosEmployeeOption[]> {
    const [list, settings] = await Promise.all([this.deps.employees.listActive(org), this.deps.store.getSettings(org)]);
    const managers = new Set(settings.managerEmployeeIds);
    return list.map((e) => ({ ...e, isManager: managers.has(e.id) }));
  }

  async login(org: OrganizationId, pin: string): Promise<PosEmployee> {
    const now = Date.parse(this.deps.clock.nowIso());
    const recent = (this.pinFailures.get(org) ?? []).filter((t) => now - t < PIN_WINDOW_MS);
    if (recent.length >= PIN_MAX_FAILURES) throw new PosPinError("Demasiados PINs errados — espere uns minutos");
    const employee = PIN.test(pin ?? "") ? await this.deps.employees.findActiveByPin(org, pin) : null;
    if (!employee) {
      this.pinFailures.set(org, [...recent, now]);
      throw new PosPinError();
    }
    const settings = await this.deps.store.getSettings(org);
    return { ...employee, isManager: settings.managerEmployeeIds.includes(employee.id) };
  }

  async checkout(org: OrganizationId, input: CheckoutInput): Promise<PosSaleRecord> {
    const employee = await this.login(org, input.pin);
    const settings = await this.deps.store.getSettings(org);
    if (!settings.invoiceSeriesRef) throw new PosRuleError("Escolha a série de faturas-recibo nas configurações do POS");
    if (!PAYMENT_METHODS.includes(input.payment?.method)) throw new PosRuleError("Escolha o método de pagamento");
    if (!Array.isArray(input.lines) || input.lines.length === 0) throw new PosRuleError("A venda não tem artigos");

    const ids = [...new Set(input.lines.map((l) => l.productId))];
    const products = new Map((await this.deps.store.productsByIds(org, ids)).map((p) => [p.id, p]));
    const items = input.lines.map((l, i) => {
      const product = products.get(l.productId);
      if (!product || !product.active) throw new PosRuleError(`Linha ${i + 1}: produto indisponível`);
      return { product, quantity: l.quantity, ...(l.discount ? { discount: l.discount } : {}) };
    });
    const priced = priceSale(items, input.saleDiscount);

    let givenCents: number | null = null;
    let changeCents: number | null = null;
    if (input.payment.method === "cash") {
      givenCents = input.payment.givenCents ?? priced.totalCents;
      if (!Number.isInteger(givenCents) || givenCents < priced.totalCents) throw new PosRuleError("O valor entregue é menor do que o total");
      changeCents = givenCents - priced.totalCents;
    }

    const sold: SoldLine[] = priced.lines.map((l, i) => ({
      lineNumber: i + 1,
      productId: l.product.id,
      ref: l.product.ref,
      name: l.product.name,
      quantity: l.quantity,
      unitPriceCents: l.product.priceCents,
      discountPct: l.discountPct,
      vatRate: l.product.vatRate,
      productType: l.product.productType,
      totalCents: l.totalCents,
    }));
    const customer = input.customer?.taxId?.trim() ? { taxId: input.customer.taxId.trim(), name: input.customer.name?.trim() || "Cliente" } : null;
    const doc = await this.deps.invoicing.issueInvoiceReceipt(org, {
      seriesRef: settings.invoiceSeriesRef,
      lines: sold.map((l) => toInvoiceLine(l)),
      paymentMechanism: SAFT_PAYMENT[input.payment.method],
      customer,
      actor: employee.id,
    });
    return this.deps.store.recordSale(org, {
      kind: "sale",
      documentId: doc.documentId,
      documentNumber: doc.documentNumber,
      employeeId: employee.id,
      employeeName: employee.name,
      paymentMethod: input.payment.method,
      totalCents: doc.totalCents,
      givenCents,
      changeCents: givenCents === null ? null : givenCents - doc.totalCents,
      refundOf: null,
      reason: null,
      lines: sold,
    });
  }

  async refund(org: OrganizationId, saleId: string, input: RefundInput): Promise<PosSaleRecord> {
    const employee = await this.login(org, input.pin);
    if (!employee.isManager) throw new PosPinError("Só um gestor pode emitir notas de crédito");
    const reason = (input.reason ?? "").trim();
    if (reason.length < 3 || reason.length > 200) throw new PosRuleError("Indique o motivo da nota de crédito");
    const settings = await this.deps.store.getSettings(org);
    if (!settings.creditSeriesRef) throw new PosRuleError("Escolha a série de notas de crédito nas configurações do POS");
    const sale = await this.deps.store.getSale(org, saleId);
    if (!sale || sale.kind !== "sale") throw new PosNotFoundError("Venda");

    const refunded = new Map<number, number>();
    for (const r of await this.deps.store.refundsOf(org, saleId)) for (const l of r.lines) refunded.set(l.lineNumber, (refunded.get(l.lineNumber) ?? 0) + l.quantity);
    const wanted = (input.lines ?? []).filter((l) => l.quantity > 0);
    if (wanted.length === 0) throw new PosRuleError("Escolha as quantidades a devolver");
    const lines = wanted.map((w) => {
      const original = sale.lines.find((l) => l.lineNumber === w.lineNumber);
      if (!original) throw new PosRuleError(`Linha ${w.lineNumber} não existe na venda`);
      const left = original.quantity - (refunded.get(w.lineNumber) ?? 0);
      if (!Number.isInteger(w.quantity) || w.quantity > left) throw new PosRuleError(`${original.name}: só faltam devolver ${left}`);
      return { original, quantity: w.quantity };
    });

    const customer = await this.deps.invoicing.documentCustomer(org, sale.documentId);
    const doc = await this.deps.invoicing.issueCreditNote(org, {
      seriesRef: settings.creditSeriesRef,
      lines: lines.map(({ original, quantity }) => toInvoiceLine(original, quantity)),
      referenceDocumentId: sale.documentId,
      reason,
      customer,
      actor: employee.id,
    });
    return this.deps.store.recordSale(org, {
      kind: "refund",
      documentId: doc.documentId,
      documentNumber: doc.documentNumber,
      employeeId: employee.id,
      employeeName: employee.name,
      paymentMethod: sale.paymentMethod,
      totalCents: doc.totalCents,
      givenCents: null,
      changeCents: null,
      refundOf: sale.id,
      reason,
      lines: lines.map(({ original, quantity }) => ({ ...original, quantity, totalCents: Math.round((original.totalCents * quantity) / original.quantity) })),
    });
  }

  async documents(org: OrganizationId, date?: string) {
    const day = date && DATE.test(date) ? date : this.deps.clock.todayLisbon();
    const { fromIso, toIso } = this.deps.clock.lisbonDayBounds(day);
    return this.deps.store.salesBetween(org, fromIso, toIso);
  }

  async summary(org: OrganizationId, date?: string): Promise<DaySummary> {
    const day = date && DATE.test(date) ? date : this.deps.clock.todayLisbon();
    const records = await this.documents(org, day);
    const byPayment: Record<PaymentMethod, number> = { card: 0, cash: 0, mbway: 0 };
    let salesCount = 0;
    let salesCents = 0;
    let refundsCount = 0;
    let refundsCents = 0;
    for (const r of records) {
      if (r.kind === "sale") {
        salesCount++;
        salesCents += r.totalCents;
        byPayment[r.paymentMethod] += r.totalCents;
      } else {
        refundsCount++;
        refundsCents += r.totalCents;
        byPayment[r.paymentMethod] -= r.totalCents;
      }
    }
    const netCents = salesCents - refundsCents;
    return { date: day, salesCount, salesCents, refundsCount, refundsCents, netCents, averageTicketCents: salesCount ? Math.round(netCents / salesCount) : 0, byPayment };
  }
}
