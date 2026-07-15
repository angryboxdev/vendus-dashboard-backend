import type { SupabaseClient } from "@supabase/supabase-js";
import type { DocumentStoragePort } from "../../domain/ports/out/document-storage.port.js";

const BUCKET = "bank-statement-documents";

export class SupabaseBankDocumentStorageAdapter implements DocumentStoragePort {
  constructor(private readonly supabase: SupabaseClient) {}

  async store(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
    const timestamp = Date.now();
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${timestamp}_${safeName}`;

    const { error } = await this.supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: mimeType, upsert: false });

    if (error) throw new Error(`Document storage failed: ${error.message}`);

    const { data } = this.supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }
}
