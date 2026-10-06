/** Dados inválidos (nome vazio, perfil inexistente, Colaborador sem ficha…). */
export class AccessValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessValidationError";
  }
}

/** Outro Admin gravou entretanto (versão desatualizada) — nunca sobrescrever em silêncio (task §20). */
export class AccessConflictError extends Error {
  constructor() {
    super("Este registo foi alterado entretanto por outro administrador. Atualize e tente novamente.");
    this.name = "AccessConflictError";
  }
}

/** A organização ficaria sem nenhum Admin ativo (task §7). */
export class LastAdminError extends Error {
  constructor() {
    super("Tem de existir pelo menos um Admin ativo.");
    this.name = "LastAdminError";
  }
}

/** Perfil protegido (Admin, Colaborador) — não se altera função a função nem se desativa. */
export class ProtectedProfileError extends Error {
  constructor(message = "Este perfil é protegido e não pode ser alterado.") {
    super(message);
    this.name = "ProtectedProfileError";
  }
}

export class AccessNotFoundError extends Error {
  constructor(what: string) {
    super(`${what} não encontrado`);
    this.name = "AccessNotFoundError";
  }
}
