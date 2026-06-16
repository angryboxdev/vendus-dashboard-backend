import type { GetInvoicePort, InvoiceDTO } from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";
import { InvoiceNotFoundError } from "../../domain/errors.js";
import { toInvoiceDTO } from "./shared.js";

export class GetInvoiceUseCase implements GetInvoicePort {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly lineRepo: InvoiceLineRepositoryPort,
  ) {}

  async execute(id: string): Promise<InvoiceDTO> {
    const invoice = await this.invoiceRepo.findById(id);
    if (!invoice) throw new InvoiceNotFoundError(id);

    const lines = await this.lineRepo.findByInvoiceId(id);
    return toInvoiceDTO(invoice, lines);
  }
}
