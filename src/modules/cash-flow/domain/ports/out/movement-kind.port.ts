/** Tipo genérico de um movimento a partir do descritivo do banco (ex.: «transfer_out», «sales»). */
export interface MovementKindPort {
  /** `platform`: plataforma de entrega numa liquidação (uber_eats, glovo, bolt_food); senão null. */
  describe(description: string, movementType: "debit" | "credit"): { kind: string; platform: string | null };
}
