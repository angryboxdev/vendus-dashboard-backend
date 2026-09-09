import type { OrganizationId } from "../../kernel/organization-id.js";
import { getSupabaseServiceRole } from "./supabase-client.js";

/**
 * The object-storage wrapper (item 6, D10/D17, ADR-0008). Moved here from
 * the invoices and payable-recurrences modules' own adapters because D10's
 * import rule requires it: this folder is the only place that may hold a
 * Supabase client, and Storage sits behind the same client as the database.
 *
 * Takes an organization on every call (ADR-0015). `STORAGE_BUCKET_REGISTRY`
 * below mirrors `TABLE_REGISTRY`'s role for the scoped-query helper: it's
 * the one place that says which buckets opt into org-prefixed paths, and
 * `StorageBucketName` — its keys — makes passing an unregistered bucket a
 * compile error, not a runtime failure, same as `TableName` does for
 * `ScopedQuery.table(...)`.
 *
 * Only `upload` actually prefixes a path (ADR-0015's DB1: new writes to an
 * opted-in bucket get `{org_id}/...` as the leading segment). `createSignedUrl`
 * and `getPublicUrl` take `organizationId` for signature symmetry but never
 * rewrite the path they're given (ADR-0015's DB2: no backfill, so an
 * existing unprefixed object must keep resolving exactly as it does today —
 * the caller always holds the real, already-resolved path, whether that's
 * a legacy unprefixed one or one `upload` returned prefixed).
 */

interface StorageBucketRegistryEntry {
  /** Whether new uploads get `{org_id}/` prepended to their path (ADR-0015 DB1/DB4). */
  readonly prefixByOrganization: boolean;
}

export const STORAGE_BUCKET_REGISTRY = {
  "hr-documents": { prefixByOrganization: true },
  "invoice-documents": { prefixByOrganization: true },
  // DB4: shares the wrapper, deliberately not prefixed yet.
  "recurrence-documents": { prefixByOrganization: false },
  "bank-statement-documents": { prefixByOrganization: false },
  "invoice-imports": { prefixByOrganization: false },
} as const satisfies Record<string, StorageBucketRegistryEntry>;

export type StorageBucketName = keyof typeof STORAGE_BUCKET_REGISTRY;

function client() {
  const supabase = getSupabaseServiceRole();
  if (!supabase) throw new Error("Supabase service role não configurado");
  return supabase;
}

function resolveUploadPath(bucket: StorageBucketName, path: string, organizationId: OrganizationId): string {
  const { prefixByOrganization } = STORAGE_BUCKET_REGISTRY[bucket];
  return prefixByOrganization ? `${organizationId}/${path}` : path;
}

export const objectStorage = {
  /** Returns the actual path the object was stored at — prefixed when the bucket opts in. */
  async upload(
    bucket: StorageBucketName,
    path: string,
    buffer: Buffer,
    contentType: string,
    organizationId: OrganizationId,
  ): Promise<string> {
    const actualPath = resolveUploadPath(bucket, path, organizationId);
    const { error } = await client()
      .storage.from(bucket)
      .upload(actualPath, buffer, { contentType, upsert: false });
    if (error) throw new Error(`Document storage failed: ${error.message}`);
    return actualPath;
  },

  getPublicUrl(bucket: StorageBucketName, path: string, _organizationId: OrganizationId): string {
    const { data } = client().storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  },

  async remove(bucket: StorageBucketName, path: string): Promise<void> {
    const { error } = await client().storage.from(bucket).remove([path]);
    if (error) throw new Error(`Document delete failed: ${error.message}`);
  },

  /** Time-limited signed URL, for buckets that aren't public (e.g. HR documents). */
  async createSignedUrl(
    bucket: StorageBucketName,
    path: string,
    expiresInSeconds: number,
    _organizationId: OrganizationId,
  ): Promise<string> {
    const { data, error } = await client().storage.from(bucket).createSignedUrl(path, expiresInSeconds);
    if (error || !data?.signedUrl) throw new Error(`Signed URL failed: ${error?.message}`);
    return data.signedUrl;
  },
};
