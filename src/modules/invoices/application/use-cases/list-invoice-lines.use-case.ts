import type { ListInvoiceLinesPort, InvoiceLineDTO } from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";
import { toInvoiceLineDTO } from "./shared.js";

export class ListInvoiceLinesUseCase implements ListInvoiceLinesPort {
  constructor(private readonly lineRepo: InvoiceLineRepositoryPort) {}

  async execute(): Promise<InvoiceLineDTO[]> {
    const lines = await this.lineRepo.findAll();
    return lines.map(toInvoiceLineDTO);
  }
}
