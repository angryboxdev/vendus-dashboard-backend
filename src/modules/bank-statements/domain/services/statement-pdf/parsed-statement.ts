import type { ParsedMovement } from "../../ports/in/bank-statement.ports.js";

import type { StatementTemplateId } from "./statement-template.js";

export type { StatementTemplateId };

/** Problema de leitura: `blocking` impede a importação (o extrato não fecha, falta o saldo…). */
export interface StatementReadIssue {
  code: "balance_chain_break" | "closing_mismatch" | "missing_opening" | "missing_closing" | "missing_period" | "missing_account" | "movement_without_amount" | "carry_mismatch";
  message: string;
  blocking: boolean;
}

/** Extrato lido de um PDF reconhecido: metadados úteis + movimentos, sem ruído (publicidade, texto legal…). */
export interface ParsedBankStatement {
  template: StatementTemplateId;
  bankName: string;
  accountNumber: string | null;
  iban: string | null;
  /** BIC/SWIFT do banco (ex.: «BCOMPTPL»). */
  bic: string | null;
  /** NIB tal como impresso (só dígitos). */
  nib: string | null;
  currency: string;
  /** Designação do produto, ex.: «CONTA NEGOCIO EMP.». */
  accountLabel: string | null;
  statementNumber: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  /** Cêntimos. */
  openingBalance: number | null;
  closingBalance: number | null;
  movements: ParsedMovement[];
  issues: StatementReadIssue[];
}
