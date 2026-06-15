export class ClosingNotFoundError extends Error {
  constructor(id: string) {
    super(`Fecho de caixa não encontrado: ${id}`);
    this.name = "ClosingNotFoundError";
  }
}

export class DuplicateClosingError extends Error {
  constructor(employeeId: string, closingDate: string) {
    super(
      `Já existe um fecho de caixa para o funcionário ${employeeId} na data ${closingDate}`,
    );
    this.name = "DuplicateClosingError";
  }
}

export class InvalidPinError extends Error {
  constructor() {
    super("PIN inválido ou funcionário inativo");
    this.name = "InvalidPinError";
  }
}

export class EmployeeNotFoundError extends Error {
  constructor(id: string) {
    super(`Funcionário não encontrado: ${id}`);
    this.name = "EmployeeNotFoundError";
  }
}
