import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { PortalRequestKind, PortalRequestStatus } from "../../entities/portal-request.js";
import type { PortalIdentity } from "./portal-me.ports.js";

/** Pedido visto pelo próprio colaborador no Portal. */
export interface MyRequestDTO {
  id: string;
  kind: PortalRequestKind;
  status: PortalRequestStatus;
  workShiftId: string | null;
  startDate: string;
  endDate: string;
  reasonLabel: string;
  reasonText: string | null;
  attachmentName: string | null;
  /** Motivo da decisão (sempre na rejeição; opcional na aprovação). */
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
}

/** Pedido na Caixa de pedidos do Hub. */
export interface InboxRequestDTO extends MyRequestDTO {
  employeeId: string;
  employeeName: string;
  /** Justificar falta: horário do turno em causa ("10:00–18:00"). */
  shiftHours: string | null;
}

export interface UploadedFile {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export type CreateMyRequestCommand = PortalIdentity &
  (
    | { kind: "justify_absence"; workShiftId: string; reasonCode: string; reasonText: string | null; attachment: UploadedFile | null }
    | { kind: "day_off"; startDate: string; endDate: string; reasonCode: string; reasonText: string | null }
  );

export interface CreateMyRequestPort {
  execute(command: CreateMyRequestCommand): Promise<MyRequestDTO>;
}
export interface ListMyRequestsPort {
  execute(identity: PortalIdentity): Promise<MyRequestDTO[]>;
}
export interface CancelMyRequestPort {
  execute(identity: PortalIdentity, requestId: string): Promise<MyRequestDTO>;
}

export interface ListInboxRequestsPort {
  /** Só os tipos que quem pede pode decidir (RH: faltas; gerente: folgas). */
  execute(command: { organizationId: OrganizationId; kinds: PortalRequestKind[] }): Promise<InboxRequestDTO[]>;
}

export interface DecidePortalRequestCommand {
  organizationId: OrganizationId;
  actor: string;
  requestId: string;
  decision: "approve" | "reject";
  note: string | null;
  /** Tipos que quem decide pode decidir (vem das permissões). */
  allowedKinds: PortalRequestKind[];
}
export interface DecidePortalRequestPort {
  execute(command: DecidePortalRequestCommand): Promise<InboxRequestDTO>;
}

export interface GetRequestAttachmentUrlPort {
  execute(command: { organizationId: OrganizationId; requestId: string; allowedKinds: PortalRequestKind[] }): Promise<{ url: string }>;
}
