import type {
  Category,
  Channel,
  MonthlySummaryResponse,
  VendusDetailedDocument,
  VendusDocument,
  VendusSelfConsumptionSummary,
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
import { fetchSelfConsumptionSummarySafe } from "./selfconsumptionService.js";
import { loadProductCatalog } from "../infra/vendusProductsCatalog.js";

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
  /** Filtra GET /selfconsumption/ por loja (opcional). */
  vendus_selfconsumption_store_id?: number;
};

export class MonthlySummaryBuilder {
  private readonly params: MonthlySummaryParams;
  private readonly state: MonthlySummaryState;
  private fsDocuments: VendusDocument[] = [];
  private detailedDocs: VendusDetailedDocument[] = [];
  private documentsFetchedCount = 0;
  private pagesFetched = 0;
  private vendusSelfConsumption: VendusSelfConsumptionSummary | undefined;
  private readonly startedAt: number;

  constructor(params: MonthlySummaryParams) {
    this.params = params;
    this.state = createMonthlySummaryState();
    this.startedAt = Date.now();
  }

  async build(): Promise<MonthlySummaryResponse> {
    await loadProductCatalog();
    await this.fetchAndFilterDocuments();
    this.vendusSelfConsumption = await fetchSelfConsumptionSummarySafe({
      date_start: this.params.since,
      date_end: this.params.until,
      ...(this.params.vendus_selfconsumption_store_id != null
        ? { store_id: this.params.vendus_selfconsumption_store_id }
        : {}),
    });
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
        .filter((d) => d.type === "FS" || d.type === "FT")
        .map((d) => d.number)
    );

    this.fsDocuments = documents
      .filter((d) => d.type === "FS" || d.type === "FT")
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

    const items = Array.isArray(doc?.items) ? doc.items : [];
    for (const item of items) {
      if (isFreeItem(doc, item)) continue;
      this.processItem(doc, item);
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

  private processItem(
    doc: VendusDetailedDocument,
    item: VendusDetailedDocument["items"][number]
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
    this.maybePushUnknownItem(doc, item, channel, title, reference, quantity, grossTotal);
    this.accumulateChannelTotals(channel, grossTotal, netTotal, quantity);
    this.state.totals.units_count += quantity;
    this.state.totals.items_count += 1;

    const category = detectCategoryFromMapOrTitle(item);
    this.accumulateCategoryTotals(channel, category, grossTotal, netTotal, quantity);

    const productAgg = this.getOrCreateProductAgg(reference, title, category, taxRate);
    this.updateProductAgg(productAgg, channel, grossTotal, netTotal, quantity);
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

  private updateProductAgg(
    p: ReturnType<typeof createProductAgg>,
    channel: Channel,
    grossTotal: number,
    netTotal: number,
    quantity: number
  ): void {
    p.qty += quantity;
    p.amounts.gross_total += grossTotal;
    p.amounts.net_total += netTotal;
    p.amounts.tax_total += grossTotal - netTotal;
    p.channels[channel].qty += quantity;
    p.channels[channel].gross_total += grossTotal;
    p.channels[channel].net_total += netTotal;

    const list = this.state.byChannel[channel].byCategory[p.category].products;
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
      ...(this.vendusSelfConsumption !== undefined
        ? { vendusSelfConsumption: this.vendusSelfConsumption }
        : {}),
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
