/**
 * Evento de auditoria (task RH §4.2: quem, quando, o quê, antes/depois,
 * motivo, IP e dispositivo). Append-only e encadeado por hash na BD — a
 * aplicação nunca escolhe `seq`, data nem hash.
 */

export interface AuditEventInput {
  actor: string;
  /** Código estável `área.recurso.ação` (ex.: `settings.value.set`). */
  action: string;
  /** Tipo de recurso (ex.: `setting_profile`). */
  resourceType: string;
  resourceId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
}

export interface AuditRequestContext {
  ip: string | null;
  userAgent: string | null;
  correlationId: string | null;
}

export interface AuditEvent extends AuditEventInput, AuditRequestContext {
  id: string;
  seq: number;
  occurredAt: string;
  hash: string;
  prevHash: string | null;
}

export interface AuditQuery {
  resourceType?: string;
  resourceId?: string;
  action?: string;
  /** Datas locais inclusivas (AAAA-MM-DD). */
  from?: string;
  to?: string;
  /** Mais recentes primeiro. */
  limit: number;
  /** seq a partir do qual continuar (exclusivo), para paginar para trás. */
  beforeSeq?: number;
}

const CODE = /^[a-z0-9_.]{3,80}$/;
const RTYPE = /^[a-z0-9_.]{2,80}$/;

export class InvalidAuditEvent extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAuditEvent";
  }
}

export function validateAuditInput(e: AuditEventInput): void {
  if (!e.actor || e.actor.length > 320) throw new InvalidAuditEvent("Autor obrigatório.");
  if (!CODE.test(e.action)) throw new InvalidAuditEvent(`Código de ação inválido: ${e.action}`);
  if (!RTYPE.test(e.resourceType)) throw new InvalidAuditEvent(`Tipo de recurso inválido: ${e.resourceType}`);
}
