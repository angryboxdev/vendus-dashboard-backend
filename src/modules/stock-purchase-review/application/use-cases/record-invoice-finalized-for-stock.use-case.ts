import type {
  RecordInvoiceFinalizedForStockCommand,
  RecordInvoiceFinalizedForStockPort,
} from "../../domain/ports/in/stock-purchase-review.ports.js";
import type { StockMovementWritePort } from "../../domain/ports/out/stock-movement-write.port.js";
import type { CostCenterCategoryReadPort } from "../../domain/ports/out/cost-center-category-read.port.js";
import type { StockReviewPolicy } from "../../../financial-base/domain/entities/cost-center-category.js";
import type { SupplierReadPort } from "../../domain/ports/out/supplier-read.port.js";
import { decideStockReview } from "../../domain/services/stock-review-decision.service.js";
import { computeInvoiceSourceHash } from "./shared.js";

/**
 * O gancho chamado (fire-and-forget) por `invoices` quando uma fatura é
 * finalizada/lançada. Nunca decide pelo Centro de Custo — só pela
 * categoria/subcategoria de cada linha e pela preferência do fornecedor.
 * Idempotente por construção: `createReviewFromInvoice` usa
 * `ON CONFLICT (invoice_id) DO NOTHING` — chamar duas vezes para a mesma
 * fatura nunca cria uma segunda revisão.
 */
export class RecordInvoiceFinalizedForStockUseCase implements RecordInvoiceFinalizedForStockPort {
  constructor(
    private readonly stockMovementWrite: StockMovementWritePort,
    private readonly categoryRead: CostCenterCategoryReadPort,
    private readonly supplierRead: SupplierReadPort,
  ) {}

  async execute(command: RecordInvoiceFinalizedForStockCommand): Promise<void> {
    // Sem linhas (fatura em `lineDetailMode=simple`, sem `invoice_lines`
    // persistidas) não há quantidade/item nenhum para converter em stock —
    // uma revisão criada aqui ficaria presa para sempre em `refreshLinesProgress`
    // (nunca há uma linha cuja resolução a leve a "ready"). Nunca criar a
    // revisão neste caso, mesmo com override `force_create` ou política do
    // fornecedor/categoria a indicar "cria revisão" — o utilizador tem de
    // detalhar a fatura por linha primeiro para o Stock ter o que resolver.
    if (command.lines.length === 0) {
      return;
    }

    const categoryIds = [...new Set(command.lines.map((l) => l.costCenterCategoryId).filter((id): id is string => id !== null))];
    const categoryPolicies = await Promise.all(
      categoryIds.map((id) => this.categoryRead.getStockReviewPolicy(command.organizationId, id)),
    );
    const lineCategoryPolicies = categoryPolicies.map((p): StockReviewPolicy => p ?? "UNDEFINED");

    const supplierDefaultPolicy = command.supplierId
      ? (await this.supplierRead.getDefaultStockPolicy(command.organizationId, command.supplierId)) ?? "inherit"
      : "inherit";

    const decision = decideStockReview({
      override: command.override,
      overrideReason: command.overrideReason,
      lineCategoryPolicies,
      supplierDefaultPolicy,
    });

    if (decision.outcome === "skip") {
      return;
    }

    const sourceHash = computeInvoiceSourceHash(
      command.invoiceNumber,
      command.invoiceDate,
      command.lines.map((l) => ({
        id: l.id,
        description: l.description,
        quantity: l.quantity,
        unit: l.unit,
        unitCostWithoutVat: l.unitCostWithoutVat,
        totalWithVat: l.totalWithVat,
        costCenterCategoryId: l.costCenterCategoryId,
        locationId: l.locationId,
      })),
    );

    await this.stockMovementWrite.createReviewFromInvoice(command.organizationId, {
      invoiceId: command.invoiceId,
      sourceInvoiceVersion: 1,
      sourceHash,
      decisionSource: decision.source,
      decisionCategoryId: null,
      decisionSupplierId: command.supplierId,
      decisionPolicyUsed: decision.policyUsed,
      decisionActor: command.actor,
      decisionOverrideReason: command.overrideReason,
      supplierName: command.supplierName,
      invoiceNumber: command.invoiceNumber,
      invoiceDate: command.invoiceDate,
      lines: command.lines.map((l) => ({
        invoiceLineId: l.id,
        description: l.description,
        purchaseQuantity: l.quantity,
        purchaseUnit: l.unit ?? "un",
        unitCostWithoutVat: l.unitCostWithoutVat,
        totalWithVat: l.totalWithVat,
      })),
    });
  }
}
