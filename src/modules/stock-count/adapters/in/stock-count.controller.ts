import { Router } from "express";
import { can } from "../../../access/domain/services/effective-access.service.js";
import {
  StockCountSessionNotFoundError,
  StockCountLineNotFoundError,
  StockCountAttemptNotFoundError,
  StockCountZoneNotFoundError,
  StockItemNotFoundError,
  StaleCountSessionVersionError,
  StaleCountLineVersionError,
  SessionAlreadyCompletedError,
  SessionAlreadyCancelledError,
  SessionNotInDraftError,
  SessionNotCountingError,
  SessionNotReviewingError,
  SessionNotReadyError,
  SessionHasPendingLinesError,
  CancellationReasonRequiredError,
  ManualResolutionReasonRequiredError,
  LineAlreadyResolvedError,
  LineNotCountedYetError,
  LineLockedByAnotherUserError,
  AttemptDoesNotBelongToLineError,
  OverlappingSessionError,
  OverlapOverrideReasonRequiredError,
  InvalidCountedQuantityError,
  InvalidConversionFactorError,
  UnknownCountUnitError,
  StockItemNotEligibleError,
  ItemAlreadyInScopeError,
  LocationRequiredError,
  NoActiveLocationError,
} from "../../domain/errors.js";
import type {
  ListCountSessionsPort,
  GetCountSessionPort,
  CreateCountSessionPort,
  StartCountSessionPort,
  SubmitCountAttemptPort,
  RequestRecountPort,
  ResolveCountLinePort,
  FinishExecutionPort,
  MarkSessionReadyPort,
  ConfirmCountSessionPort,
  CancelCountSessionPort,
  AddUnscopedItemToSessionPort,
  ListCountZonesPort,
  CreateCountZonePort,
} from "../../domain/ports/in/stock-count.ports.js";

function handleError(e: unknown, res: import("express").Response): void {
  if (
    e instanceof StockCountSessionNotFoundError ||
    e instanceof StockCountLineNotFoundError ||
    e instanceof StockCountAttemptNotFoundError ||
    e instanceof StockCountZoneNotFoundError ||
    e instanceof StockItemNotFoundError
  ) {
    res.status(404).json({ error: e.message });
    return;
  }
  if (e instanceof StaleCountSessionVersionError || e instanceof StaleCountLineVersionError) {
    res.status(409).json({ error: e.message, currentVersion: e.currentVersion });
    return;
  }
  if (
    e instanceof SessionAlreadyCompletedError ||
    e instanceof SessionAlreadyCancelledError ||
    e instanceof SessionNotInDraftError ||
    e instanceof SessionNotCountingError ||
    e instanceof SessionNotReviewingError ||
    e instanceof SessionNotReadyError ||
    e instanceof SessionHasPendingLinesError ||
    e instanceof CancellationReasonRequiredError ||
    e instanceof ManualResolutionReasonRequiredError ||
    e instanceof LineAlreadyResolvedError ||
    e instanceof LineNotCountedYetError ||
    e instanceof LineLockedByAnotherUserError ||
    e instanceof AttemptDoesNotBelongToLineError ||
    e instanceof OverlappingSessionError ||
    e instanceof OverlapOverrideReasonRequiredError ||
    e instanceof InvalidCountedQuantityError ||
    e instanceof InvalidConversionFactorError ||
    e instanceof UnknownCountUnitError ||
    e instanceof StockItemNotEligibleError ||
    e instanceof ItemAlreadyInScopeError ||
    e instanceof LocationRequiredError ||
    e instanceof NoActiveLocationError
  ) {
    res.status(400).json({ error: e.message });
    return;
  }
  res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
}

/** `true` quando o pedido tenta uma ação reservada a `admin` mas o ator não o é (secção 64). */
function canConfirmCounts(req: import("express").Request): boolean {
  // Permissão especial `stock.count_confirm` (Utilizadores & Perfis 2.0; antes: só Admin).
  return !!req.access && can(req.access, "stock.count_confirm", "MANAGE");
}

export class StockCountController {
  readonly router: Router;

  constructor(
    private readonly listCountSessions: ListCountSessionsPort,
    private readonly getCountSession: GetCountSessionPort,
    private readonly createCountSession: CreateCountSessionPort,
    private readonly startCountSession: StartCountSessionPort,
    private readonly submitCountAttempt: SubmitCountAttemptPort,
    private readonly requestRecount: RequestRecountPort,
    private readonly resolveCountLine: ResolveCountLinePort,
    private readonly finishExecution: FinishExecutionPort,
    private readonly markSessionReady: MarkSessionReadyPort,
    private readonly confirmCountSession: ConfirmCountSessionPort,
    private readonly cancelCountSession: CancelCountSessionPort,
    private readonly addUnscopedItemToSession: AddUnscopedItemToSessionPort,
    private readonly listCountZones: ListCountZonesPort,
    private readonly createCountZone: CreateCountZonePort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    this.router.get("/stock-count/sessions", async (req, res) => {
      try {
        const { status, locationId, from, to } = req.query as Record<string, string | undefined>;
        const result = await this.listCountSessions.execute({
          organizationId: req.auth!.orgId,
          ...(status !== undefined && { status: status as never }),
          ...(locationId !== undefined && { locationId }),
          ...(from !== undefined && { from }),
          ...(to !== undefined && { to }),
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.get("/stock-count/sessions/:id", async (req, res) => {
      try {
        const result = await this.getCountSession.execute({ organizationId: req.auth!.orgId, sessionId: req.params["id"] as string });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/stock-count/sessions", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        const result = await this.createCountSession.execute({
          organizationId: req.auth!.orgId,
          locationId: (body.locationId as string | null | undefined) ?? null,
          type: body.type as never,
          scopeDefinition: (body.scopeDefinition as never) ?? {},
          businessDate: body.businessDate as string,
          actor: req.auth!.email,
        });
        res.status(201).json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/stock-count/sessions/:id/start", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (typeof body.expectedVersion !== "number") {
          res.status(400).json({ error: "expectedVersion é obrigatório" });
          return;
        }
        const overrideOverlap = Boolean(body.overrideOverlap);
        if (overrideOverlap && !canConfirmCounts(req)) {
          res.status(403).json({ error: "Só admin pode forçar o início apesar de sobreposição" });
          return;
        }
        const result = await this.startCountSession.execute({
          organizationId: req.auth!.orgId,
          sessionId: req.params["id"] as string,
          expectedVersion: body.expectedVersion,
          actor: req.auth!.email,
          overrideOverlap,
          overrideReason: (body.overrideReason as string | null | undefined) ?? null,
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/stock-count/lines/:id/attempts", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (typeof body.expectedVersion !== "number") {
          res.status(400).json({ error: "expectedVersion é obrigatório" });
          return;
        }
        const result = await this.submitCountAttempt.execute({
          organizationId: req.auth!.orgId,
          lineId: req.params["id"] as string,
          expectedLineVersion: body.expectedVersion,
          components: (body.components as never) ?? [],
          countStartedAt: body.countStartedAt as string,
          reason: (body.reason as string | null | undefined) ?? null,
          actor: req.auth!.email,
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/stock-count/lines/:id/request-recount", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (typeof body.expectedVersion !== "number") {
          res.status(400).json({ error: "expectedVersion é obrigatório" });
          return;
        }
        const result = await this.requestRecount.execute({
          organizationId: req.auth!.orgId,
          lineId: req.params["id"] as string,
          expectedVersion: body.expectedVersion,
          reason: (body.reason as string | null | undefined) ?? null,
          actor: req.auth!.email,
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/stock-count/lines/:id/resolve", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (typeof body.expectedVersion !== "number") {
          res.status(400).json({ error: "expectedVersion é obrigatório" });
          return;
        }
        const resolution = body.resolution as "select_attempt" | "manual_value";
        if (resolution === "manual_value" && !canConfirmCounts(req)) {
          res.status(403).json({ error: "Só admin pode definir um valor final manual" });
          return;
        }
        const result = await this.resolveCountLine.execute({
          organizationId: req.auth!.orgId,
          lineId: req.params["id"] as string,
          expectedVersion: body.expectedVersion,
          resolution,
          ...(body.selectedAttemptId !== undefined && { selectedAttemptId: body.selectedAttemptId as string }),
          ...(body.manualValue !== undefined && { manualValue: Number(body.manualValue) }),
          ...(body.manualReason !== undefined && { manualReason: body.manualReason as string }),
          actor: req.auth!.email,
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/stock-count/sessions/:id/finish-execution", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (typeof body.expectedVersion !== "number") {
          res.status(400).json({ error: "expectedVersion é obrigatório" });
          return;
        }
        const result = await this.finishExecution.execute({
          organizationId: req.auth!.orgId,
          sessionId: req.params["id"] as string,
          expectedVersion: body.expectedVersion,
          actor: req.auth!.email,
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/stock-count/sessions/:id/mark-ready", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (typeof body.expectedVersion !== "number") {
          res.status(400).json({ error: "expectedVersion é obrigatório" });
          return;
        }
        const result = await this.markSessionReady.execute({
          organizationId: req.auth!.orgId,
          sessionId: req.params["id"] as string,
          expectedVersion: body.expectedVersion,
          actor: req.auth!.email,
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/stock-count/sessions/:id/confirm", async (req, res) => {
      try {
        if (!canConfirmCounts(req)) {
          res.status(403).json({ error: "Só admin pode confirmar a contagem e ajustar o stock" });
          return;
        }
        const body = req.body as Record<string, unknown>;
        if (typeof body.expectedVersion !== "number") {
          res.status(400).json({ error: "expectedVersion é obrigatório" });
          return;
        }
        const result = await this.confirmCountSession.execute({
          organizationId: req.auth!.orgId,
          sessionId: req.params["id"] as string,
          expectedVersion: body.expectedVersion,
          actor: req.auth!.email,
          ...(body.businessDate !== undefined && { businessDate: body.businessDate as string }),
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/stock-count/sessions/:id/cancel", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (typeof body.reason !== "string" || body.reason.trim().length === 0) {
          res.status(400).json({ error: "reason é obrigatório" });
          return;
        }
        if (typeof body.expectedVersion !== "number") {
          res.status(400).json({ error: "expectedVersion é obrigatório" });
          return;
        }
        const result = await this.cancelCountSession.execute({
          organizationId: req.auth!.orgId,
          sessionId: req.params["id"] as string,
          reason: body.reason,
          expectedVersion: body.expectedVersion,
          actor: req.auth!.email,
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/stock-count/sessions/:id/unscoped-item", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        const result = await this.addUnscopedItemToSession.execute({
          organizationId: req.auth!.orgId,
          sessionId: req.params["id"] as string,
          ...(body.itemId !== undefined && { itemId: body.itemId as string }),
          ...(body.newItem !== undefined && { newItem: body.newItem as never }),
          actor: req.auth!.email,
        });
        res.status(201).json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.get("/stock-count/zones", async (req, res) => {
      try {
        const { locationId } = req.query as Record<string, string | undefined>;
        if (!locationId) {
          res.status(400).json({ error: "locationId é obrigatório" });
          return;
        }
        const result = await this.listCountZones.execute({ organizationId: req.auth!.orgId, locationId });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/stock-count/zones", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (typeof body.name !== "string" || body.name.trim().length === 0) {
          res.status(400).json({ error: "name é obrigatório" });
          return;
        }
        if (typeof body.locationId !== "string") {
          res.status(400).json({ error: "locationId é obrigatório" });
          return;
        }
        const result = await this.createCountZone.execute({
          organizationId: req.auth!.orgId,
          locationId: body.locationId,
          name: body.name,
          ...(body.sortOrder !== undefined && { sortOrder: Number(body.sortOrder) }),
        });
        res.status(201).json(result);
      } catch (e) {
        handleError(e, res);
      }
    });
  }
}
