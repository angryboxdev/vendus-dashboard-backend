import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { PayableEntryWritePort } from "../../domain/ports/out/payable-entry-write.port.js";

/**
 * Relatório de integridade (task v1.2 §1.4): faturas com mais de uma conta a
 * pagar ativa. Só lê — a fusão exige reconciliar pagamentos/movimentos à mão.
 */
export class ListPayableDuplicatesUseCase {
  constructor(private readonly payables: PayableEntryWritePort) {}
  execute(org: OrganizationId) {
    return this.payables.listDuplicateActive(org);
  }
}
