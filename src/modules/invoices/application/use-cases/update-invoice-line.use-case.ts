import type { UpdateInvoiceLinePort, UpdateInvoiceLineCommand, InvoiceLineDTO } from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";
import { InvoiceNotFoundError, InvoiceLineNotFoundError, LineDetailModeError, LinesTotalMismatchError } from "../../domain/errors.js";
import { toInvoiceLineDTO } from "./shared.js";

const LINE_TOTAL_TOLERANCE_CENTS = 1;

export class UpdateInvoiceLineUseCase implements UpdateInvoiceLinePort {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly lineRepo: InvoiceLineRepositoryPort,
  ) {}

  async execute(command: UpdateInvoiceLineCommand): Promise<InvoiceLineDTO> {
    const invoice = await this.invoiceRepo.findById(command.invoiceId);
    if (!invoice) throw new InvoiceNotFoundError(command.invoiceId);

    if (invoice.lineDetailMode === "simple") {
      throw new LineDetailModeError(command.invoiceId);
    }

    const existingLines = await this.lineRepo.findByInvoiceId(command.invoiceId);
    const line = existingLines.find((l) => l.id === command.lineId);
    if (!line) throw new InvoiceLineNotFoundError(command.lineId);

    const patch: Parameters<typeof line.updateValues>[0] = {};
    if (command.description !== undefined) patch.description = command.description;
    if (command.quantity !== undefined) patch.quantity = command.quantity;
    if (command.unit !== undefined) patch.unit = command.unit;
    if (command.unitCostWithoutVat !== undefined) patch.unitCostWithoutVat = command.unitCostWithoutVat;
    if (command.vatRate !== undefined) patch.vatRate = command.vatRate;
    if (command.vatAmount !== undefined) patch.vatAmount = command.vatAmount;
    if (command.totalWithVat !== undefined) patch.totalWithVat = command.totalWithVat;
    const updatedLine = line.updateValues(patch);

    // Validate: sum of all lines (with updated line) must not exceed invoice total.
    // Only totalWithVat is checked — vatAmount and subtotalWithoutVat are derived fields
    // that may have rounding differences in AI-imported invoices, causing false positives.
    const otherLines = existingLines.filter((l) => l.id !== command.lineId);
    const newTotal = otherLines.reduce((s, l) => s + l.totalWithVat, 0) + updatedLine.totalWithVat;

    if (newTotal > invoice.totalWithVat + LINE_TOTAL_TOLERANCE_CENTS) {
      throw new LinesTotalMismatchError(command.invoiceId);
    }

    await this.lineRepo.updateLine(updatedLine);
    return toInvoiceLineDTO(updatedLine);
  }
}
