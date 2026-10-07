import { randomUUID } from "crypto";
import { PortalRequest, REQUEST_REASONS, type PortalRequestKind } from "../../domain/entities/portal-request.js";
import { PortalBadRequestError, PortalResourceNotFoundError, RequestNotAllowedError } from "../../domain/errors.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type { HrFileStoragePort } from "../../domain/ports/out/hr-file-storage.port.js";
import type { LeaveWritePort } from "../../domain/ports/out/leave-write.port.js";
import type { PortalAccountPort } from "../../domain/ports/out/portal-account.port.js";
import type { PortalRequestRepositoryPort } from "../../domain/ports/out/portal-request-repository.port.js";
import type { WorkShiftRepositoryPort } from "../../domain/ports/out/work-shift-repository.port.js";
import type { PortalIdentity } from "../../domain/ports/in/portal-me.ports.js";
import type {
  CancelMyRequestPort,
  CreateMyRequestCommand,
  CreateMyRequestPort,
  DecidePortalRequestCommand,
  DecidePortalRequestPort,
  GetRequestAttachmentUrlPort,
  InboxRequestDTO,
  ListInboxRequestsPort,
  ListMyRequestsPort,
  MyRequestDTO,
} from "../../domain/ports/in/portal-requests.ports.js";
import { resolvePortalEmployeeId } from "./portal-me.use-cases.js";
import { DOCUMENT_SIGNED_URL_TTL_SECONDS } from "./shared.js";

/**
 * Portal do Colaborador — pedidos (ticket 12). Justificar falta → decide o
 * RH; pedir folga → decide o gerente. Aprovar cria a ausência (tipo
 * "justificada" ou "ausência autorizada"); a escala nunca é alterada
 * automaticamente. O colaborador é sempre o da sessão.
 */

const ATTACHMENT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const MY_REQUESTS_LIMIT = 50;

export function toMyRequestDTO(r: PortalRequest): MyRequestDTO {
  const p = r.toProps();
  return {
    id: p.id,
    kind: p.kind,
    status: p.status,
    workShiftId: p.workShiftId,
    startDate: p.startDate,
    endDate: p.endDate,
    reasonLabel: REQUEST_REASONS[p.kind][p.reasonCode] ?? p.reasonCode,
    reasonText: p.reasonText,
    attachmentName: p.attachment?.name ?? null,
    decisionNote: p.decisionNote,
    decidedAt: p.decidedAt,
    createdAt: p.createdAt,
  };
}

export class CreateMyRequestUseCase implements CreateMyRequestPort {
  constructor(
    private readonly accounts: PortalAccountPort,
    private readonly workShifts: WorkShiftRepositoryPort,
    private readonly requests: PortalRequestRepositoryPort,
    private readonly storage: HrFileStoragePort,
    private readonly auditLog: HrAuditLogPort,
    private readonly today: () => string,
  ) {}

  async execute(command: CreateMyRequestCommand): Promise<MyRequestDTO> {
    const org = command.organizationId;
    const employeeId = await resolvePortalEmployeeId(this.accounts, command);
    const today = this.today();
    const existing = await this.requests.findForEmployee(org, employeeId, MY_REQUESTS_LIMIT);

    let request: PortalRequest;
    let storedPath: string | null = null;
    if (command.kind === "justify_absence") {
      const shift = await this.workShifts.findById(org, command.workShiftId);
      if (!shift || shift.employeeId !== employeeId || shift.status !== "published") throw new PortalResourceNotFoundError("Turno");
      if (existing.some((r) => r.kind === "justify_absence" && r.workShiftId === shift.id && r.isOpen)) {
        throw new PortalBadRequestError("Já existe um pedido para este turno.");
      }
      let attachment = null;
      if (command.attachment) {
        if (!ATTACHMENT_MIME_TYPES.includes(command.attachment.mimeType)) throw new PortalBadRequestError("O anexo tem de ser PDF ou foto (JPG/PNG).");
        storedPath = await this.storage.store("document", command.attachment.buffer, command.attachment.filename, command.attachment.mimeType, org);
        attachment = { path: storedPath, name: command.attachment.filename, mime: command.attachment.mimeType };
      }
      request = PortalRequest.justifyAbsence({
        employeeId,
        workShiftId: shift.id,
        workDate: shift.workDate,
        reasonCode: command.reasonCode,
        reasonText: command.reasonText,
        attachment,
        today,
      });
    } else {
      request = PortalRequest.dayOff({ employeeId, startDate: command.startDate, endDate: command.endDate, reasonCode: command.reasonCode, reasonText: command.reasonText, today });
      if (existing.some((r) => r.kind === "day_off" && r.isOpen && r.overlaps(request.startDate, request.endDate))) {
        throw new PortalBadRequestError("Já tem um pedido de folga para estes dias.");
      }
    }

    const saved = await this.requests.create(org, request).catch(async (e) => {
      if (storedPath) await this.storage.remove("document", storedPath, org).catch(() => {});
      throw e;
    });
    await this.auditLog.record({
      organizationId: org,
      actor: command.actor,
      entityType: "portal_request",
      entityId: saved.id,
      employeeId,
      action: "created",
      description: saved.kind === "justify_absence" ? `Pedido de justificação de falta (${saved.startDate})` : `Pedido de folga (${saved.startDate}${saved.endDate !== saved.startDate ? ` a ${saved.endDate}` : ""})`,
      after: saved.toProps(),
      correlationId: randomUUID(),
    });
    return toMyRequestDTO(saved);
  }
}

export class ListMyRequestsUseCase implements ListMyRequestsPort {
  constructor(
    private readonly accounts: PortalAccountPort,
    private readonly requests: PortalRequestRepositoryPort,
  ) {}

  async execute(identity: PortalIdentity): Promise<MyRequestDTO[]> {
    const employeeId = await resolvePortalEmployeeId(this.accounts, identity);
    return (await this.requests.findForEmployee(identity.organizationId, employeeId, MY_REQUESTS_LIMIT)).map(toMyRequestDTO);
  }
}

export class CancelMyRequestUseCase implements CancelMyRequestPort {
  constructor(
    private readonly accounts: PortalAccountPort,
    private readonly requests: PortalRequestRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(identity: PortalIdentity, requestId: string): Promise<MyRequestDTO> {
    const employeeId = await resolvePortalEmployeeId(this.accounts, identity);
    const request = await this.requests.findById(identity.organizationId, requestId);
    if (!request || request.employeeId !== employeeId) throw new PortalResourceNotFoundError("Pedido");
    const saved = await this.requests.update(identity.organizationId, request.cancel());
    await this.auditLog.record({
      organizationId: identity.organizationId,
      actor: identity.actor,
      entityType: "portal_request",
      entityId: saved.id,
      employeeId,
      action: "cancelled",
      description: "Pedido cancelado pelo colaborador",
      before: request.toProps(),
      after: saved.toProps(),
      correlationId: randomUUID(),
    });
    return toMyRequestDTO(saved);
  }
}

async function toInboxDTO(
  r: PortalRequest,
  employees: EmployeeRepositoryPort,
  workShifts: WorkShiftRepositoryPort,
  organizationId: PortalIdentity["organizationId"],
): Promise<InboxRequestDTO> {
  const [employee, shift] = await Promise.all([
    employees.findById(organizationId, r.employeeId),
    r.workShiftId ? workShifts.findById(organizationId, r.workShiftId) : Promise.resolve(null),
  ]);
  return {
    ...toMyRequestDTO(r),
    employeeId: r.employeeId,
    employeeName: employee?.fullName ?? r.employeeId,
    shiftHours: shift ? `${shift.startTime}–${shift.endTime}${shift.secondStartTime ? ` · ${shift.secondStartTime}–${shift.secondEndTime}` : ""}` : null,
  };
}

export class ListInboxRequestsUseCase implements ListInboxRequestsPort {
  constructor(
    private readonly requests: PortalRequestRepositoryPort,
    private readonly employees: EmployeeRepositoryPort,
    private readonly workShifts: WorkShiftRepositoryPort,
  ) {}

  async execute(command: { organizationId: PortalIdentity["organizationId"]; kinds: PortalRequestKind[] }): Promise<InboxRequestDTO[]> {
    if (command.kinds.length === 0) return [];
    const pending = await this.requests.findPending(command.organizationId, command.kinds);
    const result: InboxRequestDTO[] = [];
    for (const r of pending) result.push(await toInboxDTO(r, this.employees, this.workShifts, command.organizationId));
    return result;
  }
}

export class DecidePortalRequestUseCase implements DecidePortalRequestPort {
  constructor(
    private readonly requests: PortalRequestRepositoryPort,
    private readonly leaveWrite: LeaveWritePort,
    private readonly employees: EmployeeRepositoryPort,
    private readonly workShifts: WorkShiftRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(command: DecidePortalRequestCommand): Promise<InboxRequestDTO> {
    const org = command.organizationId;
    const request = await this.requests.findById(org, command.requestId);
    if (!request) throw new PortalResourceNotFoundError("Pedido");
    if (!command.allowedKinds.includes(request.kind)) throw new RequestNotAllowedError();

    let decided: PortalRequest;
    if (command.decision === "approve") {
      const p = request.toProps();
      // A aprovação cria a ausência — é ela que a assiduidade e as escalas já leem.
      const leaveId = await this.leaveWrite.createAbsence(org, {
        employeeId: request.employeeId,
        type: request.kind === "justify_absence" ? "justified" : "authorized_absence",
        startDate: request.startDate,
        endDate: request.endDate,
        workingDays: request.days,
        notes: `Pedido do Portal: ${REQUEST_REASONS[p.kind][p.reasonCode] ?? p.reasonCode}${p.reasonText ? ` — ${p.reasonText}` : ""}`,
        source: "portal",
        portalRequestId: request.id,
        createdBy: command.actor,
      });
      decided = request.approve(command.actor, leaveId, command.note);
    } else {
      decided = request.reject(command.actor, command.note ?? "");
    }
    const saved = await this.requests.update(org, decided);
    await this.auditLog.record({
      organizationId: org,
      actor: command.actor,
      entityType: "portal_request",
      entityId: saved.id,
      employeeId: saved.employeeId,
      action: command.decision === "approve" ? "approved" : "rejected",
      description: `${saved.kind === "justify_absence" ? "Justificação de falta" : "Pedido de folga"} ${command.decision === "approve" ? "aprovado" : "rejeitado"}${command.note ? `: ${command.note}` : ""}`,
      before: request.toProps(),
      after: saved.toProps(),
      correlationId: randomUUID(),
    });
    return toInboxDTO(saved, this.employees, this.workShifts, org);
  }
}

export class GetRequestAttachmentUrlUseCase implements GetRequestAttachmentUrlPort {
  constructor(
    private readonly requests: PortalRequestRepositoryPort,
    private readonly storage: HrFileStoragePort,
  ) {}

  async execute(command: { organizationId: PortalIdentity["organizationId"]; requestId: string; allowedKinds: PortalRequestKind[] }): Promise<{ url: string }> {
    const request = await this.requests.findById(command.organizationId, command.requestId);
    if (!request || !request.attachment) throw new PortalResourceNotFoundError("Anexo");
    if (!command.allowedKinds.includes(request.kind)) throw new RequestNotAllowedError();
    return { url: await this.storage.getSignedUrl("document", request.attachment.path, DOCUMENT_SIGNED_URL_TTL_SECONDS, command.organizationId) };
  }
}
