import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type { OccurrenceDTO } from "../../domain/ports/in/occurrence.ports.js";
import type { UnlinkInvoiceCommand, UnlinkInvoiceFromOccurrencePort } from "../../domain/ports/in/invoice-link.ports.js";
import { OccurrenceNotFoundError } from "../../domain/errors.js";
import { toOccurrenceDTO } from "./shared.js";

/** «Desassociar»: corrige uma associação errada — a ocorrência volta ao previsto. */
export class UnlinkInvoiceFromOccurrenceUseCase implements UnlinkInvoiceFromOccurrencePort {
  constructor(private readonly occurrenceRepo: OccurrenceRepositoryPort) {}

  async execute(command: UnlinkInvoiceCommand): Promise<OccurrenceDTO> {
    const occurrence = await this.occurrenceRepo.findById(command.organizationId, command.occurrenceId);
    if (!occurrence) throw new OccurrenceNotFoundError(command.occurrenceId);
    const updated = occurrence.unlinkInvoice();
    await this.occurrenceRepo.update(command.organizationId, updated);
    return toOccurrenceDTO(updated);
  }
}
