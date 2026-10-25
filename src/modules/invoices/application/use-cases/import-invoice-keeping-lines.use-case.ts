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
    const result = await this.importInvoice.execute(command);
    if (result.reused || result.extractedLines.length === 0) return result;
    try {
      await persistExtractedDraft(this.saveDraft, command.organizationId, result, command.actor ?? "sistema");
      const saved = await this.invoiceRepo.findById(command.organizationId, result.invoice.id);
      // Versão nova do rascunho (guardar incrementa-a): a revisão confirma contra esta.
      return saved ? { ...result, invoice: toInvoiceDTO(saved) } : result;
    } catch (e) {
      console.error("[invoices] lote: não foi possível gravar as linhas no rascunho (ignorado):", e instanceof Error ? e.message : e);
      return result;
    }
  }
}
