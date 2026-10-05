/**
 * Só existe uma versão "atual" por categoria de cada dono (Empresa ou
 * Colaborador) de cada vez — enviar uma categoria que já tem versão atual
 * força o chamador a usar "Substituir" (nunca cria uma segunda linha
 * "atual" concorrente).
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

export class DocumentNotFoundError extends Error {
  constructor(id: string) {
    super(`Documento não encontrado: ${id}`);
    this.name = "DocumentNotFoundError";
  }
}

/** Definição de categoria de documento (configuração, não instância enviada) não encontrada. */
export class DocumentCategoryConfigNotFoundError extends Error {
  constructor(id: string) {
    super(`Categoria de documento não encontrada: ${id}`);
    this.name = "DocumentCategoryConfigNotFoundError";
  }
}

/** Já existe uma categoria de documento configurada com este slug/label nesta organização. */
export class DocumentCategoryConfigAlreadyExistsError extends Error {
  constructor(slug: string) {
    super(`Já existe uma categoria de documento com este nome: "${slug}"`);
    this.name = "DocumentCategoryConfigAlreadyExistsError";
  }
}

/** Dados inválidos numa categoria ou num documento (ex.: categoria fora do âmbito do dono). */
export class InvalidDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDocumentError";
  }
}
