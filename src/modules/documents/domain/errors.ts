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

/**
 * Categorias periódicas (ex: Recibo de vencimento): no máximo um documento
 * atual por colaborador × categoria × período (task §26 — chave
 * tenant+employee+category+period). Nunca cria duplicado: o chamador
 * cancela ou usa "Substituir versão".
 */
export class DocumentPeriodAlreadyExistsError extends Error {
  readonly existingDocumentId: string;
  constructor(category: string, period: string, existingDocumentId: string) {
    super(`Já existe um documento "${category}" deste colaborador para o período ${period}`);
    this.name = "DocumentPeriodAlreadyExistsError";
    this.existingDocumentId = existingDocumentId;
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

// ── Documentos de colaborador (ADR-0040, fase 1: vindos do RH antigo) ─────

/** O colaborador dono do documento não existe nesta organização. */
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

/** Portal: a conta da sessão não está ligada a nenhum colaborador (403 `PORTAL_NOT_LINKED`). */
export class PortalNotLinkedError extends Error {
  constructor() {
    super("Esta conta não está ligada a nenhum colaborador");
    this.name = "PortalNotLinkedError";
  }
}

/** Portal: recurso inexistente ou de outro colaborador — 404, sem revelar qual. */
export class PortalResourceNotFoundError extends Error {
  constructor(what: string) {
    super(`${what} não encontrado`);
    this.name = "PortalResourceNotFoundError";
  }
}

/** Portal: pedido inválido (formato, data de validade). */
export class PortalBadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortalBadRequestError";
  }
}
