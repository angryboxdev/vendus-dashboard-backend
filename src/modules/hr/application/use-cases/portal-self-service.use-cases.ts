import type { LocationRepositoryPort } from "../../../locations/domain/ports/out/location-repository.port.js";
import type { DocumentRepositoryPort } from "../../../documents/domain/ports/out/document-repository.port.js";
import type { DocumentCategoryRepositoryPort } from "../../../documents/domain/ports/out/document-category-repository.port.js";
import type { WorkShift } from "../../domain/entities/work-shift.js";
import { EmployeeDocumentNotFoundError, PortalBadRequestError, PortalResourceNotFoundError } from "../../domain/errors.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { LeaveReadPort } from "../../domain/ports/out/leave-read.port.js";
import type { PortalAccountPort } from "../../domain/ports/out/portal-account.port.js";
import type { PositionRepositoryPort } from "../../domain/ports/out/position-repository.port.js";
import type { WorkShiftRepositoryPort } from "../../domain/ports/out/work-shift-repository.port.js";
import type { GetEmployeeDocumentDownloadUrlPort } from "../../domain/ports/in/employee-document.ports.js";
import type {
  CoworkerDTO,
  GetMyDocumentUrlPort,
  GetMyLeavePort,
  ListMyCoworkersPort,
  ListMyDocumentsPort,
  ListMyShiftsPort,
  MyDocumentDTO,
  MyLeaveDTO,
  MyShiftDTO,
  PortalIdentity,
} from "../../domain/ports/in/portal-me.ports.js";
import { occurrenceOverlapsShift } from "../../domain/services/shift-recurrence.service.js";
import { resolvePortalEmployeeId } from "./portal-me.use-cases.js";
import { addDays } from "./schedule-shared.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";

/**
 * Portal do Colaborador — self-service (tickets 07–09). Tudo lido das
 * entidades do Hub (Turnos, Documentos, Ausências) — nada é copiado. O
 * colaborador é sempre o da sessão; um id de outro colaborador dá 404.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** Teto do período pedido de uma vez (o ecrã mostra semanas). */
export const MAX_MY_SHIFTS_DAYS = 62;

const dayNumber = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86_400_000;

/** Nome curto (primeiro + último nome) — o mesmo critério de "nome curto" do RH, sem apelidos do meio. */
export function coworkerShortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  if (parts.length <= 1) return cap(parts[0] ?? "");
  return `${cap(parts[0]!)} ${cap(parts[parts.length - 1]!)}`;
}

function hoursOf(s: WorkShift): string {
  const first = `${s.startTime}–${s.endTime}`;
  if (s.secondStartTime && s.secondEndTime) return `${first} · ${s.secondStartTime}–${s.secondEndTime}`;
  return first;
}

async function locationNames(locations: LocationRepositoryPort, organizationId: OrganizationId): Promise<Map<string, string>> {
  return new Map((await locations.findAllForOrganization(organizationId)).map((l) => [l.id, l.name]));
}

export class ListMyShiftsUseCase implements ListMyShiftsPort {
  constructor(
    private readonly accounts: PortalAccountPort,
    private readonly workShifts: WorkShiftRepositoryPort,
    private readonly locations: LocationRepositoryPort,
  ) {}

  /** Só turnos **publicados** do próprio (os rascunhos o colaborador ainda não vê). */
  async execute(identity: PortalIdentity, from: string, to: string): Promise<MyShiftDTO[]> {
    if (!ISO.test(from) || !ISO.test(to) || from > to) throw new PortalBadRequestError("Período inválido");
    if (dayNumber(to) - dayNumber(from) + 1 > MAX_MY_SHIFTS_DAYS) throw new PortalBadRequestError(`Período máximo: ${MAX_MY_SHIFTS_DAYS} dias`);
    const employeeId = await resolvePortalEmployeeId(this.accounts, identity);
    const [shifts, names] = await Promise.all([
      this.workShifts.findInRange(identity.organizationId, { from, to, employeeId, status: "published" }),
      locationNames(this.locations, identity.organizationId),
    ]);
    return shifts
      .sort((a, b) => (a.workDate === b.workDate ? a.startTime.localeCompare(b.startTime) : a.workDate.localeCompare(b.workDate)))
      .map((s) => ({
        id: s.id,
        workDate: s.workDate,
        startTime: s.startTime,
        endTime: s.endTime,
        endsNextDay: s.endsNextDay,
        secondStartTime: s.secondStartTime,
        secondEndTime: s.secondEndTime,
        locationId: s.locationId,
        locationName: names.get(s.locationId) ?? "",
      }));
  }
}

/**
 * Quem trabalha comigo (task §19): mesmo Local e horário sobreposto (inclui
 * noturnos de dias vizinhos), só turnos publicados. Devolve apenas nome
 * curto, cargo e horário — nunca contactos, NIF, assiduidade ou ids.
 */
export class ListMyCoworkersUseCase implements ListMyCoworkersPort {
  constructor(
    private readonly accounts: PortalAccountPort,
    private readonly workShifts: WorkShiftRepositoryPort,
    private readonly employees: EmployeeRepositoryPort,
    private readonly positions: PositionRepositoryPort,
  ) {}

  async execute(identity: PortalIdentity, shiftId: string): Promise<CoworkerDTO[]> {
    const org = identity.organizationId;
    const employeeId = await resolvePortalEmployeeId(this.accounts, identity);
    const mine = await this.workShifts.findById(org, shiftId);
    if (!mine || mine.employeeId !== employeeId || mine.status !== "published") throw new PortalResourceNotFoundError("Turno");

    const nearby = await this.workShifts.findInRange(org, { from: addDays(mine.workDate, -1), to: addDays(mine.workDate, 1), locationId: mine.locationId, status: "published" });
    const occurrence = { workDate: mine.workDate, weekday: 0 as const, segments: mine.segments, endsNextDay: mine.endsNextDay };
    const overlapping = nearby.filter((s) => s.employeeId !== employeeId && occurrenceOverlapsShift(occurrence, s));
    if (overlapping.length === 0) return [];

    const positions = new Map((await this.positions.findAll(org)).map((p) => [p.id, p.name]));
    const result: Array<CoworkerDTO & { sort: string }> = [];
    for (const s of overlapping) {
      const e = await this.employees.findById(org, s.employeeId);
      if (!e || e.status !== "active") continue;
      result.push({ shortName: coworkerShortName(e.fullName), positionName: e.positionId ? (positions.get(e.positionId) ?? null) : null, hours: hoursOf(s), sort: `${s.workDate}${s.startTime}` });
    }
    return result.sort((a, b) => a.sort.localeCompare(b.sort) || a.shortName.localeCompare(b.shortName, "pt")).map(({ sort: _s, ...c }) => c);
  }
}

/** Documentos do próprio (motor documental existente) — versões atuais, sem removidos/rejeitados. Recibos = categorias com período. */
export class ListMyDocumentsUseCase implements ListMyDocumentsPort {
  constructor(
    private readonly accounts: PortalAccountPort,
    private readonly documents: DocumentRepositoryPort,
    private readonly categories: DocumentCategoryRepositoryPort,
  ) {}

  async execute(identity: PortalIdentity): Promise<MyDocumentDTO[]> {
    const org = identity.organizationId;
    const employeeId = await resolvePortalEmployeeId(this.accounts, identity);
    const [docs, cats] = await Promise.all([this.documents.findCurrentByOwners(org, "employee", [employeeId]), this.categories.findMany(org)]);
    const bySlug = new Map(cats.map((c) => [c.slug, c]));
    return docs
      .filter((d) => d.status !== "removed" && d.status !== "rejected")
      .map((d) => {
        const cat = bySlug.get(d.category);
        return {
          id: d.id,
          categoryLabel: cat?.label ?? d.category,
          fileName: d.fileName,
          period: d.period,
          isPayslip: cat?.requiresPeriod === true,
          issuedAt: d.issuedAt,
          expiresAt: d.expiresAt,
          uploadedAt: d.uploadedAt,
        };
      })
      .sort((a, b) => (b.period ?? "").localeCompare(a.period ?? "") || b.uploadedAt.localeCompare(a.uploadedAt));
  }
}

/** Download pelo mecanismo seguro existente (URL assinada de curta duração), sempre com o colaborador da sessão. */
export class GetMyDocumentUrlUseCase implements GetMyDocumentUrlPort {
  constructor(
    private readonly accounts: PortalAccountPort,
    private readonly getDownloadUrl: GetEmployeeDocumentDownloadUrlPort,
  ) {}

  async execute(identity: PortalIdentity, documentId: string): Promise<{ url: string }> {
    const employeeId = await resolvePortalEmployeeId(this.accounts, identity);
    try {
      return await this.getDownloadUrl.execute({ organizationId: identity.organizationId, employeeId, documentId });
    } catch (e) {
      if (e instanceof EmployeeDocumentNotFoundError) throw new PortalResourceNotFoundError("Documento");
      throw e;
    }
  }
}

/** Ausências do próprio, só consulta (sem saldo de férias nem feriados — decisão do produto). */
export class GetMyLeaveUseCase implements GetMyLeavePort {
  constructor(
    private readonly accounts: PortalAccountPort,
    private readonly leaves: LeaveReadPort,
  ) {}

  async execute(identity: PortalIdentity, year: number): Promise<MyLeaveDTO> {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new PortalBadRequestError("Ano inválido");
    const employeeId = await resolvePortalEmployeeId(this.accounts, identity);
    const entries = await this.leaves.findForEmployee(identity.organizationId, employeeId, `${year}-01-01`, `${year}-12-31`);
    return { year, entries: entries.map((e) => ({ id: e.id, type: e.type, startDate: e.startDate, endDate: e.endDate, workingDays: e.workingDays })) };
  }
}
