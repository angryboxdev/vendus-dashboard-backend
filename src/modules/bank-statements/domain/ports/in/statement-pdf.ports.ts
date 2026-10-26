import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { StatementAccountResolution } from "../out/statement-account-resolver.port.js";
import type { ParsedBankStatement } from "../../services/statement-pdf/parsed-statement.js";

/** Lê um extrato em PDF de um modelo reconhecido (hoje: Millennium BCP), sem gravar nada. */
export interface ReadStatementPdfPort {
  execute(fileBuffer: Buffer): Promise<ParsedBankStatement>;
}

/** Que banco/conta vai receber o extrato: existente, ou a criar (pré-visualização — nada é gravado). */
export interface PreviewStatementAccountPort {
  execute(organizationId: OrganizationId, statement: ParsedBankStatement): Promise<StatementAccountResolution | null>;
}
