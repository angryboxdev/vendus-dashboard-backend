import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { CashClosingDto } from "./shared-dto.js";
import type { DrawerDenominations } from "../../entities/cash-closing.js";

export interface SubmitClosingCommand {
  /** Rota pública sem sessão (D14): fornecido pelo controller a partir do unattended scope. */
  organizationId: OrganizationId;
  /**
   * Loja a que este fecho pertence (D3/D4). Campo de comando, não escopo —
   * fornecido explicitamente pelo unattended scope (D14), nunca pelo cliente
   * (o kiosk não tem identidade de dispositivo) nem pelo default da coluna.
   */
  locationId: string;
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
