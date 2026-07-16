/**
 * Port para guardar e recuperar associações confirmadas entre descrições
 * bancárias normalizadas e fornecedores reais.
 *
 * Quando o utilizador reconcilia manualmente um movimento com uma fatura ou
 * conta a pagar, a descrição do movimento é normalizada e a associação
 * description → supplierId é persistida. Em conciliações futuras, a mesma
 * normalização é aplicada e o hint é usado para dar um boost de confiança
 * ao candidato correcto, sem necessidade de intervenção manual.
 *
 * Análogo ao SupplierHintPort do módulo de faturas, mas orientado a descrições
 * bancárias em vez de nomes extraídos por IA.
 */
export interface MovementMatchHintPort {
  /**
   * Procura o supplierId associado a esta descrição normalizada.
   * Devolve null se nunca foi confirmada uma reconciliação com esta descrição.
   * Quando existem múltiplas associações, devolve a de maior use_count.
   */
  findSupplierByDescription(normalizedDesc: string): Promise<string | null>;

  /**
   * Persiste (ou incrementa o contador de) uma associação description → supplier.
   * @param normalizedDesc Descrição já normalizada via normalizeBankDescription().
   * @param supplierId     ID do fornecedor confirmado pelo utilizador.
   */
  save(normalizedDesc: string, supplierId: string): Promise<void>;
}
