export class InvalidEmployeeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEmployeeError";
  }
}

export class EmployeeNotFoundError extends Error {
  constructor(id: string) {
    super(`Funcionário não encontrado: ${id}`);
    this.name = "EmployeeNotFoundError";
  }
}

export class EmployeeDocumentNotFoundError extends Error {
  constructor(id: string) {
    super(`Documento não encontrado: ${id}`);
    this.name = "EmployeeDocumentNotFoundError";
  }
}

/**
 * Só existe uma versão "atual" por categoria de documento de cada vez —
 * enviar uma nova categoria quando já existe uma versão atual força o
 * chamador a usar a acção "Substituir" (nunca cria uma segunda linha
 * concorrente "atual" para a mesma categoria).
 */
export class DocumentCategoryAlreadyExistsError extends Error {
  constructor(category: string) {
    super(`Já existe um documento atual na categoria "${category}" — usa substituir em vez de enviar novo`);
    this.name = "DocumentCategoryAlreadyExistsError";
  }
}

/** Tentativa de substituir/remover uma versão que já não é a atual. */
export class DocumentNotCurrentError extends Error {
  constructor(id: string) {
    super(`Documento ${id} já não é a versão atual — não pode ser substituído/removido`);
    this.name = "DocumentNotCurrentError";
  }
}
