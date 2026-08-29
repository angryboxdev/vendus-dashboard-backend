import type {
  ClassifyInvoiceLinePort,
  ClassifyInvoiceLineCommand,
  InvoiceLineDTO,
} from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";
import type { ClassificationRuleRepositoryPort } from "../../domain/ports/out/classification-rule-repository.port.js";
import type { CostCenterCategoryReaderPort } from "../../domain/ports/out/cost-center-category-reader.port.js";
import type { InvoiceLine } from "../../domain/entities/invoice-line.js";
import { ClassificationRule } from "../../domain/entities/classification-rule.js";
import { InvoiceNotFoundError, InvoiceLineNotFoundError } from "../../domain/errors.js";
import { toInvoiceLineDTO } from "./shared.js";

export class ClassifyInvoiceLineUseCase implements ClassifyInvoiceLinePort {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly lineRepo: InvoiceLineRepositoryPort,
    private readonly ruleRepo: ClassificationRuleRepositoryPort,
    private readonly categoryReader: CostCenterCategoryReaderPort,
  ) {}

  async execute(command: ClassifyInvoiceLineCommand): Promise<InvoiceLineDTO> {
    const invoice = await this.invoiceRepo.findById(command.organizationId, command.invoiceId);
    if (!invoice) throw new InvoiceNotFoundError(command.invoiceId);

    const lines = await this.lineRepo.findByInvoiceId(command.organizationId, command.invoiceId);
    const line = lines.find((l) => l.id === command.lineId);
    if (!line) throw new InvoiceLineNotFoundError(command.lineId);

    const { costCenterCategoryId, channelId, stockItemId, type } = command.classify;

    let classified: InvoiceLine;
    if (costCenterCategoryId !== undefined && costCenterCategoryId !== null) {
      const category = await this.categoryReader.findById(command.organizationId, costCenterCategoryId);
      if (!category) throw new Error(`Subcategoria não encontrada: ${costCenterCategoryId}`);
      classified = line.classifyFromCategory(category, channelId);
      if (type !== undefined || stockItemId !== undefined) {
        const extra: Parameters<InvoiceLine["classify"]>[0] = {};
        if (type !== undefined) extra.type = type;
        if (stockItemId !== undefined) extra.stockItemId = stockItemId;
        classified = classified.classify(extra);
      }
    } else {
      const data: Parameters<InvoiceLine["classify"]>[0] = {};
      if (type !== undefined) data.type = type;
      if (costCenterCategoryId !== undefined) data.costCenterCategoryId = costCenterCategoryId;
      if (stockItemId !== undefined) data.stockItemId = stockItemId;
      classified = line.classify(data);
    }

    await this.lineRepo.updateLine(command.organizationId, classified);

    if (command.saveAsRule && invoice.supplierId) {
      const existing = await this.ruleRepo.findBySupplierIdAndDescription(
        command.organizationId,
        invoice.supplierId,
        classified.description,
      );
      if (existing) {
        const updated = existing.update({
          defaultCostCenterCategoryId: classified.costCenterCategoryId ?? existing.defaultCostCenterCategoryId,
          defaultLineType: classified.type !== "other" ? classified.type : (existing.defaultLineType ?? null),
          channelId: classified.channelId ?? existing.channelId,
          confidenceBoost: Math.min(existing.confidenceBoost + 10, 100),
        });
        await this.ruleRepo.update(command.organizationId, updated);
      } else {
        const rule = ClassificationRule.create({
          supplierId: invoice.supplierId,
          descriptionPattern: classified.description,
          defaultCostCenterCategoryId: classified.costCenterCategoryId,
          defaultLineType: classified.type !== "other" ? classified.type : null,
          channelId: classified.channelId,
          confidenceBoost: 10,
        });
        await this.ruleRepo.save(command.organizationId, rule);
      }
    }

    return toInvoiceLineDTO(classified);
  }
}
