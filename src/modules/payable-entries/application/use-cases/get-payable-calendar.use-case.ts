import type { PayableEntryRepositoryPort } from "../../domain/ports/out/payable-entry-repository.port.js";
import type {
  GetPayableCalendarPort,
  GetPayableCalendarCommand,
  PayableCalendarDayDTO,
} from "../../domain/ports/in/payable-entry.ports.js";
import { PayableSummaryService } from "../../domain/services/payable-summary.service.js";
import { toDTO } from "./shared.js";

export class GetPayableCalendarUseCase implements GetPayableCalendarPort {
  private readonly summaryService = new PayableSummaryService();

  constructor(private readonly repo: PayableEntryRepositoryPort) {}

  async execute(command: GetPayableCalendarCommand): Promise<PayableCalendarDayDTO[]> {
    const entries = await this.repo.findAll({
      from: new Date(command.from),
      to: new Date(command.to),
    });

    const days = this.summaryService.groupByDay(entries);

    return days.map((day) => ({
      date: day.date,
      entries: day.entries.map(toDTO),
      totalAmount: day.totalAmount,
    }));
  }
}
