/**
 * Cross-module output port — quando uma obrigação financeira de origem 'recurrence'
 * é marcada como paga, sincroniza o estado da ocorrência correspondente
 * (payable_created → paid).
 *
 * O adapter concreto acede directamente à tabela recurring_occurrences sem
 * importar código do módulo payable-recurrences.
 */
export interface OccurrenceSyncPort {
  syncPayableMarkedPaid(payableEntryId: string): Promise<void>;
}
