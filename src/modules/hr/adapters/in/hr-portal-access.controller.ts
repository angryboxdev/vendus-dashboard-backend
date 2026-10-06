import { Router, type Response } from "express";
import { requireMinRole } from "../../../../middleware/auth.js";
import { EmployeeNotFoundError, PortalAccessError } from "../../domain/errors.js";
import type { GetPortalAccessPort, GrantPortalAccessPort, RevokePortalAccessPort } from "../../domain/ports/in/portal-access.ports.js";

function handleError(e: unknown, res: Response): void {
  if (e instanceof PortalAccessError) {
    res.status(409).json({ error: e.message });
    return;
  }
  if (e instanceof EmployeeNotFoundError) {
    res.status(404).json({ error: e.message });
    return;
  }
  res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
}

/** "Dar acesso ao Portal" na ficha do colaborador (Portal do Colaborador, ticket 02). Só gestão (manager+). */
export class HrPortalAccessController {
  readonly router: Router;

  constructor(
    private readonly getPortalAccess: GetPortalAccessPort,
    private readonly grantPortalAccess: GrantPortalAccessPort,
    private readonly revokePortalAccess: RevokePortalAccessPort,
  ) {
    this.router = Router();
    this.router.get("/hr/people/:id/portal-access", requireMinRole("manager"), async (req, res) => {
      try {
        res.json(await this.getPortalAccess.execute({ organizationId: req.auth!.orgId, employeeId: req.params.id as string }));
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/hr/people/:id/portal-access", requireMinRole("manager"), async (req, res) => {
      try {
        const result = await this.grantPortalAccess.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          employeeId: req.params.id as string,
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.delete("/hr/people/:id/portal-access", requireMinRole("manager"), async (req, res) => {
      try {
        await this.revokePortalAccess.execute({ organizationId: req.auth!.orgId, actor: req.auth!.email, employeeId: req.params.id as string });
        res.json({ revoked: true });
      } catch (e) {
        handleError(e, res);
      }
    });
  }
}
