import type { CashClosingDto } from "./shared-dto.js";
import type { DrawerDenominations } from "../../entities/cash-closing.js";

export interface SubmitClosingCommand {
  employeeId: string;
  closingDate: string;
  tpa: number;
  uber: number;
  glovo: number;
  bolt: number;
  eatz: number;
  cashSales: number;
  cashIn: number;
  cashOut: number;
  cashDrawerOpen: number;
  cashDrawerTotal: number;
  notes?: string | null | undefined;
  /**
   * Modo sessions: datetime de abertura da sessão Vendus que se está a fechar.
   * Ausente/null → modo legado (usa /documents/ para o total Vendus).
   */
  sessionOpenedAt?: string | null | undefined;
  /**
   * Contagem física de notas e moedas na gaveta no fim do dia.
   * Ausente/null → kiosk antigo (antes desta feature).
   */
  drawerDenominations?: DrawerDenominations | null | undefined;
}

export interface SubmitClosingPort {
  execute(command: SubmitClosingCommand): Promise<CashClosingDto>;
}
