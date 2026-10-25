import { Router } from "express";
import {
  StockPurchaseReviewNotFoundError,
  InvalidReviewLineResolutionError,
  InvalidConversionFactorError,
  InactiveStockItemReferencedError,
  ReviewNotReadyError,
  StaleReviewVersionError,
  StaleInvoiceSnapshotError,
  ReviewAlreadyAppliedError,
  ReviewAlreadyCancelledError,
  CancellationReasonRequiredError,
  LocationRequiredError,
  DocumentNotReconciledError,
  ReviewNotCancelledError,
} from "../../domain/errors.js";
import type {
  ListStockPurchaseReviewsPort,
  GetStockPurchaseReviewPort,
  ResolveReviewLinePort,
  DecideUnresolvedReviewPort,
  SuggestReviewMappingsPort,
  RestoreStockPurchaseReviewPort,
  SuggestLineMappingPort,
  ConfirmStockPurchaseReviewPort,
  CancelStockPurchaseReviewPort,
  CancelEmptyStockPurchaseReviewsPort,
} from "../../domain/ports/in/stock-purchase-review.ports.js";

function handleError(e: unknown, res: import("express").Response): void {
  if (e instanceof StockPurchaseReviewNotFoundError) {
    res.status(404).json({ error: e.message });
    return;
  }
  if (e instanceof DocumentNotReconciledError) {
    res.status(422).json({ error: e.message, code: "document_not_reconciled", netDifferenceCents: e.netDifferenceCents, vatDifferenceCents: e.vatDifferenceCents });
    return;
  }
  if (e instanceof StaleReviewVersionError) {
    res.status(409).json({ error: e.message, currentVersion: e.currentVersion });
    return;
  }
  if (
    e instanceof InvalidReviewLineResolutionError ||
    e instanceof InvalidConversionFactorError ||
    e instanceof InactiveStockItemReferencedError ||
    e instanceof ReviewNotReadyError ||
    e instanceof StaleInvoiceSnapshotError ||
    e instanceof ReviewAlreadyAppliedError ||
    e instanceof ReviewAlreadyCancelledError ||
    e instanceof CancellationReasonRequiredError ||
    e instanceof LocationRequiredError ||
    e instanceof ReviewNotCancelledError
  ) {
    res.status(400).json({ error: e.message });
    return;
  }
  res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
}

export class StockPurchaseReviewController {
  readonly router: Router;

  constructor(
    private readonly listStockPurchaseReviews: ListStockPurchaseReviewsPort,
    private readonly getStockPurchaseReview: GetStockPurchaseReviewPort,
    private readonly resolveReviewLine: ResolveReviewLinePort,
    private readonly decideUnresolvedReview: DecideUnresolvedReviewPort,
    private readonly suggestLineMapping: SuggestLineMappingPort,
    private readonly confirmStockPurchaseReview: ConfirmStockPurchaseReviewPort,
    private readonly cancelStockPurchaseReview: CancelStockPurchaseReviewPort,
    private readonly cancelEmptyStockPurchaseReviews: CancelEmptyStockPurchaseReviewsPort,
    private readonly suggestReviewMappings: SuggestReviewMappingsPort,
    private readonly restoreStockPurchaseReview: RestoreStockPurchaseReviewPort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    // Antes de `/:id` — literal, nunca ambíguo com o `GetStockPurchaseReviewPort`
    // (métodos diferentes), mas mantido primeiro por clareza.
    this.router.post("/stock-purchase-reviews/cancel-empty", async (req, res) => {
      try {
        const result = await this.cancelEmptyStockPurchaseReviews.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.get("/stock-purchase-reviews", async (req, res) => {
      try {
        const { status, supplierId, from, to, search, view } = req.query as Record<string, string | undefined>;
        const result = await this.listStockPurchaseReviews.execute({
          organizationId: req.auth!.orgId,
          ...((view === "active" || view === "history") && { view }),
          ...(status !== undefined && { status: status as never }),
          ...(supplierId !== undefined && { supplierId }),
          ...(from !== undefined && { from }),
          ...(to !== undefined && { to }),
          ...(search !== undefined && { search }),
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.get("/stock-purchase-reviews/:id", async (req, res) => {
      try {
        const result = await this.getStockPurchaseReview.execute({
          organizationId: req.auth!.orgId,
          id: req.params["id"] as string,
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/stock-purchase-reviews/:id/lines/:lineId/resolve", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (typeof body.expectedVersion !== "number") {
          res.status(400).json({ error: "expectedVersion é obrigatório" });
          return;
        }
        const result = await this.resolveReviewLine.execute({
          organizationId: req.auth!.orgId,
          reviewId: req.params["id"] as string,
          lineId: req.params["lineId"] as string,
          expectedVersion: body.expectedVersion,
          resolution: body.resolution as "existing_item" | "new_item" | "no_stock_effect",
          stockItemId: (body.stockItemId as string | null | undefined) ?? null,
          ...(body.newItem !== undefined && {
            newItem: body.newItem as { name: string; categoryId: string; type: string; baseUnit: string },
          }),
          ...(body.conversionFactor !== undefined && { conversionFactor: Number(body.conversionFactor) }),
          locationId: (body.locationId as string | null | undefined) ?? null,
          ...(Array.isArray(body.locationSplits) && {
            locationSplits: (body.locationSplits as Array<Record<string, unknown>>).map((sp) => ({
              locationId: String(sp.locationId),
              purchaseQuantity: Number(sp.purchaseQuantity),
            })),
          }),
          actor: req.auth!.email,
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.get("/stock-purchase-reviews/:id/lines/:lineId/suggestion", async (req, res) => {
      try {
        const result = await this.suggestLineMapping.execute({
          organizationId: req.auth!.orgId,
          reviewId: req.params["id"] as string,
          lineId: req.params["lineId"] as string,
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/stock-purchase-reviews/:id/decide-unresolved", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (typeof body.expectedVersion !== "number") {
          res.status(400).json({ error: "expectedVersion é obrigatório" });
          return;
        }
        const result = await this.decideUnresolvedReview.execute({
          organizationId: req.auth!.orgId,
          reviewId: req.params["id"] as string,
          outcome: body.outcome as "create" | "skip",
          actor: req.auth!.email,
          expectedVersion: body.expectedVersion,
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/stock-purchase-reviews/:id/confirm", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (typeof body.expectedVersion !== "number") {
          res.status(400).json({ error: "expectedVersion é obrigatório" });
          return;
        }
        const result = await this.confirmStockPurchaseReview.execute({
          organizationId: req.auth!.orgId,
          id: req.params["id"] as string,
          expectedVersion: body.expectedVersion,
          actor: req.auth!.email,
          ...(body.effectiveDate !== undefined && { effectiveDate: body.effectiveDate as string }),
          ...(body.locationId !== undefined && { locationId: body.locationId as string | null }),
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/stock-purchase-reviews/:id/suggestions", async (req, res) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const result = await this.suggestReviewMappings.execute({
          organizationId: req.auth!.orgId,
          reviewId: req.params["id"] as string,
          refresh: body.refresh === true,
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/stock-purchase-reviews/:id/restore", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (typeof body.expectedVersion !== "number") {
          res.status(400).json({ error: "expectedVersion é obrigatório" });
          return;
        }
        const result = await this.restoreStockPurchaseReview.execute({
          organizationId: req.auth!.orgId,
          id: req.params["id"] as string,
          actor: req.auth!.email,
          expectedVersion: body.expectedVersion,
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/stock-purchase-reviews/:id/cancel", async (req, res) => {
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
        const result = await this.cancelStockPurchaseReview.execute({
          organizationId: req.auth!.orgId,
          id: req.params["id"] as string,
          reason: body.reason,
          actor: req.auth!.email,
          expectedVersion: body.expectedVersion,
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });
  }
}
