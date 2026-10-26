/** Tipo genérico de um movimento a partir do descritivo do banco (ex.: «transfer_out», «sales»). */
export interface MovementKindPort {
  kindOf(description: string, movementType: "debit" | "credit"): string;
}
