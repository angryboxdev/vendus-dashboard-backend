import type { ListInvoicesPort, ListInvoiceLinesPort } from "../../../invoices/domain/ports/in/invoice.ports.js";
import type { ListCostCenterCategoriesPort } from "../../../financial-base/domain/ports/in/cost-center-category.ports.js";
import type { SalesVatReadPort } from "../../domain/ports/out/sales-vat-read.port.js";
import type { AccountingDocumentRepositoryPort } from "../../domain/ports/out/accounting-document-repository.port.js";
import type { AccountingSettingsRepositoryPort } from "../../domain/ports/out/accounting-settings-repository.port.js";
import { getVatPeriodRange } from "../../domain/services/vat-period.service.js";
import type {
  GetVatOverviewCommand,
  GetVatOverviewPort,
  VatDocumentBreakdownDTO,
  VatOverviewResultDTO,
  VatRateBreakdownDTO,
} from "../../domain/ports/in/vat-overview.ports.js";
import { resolveDeductibility } from "./shared.js";

interface RateBucket {
  salesVat: number;
  purchasesDeductible: number;
  purchasesNonDeductible: number;
}

/**
 * "Apuramento de IVA" — acompanhamento (sem fecho formal, ver README/plano).
 * Nunca recalcula IVA a partir de documentos crus: só agrega o que `vendus`
 * (vendas) e `invoices` (compras) já calculam, cruzando com a dedutibilidade
 * (override por linha/documento, ou sugestão de `vat_deductible` — nunca
 * decidida sozinha pela categoria). Periodicidade (mensal/trimestral) vem da
 * configuração da organização, nunca hardcoded.
 *
 * `AccountingDocument`s (secção 5) entram nos totais gerais e no drill-down
 * por documento, mas NUNCA no breakdown por taxa — não têm uma única taxa de
 * IVA associada de forma fidedigna nesta fase (decisão documentada no
 * README, não uma omissão).
 */
export class GetVatOverviewUseCase implements GetVatOverviewPort {
  constructor(
    private readonly salesVatRead: SalesVatReadPort,
    private readonly listInvoices: ListInvoicesPort,
    private readonly listInvoiceLines: ListInvoiceLinesPort,
    private readonly listCostCenterCategories: ListCostCenterCategoriesPort,
    private readonly documentRepository: AccountingDocumentRepositoryPort,
    private readonly settingsRepository: AccountingSettingsRepositoryPort,
  ) {}

  async execute(command: GetVatOverviewCommand): Promise<VatOverviewResultDTO> {
    const { organizationId, year, period } = command;
    const settings = await this.settingsRepository.get(organizationId);
    const { from, to } = getVatPeriodRange(settings.vatPeriodicity, year, period);

    const [salesByRate, invoicesInRange, allLines, categories, documentsInRange] = await Promise.all([
      this.salesVatRead.getVatByRate(organizationId, from, to),
      this.listInvoices.execute(organizationId, { from, to }),
      this.listInvoiceLines.execute(organizationId),
      this.listCostCenterCategories.execute({ organizationId }),
      this.documentRepository.findAll(organizationId, { from, to }),
    ]);

    const invoiceById = new Map(invoicesInRange.map((inv) => [inv.id, inv]));

    const byRate = new Map<number, RateBucket>();
    function bucketFor(rate: number): RateBucket {
      let bucket = byRate.get(rate);
      if (!bucket) {
        bucket = { salesVat: 0, purchasesDeductible: 0, purchasesNonDeductible: 0 };
        byRate.set(rate, bucket);
      }
      return bucket;
    }

    for (const s of salesByRate) {
      bucketFor(s.rate).salesVat += s.vatAmount;
    }

    let purchasesVatDeductibleTotal = 0;
    let purchasesVatNonDeductibleTotal = 0;

    for (const line of allLines) {
      const invoice = invoiceById.get(line.invoiceId);
      if (!invoice || invoice.status === "cancelled") continue;
      const sign = invoice.documentType === "credit_note" ? -1 : 1;
      const { vatDeductibleAmount, vatNonDeductibleAmount } = resolveDeductibility(
        line.vatAmount,
        line.deductiblePercentage ?? null,
        line.costCenterCategoryId,
        categories,
      );
      const bucket = bucketFor(line.vatRate);
      bucket.purchasesDeductible += sign * vatDeductibleAmount;
      bucket.purchasesNonDeductible += sign * vatNonDeductibleAmount;
      purchasesVatDeductibleTotal += sign * vatDeductibleAmount;
      purchasesVatNonDeductibleTotal += sign * vatNonDeductibleAmount;
    }

    const documents: VatDocumentBreakdownDTO[] = [];
    for (const doc of documentsInRange) {
      const d = doc.toProps();
      if (d.status === "cancelled") continue;
      const sign = d.documentType === "credit_note" ? -1 : 1;
      purchasesVatDeductibleTotal += sign * d.vatDeductibleAmount;
      purchasesVatNonDeductibleTotal += sign * d.vatNonDeductibleAmount;
      documents.push({
        id: d.id,
        source: "accounting_document",
        documentType: d.documentType,
        fundingSource: d.fundingSource,
        entityName: d.entityName,
        date: d.issueDate,
        vatAmount: sign * d.vatAmount,
        vatDeductibleAmount: sign * d.vatDeductibleAmount,
        vatNonDeductibleAmount: sign * d.vatNonDeductibleAmount,
      });
    }

    const salesVatTotal = salesByRate.reduce((sum, s) => sum + s.vatAmount, 0);

    const byRateResult: VatRateBreakdownDTO[] = [...byRate.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([rate, bucket]) => ({
        rate,
        salesVat: bucket.salesVat,
        purchasesVatDeductible: bucket.purchasesDeductible,
        purchasesVatNonDeductible: bucket.purchasesNonDeductible,
        balance: bucket.salesVat - bucket.purchasesDeductible,
      }));

    return {
      period: { periodicity: settings.vatPeriodicity, year, period, from, to },
      salesVatTotal,
      purchasesVatDeductibleTotal,
      purchasesVatNonDeductibleTotal,
      balance: salesVatTotal - purchasesVatDeductibleTotal,
      byRate: byRateResult,
      documents,
    };
  }
}
