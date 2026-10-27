import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/**
 * Faturas por email (módulo invoice-email-intake, ligado em server.ts): um PDF recebido entra pelo MESMO
 * import das faturas — rascunho «Por rever» no Financeiro (`finance`) ou, para quem só usa o Stock, pelo import
 * do Stock («Compras por rever», `stock`). Nunca confirma, paga nem mexe no stock.
 */
export interface ImportInvoiceFromEmailCommand {
  organizationId: OrganizationId;
  destination: "finance" | "stock";
  fileBuffer: Buffer;
  filename: string;
}

export type ImportInvoiceFromEmailResult =
  /** Rascunho novo (ou rascunhos, num documento de pagamento com várias faturas). */
  | { outcome: "imported"; invoiceIds: string[] }
  /** Já existia (mesmo ficheiro, mesma identidade fiscal, ou já no Stock): nada é criado. */
  | { outcome: "duplicate"; invoiceId: string | null; message: string }
  /** Não é para importar (documento de cobrança AT/SS, não é fatura, sem linhas para o Stock). */
  | { outcome: "rejected"; code: "payment_document" | "not_invoice" | "no_lines"; message: string }
  /** Falha passageira (ex.: orçamento diário da IA esgotado): tentar mais tarde. */
  | { outcome: "retry_later"; message: string };

export interface ImportInvoiceFromEmailPort {
  execute(command: ImportInvoiceFromEmailCommand): Promise<ImportInvoiceFromEmailResult>;
}
