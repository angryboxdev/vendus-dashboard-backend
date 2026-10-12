/**
 * Convites e adesões (FE-054): um código/link que permite a um trabalhador
 * pedir a adesão; o RH aceita (abre a criação da pessoa pré-preenchida) ou
 * recusa. O pedido só tem nome, apelidos e e-mail (minimização RGPD). O
 * código em claro nunca é guardado — só o hash e os últimos 4 caracteres.
 */
export interface Invitation {
  id: string;
  codeHint: string;
  locationId: string | null;
  departmentId: string | null;
  maxUses: number | null;
  uses: number;
  expiresAt: string;
  status: "active" | "revoked";
  createdBy: string;
  createdAt: string;
  revokedAt: string | null;
}

export type InvitationState = "active" | "expired" | "exhausted" | "revoked";

export interface JoinRequest {
  id: string;
  invitationId: string;
  firstName: string;
  lastName: string;
  email: string;
  status: "pending" | "accepted" | "rejected";
  possibleDuplicate: boolean;
  rejectReason: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  employeeId: string | null;
  createdAt: string;
}

export class InvitationError extends Error {
  constructor(
    message: string,
    readonly code: "validation" | "not_found" | "invalid_invitation" | "conflict" | "rate_limited",
    readonly field: string | null = null,
  ) {
    super(message);
    this.name = "InvitationError";
  }
}

/** Expirado, esgotado ou revogado não volta a ficar ativo (cria-se outro). */
export function invitationState(i: Pick<Invitation, "status" | "expiresAt" | "maxUses" | "uses">, now: string): InvitationState {
  if (i.status === "revoked") return "revoked";
  if (Date.parse(i.expiresAt) <= Date.parse(now)) return "expired";
  if (i.maxUses !== null && i.uses >= i.maxUses) return "exhausted";
  return "active";
}

export const MAX_DAYS = 90;

export function validateInvitation(input: { expiresInDays: number; maxUses: number | null }): void {
  if (!Number.isInteger(input.expiresInDays) || input.expiresInDays < 1 || input.expiresInDays > MAX_DAYS) throw new InvitationError(`Validade entre 1 e ${MAX_DAYS} dias.`, "validation", "expiresInDays");
  if (input.maxUses !== null && (!Number.isInteger(input.maxUses) || input.maxUses < 1 || input.maxUses > 500)) throw new InvitationError("Número de utilizações entre 1 e 500.", "validation", "maxUses");
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Dados mínimos do pedido de adesão. */
export function validateJoin(input: { firstName: string; lastName: string; email: string }) {
  const firstName = (input.firstName ?? "").trim();
  const lastName = (input.lastName ?? "").trim();
  const email = (input.email ?? "").trim().toLowerCase();
  if (firstName.length < 1 || firstName.length > 80) throw new InvitationError("Indique o nome.", "validation", "firstName");
  if (lastName.length < 1 || lastName.length > 120) throw new InvitationError("Indique os apelidos.", "validation", "lastName");
  if (!EMAIL.test(email) || email.length > 254) throw new InvitationError("E-mail inválido.", "validation", "email");
  return { firstName, lastName, email };
}
