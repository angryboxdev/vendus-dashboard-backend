import type {
  Category,
  Channel,
  MonthlySummaryResponse,
  PaymentMethodEntry,
  VendusDetailedDocument,
  VendusDocument,
} from "../domain/types.js";
import {
  addTaxBreakdown,
  addToTotals,
  createProductAgg,
} from "../domain/aggregation.js";
import { fromCents, toCents } from "../utils/numbers.js";
import { detectCategoryFromMapOrTitle } from "../domain/categoryDetection.js";
import { detectChannel } from "../domain/channelDetection.js";
import { isFreeItem } from "../domain/priceDetection.js";
import { mapLimit } from "../utils/mapLimit.js";
import { vendusGet } from "../infra/vendusClient.js";
import {
  createMonthlySummaryState,
  type MonthlySummaryState,
} from "./monthlySummary/monthlySummaryState.js";
import {
  buildMonthlySummaryResponse,
  type BuildResponseParams,
} from "./monthlySummary/monthlySummaryResponseBuilder.js";

export type MonthlySummaryParams = {
  since: string;
  until: string;
  type: string;
  perPage: number;
  concurrency: number;
  fetchAllDocuments: (
    since: string,
    until: string,
    type: string,
    per_page: number
  ) => Promise<{ documents: VendusDocument[]; pagesFetched: number }>;
};

export class MonthlySummaryBuilder {
  private readonly params: MonthlySummaryParams;
  private readonly state: MonthlySummaryState;
  private fsDocuments: VendusDocument[] = [];
  private detailedDocs: VendusDetailedDocument[] = [];
  private documentsFetchedCount = 0;
  private pagesFetched = 0;
  private readonly startedAt: number;

  constructor(params: MonthlySummaryParams) {
    this.params = params;
    this.state = createMonthlySummaryState();
    this.startedAt = Date.now();
  }

  async build(): Promise<MonthlySummaryResponse> {
    await this.fetchAndFilterDocuments();
    this.processAllDocuments();
    return this.buildResponse();
  }

  private async fetchAndFilterDocuments(): Promise<void> {
    const { since, until, type, perPage, concurrency, fetchAllDocuments } =
      this.params;

    const { documents, pagesFetched } = await fetchAllDocuments(
      since,
      until,
      type,
      perPage
    );
    this.documentsFetchedCount = documents.length;
    this.pagesFetched = pagesFetched;

    const ncDocuments = documents.filter((d) => d.type === "NC");
    const detailedNc = await mapLimit(ncDocuments, concurrency, (doc) =>
      vendusGet<VendusDetailedDocument>(`/documents/${doc.id}/`)
    );
    const ncFsNumbers = detailedNc.flatMap((doc) =>
      (doc.related_docs ?? [])
        .filter((d) => d.type === "FS")
        .map((d) => d.number)
    );

    this.fsDocuments = documents
      .filter((d) => d.type === "FS")
      .filter((d) => !ncFsNumbers.includes(d.number));

    this.detailedDocs = await mapLimit(this.fsDocuments, concurrency, (doc) =>
      vendusGet<VendusDetailedDocument>(`/documents/${doc.id}/`)
    );
  }

  private processAllDocuments(): void {
    for (const doc of this.detailedDocs) {
      this.processDocument(doc);
    }
  }

  private processDocument(doc: VendusDetailedDocument): void {
    const channel = detectChannel(doc);
    this.state.totals.documents_count += 1;
    this.state.byChannel[channel].totals.documents_count += 1;

    const docGross = toCents(doc?.amount_gross);
    const docNet = toCents(doc?.amount_net);

    this.accumulateDocTotals(doc, docGross, docNet);
    this.accumulateTaxBreakdown(doc);
    this.accumulateTopLevelPaymentMethods(doc);

    const paymentMethods = this.getDocPaymentMethods(doc);
    const items = Array.isArray(doc?.items) ? doc.items : [];

    for (const item of items) {
      if (isFreeItem(doc, item)) continue;
      this.processItem(doc, item, paymentMethods);
    }
  }

  private accumulateDocTotals(
    doc: VendusDetailedDocument,
    docGross: number,
    docNet: number
  ): void {
    this.state.totals.gross += docGross;
    this.state.totals.net += docNet;
    this.state.totals.tax_amount += docGross - docNet;
  }

  private accumulateTaxBreakdown(doc: VendusDetailedDocument): void {
    if (!Array.isArray(doc?.taxes)) return;
    for (const tx of doc.taxes) {
      const rate = Number(tx?.rate);
      const base = toCents(tx?.base);
      const amount = toCents(tx?.amount);
      const total = toCents(tx?.total);
      if (Number.isFinite(rate)) {
        addTaxBreakdown(this.state.taxMap, rate, base, amount, total);
      }
    }
  }

  private accumulateTopLevelPaymentMethods(doc: VendusDetailedDocument): void {
    if (!Array.isArray(doc?.payments)) return;
    for (const payment of doc.payments) {
      const method = String(payment?.title ?? "Outros").trim() || "Outros";
      const amount = toCents(payment?.amount);
      let entry = this.state.paymentMethodMap.get(method);
      if (!entry) {
        entry = { amount: 0, docIds: new Set() };
        this.state.paymentMethodMap.set(method, entry);
      }
      entry.amount += amount;
      entry.docIds.add(doc.id);
    }
  }

  private getDocPaymentMethods(
    doc: VendusDetailedDocument
  ): Array<{ method: string; amount: number }> {
    if (!Array.isArray(doc?.payments)) return [];
    return doc.payments.map((p) => ({
      method: String(p?.title ?? "Outros").trim() || "Outros",
      amount: toCents(p?.amount),
    }));
  }

  private processItem(
    doc: VendusDetailedDocument,
    item: VendusDetailedDocument["items"][number],
    paymentMethods: Array<{ method: string; amount: number }>
  ): void {
    const quantity = Number(item?.qty || 0);
    const title = String(item?.title ?? "");
    const reference = String(item?.reference ?? "");
    let grossTotal = toCents(item?.amounts?.gross_total);
    let netTotal = toCents(item?.amounts?.net_total);
    const taxRate = Number(item?.tax?.rate || 0);

    if (item.discounts?.amount) {
      const grossDiscountAmount = toCents(item.discounts.amount);
      grossTotal -= grossDiscountAmount;
      netTotal = grossTotal / (1 + taxRate / 100);
    } else if (
      item.discounts?.calculated_percentage &&
      // caso especial: ignora este item porque o desconto foi aplicado no total do documento, não só no brigadeiro.
      item.id !== 275976345
    ) {
      const grossDiscountAmount =
        grossTotal * (item.discounts.calculated_percentage / 100);
      grossTotal -= grossDiscountAmount;
      netTotal = grossTotal / (1 + taxRate / 100);
    }

    const channel = detectChannel(doc);
    this.maybePushUnknownItem(
      doc,
      item,
      channel,
      title,
      reference,
      quantity,
      grossTotal
    );
    this.accumulateChannelTotals(channel, grossTotal, netTotal, quantity);
      this.state.totals.units_count += quantity;
      this.state.totals.items_count += 1;

    const category = detectCategoryFromMapOrTitle(item);
    this.accumulateCategoryTotals(
      channel,
      category,
      grossTotal,
      netTotal,
      quantity
    );
    this.accumulatePaymentMethodsByChannelAndCategory(
      channel,
      category,
      paymentMethods,
      grossTotal
    );

    const productAgg = this.getOrCreateProductAgg(
      reference,
      title,
      category,
      taxRate
    );
    this.updateProductAgg(
      doc,
      productAgg,
      channel,
      category,
      paymentMethods,
      grossTotal,
      netTotal,
      quantity
    );
  }

  private maybePushUnknownItem(
    doc: VendusDetailedDocument,
    item: VendusDetailedDocument["items"][number],
    channel: Channel,
    title: string,
    reference: string,
    quantity: number,
    grossTotal: number
  ): void {
    if (channel !== "unknown") return;
    this.state.unknownItems.push({
      doc_id: doc.id,
      doc_number: String(doc?.number ?? ""),
      title,
      reference,
      qty: quantity,
      gross_unit: String(item?.amounts?.gross_unit ?? ""),
      gross_total: grossTotal,
    });
  }

  private accumulateChannelTotals(
    channel: Channel,
    grossTotal: number,
    netTotal: number,
    quantity: number
  ): void {
    const slot = this.state.byChannel[channel];
    slot.totals.gross += grossTotal;
    slot.totals.net += netTotal;
    slot.totals.tax_amount += grossTotal - netTotal;
    slot.totals.units_count += quantity;
    slot.totals.items_count += 1;
  }

  private accumulateCategoryTotals(
    channel: Channel,
    category: Category,
    grossTotal: number,
    netTotal: number,
    quantity: number
  ): void {
    addToTotals(
      this.state.byChannel[channel].byCategory[category].totals,
      grossTotal,
      netTotal,
      quantity
    );
  }

  private addToPaymentMap(
    map: Map<string, number>,
    method: string,
    amount: number
  ): void {
    map.set(method, (map.get(method) ?? 0) + amount);
  }

  private accumulatePaymentMethodsByChannelAndCategory(
    channel: Channel,
    category: Category,
    paymentMethods: Array<{ method: string; amount: number }>,
    grossTotal: number
  ): void {
    if (paymentMethods.length !== 1) return;
    const pm = paymentMethods[0];
    const method = pm?.method ?? "";
    this.addToPaymentMap(
      this.state.byChannel[channel].paymentMethodsMap,
      method,
      grossTotal
    );
    this.addToPaymentMap(
      this.state.byChannel[channel].byCategory[category].paymentMethodsMap,
      method,
      grossTotal
    );
    this.addToPaymentMap(
      this.state.byCategoryOverallPaymentMaps.get(category)!,
      method,
      grossTotal
    );
  }

  private getOrCreateProductAgg(
    reference: string,
    title: string,
    category: Category,
    taxRate: number
  ) {
    const key = reference || title;
    let p = this.state.productsMap.get(key);
    if (p) return p;
    p = createProductAgg(reference || key, title, category, taxRate);
    this.state.productsMap.set(key, p);
    return p;
  }

  private addPaymentMethodAmount(
    entries: PaymentMethodEntry[],
    method: string,
    amount: number
  ): void {
    const e = entries.find((x) => x.method === method);
    if (e) e.amount += amount;
    else entries.push({ method, amount });
  }

  private updateProductAgg(
    doc: VendusDetailedDocument,
    p: ReturnType<typeof createProductAgg>,
    channel: Channel,
    category: Category,
    paymentMethods: Array<{ method: string; amount: number }>,
    grossTotal: number,
    netTotal: number,
    quantity: number
  ): void {
    if (paymentMethods.length === 1) {
      this.addPaymentMethodAmount(
        p.payment_methods,
        paymentMethods[0]?.method ?? "",
        grossTotal
      );
    }
    p.qty += quantity;
    p.amounts.gross_total += grossTotal;
    p.amounts.net_total += netTotal;
    p.amounts.tax_total += grossTotal - netTotal;
    p.channels[channel].qty += quantity;
    p.channels[channel].gross_total += grossTotal;
    p.channels[channel].net_total += netTotal;

    const list = this.state.byChannel[channel].byCategory[category].products;
    if (!list.some((x) => x.reference === p.reference)) list.push(p);

    p.amounts.avg_gross_unit =
      p.qty > 0 ? fromCents(p.amounts.gross_total) / p.qty : 0;
    p.amounts.avg_net_unit =
      p.qty > 0 ? fromCents(p.amounts.net_total) / p.qty : 0;
  }

  private buildResponse(): MonthlySummaryResponse {
    const params: BuildResponseParams = {
      since: this.params.since,
      until: this.params.until,
      type: this.params.type,
      fsDocuments: this.fsDocuments,
      detailedDocsCount: this.detailedDocs.length,
      documentsCount: this.documentsFetchedCount,
      pagesFetched: this.pagesFetched,
      startedAt: this.startedAt,
      unknownItemsCount: this.state.unknownItems.length,
      unknownItemsSample: this.state.unknownItems,
    };
    return buildMonthlySummaryResponse(this.state, params);
  }
}

export async function buildMonthlySummary(
  params: MonthlySummaryParams
): Promise<MonthlySummaryResponse> {
  const builder = new MonthlySummaryBuilder(params);
  return builder.build();
}
