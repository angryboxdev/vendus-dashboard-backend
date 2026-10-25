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
  // RH-02: fotos de perfil do colaborador — privado, como hr-documents (dado
  // pessoal, RGPD), mas servido com URL assinado de TTL mais longo (ver
  // src/modules/hr/README.md) para não reassinar em cada render de lista.
  "hr-photos": { prefixByOrganization: true },
  "invoice-documents": { prefixByOrganization: true },
  // Módulo Contabilidade (Fase 1) — anexo de "documento especial" (despesa de sócio/funcionário/plataforma), privado como hr-documents.
  "accounting-documents": { prefixByOrganization: true },
  // Módulo organization (Base Organizacional — Empresa): logotipo, privado como hr-photos.
  "organization-assets": { prefixByOrganization: true },
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

  /** Conteúdo de um objeto já guardado (o chamador tem o caminho real, como em `createSignedUrl`). */
  async download(bucket: StorageBucketName, path: string, _organizationId: OrganizationId): Promise<Buffer> {
    const { data, error } = await client().storage.from(bucket).download(path);
    if (error || !data) throw new Error(`Document download failed: ${error?.message}`);
    return Buffer.from(await data.arrayBuffer());
  },

  async remove(bucket: StorageBucketName, path: string): Promise<void> {
    const { error } = await client().storage.from(bucket).remove([path]);
    if (error) throw new Error(`Document delete failed: ${error.message}`);
  },

  /** Several signed URLs in one request; paths that fail to sign are left out of the map. */
  async createSignedUrls(
    bucket: StorageBucketName,
    paths: string[],
    expiresInSeconds: number,
    _organizationId: OrganizationId,
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (paths.length === 0) return out;
    const { data, error } = await client().storage.from(bucket).createSignedUrls(paths, expiresInSeconds);
    if (error) throw new Error(`Signed URLs failed: ${error.message}`);
    for (const r of data ?? []) if (r.path && r.signedUrl && !r.error) out.set(r.path, r.signedUrl);
    return out;
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
