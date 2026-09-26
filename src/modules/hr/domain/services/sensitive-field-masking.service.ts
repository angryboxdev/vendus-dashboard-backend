/**
 * Réplica local do `AppRole` de `src/middleware/auth-middleware.ts` — o
 * domínio não pode importar de `src/middleware` (regra de fronteiras D10),
 * por isso o adapter de entrada (`hr-people.controller.ts`) é responsável
 * por traduzir `req.auth.orgRole` para este tipo antes de chamar os use
 * cases.
 */
export type ViewerRole = "admin" | "manager" | "hr_viewer";

/**
 * Mascara um valor sensível (IBAN, NIF, NISS, nº de documento de
 * identificação) mostrando só os últimos 4 caracteres — aplicado quando o
 * pedido vem de um `hr_viewer`. `manager`/`admin` veem o valor completo
 * (RH-02 nota técnica: "IBAN e identificadores sensíveis podem exigir
 * mascaramento e permissões distintas de leitura/edição").
 */
export function maskSensitiveValue(value: string | null): string | null {
  if (!value) return value;
  const visible = value.slice(-4);
  return `${"*".repeat(Math.max(value.length - 4, 0))}${visible}`;
}

export function shouldMaskSensitiveFields(viewerRole: ViewerRole): boolean {
  return viewerRole === "hr_viewer";
}
