import type { CashClosingDto } from "./shared-dto.js";

export interface GetClosingQuery {
  id: string;
}

export interface GetClosingPort {
  execute(query: GetClosingQuery): Promise<CashClosingDto>;
}
