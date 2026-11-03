/** NIF português: 9 dígitos, dígito de controlo módulo 11. */
export function isValidPtNif(nif: string): boolean {
  if (!/^\d{9}$/.test(nif)) return false;
  const sum = nif
    .slice(0, 8)
    .split("")
    .reduce((s, d, i) => s + Number(d) * (9 - i), 0);
  const check = 11 - (sum % 11);
  return (check >= 10 ? 0 : check) === Number(nif[8]);
}
