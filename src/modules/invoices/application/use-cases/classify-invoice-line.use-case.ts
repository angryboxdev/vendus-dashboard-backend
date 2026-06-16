import type {
  ClassifyInvoiceLinePort,
  ClassifyInvoiceLineCommand,
  InvoiceLineDTO,
} from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";
import type { ClassificationRuleRepositoryPort } from "../../domain/ports/out/classification-rule-repository.port.js";
import { ClassificationRule } from "../../domain/entities/classification-rule.js";
import { InvoiceNotFoundError, InvoiceLineNotFoundError } from "../../domain/errors.js";
import { toInvoiceLineDTO } from "./shared.js";

export class ClassifyInvoiceLineUseCase implements ClassifyInvoiceLinePort {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly lineRepo: InvoiceLineRepositoryPort,
    private readonly ruleRepo: ClassificationRuleRepositoryPort,
  ) {}

  async execute(command: ClassifyInvoiceLineCommand): Promise<InvoiceLineDTO> {
    const invoice = await this.invoiceRepo.findById(command.invoiceId);
    if (!invoice) throw new InvoiceNotFoundError(command.invoiceId);

    const lines = await this.lineRepo.findByInvoiceId(command.invoiceId);
    const line = lines.find((l) => l.id === command.lineId);
    if (!line) throw new InvoiceLineNotFoundError(command.lineId);

    const classified = line.classify(command.classify);
    await this.lineRepo.updateLine(classified);

    if (command.saveAsRule && invoice.supplierId) {
      const existing = await this.ruleRepo.findBySupplierId(invoice.supplierId);
      if (existing) {
        const updated = existing.update({
          defaultCostCenterId: command.classify.costCenterId ?? existing.defaultCostCenterId,
          defaultLineType: command.classify.type ?? existing.defaultLineType,
          defaultCategory: command.classify.category ?? existing.defaultCategory,
          confidenceBoost: Math.min(existing.confidenceBoost + 10, 100),
        });
        await this.ruleRepo.update(updated);
      } else {
        const ruleProps: Parameters<typeof ClassificationRule.create>[0] = {
          supplierId: invoice.supplierId,
          confidenceBoost: 10,
        };
        if (command.classify.costCenterId !== undefined) ruleProps.defaultCostCenterId = command.classify.costCenterId;
        if (command.classify.type !== undefined) ruleProps.defaultLineType = command.classify.type;
        if (command.classify.category !== undefined) ruleProps.defaultCategory = command.classify.category;
        const rule = ClassificationRule.create(ruleProps);
        await this.ruleRepo.save(rule);
      }
    }

    return toInvoiceLineDTO(classified);
  }
}
