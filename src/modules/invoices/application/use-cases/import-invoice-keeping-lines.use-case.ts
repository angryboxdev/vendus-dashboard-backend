import type { ImportInvoiceCommand, ImportInvoicePort, InvoiceImportResultDTO } from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { SaveInvoiceDraftUseCase } from "./save-invoice-draft.use-case.js";
import { persistExtractedDraft } from "./shared-extracted-draft.js";
import { toInvoiceDTO } from "./shared.js";

/**
 * Importação em lote / em segundo plano (E4): a mesma importação, mas as linhas lidas ficam já
 * gravadas no rascunho — a revisão pode ser feita mais tarde (ou noutra sessão) sem voltar a ler o
 * PDF nem perder o que foi lido. Gravar as linhas é uma ajuda: se falhar, o rascunho fica como na
 * importação normal.
 */
export class ImportInvoiceKeepingLinesUseCase implements ImportInvoicePort {
  constructor(
    private readonly importInvoice: ImportInvoicePort,
    private readonly saveDraft: Pick<SaveInvoiceDraftUseCase, "execute">,
    private readonly invoiceRepo: InvoiceRepositoryPort,
  ) {}

  async execute(command: ImportInvoiceCommand & { actor?: string }): Promise<InvoiceImportResultDTO> {
    const { siblings, ...result } = await this.importInvoice.execute(command);
    const keep = async (r: InvoiceImportResultDTO): Promise<InvoiceImportResultDTO> => {
      if (r.reused || r.extractedLines.length === 0) return r;
      try {
        await persistExtractedDraft(this.saveDraft, command.organizationId, r, command.actor ?? "sistema");
        const saved = await this.invoiceRepo.findById(command.organizationId, r.invoice.id);
        // Versão nova do rascunho (guardar incrementa-a): a revisão confirma contra esta.
        return saved ? { ...r, invoice: { ...toInvoiceDTO(saved), paymentGroupId: r.invoice.paymentGroupId } } : r;
      } catch (e) {
        console.error("[invoices] lote: não foi possível gravar as linhas no rascunho (ignorado):", e instanceof Error ? e.message : e);
        return r;
      }
    };
    // Documento de pagamento com várias faturas: cada rascunho fica com as suas linhas.
    const primary = await keep(result);
    if (!siblings?.length) return primary;
    const kept: InvoiceImportResultDTO[] = [];
    for (const sibling of siblings) kept.push(await keep(sibling));
    return { ...primary, siblings: kept };
  }
}
