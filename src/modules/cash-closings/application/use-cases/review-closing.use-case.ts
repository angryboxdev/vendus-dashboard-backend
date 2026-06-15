import { ClosingNotFoundError } from "../../domain/errors.js";
import type { ReviewClosingPort, ReviewClosingCommand } from "../../domain/ports/in/review-closing.port.js";
import type { CashClosingDto } from "../../domain/ports/in/shared-dto.js";
import type { CashClosingRepositoryPort } from "../../domain/ports/out/cash-closing-repository.port.js";
import { toDto } from "./submit-closing.use-case.js";

export class ReviewClosingUseCase implements ReviewClosingPort {
  constructor(private readonly closingRepository: CashClosingRepositoryPort) {}

  async execute(command: ReviewClosingCommand): Promise<CashClosingDto> {
    const existing = await this.closingRepository.findById(command.id);
    if (!existing) throw new ClosingNotFoundError(command.id);

    const updated = existing.review({
      status: command.status,
      managerNotes: command.managerNotes,
      tpa: command.tpa,
      uber: command.uber,
      glovo: command.glovo,
      bolt: command.bolt,
      eatz: command.eatz,
      cashSales: command.cashSales,
      cashIn: command.cashIn,
      cashOut: command.cashOut,
      cashDrawerOpen: command.cashDrawerOpen,
      cashDrawerTotal: command.cashDrawerTotal,
      notes: command.notes,
    });

    await this.closingRepository.update(updated);
    return toDto(updated);
  }
}
