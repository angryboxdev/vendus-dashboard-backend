import type { CashClosingStatus } from "../../entities/cash-closing.js";
import type { CashClosingDto } from "./shared-dto.js";

export interface ReviewClosingCommand {
  id: string;
  status?: CashClosingStatus | undefined;
  managerNotes?: string | null | undefined;
  tpa?: number | undefined;
  uber?: number | undefined;
  glovo?: number | undefined;
  bolt?: number | undefined;
  eatz?: number | undefined;
  cashSales?: number | undefined;
  cashIn?: number | undefined;
  cashOut?: number | undefined;
  cashDrawerOpen?: number | undefined;
  cashDrawerTotal?: number | undefined;
  notes?: string | null | undefined;
}

export interface ReviewClosingPort {
  execute(command: ReviewClosingCommand): Promise<CashClosingDto>;
}
