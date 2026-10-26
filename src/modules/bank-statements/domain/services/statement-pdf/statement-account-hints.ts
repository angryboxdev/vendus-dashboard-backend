import type { StatementAccountHints } from "../../ports/out/statement-account-resolver.port.js";
import type { ParsedBankStatement } from "./parsed-statement.js";

export function statementAccountHints(s: ParsedBankStatement): StatementAccountHints {
  return { template: s.template, bankName: s.bankName, bic: s.bic, iban: s.iban, accountNumber: s.accountNumber, accountLabel: s.accountLabel };
}
