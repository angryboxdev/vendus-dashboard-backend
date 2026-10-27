/**
 * Regras puras da receção: a que endereços do Mezza foi enviado o email e que anexos se importam.
 */

/** Tamanho máximo de um PDF (igual ao import manual). */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
/** Máximo de PDFs importados por email (o resto é registado como rejeitado). */
export const MAX_PDFS_PER_EMAIL = 10;

/**
 * Partes locais dos destinatários que são do nosso domínio (minúsculas, sem duplicados). Aceita
 * «Nome <a@b>» e endereços com «+etiqueta» (a etiqueta é ignorada). A empresa só se decide por aqui —
 * nunca pelo remetente nem pelo conteúdo.
 */
export function ourLocalParts(recipients: readonly string[], domain: string): string[] {
  const d = domain.trim().toLowerCase();
  const out = new Set<string>();
  for (const raw of recipients) {
    const m = /<([^>]+)>/.exec(raw);
    const address = (m ? m[1]! : raw).trim().toLowerCase();
    const at = address.lastIndexOf("@");
    if (at <= 0 || address.slice(at + 1) !== d) continue;
    const local = address.slice(0, at).split("+")[0]!;
    if (local) out.add(local);
  }
  return [...out];
}

export interface AttachmentMeta {
  id: string;
  filename: string;
  contentType: string | null;
  size: number | null;
  /** «inline» = imagem no corpo da mensagem (assinatura, logótipo). */
  contentDisposition: string | null;
}

export type AttachmentDecision = { accept: true } | { accept: false; code: "not_pdf" | "too_large" | "inline" | "too_many"; message: string };

const isPdf = (a: AttachmentMeta) =>
  (a.contentType ?? "").toLowerCase().split(";")[0]!.trim() === "application/pdf" || /\.pdf$/i.test(a.filename.trim());

/** Decisão por anexo: só PDFs anexados (não inline), até ao tamanho e quantidade máximos. Decisão do utilizador: só PDF. */
export function decideAttachments(attachments: readonly AttachmentMeta[]): Array<{ meta: AttachmentMeta; decision: AttachmentDecision }> {
  let accepted = 0;
  return attachments.map((meta) => {
    if (!isPdf(meta)) return { meta, decision: { accept: false, code: "not_pdf", message: "Não é PDF (só se importam PDFs)." } };
    if ((meta.contentDisposition ?? "").toLowerCase() === "inline") {
      return { meta, decision: { accept: false, code: "inline", message: "PDF embutido na mensagem, não anexado." } };
    }
    if (meta.size !== null && meta.size > MAX_ATTACHMENT_BYTES) {
      return { meta, decision: { accept: false, code: "too_large", message: "PDF acima de 20 MB." } };
    }
    if (accepted >= MAX_PDFS_PER_EMAIL) {
      return { meta, decision: { accept: false, code: "too_many", message: `Mais de ${MAX_PDFS_PER_EMAIL} PDFs no mesmo email.` } };
    }
    accepted++;
    return { meta, decision: { accept: true } };
  });
}

/** Conteúdo real de PDF (cabeçalho «%PDF-» no início, tolerando lixo até 1 KB como os leitores). */
export function looksLikePdf(bytes: Uint8Array): boolean {
  const sig = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
  const end = Math.min(bytes.length, 1024) - sig.length;
  for (let i = 0; i <= end; i++) {
    if (sig.every((b, j) => bytes[i + j] === b)) return true;
  }
  return false;
}
