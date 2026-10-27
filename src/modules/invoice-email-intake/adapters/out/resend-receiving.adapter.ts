import { createHash } from "node:crypto";
import type { ReceivedAttachmentInfo, ResendReceivingPort } from "../../domain/ports/out/email-intake.out-ports.js";

const API = "https://api.resend.com";
const TIMEOUT_MS = 30_000;

/**
 * API Receiving da Resend (sem SDK — `fetch` nativo): lista os anexos de um email recebido
 * (`GET /emails/receiving/:email_id/attachments`, com `download_url` válido 1 hora) e descarrega-os.
 * A chave nunca vai para logs nem mensagens de erro.
 */
export class ResendReceivingAdapter implements ResendReceivingPort {
  constructor(private readonly apiKey: string) {}

  async listAttachments(emailId: string): Promise<ReceivedAttachmentInfo[]> {
    const res = await fetch(`${API}/emails/receiving/${encodeURIComponent(emailId)}/attachments`, {
      headers: { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Resend: falha ao listar anexos (HTTP ${res.status}).`);
    const body = (await res.json()) as { data?: unknown };
    const items = Array.isArray(body.data) ? body.data : Array.isArray(body) ? (body as unknown[]) : [];
    return items.flatMap((raw) => {
      const r = raw as Record<string, unknown>;
      if (typeof r.id !== "string" || typeof r.download_url !== "string") return [];
      return [{
        id: r.id,
        filename: typeof r.filename === "string" ? r.filename : "anexo.pdf",
        contentType: typeof r.content_type === "string" ? r.content_type : null,
        size: typeof r.size === "number" ? r.size : null,
        downloadUrl: r.download_url,
      }];
    });
  }

  async download(url: string, maxBytes: number): Promise<{ bytes: Buffer; sha256: string }> {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Resend: falha ao descarregar o anexo (HTTP ${res.status}).`);
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > maxBytes) throw new Error("Anexo acima do tamanho máximo.");
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > maxBytes) throw new Error("Anexo acima do tamanho máximo.");
    return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
  }
}
