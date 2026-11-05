/** Regra do POS violada (dados recusados). → 422 */
export class PosRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PosRuleError";
  }
}

export class PosNotFoundError extends Error {
  constructor(what: string) {
    super(`${what} não encontrado`);
    this.name = "PosNotFoundError";
  }
}

/** PIN errado ou sem a permissão pedida (gestor). → 403 */
export class PosPinError extends Error {
  constructor(message = "PIN inválido") {
    super(message);
    this.name = "PosPinError";
  }
}
