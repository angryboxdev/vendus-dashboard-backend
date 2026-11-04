/** Assinatura produzida com a chave privada do produtor (Despacho 8632/2014, 2.1.3). */
export interface DocumentSignature {
  /** RSA-SHA1 em Base64, uma linha, 172 caracteres. */
  hash: string;
  /** Versão da chave privada usada (vai para o `HashControl`). */
  keyVersion: number;
}

/** Assina a mensagem do documento com a chave privada do produtor. */
export interface SignerPort {
  sign(message: string): Promise<DocumentSignature>;
}

/** Verifica uma assinatura com a chave pública entregue à AT. */
export interface SignatureVerifierPort {
  verify(message: string, hash: string): Promise<boolean>;
}
