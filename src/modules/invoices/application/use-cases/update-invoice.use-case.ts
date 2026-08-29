import type {
  UpdateInvoicePort,
  UpdateInvoiceCommand,
  InvoiceDTO,
} from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";
import type { PayableEntryWritePort } from "../../domain/ports/out/payable-entry-write.port.js";
import type { InvoiceReconciliationCleanupPort } from "../../domain/ports/out/invoice-reconciliation-cleanup.port.js";
import { InvoiceNotFoundError, DuplicateInvoiceError } from "../../domain/errors.js";
import type { UpdateInvoiceData } from "../../domain/entities/invoice.js";
import { toInvoiceDTO } from "./shared.js";

export class UpdateInvoiceUseCase implements UpdateInvoicePort {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly lineRepo: InvoiceLineRepositoryPort,
    private readonly payableWrite: PayableEntryWritePort,
    private readonly reconciliationCleanup: InvoiceReconciliationCleanupPort,
  ) {}

  async execute(command: UpdateInvoiceCommand): Promise<InvoiceDTO> {
    const existing = await this.invoiceRepo.findById(command.organizationId, command.id);
    if (!existing) throw new InvoiceNotFoundError(command.id);

    // Validar duplicado se o número da fatura for alterado
    if (command.invoiceNumber !== undefined && command.invoiceNumber !== existing.invoiceNumber) {
      const nif = existing.supplierNifSnapshot;
      if (nif) {
        const dup = await this.invoiceRepo.findDuplicateByNif(command.organizationId, command.invoiceNumber, nif, command.id);
        if (dup) throw new DuplicateInvoiceError(command.invoiceNumber, existing.supplierName);
      } else if (existing.supplierId) {
        const dup = await this.invoiceRepo.findDuplicate(command.organizationId, command.invoiceNumber, existing.supplierId, command.id);
        if (dup) throw new DuplicateInvoiceError(command.invoiceNumber, existing.supplierName);
      }
    }

    const data: UpdateInvoiceData = {};
    if (command.supplierId !== undefined) data.supplierId = command.supplierId;
    if (command.supplierName !== undefined) data.supplierName = command.supplierName;
    if (command.supplierNifSnapshot !== undefined) data.supplierNifSnapshot = command.supplierNifSnapshot;
    if (command.invoiceNumber !== undefined) data.invoiceNumber = command.invoiceNumber;
    if (command.invoiceDate !== undefined) data.invoiceDate = new Date(command.invoiceDate);
    if (command.dueDate !== undefined) data.dueDate = command.dueDate ? new Date(command.dueDate) : null;
    if (command.isDirectDebit !== undefined) data.isDirectDebit = command.isDirectDebit;
    if (command.directDebitDate !== undefined) data.directDebitDate = command.directDebitDate ? new Date(command.directDebitDate) : null;
    if (command.subtotalWithoutVat !== undefined) data.subtotalWithoutVat = command.subtotalWithoutVat;
    if (command.totalVat !== undefined) data.totalVat = command.totalVat;
    if (command.totalWithVat !== undefined) data.totalWithVat = command.totalWithVat;
    if (command.notes !== undefined) data.notes = command.notes;
    if (command.attachmentUrl !== undefined) data.attachmentUrl = command.attachmentUrl;
    if (command.costCenterGroupId !== undefined) data.costCenterGroupId = command.costCenterGroupId;
    if (command.costCenterCategoryId !== undefined) data.costCenterCategoryId = command.costCenterCategoryId;
    if (command.financialType !== undefined) data.financialType = command.financialType;
    if (command.affectsDre !== undefined) data.affectsDre = command.affectsDre;
    if (command.affectsCashflow !== undefined) data.affectsCashflow = command.affectsCashflow;
    if (command.affectsProfitability !== undefined) data.affectsProfitability = command.affectsProfitability;
    if (command.currency !== undefined) data.currency = command.currency;

    const updated = existing.update(data);
    await this.invoiceRepo.update(command.organizationId, updated);

    // Propagar costCenterCategoryId às linhas sempre que o campo for explicitamente enviado
    if (command.costCenterCategoryId !== undefined) {
      await this.lineRepo.updateCostCenterCategoryForInvoice(command.organizationId, updated.id, updated.costCenterCategoryId);
    }

    // Propagar novo número às tabelas denormalizadas (payable_entries e bank_movement_entity_links)
    if (command.invoiceNumber !== undefined && command.invoiceNumber !== existing.invoiceNumber) {
      await this.payableWrite.renumberByInvoiceId(command.organizationId, updated.id, updated.invoiceNumber);
      await this.reconciliationCleanup.renumberLinksForInvoice(
        command.organizationId,
        updated.id,
        `${updated.supplierName} — ${updated.invoiceNumber}`,
      );
    }

    return toInvoiceDTO(updated);
  }
}
