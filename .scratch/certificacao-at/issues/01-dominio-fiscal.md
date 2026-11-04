# 01 — Domínio fiscal puro + assinador RSA + vetores da AT

Status: resolved
Fase: F1

## O quê
Em `src/modules/invoicing/domain` (sem dependências externas além de `src/kernel`):
- Mensagem a assinar (`InvoiceDate;SystemEntryDate;InvoiceNo;GrossTotal;HashAnterior`) e validação de formatos.
- 4 caracteres impressos (posições 1, 11, 21, 31) e menções «Processado por programa certificado n.º N/AT» / «Emitido por programa certificado n.º N/AT» / formação.
- Identificador de série (máx. 35 `[A-Za-z0-9._-]`, sem separador no início/fim/repetido, não começa por «AT») e n.º de documento `TIPO SERIE/NUM`.
- ATCUD `código(≥8)-número`.
- Payload do QR (campos A–S, ordem, 2 casas, opcionais omitidos, `I1:0` sem IVA).
- Totais: linhas com IVA incluído ou não, desconto 0–100 %, taxas por espaço fiscal, isenção obrigatória com código M (tabela v4.0), totais por taxa, NetTotal/TaxPayable/GrossTotal.
- Guarda de relógio (data futura; relógio a recuar face ao último `SystemEntryDate`).
- Regra «antes do certificado só formação».
- Porta `SignerPort` + adapter `node:crypto` (RSA-SHA1 PKCS#1 v1.5, Base64 172).

## Critérios de aceitação
- Os 36 documentos do SAF-T de demonstração da AT verificam com a chave pública da AT (cadeia por série/tipo).
- O assinador com a chave privada de exemplo da AT reproduz exatamente o hash do `1T 1/1` da demonstração.
- Exemplos da especificação do QR (FS do §5.2) reproduzidos carácter a carácter.
- `npm run typecheck`, `npm run test:unit`, `npm run lint:deps` verdes.
