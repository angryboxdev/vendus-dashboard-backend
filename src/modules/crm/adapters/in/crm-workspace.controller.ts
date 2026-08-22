import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { CrmWorkspaceService } from "../../application/crm-workspace.service.js";

const ids = z.array(z.string().min(1)).min(1).max(1000);
const actionBody = z.object({ customerIds: ids, actionTypeCode: z.string().min(1),
  scheduledFor: z.string().datetime(),
  notes: z.string().max(5000).nullable().optional(), scriptCode: z.string().nullable().optional() });

export class CrmWorkspaceController {
  readonly router = Router();
  constructor(private readonly service: CrmWorkspaceService) {
    this.router.get("/crm/customer-table", this.handle(this.list));
    this.router.get("/crm/action-types", this.handle(this.actionTypes));
    this.router.post("/crm/action-types", this.handle(this.createActionType));
    this.router.patch("/crm/action-types/:code", this.handle(this.updateActionType));
    this.router.post("/crm/actions", this.handle(this.createActions));
    this.router.patch("/crm/actions/complete-bulk", this.handle(this.completeActions));
    this.router.patch("/crm/actions/:id/complete", this.handle(this.completeAction));
    this.router.get("/crm/customers/:customerId/actions", this.handle(this.listCustomerActions));
    this.router.get("/crm/tags", this.handle(this.tags));
    this.router.post("/crm/tags", this.handle(this.createTag));
    this.router.patch("/crm/customers/tags", this.handle(this.updateTags));
    this.router.patch("/crm/customers/inactive", this.handle(this.setInactive));
  }
  private handle(fn: (req: Request, res: Response) => Promise<void>) {
    return async (req: Request, res: Response) => { try { await fn(req, res); } catch (error) {
      if (error instanceof z.ZodError) { res.status(400).json({ error: "Dados inválidos", details: error.issues }); return; }
      const message = error instanceof Error ? error.message : "Erro interno";
      res.status(message.includes("duplicate") || message.includes("unique") ? 409 : 500).json({ error: message });
    }};
  }
  private list = async (req: Request, res: Response) => {
    const one = (value: unknown) => typeof value === "string" ? value : undefined;
    const result = await this.service.listCustomers({ search: one(req.query.search), status: one(req.query.status) as any,
      activity: one(req.query.activity) as any, tags: one(req.query.tags)?.split(",").filter(Boolean) ?? [], tagMode: one(req.query.tagMode) as any,
      lastActionType: one(req.query.lastActionType), nextActionType: one(req.query.nextActionType), lastScriptCode: one(req.query.lastScriptCode), followUpFrom: one(req.query.followUpFrom),
      followUpTo: one(req.query.followUpTo), followUpState: one(req.query.followUpState) as any, sortBy: one(req.query.sortBy) as any,
      sortDirection: one(req.query.sortDirection) as any, page: Number(one(req.query.page) ?? 1), pageSize: Number(one(req.query.pageSize) ?? 10) });
    res.json(result);
  };
  private actionTypes = async (_req: Request, res: Response) => { res.json(await this.service.listActionTypes()); };
  private createActionType = async (req: Request, res: Response) => { const body = z.object({ code: z.string().regex(/^[a-z0-9_-]+$/).optional(), name: z.string().min(1), color: z.string().default("#6b7280"), active: z.boolean().default(true) }).parse(req.body); res.status(201).json(await this.service.createActionType(body)); };
  private updateActionType = async (req: Request, res: Response) => { const code = z.string().min(1).parse(req.params.code); const body = z.object({ name: z.string().trim().min(1), color: z.string().optional() }).parse(req.body); res.json(await this.service.updateActionType(code, body)); };
  private createActions = async (req: Request, res: Response) => { const body = actionBody.parse(req.body); res.status(201).json(await this.service.createActions({ ...body, status: "pending", completedAt: null, notes: body.notes ?? null, scriptCode: body.scriptCode ?? null, createdBy: req.auth!.sub })); };
  private completeAction = async (req: Request, res: Response) => { const id = z.string().uuid().parse(req.params.id); const body = z.object({ completedAt: z.string().datetime() }).parse(req.body); res.json(await this.service.completeAction(id, body.completedAt)); };
  private completeActions = async (req: Request, res: Response) => { const body = z.object({ actions: z.array(z.object({ id: z.string().uuid(), completedAt: z.string().datetime() })).min(1).max(100) }).parse(req.body); res.json(await this.service.completeActions(body.actions)); };
  private listCustomerActions = async (req: Request, res: Response) => { const customerId = z.string().min(1).parse(req.params.customerId); const query = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(50).default(20) }).parse(req.query); res.json(await this.service.listCustomerActions(customerId, query.cursor, query.limit)); };
  private tags = async (_req: Request, res: Response) => { res.json(await this.service.listTags()); };
  private createTag = async (req: Request, res: Response) => { const body = z.object({ label: z.string().min(1), color: z.string().optional(), category: z.enum(["feedback", "comportamento", "alerta", "estado", "geral"]).optional() }).parse(req.body); res.status(201).json(await this.service.createTag(body)); };
  private updateTags = async (req: Request, res: Response) => { const body = z.object({ customerIds: ids, add: z.array(z.string()).default([]), remove: z.array(z.string()).default([]) }).parse(req.body); await this.service.updateTags(body.customerIds, body.add, body.remove); res.status(204).send(); };
  private setInactive = async (req: Request, res: Response) => { const body = z.object({ customerIds: ids, inactive: z.boolean() }).parse(req.body); await this.service.setInactive(body.customerIds, body.inactive); res.status(204).send(); };
}
