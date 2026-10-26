import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { PreviewStatementAccountPort } from "../../domain/ports/in/statement-pdf.ports.js";
import type { StatementAccountResolution, StatementAccountResolverPort } from "../../domain/ports/out/statement-account-resolver.port.js";
import type { ParsedBankStatement } from "../../domain/services/statement-pdf/parsed-statement.js";
import { statementAccountHints } from "../../domain/services/statement-pdf/statement-account-hints.js";

/** Pré-visualização: diz se o extrato vai para uma conta existente ou se banco/conta serão criados. */
export class PreviewStatementAccountUseCase implements PreviewStatementAccountPort {
  constructor(private readonly resolver: StatementAccountResolverPort) {}

  async execute(organizationId: OrganizationId, statement: ParsedBankStatement): Promise<StatementAccountResolution | null> {
    return this.resolver.resolve(organizationId, statementAccountHints(statement), { create: false });
  }
}
