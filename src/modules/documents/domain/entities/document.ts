import { DocumentNotCurrentError } from "../errors.js";

export type DocumentOrigin = "rh" | "colaborador" | "sistema";
export type DocumentStatus = "valid" | "pending_validation" | "rejected" | "removed";

/**
 * Dono do documento (task Base Organizacional §10 — motor único):
 * - `employee` → `ownerId` é o id do colaborador;
 * - `company`  → `ownerId` é o id da própria organização (a "Empresa" é a
 *   `Organization`, CONTEXT.md).
 */
export type DocumentOwnerType = "employee" | "company";

/** D11 — só para documentos da Empresa: Gestão (manager+admin) ou Só administração (admin). */
export type DocumentVisibility = "management" | "admin";

export interface DocumentOwner {
  type: DocumentOwnerType;
  id: string;
}

export interface DocumentProps {
  id: string;
  ownerType: DocumentOwnerType;
  ownerId: string;
  category: string;
  mandatory: boolean;
  fileName: string;
  storagePath: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  status: DocumentStatus;
  origin: DocumentOrigin;
  /** Data de emissão, opcional (ticket 03). */
  issuedAt: string | null;
  expiresAt: string | null;
  /** `null` para documentos de colaborador; obrigatório para documentos da Empresa. */
  visibility: DocumentVisibility | null;
  /** Período `YYYY-MM` das categorias periódicas (ex: Recibo de vencimento, ticket 10); `null` nas restantes. */
  period: string | null;
  version: number;
  previousVersionId: string | null;
  isCurrent: boolean;
  uploadedBy: string;
  uploadedAt: string;
}

export interface NewDocumentData {
  owner: DocumentOwner;
  category: string;
  mandatory: boolean;
  fileName: string;
  storagePath: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  origin: DocumentOrigin;
  issuedAt?: string | null;
  expiresAt: string | null;
  visibility?: DocumentVisibility | null;
  period?: string | null;
  uploadedBy: string;
}

/** Período Mês/Ano no formato `YYYY-MM` (ex: "2026-09"). */
export function isValidDocumentPeriod(period: string): boolean {
  return /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(period);
}

function visibilityFor(ownerType: DocumentOwnerType, visibility: DocumentVisibility | null | undefined): DocumentVisibility | null {
  if (ownerType === "employee") return null;
  return visibility ?? "management";
}

/**
 * Uma versão de um documento — da Empresa ou de um Colaborador, sempre o
 * mesmo motor. "Substituir" nunca apaga a linha anterior — cria uma nova
 * versão (`supersede`) e marca a anterior `isCurrent=false`
 * (`markSuperseded`, "Substituído"). "Remover" também nunca apaga — marca
 * `status="removed"`/`isCurrent=false` (`remove`), preservando o ficheiro e
 * a linha para auditoria.
 */
export class Document {
  readonly id: string;
  readonly ownerType: DocumentOwnerType;
  readonly ownerId: string;
  readonly category: string;
  readonly mandatory: boolean;
  readonly fileName: string;
  readonly storagePath: string;
  readonly mimeType: string | null;
  readonly fileSizeBytes: number | null;
  readonly status: DocumentStatus;
  readonly origin: DocumentOrigin;
  readonly issuedAt: string | null;
  readonly expiresAt: string | null;
  readonly visibility: DocumentVisibility | null;
  readonly period: string | null;
  readonly version: number;
  readonly previousVersionId: string | null;
  readonly isCurrent: boolean;
  readonly uploadedBy: string;
  readonly uploadedAt: string;

  private constructor(props: DocumentProps) {
    this.id = props.id;
    this.ownerType = props.ownerType;
    this.ownerId = props.ownerId;
    this.category = props.category;
    this.mandatory = props.mandatory;
    this.fileName = props.fileName;
    this.storagePath = props.storagePath;
    this.mimeType = props.mimeType;
    this.fileSizeBytes = props.fileSizeBytes;
    this.status = props.status;
    this.origin = props.origin;
    this.issuedAt = props.issuedAt;
    this.expiresAt = props.expiresAt;
    this.visibility = props.visibility;
    this.period = props.period;
    this.version = props.version;
    this.previousVersionId = props.previousVersionId;
    this.isCurrent = props.isCurrent;
    this.uploadedBy = props.uploadedBy;
    this.uploadedAt = props.uploadedAt;
  }

  belongsTo(owner: DocumentOwner): boolean {
    return this.ownerType === owner.type && this.ownerId === owner.id;
  }

  /** Primeira versão de uma nova categoria de documento. */
  static createFirstVersion(data: NewDocumentData): Document {
    return new Document({
      id: crypto.randomUUID(),
      ownerType: data.owner.type,
      ownerId: data.owner.id,
      category: data.category,
      mandatory: data.mandatory,
      fileName: data.fileName,
      storagePath: data.storagePath,
      mimeType: data.mimeType,
      fileSizeBytes: data.fileSizeBytes,
      // Um documento enviado pelo próprio colaborador aguarda validação de RH;
      // enviado por RH/sistema já entra validado.
      status: data.origin === "colaborador" ? "pending_validation" : "valid",
      origin: data.origin,
      issuedAt: data.issuedAt ?? null,
      expiresAt: data.expiresAt,
      visibility: visibilityFor(data.owner.type, data.visibility),
      period: data.period ?? null,
      version: 1,
      previousVersionId: null,
      isCurrent: true,
      uploadedBy: data.uploadedBy,
      uploadedAt: new Date().toISOString(),
    });
  }

  static reconstitute(props: DocumentProps): Document {
    return new Document(props);
  }

  /**
   * Cria a próxima versão a partir desta (que deve ser a versão atual).
   * Validade/emissão são da nova versão; a visibilidade mantém-se, salvo se
   * for indicada outra; o período nunca muda (é o mesmo recibo, nova versão).
   */
  supersede(data: {
    fileName: string;
    storagePath: string;
    mimeType: string | null;
    fileSizeBytes: number | null;
    issuedAt?: string | null;
    expiresAt: string | null;
    visibility?: DocumentVisibility | null;
    uploadedBy: string;
  }): Document {
    if (!this.isCurrent) {
      throw new DocumentNotCurrentError(this.id);
    }
    return new Document({
      id: crypto.randomUUID(),
      ownerType: this.ownerType,
      ownerId: this.ownerId,
      category: this.category,
      mandatory: this.mandatory,
      fileName: data.fileName,
      storagePath: data.storagePath,
      mimeType: data.mimeType,
      fileSizeBytes: data.fileSizeBytes,
      status: this.origin === "colaborador" ? "pending_validation" : "valid",
      origin: this.origin,
      issuedAt: data.issuedAt ?? null,
      expiresAt: data.expiresAt,
      visibility: visibilityFor(this.ownerType, data.visibility ?? this.visibility),
      period: this.period,
      version: this.version + 1,
      previousVersionId: this.id,
      isCurrent: true,
      uploadedBy: data.uploadedBy,
      uploadedAt: new Date().toISOString(),
    });
  }

  /** Marca esta versão como já não sendo a atual ("Substituído") — chamado sobre a versão antiga ao substituir. */
  markSuperseded(): Document {
    return new Document({ ...this.toProps(), isCurrent: false });
  }

  /** Remoção lógica — nunca apaga o ficheiro nem a linha. */
  remove(): Document {
    if (!this.isCurrent) {
      throw new DocumentNotCurrentError(this.id);
    }
    return new Document({ ...this.toProps(), status: "removed", isCurrent: false });
  }

  validate(): Document {
    return new Document({ ...this.toProps(), status: "valid" });
  }

  reject(): Document {
    return new Document({ ...this.toProps(), status: "rejected" });
  }

  toProps(): DocumentProps {
    return {
      id: this.id,
      ownerType: this.ownerType,
      ownerId: this.ownerId,
      category: this.category,
      mandatory: this.mandatory,
      fileName: this.fileName,
      storagePath: this.storagePath,
      mimeType: this.mimeType,
      fileSizeBytes: this.fileSizeBytes,
      status: this.status,
      origin: this.origin,
      issuedAt: this.issuedAt,
      expiresAt: this.expiresAt,
      visibility: this.visibility,
      period: this.period,
      version: this.version,
      previousVersionId: this.previousVersionId,
      isCurrent: this.isCurrent,
      uploadedBy: this.uploadedBy,
      uploadedAt: this.uploadedAt,
    };
  }
}
