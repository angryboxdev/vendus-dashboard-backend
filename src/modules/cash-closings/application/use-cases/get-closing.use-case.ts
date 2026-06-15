import { ClosingNotFoundError } from "../../domain/errors.js";
import type { GetClosingPort, GetClosingQuery } from "../../domain/ports/in/get-closing.port.js";
import type { CashClosingDto } from "../../domain/ports/in/shared-dto.js";
import type { CashClosingRepositoryPort } from "../../domain/ports/out/cash-closing-repository.port.js";
import { toDto } from "./submit-closing.use-case.js";

export class GetClosingUseCase implements GetClosingPort {
  constructor(private readonly closingRepository: CashClosingRepositoryPort) {}

  async execute(query: GetClosingQuery): Promise<CashClosingDto> {
    const closing = await this.closingRepository.findById(query.id);
    if (!closing) throw new ClosingNotFoundError(query.id);
    return toDto(closing);
  }
}
