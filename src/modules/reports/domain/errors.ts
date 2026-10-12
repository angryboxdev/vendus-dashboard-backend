/** Erros do Novo RH → Relatórios. O controller converte-os em RFC 7807. */
export class ReportError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "validation" | "forbidden",
    readonly field: string | null = null,
  ) {
    super(message);
    this.name = "ReportError";
  }
}
