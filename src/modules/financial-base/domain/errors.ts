export class CostCenterGroupNotFoundError extends Error {
  constructor(id: string) {
    super(`Grupo de centro de custo "${id}" não encontrado`);
    this.name = "CostCenterGroupNotFoundError";
  }
}

export class CostCenterGroupCodeAlreadyExistsError extends Error {
  constructor(code: string) {
    super(`Já existe um grupo de centro de custo com o código "${code}"`);
    this.name = "CostCenterGroupCodeAlreadyExistsError";
  }
}

export class CostCenterCategoryNotFoundError extends Error {
  constructor(id: string) {
    super(`Subcategoria de centro de custo "${id}" não encontrada`);
    this.name = "CostCenterCategoryNotFoundError";
  }
}

export class CostCenterCategoryCodeAlreadyExistsError extends Error {
  constructor(code: string) {
    super(`Já existe uma subcategoria com o código "${code}"`);
    this.name = "CostCenterCategoryCodeAlreadyExistsError";
  }
}

export class InvalidFinancialTypeError extends Error {
  constructor(value: string) {
    super(`Tipo financeiro inválido: "${value}"`);
    this.name = "InvalidFinancialTypeError";
  }
}

export class SupplierNotFoundError extends Error {
  constructor(id: string) {
    super(`Fornecedor "${id}" não encontrado`);
    this.name = "SupplierNotFoundError";
  }
}

export class OrganizationNotFoundError extends Error {
  constructor(orgId: string) {
    super(`Organização "${orgId}" não encontrada`);
    this.name = "OrganizationNotFoundError";
  }
}
