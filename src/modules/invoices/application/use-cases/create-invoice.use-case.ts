import { Invoice } from "../../domain/entities/invoice.js";
import { InvoiceLine } from "../../domain/entities/invoice-line.js";
import type {
  CreateInvoicePort,
  CreateInvoiceCommand,
  InvoiceDTO,
} from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";
import type { PayableEntryWritePort } from "../../domain/ports/out/payable-entry-write.port.js";
import { toInvoiceDTO } from "./shared.js";
import { DuplicateInvoiceError } from "../../domain/errors.js";

export class CreateInvoiceUseCase implements CreateInvoicePort {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly lineRepo: InvoiceLineRepositoryPort,
    private readonly payableWrite: PayableEntryWritePort,
  ) {}

  async execute(command: CreateInvoiceCommand): Promise<InvoiceDTO> {
    const invoiceProps: Parameters<typeof Invoice.create>[0] = {
      supplierName: command.supplierName,
      invoiceNumber: command.invoiceNumber,
      invoiceDate: new Date(command.invoiceDate),
      dueDate: command.dueDate ? new Date(command.dueDate) : null,
      subtotalWithoutVat: command.subtotalWithoutVat,
      totalVat: command.totalVat,
      totalWithVat: command.totalWithVat,
    };
    if (command.supplierId !== undefined) invoiceProps.supplierId = command.supplierId;
    if (command.notes !== undefined) invoiceProps.notes = command.notes;
    if (command.attachmentUrl !== undefined) invoiceProps.attachmentUrl = command.attachmentUrl;
    if (command.costCenterGroupId !== undefined) invoiceProps.costCenterGroupId = command.costCenterGroupId;
    if (command.costCenterCategoryId !== undefined) invoiceProps.costCenterCategoryId = command.costCenterCategoryId;
    if (command.financialType !== undefined) invoiceProps.financialType = command.financialType;
    if (command.isDirectDebit !== undefined) invoiceProps.isDirectDebit = command.isDirectDebit;
    if (command.directDebitDate !== undefined) invoiceProps.directDebitDate = command.directDebitDate ? new Date(command.directDebitDate) : null;
    const invoice = Invoice.create(invoiceProps);

    // Duplicate check — only when supplier is known
    if (invoice.supplierId) {
      const existing = await this.invoiceRepo.findDuplicate(command.organizationId, invoice.invoiceNumber, invoice.supplierId);
      if (existing) throw new DuplicateInvoiceError(invoice.invoiceNumber, invoice.supplierName);
    }

    const lines = (command.lines ?? []).map((lc) => {
      const lineProps: Parameters<typeof InvoiceLine.create>[0] = {
        invoiceId: invoice.id,
        description: lc.description,
        quantity: lc.quantity,
        unitCostWithoutVat: lc.unitCostWithoutVat,
        vatRate: lc.vatRate,
        vatAmount: lc.vatAmount,
        totalWithVat: lc.totalWithVat,
      };
      if (lc.type !== undefined) lineProps.type = lc.type;
      if (lc.costCenterCategoryId !== undefined) lineProps.costCenterCategoryId = lc.costCenterCategoryId;
      if (lc.stockItemId !== undefined) lineProps.stockItemId = lc.stockItemId;
      if (lc.unit !== undefined) lineProps.unit = lc.unit;
      if (lc.locationId !== undefined) lineProps.locationId = lc.locationId;
      return InvoiceLine.create(lineProps);
    });

    await this.invoiceRepo.save(command.organizationId, invoice);
    if (lines.length > 0) {
      await this.lineRepo.saveAll(command.organizationId, lines);
    }

    // Auto-criar conta a pagar quando a fatura tem data de vencimento
    if (invoice.dueDate) {
      await this.payableWrite.createForInvoice(command.organizationId, {
        invoiceId: invoice.id,
        supplierId: invoice.supplierId,
        supplierName: invoice.supplierName,
        invoiceNumber: invoice.invoiceNumber,
        dueDate: invoice.dueDate,
        amount: invoice.totalWithVat,
      });
    }

    return toInvoiceDTO(invoice, lines);
  }
}
