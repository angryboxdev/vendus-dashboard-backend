import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { ExistingObligation } from "../../services/reading/obligation-match.js";

/** Faturas e contas a pagar da organização com o mesmo valor ou um número parecido (para não duplicar obrigações). */
export interface ObligationCandidatesPort {
  find(organizationId: OrganizationId, query: { amountCents: number | null; numbers: string[] }): Promise<ExistingObligation[]>;
}
