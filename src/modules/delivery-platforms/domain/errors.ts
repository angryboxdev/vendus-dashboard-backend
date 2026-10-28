/** O ficheiro não é um dos documentos suportados (ou não se conseguiu ler o texto). */
export class UnsupportedPlatformDocumentError extends Error {
  constructor(readonly fileName: string) {
    super(`Documento não reconhecido: ${fileName}`);
    this.name = "UnsupportedPlatformDocumentError";
  }
}

/** Ano/mês pedidos inválidos. */
export class InvalidStatementPeriodError extends Error {
  constructor() {
    super("year e month têm de ser um mês válido");
    this.name = "InvalidStatementPeriodError";
  }
}

/**
 * O documento foi reconhecido mas a leitura não confere: falta um campo obrigatório ou as linhas não
 * somam o total a transferir que o próprio documento indica. Não se grava nada desse ficheiro.
 */
export class InvalidPlatformDocumentError extends Error {
  constructor(
    readonly fileName: string,
    readonly reason: string,
  ) {
    super(`${fileName}: ${reason}`);
    this.name = "InvalidPlatformDocumentError";
  }
}
