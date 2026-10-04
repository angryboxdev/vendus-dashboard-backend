export class OrganizationNotFoundError extends Error {
  constructor(organizationId: string) {
    super(`Organização "${organizationId}" não encontrada`);
    this.name = "OrganizationNotFoundError";
  }
}

export interface OrganizationFieldError {
  field: string;
  message: string;
}

/** Agrega todos os campos inválidos de uma vez — o formulário mostra-os todos, não só o primeiro. */
export class InvalidOrganizationProfileError extends Error {
  constructor(readonly fieldErrors: OrganizationFieldError[]) {
    super(`Perfil da organização inválido: ${fieldErrors.map((e) => `${e.field} (${e.message})`).join(", ")}`);
    this.name = "InvalidOrganizationProfileError";
  }
}
