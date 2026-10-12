import type { OrganizationId } from "../../../../kernel/organization-id.js";

/**
 * Organização de demonstração do Novo RH (ADR-0034): na mesma base de dados,
 * ligada à organização real (`demo_of`), sem membros. Só é vista no Novo RH
 * quando um Admin da organização real escolhe "Demonstração".
 */
export interface DemoOrg {
  id: OrganizationId;
  name: string;
}

export interface DemoSeedSummary {
  locations: number;
  employees: number;
  schedules: number;
  clockEvents: number;
  absenceTypes: number;
  holidays: number;
}

export class DemoOrgError extends Error {
  constructor(
    message: string,
    readonly code: "already_exists" | "not_found" | "is_demo" | "admin_only",
  ) {
    super(message);
    this.name = "DemoOrgError";
  }
}
