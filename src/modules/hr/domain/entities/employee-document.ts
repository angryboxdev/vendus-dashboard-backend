import { DocumentNotCurrentError } from "../errors.js";

export type DocumentOrigin = "rh" | "colaborador" | "sistema";
export type DocumentStatus = "valid" | "pending_validation" | "rejected" | "removed";

export interface EmployeeDocumentProps {
  id: string;
  employeeId: string;
  category: string;
  mandatory: boolean;
  fileName: string;
  storagePath: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  status: DocumentStatus;
  origin: DocumentOrigin;
  expiresAt: string | null;
  version: number;
  previousVersionId: string | null;
  isCurrent: boolean;
  uploadedBy: string;
  uploadedAt: string;
}

/**
 * Uma versão de documento do dossiê do colaborador. "Substituir" nunca apaga
 * a linha anterior — cria uma nova versão (`supersede`) e marca a anterior
 * `isCurrent=false` (`markSuperseded`). "Remover" também nunca apaga — marca
 * `status="removed"`/`isCurrent=false` (`remove`), preservando o ficheiro e a
 * linha para auditoria (RH-02: "substituir ou remover um ficheiro não pode
 * apagar a evidência anterior").
 */
export class EmployeeDocument {
  readonly id: string;
  readonly employeeId: string;
  readonly category: string;
  readonly mandatory: boolean;
  readonly fileName: string;
  readonly storagePath: string;
  readonly mimeType: string | null;
  readonly fileSizeBytes: number | null;
  readonly status: DocumentStatus;
  readonly origin: DocumentOrigin;
  readonly expiresAt: string | null;
  readonly version: number;
  readonly previousVersionId: string | null;
  readonly isCurrent: boolean;
  readonly uploadedBy: string;
  readonly uploadedAt: string;

  private constructor(props: EmployeeDocumentProps) {
    this.id = props.id;
    this.employeeId = props.employeeId;
    this.category = props.category;
    this.mandatory = props.mandatory;
    this.fileName = props.fileName;
    this.storagePath = props.storagePath;
    this.mimeType = props.mimeType;
    this.fileSizeBytes = props.fileSizeBytes;
    this.status = props.status;
    this.origin = props.origin;
    this.expiresAt = props.expiresAt;
    this.version = props.version;
    this.previousVersionId = props.previousVersionId;
    this.isCurrent = props.isCurrent;
    this.uploadedBy = props.uploadedBy;
    this.uploadedAt = props.uploadedAt;
  }

  /** Primeira versão de uma nova categoria de documento. */
  static createFirstVersion(props: {
    employeeId: string;
    category: string;
    mandatory: boolean;
    fileName: string;
    storagePath: string;
    mimeType: string | null;
    fileSizeBytes: number | null;
    origin: DocumentOrigin;
    expiresAt: string | null;
    uploadedBy: string;
  }): EmployeeDocument {
    return new EmployeeDocument({
      id: crypto.randomUUID(),
      employeeId: props.employeeId,
      category: props.category,
      mandatory: props.mandatory,
      fileName: props.fileName,
      storagePath: props.storagePath,
      mimeType: props.mimeType,
      fileSizeBytes: props.fileSizeBytes,
      // Um documento enviado pelo próprio colaborador aguarda validação de RH;
      // enviado por RH/sistema já entra validado.
      status: props.origin === "colaborador" ? "pending_validation" : "valid",
      origin: props.origin,
      expiresAt: props.expiresAt,
      version: 1,
      previousVersionId: null,
      isCurrent: true,
      uploadedBy: props.uploadedBy,
      uploadedAt: new Date().toISOString(),
    });
  }

  static reconstitute(props: EmployeeDocumentProps): EmployeeDocument {
    return new EmployeeDocument(props);
  }

  /** Cria a próxima versão a partir desta (que deve ser a versão atual). */
  supersede(props: {
    fileName: string;
    storagePath: string;
    mimeType: string | null;
    fileSizeBytes: number | null;
    expiresAt: string | null;
    uploadedBy: string;
  }): EmployeeDocument {
    if (!this.isCurrent) {
      throw new DocumentNotCurrentError(this.id);
    }
    return new EmployeeDocument({
      id: crypto.randomUUID(),
      employeeId: this.employeeId,
      category: this.category,
      mandatory: this.mandatory,
      fileName: props.fileName,
      storagePath: props.storagePath,
      mimeType: props.mimeType,
      fileSizeBytes: props.fileSizeBytes,
      status: this.origin === "colaborador" ? "pending_validation" : "valid",
      origin: this.origin,
      expiresAt: props.expiresAt,
      version: this.version + 1,
      previousVersionId: this.id,
      isCurrent: true,
      uploadedBy: props.uploadedBy,
      uploadedAt: new Date().toISOString(),
    });
  }

  /** Marca esta versão como já não sendo a atual (chamado sobre a versão antiga ao substituir). */
  markSuperseded(): EmployeeDocument {
    return new EmployeeDocument({ ...this.toProps(), isCurrent: false });
  }

  /** Remoção lógica — nunca apaga o ficheiro nem a linha. */
  remove(): EmployeeDocument {
    if (!this.isCurrent) {
      throw new DocumentNotCurrentError(this.id);
    }
    return new EmployeeDocument({ ...this.toProps(), status: "removed", isCurrent: false });
  }

  validate(): EmployeeDocument {
    return new EmployeeDocument({ ...this.toProps(), status: "valid" });
  }

  reject(): EmployeeDocument {
    return new EmployeeDocument({ ...this.toProps(), status: "rejected" });
  }

  toProps(): EmployeeDocumentProps {
    return {
      id: this.id,
      employeeId: this.employeeId,
      category: this.category,
      mandatory: this.mandatory,
      fileName: this.fileName,
      storagePath: this.storagePath,
      mimeType: this.mimeType,
      fileSizeBytes: this.fileSizeBytes,
      status: this.status,
      origin: this.origin,
      expiresAt: this.expiresAt,
      version: this.version,
      previousVersionId: this.previousVersionId,
      isCurrent: this.isCurrent,
      uploadedBy: this.uploadedBy,
      uploadedAt: this.uploadedAt,
    };
  }
}
