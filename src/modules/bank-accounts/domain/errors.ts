export class BankNotFoundError extends Error {
  constructor(id: string) {
    super(`Bank not found: ${id}`);
    this.name = "BankNotFoundError";
  }
}

export class BankAccountNotFoundError extends Error {
  constructor(id: string) {
    super(`Bank account not found: ${id}`);
    this.name = "BankAccountNotFoundError";
  }
}

export class BankHasAccountsError extends Error {
  constructor(id: string) {
    super(`Cannot delete bank ${id}: it has associated accounts`);
    this.name = "BankHasAccountsError";
  }
}

export class BankAccountHasStatementsError extends Error {
  constructor(id: string) {
    super(`Cannot delete bank account ${id}: it has imported statements`);
    this.name = "BankAccountHasStatementsError";
  }
}
