/**
 * Um anexo PDF recebido por email e o estado do seu processamento. Estados (task «Faturas por email»):
 *  - `received`   Recebido — à espera de ser processado.
 *  - `processing` Em processamento.
 *  - `imported`   Por rever — rascunho criado (Faturas ou Compras por rever).
 *  - `duplicate`  Duplicado — a fatura já existia; nada foi criado.
 *  - `read_error` Erro de leitura — falhou; volta a tentar enquanto houver `nextAttemptAt`.
 *  - `rejected`   Rejeitado — não é para importar (não é PDF, não é fatura, documento de cobrança…).
 */
export type InboundAttachmentStatus = "received" | "processing" | "imported" | "duplicate" | "read_error" | "rejected";
export type IntakeDestination = "finance" | "stock";

export interface InboundAttachment {
  id: string;
  eventId: string;
  addressId: string;
  emailId: string;
  attachmentId: string;
  filename: string;
  contentType: string | null;
  sizeBytes: number | null;
  sender: string | null;
  receivedAt: Date;
  destination: IntakeDestination;
  status: InboundAttachmentStatus;
  invoiceId: string | null;
  fileSha256: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  attempts: number;
  nextAttemptAt: Date | null;
  lockedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Tentativas de um anexo com falha passageira (API, armazenamento, leitura): 1 + 3 novas tentativas. */
export const MAX_ATTEMPTS = 4;
const RETRY_DELAYS_MIN = [5, 30, 120];

/** Próxima tentativa depois de uma falha passageira, ou `null` se já esgotou as tentativas. */
export function nextAttemptAfterFailure(attempts: number, now: Date): Date | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  const minutes = RETRY_DELAYS_MIN[Math.min(attempts - 1, RETRY_DELAYS_MIN.length - 1)] ?? 120;
  return new Date(now.getTime() + minutes * 60_000);
}

/** Um anexo que ficou «Em processamento» mais do que isto (o servidor reiniciou a meio) pode ser retomado. */
export const STALE_PROCESSING_MS = 15 * 60_000;

/** Estados finais: um anexo concluído nunca é processado outra vez (falha parcial num email com vários PDFs). */
export function isFinal(a: Pick<InboundAttachment, "status" | "nextAttemptAt">): boolean {
  return a.status === "imported" || a.status === "duplicate" || a.status === "rejected" || (a.status === "read_error" && a.nextAttemptAt === null);
}
