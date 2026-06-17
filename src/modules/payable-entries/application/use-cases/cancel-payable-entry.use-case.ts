import type { PayableEntryRepositoryPort } from "../../domain/ports/out/payable-entry-repository.port.js";
import type {
  CancelPayableEntryPort,
  PayableEntryDTO,
} from "../../domain/ports/in/payable-entry.ports.js";
import { PayableEntryNotFoundError } from "../../domain/errors.js";
import { toDTO } from "./shared.js";

export class CancelPayableEntryUseCase implements CancelPayableEntryPort {
  constructor(private readonly repo: PayableEntryRepositoryPort) {}

  async execute(id: string): Promise<PayableEntryDTO> {
    const entry = await this.repo.findById(id);
    if (!entry) throw new PayableEntryNotFoundError(id);

    const cancelled = entry.cancel();
    await this.repo.update(cancelled);
    return toDTO(cancelled);
  }
}
