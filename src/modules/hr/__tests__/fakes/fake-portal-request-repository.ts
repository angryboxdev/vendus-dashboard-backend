import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { PortalRequest, PortalRequestKind } from "../../domain/entities/portal-request.js";
import type { PortalRequestRepositoryPort } from "../../domain/ports/out/portal-request-repository.port.js";

export class FakePortalRequestRepository implements PortalRequestRepositoryPort {
  readonly items = new Map<string, PortalRequest>();
  private seq = 0;
  private readonly order = new Map<string, number>();

  async create(_org: OrganizationId, request: PortalRequest): Promise<PortalRequest> {
    this.items.set(request.id, request);
    this.order.set(request.id, ++this.seq);
    return request;
  }
  async update(_org: OrganizationId, request: PortalRequest): Promise<PortalRequest> {
    this.items.set(request.id, request);
    return request;
  }
  async findById(_org: OrganizationId, id: string): Promise<PortalRequest | null> {
    return this.items.get(id) ?? null;
  }
  async findForEmployee(_org: OrganizationId, employeeId: string, limit: number): Promise<PortalRequest[]> {
    return [...this.items.values()].filter((r) => r.employeeId === employeeId).sort((a, b) => this.order.get(b.id)! - this.order.get(a.id)!).slice(0, limit);
  }
  async findOverlapping(_org: OrganizationId, from: string, to: string): Promise<PortalRequest[]> {
    return [...this.items.values()].filter((r) => r.overlaps(from, to));
  }
  async findPending(_org: OrganizationId, kinds: PortalRequestKind[]): Promise<PortalRequest[]> {
    return [...this.items.values()].filter((r) => r.status === "pending" && kinds.includes(r.kind)).sort((a, b) => this.order.get(a.id)! - this.order.get(b.id)!);
  }
}
