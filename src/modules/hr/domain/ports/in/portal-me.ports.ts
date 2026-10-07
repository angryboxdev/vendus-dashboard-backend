import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { PunchKind, PunchRefusal } from "../../services/punch.service.js";
import type { ClientLocation, GeofencePolicy, GeofenceStatus, UnverifiedReason } from "../../services/punch-geofence.service.js";

/** Quem pede: a conta autenticada. O colaborador é sempre resolvido a partir dela (decisão P2). */
export interface PortalIdentity {
  organizationId: OrganizationId;
  userId: string;
  actor: string;
}

export interface PortalShiftDTO {
  workDate: string;
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
  secondStartTime: string | null;
  secondEndTime: string | null;
  locationId: string;
  locationName: string;
}

/** Início do Portal: próximo turno, estado da picagem e ação disponível. */
export interface PortalHomeDTO {
  employee: { id: string; shortName: string };
  nextShift: PortalShiftDTO | null;
  punch: {
    state: "not_in" | "in" | "done" | "no_shift";
    /** HH:mm da entrada aberta (state = in) ou da última saída (done). */
    since: string | null;
    /** Ação que o botão principal faz agora (null = nenhuma). */
    action: PunchKind | null;
    /** Quando a ação ainda não está disponível (ex.: cedo demais), o motivo. */
    blockedReason: PunchRefusal | null;
    /** Política GPS do local do turno em causa — o Portal só pede localização se não for `off`. */
    geofencePolicy: GeofencePolicy;
  };
}

export interface RegisterPunchCommand extends PortalIdentity {
  kind: PunchKind;
  idempotencyKey: string;
  location: ClientLocation | null;
}

export interface PunchResultDTO {
  kind: PunchKind;
  /** HH:mm oficial (servidor). */
  time: string;
  serverAt: string;
  geofence: { status: GeofenceStatus; reason: UnverifiedReason | null; distanceM: number | null };
  /** A picagem foi aceite mas fica sinalizada para o gestor. */
  flagged: boolean;
  /** Este pedido repetiu um já gravado (duplo toque / retry) — nada novo foi criado. */
  replay: boolean;
}

export interface GetPortalHomePort {
  execute(identity: PortalIdentity): Promise<PortalHomeDTO>;
}

export interface RegisterPunchPort {
  execute(command: RegisterPunchCommand): Promise<PunchResultDTO>;
}

// ── Self-service (Portal tickets 07–09) ──────────────────────────────────

export interface MyShiftDTO extends PortalShiftDTO {
  id: string;
}

/** Quem trabalha comigo: só dados operacionais mínimos (nunca contactos, NIF, assiduidade…). */
export interface CoworkerDTO {
  shortName: string;
  positionName: string | null;
  hours: string;
}

export interface MyDocumentDTO {
  id: string;
  categoryLabel: string;
  fileName: string;
  /** `YYYY-MM` nos recibos. */
  period: string | null;
  isPayslip: boolean;
  issuedAt: string | null;
  expiresAt: string | null;
  uploadedAt: string;
}

export interface MyLeaveDTO {
  year: number;
  entries: Array<{ id: string; type: string; startDate: string; endDate: string; workingDays: number }>;
}

export interface ListMyShiftsPort {
  execute(identity: PortalIdentity, from: string, to: string): Promise<MyShiftDTO[]>;
}
export interface ListMyCoworkersPort {
  execute(identity: PortalIdentity, shiftId: string): Promise<CoworkerDTO[]>;
}
export interface ListMyDocumentsPort {
  execute(identity: PortalIdentity): Promise<MyDocumentDTO[]>;
}
export interface GetMyDocumentUrlPort {
  execute(identity: PortalIdentity, documentId: string): Promise<{ url: string }>;
}
export interface GetMyLeavePort {
  execute(identity: PortalIdentity, year: number): Promise<MyLeaveDTO>;
}
