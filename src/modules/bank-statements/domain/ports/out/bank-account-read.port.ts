/**
 * Cross-module output port — lets bank-statements look up bank accounts
 * without depending on the bank-accounts module directly.
 */
export interface BankAccountReadPort {
  findByAccountNumber(raw: string): Promise<{ id: string } | null>;
  findById(id: string): Promise<{ id: string } | null>;
}
