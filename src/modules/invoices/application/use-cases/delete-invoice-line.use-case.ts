import type { DeleteInvoiceLinePort } from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";
import { InvoiceNotFoundError, InvoiceLineNotFoundError, LineDetailModeError } from "../../domain/errors.js";

export class DeleteInvoiceLineUseCase implements DeleteInvoiceLinePort {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly lineRepo: InvoiceLineRepositoryPort,
  ) {}

  async execute(invoiceId: string, lineId: string): Promise<void> {
    const invoice = await this.invoiceRepo.findById(invoiceId);
    if (!invoice) throw new InvoiceNotFoundError(invoiceId);

    if (invoice.lineDetailMode === "simple") {
      throw new LineDetailModeError(invoiceId);
    }

    const lines = await this.lineRepo.findByInvoiceId(invoiceId);
    const line = lines.find((l) => l.id === lineId);
    if (!line) throw new InvoiceLineNotFoundError(lineId);

    await this.lineRepo.deleteLineById(lineId);
  }
}
