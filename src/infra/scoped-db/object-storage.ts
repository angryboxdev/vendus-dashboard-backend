import { getSupabaseServiceRole } from "./supabase-client.js";

/**
 * The object-storage wrapper (item 6, D10/D17, ADR-0008). Moved here from
 * the invoices and payable-recurrences modules' own adapters because D10's
 * import rule requires it: this folder is the only place that may hold a
 * Supabase client, and Storage sits behind the same client as the database.
 *
 * Deliberately **no organization parameter and no path prefixing** (D17,
 * spec.md D17/Notes). Existing objects live at unprefixed paths — prefixing
 * storage paths by organization would mean migrating every stored file or
 * breaking every existing document URL, which spec A already deferred. An
 * argument this wrapper would ignore is worse than one that is absent: it
 * gets an organization parameter when the prefixing migration actually
 * happens, not before.
 */

function client() {
  const supabase = getSupabaseServiceRole();
  if (!supabase) throw new Error("Supabase service role não configurado");
  return supabase;
}

export const objectStorage = {
  async upload(bucket: string, path: string, buffer: Buffer, contentType: string): Promise<void> {
    const { error } = await client()
      .storage.from(bucket)
      .upload(path, buffer, { contentType, upsert: false });
    if (error) throw new Error(`Document storage failed: ${error.message}`);
  },

  getPublicUrl(bucket: string, path: string): string {
    const { data } = client().storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  },

  async remove(bucket: string, path: string): Promise<void> {
    const { error } = await client().storage.from(bucket).remove([path]);
    if (error) throw new Error(`Document delete failed: ${error.message}`);
  },
};
