import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { PunchAttendance, PunchKind } from "../../services/punch.service.js";
import type { GeofenceStatus, UnverifiedReason } from "../../services/punch-geofence.service.js";

/** Um toque de Entrada/Saída já gravado (`hr_attendance_punch_events`). */
export interface PunchEventRecord {
  id: string;
  attendanceId: string;
  employeeId: string;
  workShiftId: string | null;
  locationId: string;
  kind: PunchKind;
  /** Hora oficial (servidor), ISO com fuso. */
  serverAt: string;
  geofenceStatus: GeofenceStatus;
  unverifiedReason: UnverifiedReason | null;
  distanceM: number | null;
}

export interface RecordPunchInput {
  kind: PunchKind;
  employeeId: string;
  workShiftId: string;
  workDate: string;
  locationId: string;
  /** Saída: a linha de assiduidade aberta. Entrada: null (cria a linha). */
  attendanceId: string | null;
  status: string;
  lateMinutes: number | null;
  /** HH:mm de parede (Europe/Lisbon) a gravar em `actual_start_time`/`actual_end_time`. */
  time: string;
  serverAt: string;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  distanceM: number | null;
  geofenceStatus: GeofenceStatus;
  unverifiedReason: UnverifiedReason | null;
  idempotencyKey: string;
  userId: string;
}

/**
 * Persistência da picagem pelo Portal (ticket 04): escreve na Assiduidade
 * existente (`hr_shift_attendance`, origem `employee_portal`) e guarda a
 * evidência de cada toque em `hr_attendance_punch_events` — nunca uma
 * assiduidade paralela.
 */
export interface PunchRepositoryPort {
  findAttendanceByShiftIds(organizationId: OrganizationId, shiftIds: string[]): Promise<PunchAttendance[]>;
  /** Idempotência: o mesmo pedido (duplo toque, retry) devolve o evento já gravado. */
  findEventByIdempotencyKey(organizationId: OrganizationId, idempotencyKey: string): Promise<PunchEventRecord | null>;
  recordPunch(organizationId: OrganizationId, input: RecordPunchInput): Promise<PunchEventRecord>;
}
