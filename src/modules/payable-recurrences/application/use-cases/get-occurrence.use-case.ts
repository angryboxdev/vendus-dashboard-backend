import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type { BankMovementLinkReadPort } from "../../domain/ports/out/bank-movement-link-read.port.js";
import type { GetOccurrencePort, GetOccurrenceQuery, OccurrenceDTO } from "../../domain/ports/in/occurrence.ports.js";
import { OccurrenceNotFoundError } from "../../domain/errors.js";
import { toOccurrenceDTO } from "./shared.js";

export class GetOccurrenceUseCase implements GetOccurrencePort {
  constructor(
    private readonly repo: OccurrenceRepositoryPort,
    private readonly bankMovementLinkRead: BankMovementLinkReadPort,
  ) {}

  async execute(query: GetOccurrenceQuery): Promise<OccurrenceDTO> {
    const occurrence = await this.repo.findById(query.organizationId, query.id);
    if (!occurrence) throw new OccurrenceNotFoundError(query.id);

    const bankLinks = await this.bankMovementLinkRead.findByOccurrenceIds(query.organizationId, [query.id]);
    return toOccurrenceDTO(occurrence, bankLinks.get(query.id) ?? null);
  }
}
