import { decrypt, encrypt } from "../../../../infra/crypto/encryption.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { AtCredentials, AtEnvironment } from "../../domain/entities/at-communication.js";
import type { AtCredentialsPort, AtCredentialsSummary } from "../../domain/ports/out/at-credentials.port.js";

/** Cifra em repouso (AES-256-GCM com `CREDENTIALS_ENCRYPTION_KEY`); injetável nos testes. */
export interface SecretCipher {
  encrypt(plain: string): string;
  decrypt(payload: string): string;
}

const DEFAULT_CIPHER: SecretCipher = { encrypt: (v) => encrypt(v), decrypt: (v) => decrypt(v) };

/**
 * Subutilizador WFA por emitente (`invoicing_at_credentials`). A tabela não é
 * legível pelo browser (sem privilégios nem políticas): só o backend a lê.
 */
export class SupabaseAtCredentials implements AtCredentialsPort {
  constructor(
    private readonly scoped: ScopedQueryFactory,
    private readonly cipher: SecretCipher = DEFAULT_CIPHER,
  ) {}

  async list(org: OrganizationId, environment: AtEnvironment): Promise<AtCredentialsSummary[]> {
    const { data, error } = await this.scoped(org)
      .table("invoicing_at_credentials")
      .select("legal_entity_id, username, updated_at")
      .eq("environment", environment)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(`Faturação: erro a ler as credenciais da AT: ${error.message}`);
    return ((data ?? []) as unknown as Array<{ legal_entity_id: string; username: string; updated_at: string }>).map((r) => ({
      legalEntityId: r.legal_entity_id,
      username: r.username,
      updatedAt: r.updated_at,
    }));
  }

  async get(org: OrganizationId, environment: AtEnvironment, legalEntityId: string): Promise<(AtCredentials & { updatedAt: string }) | null> {
    const { data, error } = await this.scoped(org)
      .table("invoicing_at_credentials")
      .select("username, password_encrypted, updated_at")
      .eq("environment", environment)
      .eq("legal_entity_id", legalEntityId)
      .maybeSingle();
    if (error) throw new Error(`Faturação: erro a ler as credenciais da AT: ${error.message}`);
    if (!data) return null;
    const row = data as unknown as { username: string; password_encrypted: string; updated_at: string };
    return { username: row.username, password: this.cipher.decrypt(row.password_encrypted), updatedAt: row.updated_at };
  }

  async save(org: OrganizationId, environment: AtEnvironment, legalEntityId: string, c: AtCredentials, actor: string): Promise<void> {
    const { error } = await this.scoped(org)
      .table("invoicing_at_credentials")
      .upsert(
        {
          legal_entity_id: legalEntityId,
          environment,
          username: c.username,
          password_encrypted: this.cipher.encrypt(c.password),
          updated_by: actor,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id,legal_entity_id,environment" },
      );
    // Sem a mensagem do PostgREST: não há senha nela, mas também não interessa ao utilizador.
    if (error) throw new Error(`Faturação: erro a gravar as credenciais da AT (${error.code ?? "?"})`);
  }

  async remove(org: OrganizationId, environment: AtEnvironment, legalEntityId: string): Promise<void> {
    const { error } = await this.scoped(org).table("invoicing_at_credentials").delete().eq("environment", environment).eq("legal_entity_id", legalEntityId);
    if (error) throw new Error(`Faturação: erro a apagar as credenciais da AT: ${error.message}`);
  }
}
