import { Router, type Request, type Response } from "express";
import { InvalidAbsenceError, type AbsenceDuration } from "../../domain/entities/absence.js";
import { PortalResourceNotFoundError } from "../../domain/errors.js";
import type {
  CancelAbsencePort,
  GetAbsenceBoardPort,
  ListLeaveBalancesPort,
  PreviewAbsencePort,
  RegisterAbsenceCommand,
  RegisterAbsencePort,
  SetLeaveBalancePort,
} from "../../domain/ports/in/absences.ports.js";
import type { LeaveType } from "../../domain/ports/out/leave-read.port.js";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DURATIONS = new Set<AbsenceDuration>(["day", "half_day", "hours"]);

function handleError(e: unknown, res: Response): void {
  if (e instanceof InvalidAbsenceError) {
    res.status(400).json({ error: e.message });
    return;
  }
  if (e instanceof PortalResourceNotFoundError) {
    res.status(404).json({ error: e.message });
    return;
  }
  res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
}

function readCommand(req: Request): RegisterAbsenceCommand {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  if (!str(b.employeeId)) throw new InvalidAbsenceError("Escolha o colaborador.");
  const duration = (str(b.duration) ?? "day") as AbsenceDuration;
  if (!DURATIONS.has(duration)) throw new InvalidAbsenceError("Duração inválida.");
  return {
    organizationId: req.auth!.orgId,
    actor: req.auth!.email,
    employeeId: b.employeeId as string,
    type: str(b.type) as LeaveType,
    duration,
    startDate: str(b.startDate) ?? "",
    endDate: str(b.endDate) ?? str(b.startDate) ?? "",
    startTime: str(b.startTime),
    endTime: str(b.endTime),
    notes: str(b.notes),
  };
}

/**
 * Férias & Ausências 2.0 — debaixo de `/api/hr/leave` (já classificado em
 * `hr.leave`: GET = ver, resto = gerir). As rotas legacy do mesmo prefixo
 * (`/leave/holidays`, `/leave/overview`) continuam como estavam.
 */
export class HrAbsencesController {
  readonly router: Router;

  constructor(
    private readonly board: GetAbsenceBoardPort,
    private readonly preview: PreviewAbsencePort,
    private readonly register: RegisterAbsencePort,
    private readonly cancel: CancelAbsencePort,
    private readonly listBalances: ListLeaveBalancesPort,
    private readonly setBalance: SetLeaveBalancePort,
  ) {
    this.router = Router();

    /** GET /api/hr/leave/balances?year — separador "Saldos". */
    this.router.get("/hr/leave/balances", async (req, res) => {
      try {
        const year = Number(req.query.year);
        if (!Number.isInteger(year)) {
          res.status(400).json({ error: "year inválido" });
          return;
        }
        res.json(await this.listBalances.execute({ organizationId: req.auth!.orgId, year }));
      } catch (e) {
        handleError(e, res);
      }
    });

    /** PUT /api/hr/leave/balances/:employeeId/:year { daysEntitled, daysCarriedOver } */
    this.router.put("/hr/leave/balances/:employeeId/:year", async (req, res) => {
      try {
        const b = (req.body ?? {}) as Record<string, unknown>;
        await this.setBalance.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          employeeId: req.params.employeeId as string,
          year: Number(req.params.year),
          daysEntitled: Number(b.daysEntitled),
          daysCarriedOver: Number(b.daysCarriedOver ?? 0),
        });
        res.json({ saved: true });
      } catch (e) {
        handleError(e, res);
      }
    });

    /** GET /api/hr/leave/board?from&to — Calendário + Registos + "Requer atenção". */
    this.router.get("/hr/leave/board", async (req, res) => {
      try {
        const from = String(req.query.from ?? "");
        const to = String(req.query.to ?? "");
        if (!ISO.test(from) || !ISO.test(to) || from > to) {
          res.status(400).json({ error: "from/to inválidos" });
          return;
        }
        res.json(await this.board.execute({ organizationId: req.auth!.orgId, from, to }));
      } catch (e) {
        handleError(e, res);
      }
    });

    /** POST /api/hr/leave/absences/preview — "Impacto" antes de registar (não grava nada). */
    this.router.post("/hr/leave/absences/preview", async (req, res) => {
      try {
        res.json(await this.preview.execute(readCommand(req)));
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/hr/leave/absences", async (req, res) => {
      try {
        res.status(201).json(await this.register.execute(readCommand(req)));
      } catch (e) {
        handleError(e, res);
      }
    });

    /** POST /api/hr/leave/absences/:id/cancel { reason } — nunca apaga, fica no histórico. */
    this.router.post("/hr/leave/absences/:id/cancel", async (req, res) => {
      try {
        const reason = typeof req.body?.reason === "string" ? req.body.reason : "";
        await this.cancel.execute({ organizationId: req.auth!.orgId, actor: req.auth!.email, id: req.params.id as string, reason });
        res.json({ cancelled: true });
      } catch (e) {
        handleError(e, res);
      }
    });
  }
}
