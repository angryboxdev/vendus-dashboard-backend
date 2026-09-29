import type { ListInvoicesPort } from "../../../invoices/domain/ports/in/invoice.ports.js";
import type { ListCostCenterCategoriesPort } from "../../../financial-base/domain/ports/in/cost-center-category.ports.js";
import { AccountingDocument } from "../../domain/entities/accounting-document.js";
import { PossibleDuplicateDocumentError } from "../../domain/errors.js";
import type { AccountingDocumentRepositoryPort } from "../../domain/ports/out/accounting-document-repository.port.js";
import type { AccountingAuditLogPort } from "../../domain/ports/out/accounting-audit-log.port.js";
import type {
  CreateAccountingDocumentCommand,
  CreateAccountingDocumentPort,
  AccountingDocumentDTO,
} from "../../domain/ports/in/accounting-document.ports.js";
import { resolveDeductibility, toAccountingDocumentDTO } from "./shared.js";

/**
 * Deteção de duplicados (secção 9 da task) — cruza NIF+número+data+total
 * contra `AccountingDocument`s já existentes e contra `invoices` (D10, porta
 * já injetada). `confirmDuplicate: true` força a criação mesmo perante um
 * candidato encontrado.
 */
export class CreateAccountingDocumentUseCase implements CreateAccountingDocumentPort {
  constructor(
    private readonly repository: AccountingDocumentRepositoryPort,
    private readonly listCostCenterCategories: ListCostCenterCategoriesPort,
    private readonly listInvoices: ListInvoicesPort,
    private readonly auditLog: AccountingAuditLogPort,
  ) {}

  async execute(command: CreateAccountingDocumentCommand): Promise<AccountingDocumentDTO> {
    const nif = command.nif ?? null;
    const documentNumber = command.documentNumber ?? null;

    if (!command.confirmDuplicate) {
      const duplicateDocument = await this.repository.findPossibleDuplicate(command.organizationId, {
        nif,
        documentNumber,
        issueDate: command.issueDate,
        totalWithVat: command.totalWithVat,
      });
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
          (inv) => inv.invoiceNumber === documentNumber && inv.totalWithVat === command.totalWithVat && inv.invoiceDate === command.issueDate,
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
    const { vatDeductibleAmount, vatNonDeductibleAmount } = resolveDeductibility(
      command.vatAmount,
      command.deductiblePercentage ?? null,
      command.costCenterCategoryId ?? null,
      categories,
    );

    const document = AccountingDocument.create({
      organizationId: command.organizationId,
      documentType: command.documentType,
      fundingSource: command.fundingSource,
      entityName: command.entityName,
      nif,
      documentNumber,
      issueDate: command.issueDate,
      receivedDate: command.receivedDate ?? null,
      competenceDate: command.competenceDate ?? null,
      ...(command.currency !== undefined && { currency: command.currency }),
      ...(command.country !== undefined && { country: command.country }),
      subtotalWithoutVat: command.subtotalWithoutVat,
      vatAmount: command.vatAmount,
      totalWithVat: command.totalWithVat,
      costCenterCategoryId: command.costCenterCategoryId ?? null,
      deductiblePercentage: command.deductiblePercentage ?? null,
      deductibilityOverrideReason: command.deductibilityOverrideReason ?? null,
      vatDeductibleAmount,
      vatNonDeductibleAmount,
      settlementMethod: command.settlementMethod,
      notes: command.notes ?? null,
      createdBy: command.actor,
    });

    await this.repository.save(command.organizationId, document);
    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "accounting_document",
      entityId: document.id,
      action: "create",
      after: document.toProps(),
    });

    return toAccountingDocumentDTO(document, []);
  }
}
