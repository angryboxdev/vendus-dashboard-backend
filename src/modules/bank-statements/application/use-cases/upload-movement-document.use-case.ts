import { MovementNotFoundError } from "../../domain/errors.js";
import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type { DocumentStoragePort } from "../../domain/ports/out/document-storage.port.js";
import type {
  UploadMovementDocumentCommand,
  UploadMovementDocumentPort,
} from "../../domain/ports/in/bank-statement.ports.js";

export class UploadMovementDocumentUseCase implements UploadMovementDocumentPort {
  constructor(
    private readonly movementRepo: BankMovementRepositoryPort,
    private readonly storage: DocumentStoragePort
  ) {}

  async execute(command: UploadMovementDocumentCommand): Promise<{ documentUrl: string }> {
    const movement = await this.movementRepo.findById(command.movementId);
    if (!movement) throw new MovementNotFoundError(command.movementId);

    const documentUrl = await this.storage.store(
      command.buffer,
      command.filename,
      command.mimeType
    );

    // documentUrl is returned to the caller; the classify step will persist it
    // alongside the full classification payload.
    return { documentUrl };
  }
}
