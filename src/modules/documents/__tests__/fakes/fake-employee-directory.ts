import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { DocumentEmployee, EmployeeDirectoryPort } from "../../domain/ports/out/employee-directory.port.js";

export interface FakeEmployee extends DocumentEmployee {
  status: "active" | "inactive";
  deactivate(): FakeEmployee;
}

/** Colaborador fictício para os testes (só os campos que os documentos usam). */
export function employee(props: { fullName: string; nif?: string | null; positionId?: string | null; email?: string }): FakeEmployee {
  const make = (status: FakeEmployee["status"], id: string): FakeEmployee => ({
    id,
    fullName: props.fullName,
    nif: props.nif ?? null,
    positionId: props.positionId ?? null,
    status,
    deactivate: () => make("inactive", id),
  });
  return make("active", randomUUID());
}

/** Ficha em memória + ligação conta ↔ colaborador (Portal). Uma organização por teste chega. */
export class FakeEmployeeDirectory implements EmployeeDirectoryPort {
  private readonly employees = new Map<string, FakeEmployee>();
  /** employeeId → userId */
  readonly links = new Map<string, string>();

  seed(_org: OrganizationId, e: FakeEmployee): void {
    this.employees.set(e.id, e);
  }

  async findById(_org: OrganizationId, id: string): Promise<DocumentEmployee | null> {
    return this.employees.get(id) ?? null;
  }

  async findMany(_org: OrganizationId, filter: { status: "active" | "all" }): Promise<DocumentEmployee[]> {
    return [...this.employees.values()]
      .filter((e) => filter.status === "all" || e.status === "active")
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  async findLinkedEmployeeId(_org: OrganizationId, userId: string): Promise<string | null> {
    return [...this.links.entries()].find(([, u]) => u === userId)?.[0] ?? null;
  }
}
