/** Ficheiro enviado que não é um SAF-T de vendas utilizável. */
export class InvalidSaftFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSaftFileError";
  }
}

/** Pedido sem ficheiros ou com datas impossíveis. */
export class InvalidSalesDeclarationRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSalesDeclarationRequestError";
  }
}
