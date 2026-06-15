import { Router } from "express";
import type { Request, Response } from "express";
import { requireAuth, requireMinRole } from "../../../../middleware/auth.js";
import type { DrawerDenominations } from "../../domain/entities/cash-closing.js";
import type { VerifyPinPort } from "../../domain/ports/in/verify-pin.port.js";
import type { SubmitClosingPort } from "../../domain/ports/in/submit-closing.port.js";
import type { ListClosingsPort } from "../../domain/ports/in/list-closings.port.js";
import type { GetClosingPort } from "../../domain/ports/in/get-closing.port.js";
import type { ReviewClosingPort } from "../../domain/ports/in/review-closing.port.js";
import type { GetAvailableSessionsPort } from "../../domain/ports/in/get-available-sessions.port.js";
import type { CashClosingStatus } from "../../domain/entities/cash-closing.js";
import {
  ClosingNotFoundError,
  DuplicateClosingError,
  EmployeeNotFoundError,
  InvalidPinError,
} from "../../domain/errors.js";

function jsonError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

function toNum(v: unknown, name: string): number {
  const n = Number(v);
  if (isNaN(n) || n < 0) throw new Error(`${name} inválido`);
  return Math.round(n * 100) / 100;
}

export class CashClosingController {
  readonly publicRouter: Router;
  readonly managedRouter: Router;

  constructor(
    private readonly verifyPin: VerifyPinPort,
    private readonly submitClosing: SubmitClosingPort,
    private readonly listClosings: ListClosingsPort,
    private readonly getClosing: GetClosingPort,
    private readonly reviewClosing: ReviewClosingPort,
    private readonly getAvailableSessions: GetAvailableSessionsPort,
  ) {
    this.publicRouter = Router();
    this.managedRouter = Router();
    this.registerPublicRoutes();
    this.registerManagedRoutes();
  }

  private registerPublicRoutes(): void {
    /** POST /api/cash-closings/verify-pin */
    this.publicRouter.post(
      "/cash-closings/verify-pin",
      async (req: Request, res: Response) => {
        try {
          const { pin } = req.body as { pin?: string };
          if (!pin || typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
            jsonError(res, 400, "PIN inválido (4 dígitos)");
            return;
          }
          const result = await this.verifyPin.execute({ pin });
          res.json(result);
        } catch (e: unknown) {
          if (e instanceof InvalidPinError) {
            jsonError(res, 401, e.message);
            return;
          }
          const msg = e instanceof Error ? e.message : "Erro interno";
          res.status(500).json({ error: msg });
        }
      },
    );

    /** POST /api/cash-closings/submit */
    this.publicRouter.post(
      "/cash-closings/submit",
      async (req: Request, res: Response) => {
        try {
          const b = req.body as Record<string, unknown>;
          const {
            employeeId,
            closingDate,
            tpa,
            uber,
            glovo,
            bolt,
            eatz,
            cashSales,
            cashIn,
            cashOut,
            cashDrawerOpen,
            cashDrawerTotal,
            notes,
            sessionOpenedAt,
            drawerDenominations,
          } = b;

          if (!employeeId || typeof employeeId !== "string") {
            jsonError(res, 400, "employeeId obrigatório");
            return;
          }
          if (
            !closingDate ||
            typeof closingDate !== "string" ||
            !/^\d{4}-\d{2}-\d{2}$/.test(closingDate)
          ) {
            jsonError(res, 400, "closingDate inválido (YYYY-MM-DD)");
            return;
          }

          const closing = await this.submitClosing.execute({
            employeeId,
            closingDate,
            tpa: toNum(tpa, "tpa"),
            uber: toNum(uber, "uber"),
            glovo: toNum(glovo, "glovo"),
            bolt: toNum(bolt, "bolt"),
            eatz: toNum(eatz, "eatz"),
            cashSales: toNum(cashSales, "cashSales"),
            cashIn: toNum(cashIn, "cashIn"),
            cashOut: toNum(cashOut, "cashOut"),
            cashDrawerOpen: toNum(cashDrawerOpen, "cashDrawerOpen"),
            cashDrawerTotal: toNum(cashDrawerTotal, "cashDrawerTotal"),
            notes: typeof notes === "string" ? notes.trim() || null : null,
            sessionOpenedAt:
              typeof sessionOpenedAt === "string" ? sessionOpenedAt : null,
            drawerDenominations:
              drawerDenominations != null && typeof drawerDenominations === "object"
                ? (drawerDenominations as DrawerDenominations)
                : null,
          });

          res.status(201).json(closing);
        } catch (e: unknown) {
          if (e instanceof EmployeeNotFoundError) {
            jsonError(res, 404, e.message);
            return;
          }
          if (e instanceof DuplicateClosingError) {
            jsonError(res, 409, e.message);
            return;
          }
          const msg = e instanceof Error ? e.message : "Erro interno";
          const status = msg.includes("inválido") ? 400 : 500;
          res.status(status).json({ error: msg });
        }
      },
    );

    /** GET /api/cash-closings/sessions?date=YYYY-MM-DD */
    this.publicRouter.get(
      "/cash-closings/sessions",
      async (req: Request, res: Response) => {
        try {
          const date = req.query.date as string | undefined;
          if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            jsonError(res, 400, "date obrigatório (YYYY-MM-DD)");
            return;
          }
          const sessions = await this.getAvailableSessions.execute({ date });
          res.json(sessions);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Erro interno";
          res.status(500).json({ error: msg });
        }
      },
    );

  }

  private registerManagedRoutes(): void {
    /** GET /api/cash-closings */
    this.managedRouter.get(
      "/cash-closings",
      requireAuth,
      requireMinRole("manager"),
      async (req: Request, res: Response) => {
        try {
          const { date, from, to, status, employeeId, limit, offset } =
            req.query as Record<string, string | undefined>;

          const result = await this.listClosings.execute({
            date,
            from,
            to,
            status: status as CashClosingStatus | undefined,
            employeeId,
            limit: limit ? Number(limit) : 50,
            offset: offset ? Number(offset) : 0,
          });

          res.json(result);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Erro interno";
          res.status(500).json({ error: msg });
        }
      },
    );

    /** GET /api/cash-closings/:id */
    this.managedRouter.get(
      "/cash-closings/:id",
      requireAuth,
      requireMinRole("manager"),
      async (req: Request, res: Response) => {
        try {
          const closing = await this.getClosing.execute({
            id: req.params.id as string,
          });
          res.json(closing);
        } catch (e: unknown) {
          if (e instanceof ClosingNotFoundError) {
            jsonError(res, 404, e.message);
            return;
          }
          const msg = e instanceof Error ? e.message : "Erro interno";
          res.status(500).json({ error: msg });
        }
      },
    );

    /** PATCH /api/cash-closings/:id */
    this.managedRouter.patch(
      "/cash-closings/:id",
      requireAuth,
      requireMinRole("manager"),
      async (req: Request, res: Response) => {
        try {
          const b = req.body as Record<string, unknown>;
          const updated = await this.reviewClosing.execute({
            id: req.params.id as string,
            status: b.status != null ? (b.status as CashClosingStatus) : undefined,
            managerNotes:
              "managerNotes" in b ? (b.managerNotes as string | null) : undefined,
            notes: "notes" in b ? (b.notes as string | null) : undefined,
            tpa: b.tpa != null ? Number(b.tpa) : undefined,
            uber: b.uber != null ? Number(b.uber) : undefined,
            glovo: b.glovo != null ? Number(b.glovo) : undefined,
            bolt: b.bolt != null ? Number(b.bolt) : undefined,
            eatz: b.eatz != null ? Number(b.eatz) : undefined,
            cashSales: b.cashSales != null ? Number(b.cashSales) : undefined,
            cashIn: b.cashIn != null ? Number(b.cashIn) : undefined,
            cashOut: b.cashOut != null ? Number(b.cashOut) : undefined,
            cashDrawerOpen:
              b.cashDrawerOpen != null ? Number(b.cashDrawerOpen) : undefined,
            cashDrawerTotal:
              b.cashDrawerTotal != null ? Number(b.cashDrawerTotal) : undefined,
          });
          res.json(updated);
        } catch (e: unknown) {
          if (e instanceof ClosingNotFoundError) {
            jsonError(res, 404, e.message);
            return;
          }
          const msg = e instanceof Error ? e.message : "Erro interno";
          res.status(500).json({ error: msg });
        }
      },
    );
  }
}
