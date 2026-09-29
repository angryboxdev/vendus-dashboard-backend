import type { ListInvoicesPort } from "../../../invoices/domain/ports/in/invoice.ports.js";
import type { ListCostCenterCategoriesPort } from "../../../financial-base/domain/ports/in/cost-center-category.ports.js";
import { AccountingDocumentNotFoundError, PossibleDuplicateDocumentError } from "../../domain/errors.js";
import type { AccountingDocumentRepositoryPort } from "../../domain/ports/out/accounting-document-repository.port.js";
import type { AccountingDocumentAttachmentRepositoryPort } from "../../domain/ports/out/accounting-document-attachment-repository.port.js";
import type { AccountingAuditLogPort } from "../../domain/ports/out/accounting-audit-log.port.js";
import type {
  UpdateAccountingDocumentCommand,
  UpdateAccountingDocumentPort,
  AccountingDocumentDTO,
} from "../../domain/ports/in/accounting-document.ports.js";
import { resolveDeductibility, toAccountingDocumentDTO } from "./shared.js";

export class UpdateAccountingDocumentUseCase implements UpdateAccountingDocumentPort {
  constructor(
    private readonly repository: AccountingDocumentRepositoryPort,
    private readonly attachmentRepository: AccountingDocumentAttachmentRepositoryPort,
    private readonly listCostCenterCategories: ListCostCenterCategoriesPort,
    private readonly listInvoices: ListInvoicesPort,
    private readonly auditLog: AccountingAuditLogPort,
  ) {}

  async execute(command: UpdateAccountingDocumentCommand): Promise<AccountingDocumentDTO> {
    const existing = await this.repository.findById(command.organizationId, command.id);
    if (!existing) throw new AccountingDocumentNotFoundError(command.id);
    const before = existing.toProps();

    if (!command.confirmDuplicate) {
      const nif = command.data.nif !== undefined ? command.data.nif : before.nif;
      const documentNumber = command.data.documentNumber !== undefined ? command.data.documentNumber : before.documentNumber;
      const issueDate = command.data.issueDate ?? before.issueDate;
      const totalWithVat = command.data.totalWithVat ?? before.totalWithVat;

      const duplicateDocument = await this.repository.findPossibleDuplicate(
        command.organizationId,
        { nif, documentNumber, issueDate, totalWithVat },
        command.id,
      );
      if (duplicateDocument) {
        const d = duplicateDocument.toProps();
        throw new PossibleDuplicateDocumentError({
          source: "accounting_document",
          id: d.id,
          label: `${d.entityName} — ${d.documentNumber ?? "s/nº"} (${d.issueDate})`,
        });
      }

      if (documentNumber) {
        const invoices = await this.listInvoices.execute(command.organizationId, { search: documentNumber });
        const candidate = invoices.find(
          (inv) => inv.invoiceNumber === documentNumber && inv.totalWithVat === totalWithVat && inv.invoiceDate === issueDate,
        );
        if (candidate) {
          throw new PossibleDuplicateDocumentError({
            source: "invoice",
            id: candidate.id,
            label: `${candidate.supplierName} — ${candidate.invoiceNumber} (${candidate.invoiceDate})`,
          });
        }
      }
    }

    const categories = await this.listCostCenterCategories.execute({ organizationId: command.organizationId });
    const vatAmount = command.data.vatAmount ?? before.vatAmount;
    const costCenterCategoryId =
      command.data.costCenterCategoryId !== undefined ? command.data.costCenterCategoryId : before.costCenterCategoryId;
    const deductiblePercentage =
      command.data.deductiblePercentage !== undefined ? command.data.deductiblePercentage : before.deductiblePercentage;
    const { vatDeductibleAmount, vatNonDeductibleAmount } = resolveDeductibility(
      vatAmount,
      deductiblePercentage,
      costCenterCategoryId,
      categories,
    );

    const updated = existing.update({ ...command.data, vatDeductibleAmount, vatNonDeductibleAmount }, command.actor);
    await this.repository.save(command.organizationId, updated);
    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "accounting_document",
      entityId: updated.id,
      action: "update",
      before,
      after: updated.toProps(),
    });

    const attachments = await this.attachmentRepository.listByDocument(command.organizationId, updated.id);
    return toAccountingDocumentDTO(updated, attachments);
  }
}
