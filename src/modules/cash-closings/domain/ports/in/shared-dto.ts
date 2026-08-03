import type { CashClosingStatus, DrawerDenominations } from "../../entities/cash-closing.js";

/** DTO de saída partilhado por todos os input ports. */
export interface CashClosingDto {
  id: string;
  closingDate: string;
  employeeId: string;
  employeeName: string;
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
  totalCalculated: number;
  vendusTotal: number | null;
  sangriaAmount: number;
  notes: string | null;
  status: CashClosingStatus;
  managerNotes: string | null;
  reviewedAt: string | null;
  submittedAt: string;
  sessionOpenedAt: string | null;
  drawerDenominations: DrawerDenominations | null;
  /** Totais AirMenu por plataforma — null se AirMenu indisponível ou não configurado. */
  airMenuUber: number | null;
  airMenuGlovo: number | null;
  airMenuBolt: number | null;
}
