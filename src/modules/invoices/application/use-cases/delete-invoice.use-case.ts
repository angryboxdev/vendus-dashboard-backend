import type { DeleteInvoicePort } from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";
import { InvoiceNotFoundError } from "../../domain/errors.js";

export class DeleteInvoiceUseCase implements DeleteInvoicePort {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly lineRepo: InvoiceLineRepositoryPort,
  ) {}

  async execute(id: string): Promise<void> {
    const existing = await this.invoiceRepo.findById(id);
    if (!existing) throw new InvoiceNotFoundError(id);

    await this.lineRepo.deleteByInvoiceId(id);
    await this.invoiceRepo.delete(id);
  }
}
