export class CostCenterNotFoundError extends Error {
  constructor(id: string) {
    super(`Centro de custo "${id}" não encontrado`);
    this.name = "CostCenterNotFoundError";
  }
}

export class CostCenterCodeAlreadyExistsError extends Error {
  constructor(code: string) {
    super(`Já existe um centro de custo com o código "${code}"`);
    this.name = "CostCenterCodeAlreadyExistsError";
  }
}

export class SupplierNotFoundError extends Error {
  constructor(id: string) {
    super(`Fornecedor "${id}" não encontrado`);
    this.name = "SupplierNotFoundError";
  }
}
