import type { ListInvoicesPort } from "../../../invoices/domain/ports/in/invoice.ports.js";
import type { AccountingDocumentRepositoryPort } from "../../domain/ports/out/accounting-document-repository.port.js";
import type {
  AccountingDocumentRowDTO,
  ListAccountingDocumentsCommand,
  ListAccountingDocumentsPort,
} from "../../domain/ports/in/accounting-documents.ports.js";

/**
 * "Documentos" (vista agregada, decisão confirmada com o utilizador) — lê
 * `invoices` (faturas/notas de crédito pagas pela conta/cartão/caixa da
 * empresa) via `ListInvoicesPort` (D10, porta de outro módulo injetada
 * diretamente) + `AccountingDocument` (qualquer documento sem esse fluxo
 * bancário normal). Nunca escreve nem duplica a lógica de faturas.
 */
export class ListAccountingDocumentsUseCase implements ListAccountingDocumentsPort {
  constructor(
    private readonly listInvoices: ListInvoicesPort,
    private readonly repository: AccountingDocumentRepositoryPort,
  ) {}

  async execute(command: ListAccountingDocumentsCommand): Promise<AccountingDocumentRowDTO[]> {
    const dateFilter = {
      ...(command.from !== undefined && { from: command.from }),
      ...(command.to !== undefined && { to: command.to }),
    };
    const [invoices, documents] = await Promise.all([
      this.listInvoices.execute(command.organizationId, dateFilter),
      this.repository.findAll(command.organizationId, dateFilter),
    ]);

    const invoiceRows: AccountingDocumentRowDTO[] = invoices.map((inv) => ({
      id: inv.id,
      source: "invoice",
      documentType: inv.documentType,
      fundingSource: null,
      entityName: inv.supplierName,
      nif: inv.supplierNifSnapshot,
      documentNumber: inv.invoiceNumber,
      date: inv.invoiceDate,
      totalWithVat: inv.totalWithVat,
      status: inv.status,
      costCenterCategoryId: inv.costCenterCategoryId,
    }));

    const documentRows: AccountingDocumentRowDTO[] = documents.map((doc) => {
      const d = doc.toProps();
      return {
        id: d.id,
        source: "accounting_document",
        documentType: d.documentType,
        fundingSource: d.fundingSource,
        entityName: d.entityName,
        nif: d.nif,
        documentNumber: d.documentNumber,
        date: d.issueDate,
        totalWithVat: d.totalWithVat,
        status: d.status,
        costCenterCategoryId: d.costCenterCategoryId,
      };
    });

    return [...invoiceRows, ...documentRows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }
}
