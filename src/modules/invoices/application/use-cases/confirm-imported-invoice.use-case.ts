import { InvoiceLine } from "../../domain/entities/invoice-line.js";
import type {
  ConfirmImportedInvoicePort,
  ConfirmImportedInvoiceCommand,
  InvoiceDTO,
} from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";
import type { PayableEntryWritePort } from "../../domain/ports/out/payable-entry-write.port.js";
import type { SupplierCreatePort } from "../../domain/ports/out/supplier-create.port.js";
import type { SupplierHintPort } from "../../domain/ports/out/supplier-hint.port.js";
import { normalizeSupplierName } from "../../domain/utils/supplier-name.js";
import { InvoiceNotFoundError, DuplicateInvoiceError } from "../../domain/errors.js";
import { toInvoiceDTO } from "./shared.js";

export class ConfirmImportedInvoiceUseCase implements ConfirmImportedInvoicePort {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly lineRepo: InvoiceLineRepositoryPort,
    private readonly payableWrite: PayableEntryWritePort,
    private readonly supplierCreate: SupplierCreatePort,
    private readonly supplierHint: SupplierHintPort,
  ) {}

  async execute(command: ConfirmImportedInvoiceCommand): Promise<InvoiceDTO> {
    const existing = await this.invoiceRepo.findById(command.organizationId, command.id);
    if (!existing) throw new InvoiceNotFoundError(command.id);

    if (existing.status !== "draft_ai" && existing.status !== "pending_review") {
      throw new Error(
        `Cannot confirm invoice with status "${existing.status}". Expected draft_ai or pending_review.`,
      );
    }

    // Criar fornecedor novo se solicitado (tem precedência sobre supplierId)
    let resolvedSupplierId = command.supplierId;
    let resolvedSupplierName = command.supplierName;
    if (command.newSupplier) {
      const created = await this.supplierCreate.create(command.organizationId, command.newSupplier);
      resolvedSupplierId = created.id;
      resolvedSupplierName = resolvedSupplierName ?? created.name;
    }

    // Apply user corrections and transition to pending
    const confirmData: Parameters<typeof existing.confirmImport>[0] = {};
    if (resolvedSupplierId !== undefined) confirmData.supplierId = resolvedSupplierId;
    if (resolvedSupplierName !== undefined) confirmData.supplierName = resolvedSupplierName;
    if (command.supplierNifSnapshot !== undefined) confirmData.supplierNifSnapshot = command.supplierNifSnapshot;
    if (command.invoiceNumber !== undefined) confirmData.invoiceNumber = command.invoiceNumber;
    if (command.invoiceDate !== undefined) confirmData.invoiceDate = new Date(command.invoiceDate);
    if (command.dueDate !== undefined) confirmData.dueDate = command.dueDate ? new Date(command.dueDate) : null;
    if (command.isDirectDebit !== undefined) confirmData.isDirectDebit = command.isDirectDebit;
    if (command.directDebitDate !== undefined) confirmData.directDebitDate = command.directDebitDate ? new Date(command.directDebitDate) : null;
    if (command.subtotalWithoutVat !== undefined) confirmData.subtotalWithoutVat = command.subtotalWithoutVat;
    if (command.totalVat !== undefined) confirmData.totalVat = command.totalVat;
    if (command.totalWithVat !== undefined) confirmData.totalWithVat = command.totalWithVat;
    if (command.notes !== undefined) confirmData.notes = command.notes;
    if (command.costCenterGroupId !== undefined) confirmData.costCenterGroupId = command.costCenterGroupId;
    if (command.costCenterCategoryId !== undefined) confirmData.costCenterCategoryId = command.costCenterCategoryId;
    if (command.financialType !== undefined) confirmData.financialType = command.financialType;
    if (command.affectsDre !== undefined) confirmData.affectsDre = command.affectsDre;
    if (command.affectsCashflow !== undefined) confirmData.affectsCashflow = command.affectsCashflow;
    if (command.affectsProfitability !== undefined) confirmData.affectsProfitability = command.affectsProfitability;
    if (command.currency !== undefined) confirmData.currency = command.currency;

    let confirmed = existing.confirmImport(confirmData);
    if (command.markAsPaid) {
      const paidAt = command.paidAt ? new Date(command.paidAt) : (confirmed.invoiceDate ?? new Date());
      confirmed = confirmed.markPaid(paidAt);
    }

    // Duplicate check by NIF + invoice number — hard block, exclude this invoice itself
    if (confirmed.supplierNifSnapshot && confirmed.invoiceNumber) {
      const duplicate = await this.invoiceRepo.findDuplicateByNif(
        command.organizationId,
        confirmed.invoiceNumber,
        confirmed.supplierNifSnapshot,
        confirmed.id,
      );
      if (duplicate) throw new DuplicateInvoiceError(confirmed.invoiceNumber, confirmed.supplierName);
    }

    await this.invoiceRepo.update(command.organizationId, confirmed);

    // Guardar hint nome→fornecedor para importações futuras.
    // Usa o nome extraído pela IA (pre-confirm) para que nomes ligeiramente
    // diferentes do mesmo fornecedor sejam reconhecidos automaticamente.
    if (resolvedSupplierId && existing.supplierName) {
      const normalizedName = normalizeSupplierName(existing.supplierName);
      if (normalizedName.length > 0) {
        await this.supplierHint.save(command.organizationId, normalizedName, resolvedSupplierId);
      }
    }

    // Save optional lines
    const lines: InvoiceLine[] = (command.lines ?? []).map((lc) => {
      const lineProps: Parameters<typeof InvoiceLine.create>[0] = {
        invoiceId: confirmed.id,
        description: lc.description,
        quantity: lc.quantity,
        unitCostWithoutVat: lc.unitCostWithoutVat,
        vatRate: lc.vatRate,
        vatAmount: lc.vatAmount,
        totalWithVat: lc.totalWithVat,
      };
      if (lc.type !== undefined) lineProps.type = lc.type;
      if (lc.costCenterCategoryId !== undefined) lineProps.costCenterCategoryId = lc.costCenterCategoryId;
      if (lc.unit !== undefined) lineProps.unit = lc.unit;
      if (lc.affectsDre !== undefined) lineProps.affectsDre = lc.affectsDre;
      if (lc.affectsCashflow !== undefined) lineProps.affectsCashflow = lc.affectsCashflow;
      if (lc.affectsProfitability !== undefined) lineProps.affectsProfitability = lc.affectsProfitability;
      if (lc.locationId !== undefined) lineProps.locationId = lc.locationId;
      return InvoiceLine.create(lineProps);
    });

    if (lines.length > 0) {
      await this.lineRepo.saveAll(command.organizationId, lines);
    }

    // Derivar lineDetailMode automaticamente: se há linhas confirmadas → detailed, caso contrário manter simple
    let finalInvoice = confirmed;
    if (lines.length > 0) {
      finalInvoice = confirmed.setLineDetailMode("detailed");
      await this.invoiceRepo.update(command.organizationId, finalInvoice);
    }

    // Propagar costCenterCategoryId da fatura para todas as linhas existentes
    if (finalInvoice.costCenterCategoryId !== null) {
      await this.lineRepo.updateCostCenterCategoryForInvoice(
        command.organizationId,
        finalInvoice.id,
        finalInvoice.costCenterCategoryId,
      );
    }

    // Create payable entry if explicitly requested and due date is set
    if (command.saveAsPayable && finalInvoice.dueDate) {
      await this.payableWrite.createForInvoice(command.organizationId, {
        invoiceId: finalInvoice.id,
        supplierId: finalInvoice.supplierId,
        supplierName: finalInvoice.supplierName,
        invoiceNumber: finalInvoice.invoiceNumber,
        dueDate: finalInvoice.dueDate,
        amount: finalInvoice.totalWithVat,
      });
    }

    return toInvoiceDTO(finalInvoice, lines);
  }
}
