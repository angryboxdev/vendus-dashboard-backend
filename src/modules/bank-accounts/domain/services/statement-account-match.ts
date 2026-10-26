import type { Bank } from "../entities/bank.js";
import type { BankAccount } from "../entities/bank-account.js";

const clean = (s: string | null | undefined) => (s ?? "").replace(/[\s.-]/g, "").toUpperCase();
const digits = (s: string | null | undefined) => clean(s).replace(/\D/g, "").replace(/^0+/, "");

/**
 * A conta registada é a do extrato? (task V2 §4.1 — identificar pelo IBAN/nº de conta, sem duplicados)
 * - IBAN igual (sem espaços/maiúsculas);
 * - nº de conta igual, ignorando zeros à esquerda («0000045797093352» = «45797093352»);
 * - nº de conta de um contido no IBAN do outro (o IBAN PT leva o nº de conta lá dentro).
 * Nunca compara cartões (só contas à ordem).
 */
export function matchesStatementAccount(account: BankAccount, statement: { iban: string | null; accountNumber: string | null }): boolean {
  if (account.type !== "account") return false;
  const accIban = clean(account.iban);
  const stIban = clean(statement.iban);
  if (accIban && stIban && accIban === stIban) return true;
  const accNo = digits(account.accountNumber);
  const stNo = digits(statement.accountNumber);
  if (accNo && stNo && accNo === stNo) return true;
  if (stNo.length >= 8 && accIban.includes(stNo)) return true;
  if (accNo.length >= 8 && stIban.includes(accNo)) return true;
  return false;
}

/** O banco registado é o do extrato: mesmo logótipo predefinido (ex.: «millennium_bcp») ou mesmo nome. */
export function matchesStatementBank(bank: Bank, statement: { logoKey: string; bankName: string }): boolean {
  const name = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  return (statement.logoKey !== "other" && bank.logoKey === statement.logoKey) || name(bank.name) === name(statement.bankName);
}

/** «CONTA NEGOCIO EMP.» → «Conta Negocio Emp.» (nome legível para a conta criada automaticamente). */
export function accountNicknameFromLabel(label: string | null): string {
  if (!label?.trim()) return "Conta à ordem";
  return label.trim().toLowerCase().replace(/(^|\s)(\p{L})/gu, (_m, sp: string, c: string) => sp + c.toUpperCase());
}
