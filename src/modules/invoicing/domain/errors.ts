/** Violação de uma regra fiscal (dados recusados antes de emitir). A F3 mapeia para 422. */
export class InvoicingRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoicingRuleError";
  }
}
