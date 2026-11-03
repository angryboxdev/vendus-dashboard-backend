# Module: invoicing

> Status: active (em construção — F1 de 7; fora do `server.ts`)
> Last updated: 2026-11-03

---

## What it is and what it's for (business perspective)

O motor de faturação do Mezza, feito para ser **certificado pela AT**: emite
faturas, faturas simplificadas, faturas-recibo, notas de crédito/débito,
consultas de mesa e recibos, assinados, numerados por série, com ATCUD e
código QR, e exportáveis em SAF-T (PT).

**The problem it solves:**
Hoje as vendas são faturadas por programas de terceiros (Vendus, AirMenu). Para
o Mezza faturar diretamente — e um dia vender isso a outros restaurantes — tem
de cumprir a Portaria 363/2010, o Despacho 8632/2014, o DL 28/2019 e a
Portaria 195/2020, e passar a certificação (Modelo 24).

**The flow from the business's point of view:**

```
Restaurante (área «Vendas»)          AT
──────────────────────              ──────────────────────
1. Cria a série (formação até        2. Atribui o código de validação (ATCUD)
   haver certificado)
3. Emite o documento → assinado,
   numerado, com ATCUD e QR     →    4. Recebe a comunicação (e-Fatura)
5. Exporta o SAF-T              →    6. Inspeção / validação
```

**Key concepts for the business:**

- **Série** — sequência de numeração por tipo de documento e estabelecimento; comunicada à AT antes de usar.
- **Assinatura (hash)** — impressão digital do documento encadeada com a anterior da mesma série; impede alterações.
- **ATCUD** — código único do documento (código da série + número), impresso acima do QR.
- **Modo formação** — documentos de treino sem valor fiscal. Até haver n.º de certificado, é o único modo permitido.

---

## Technical purpose

Regras fiscais puras (mensagem a assinar, cadeia, menções impressas, totais e
IVA, QR, ATCUD, séries, bloqueios de emissão) e os adapters de assinatura
RSA-SHA1 e de relógio. NÃO é responsável por canais existentes: não lê nem
escreve Vendus, AirMenu, DRE, stock ou custos, e nenhum desses módulos o importa.

## Domain concepts

- `buildSignatureMessage` — `Data;SystemEntryDate;Número;GrossTotal(2 casas);HashAnterior` (vazio no 1.º da série).
- `verifySignatureChain` / `SignedDocumentRecord` — verifica a cadeia por série/tipo (`chainKey`) e aponta o 1.º documento adulterado.
- `parseDocumentNumber` — único parser de `TIPO SÉRIE/NÚMERO` (regex do SAF-T); usado pela assinatura, pela cadeia e pelo ATCUD.
- `validateSeriesId` / `documentNumber` / `atcud` / `printedAtcud`.
- `printedSignatureCode` / `certifiedProgramMention` / `receiptCertificationMention` / `TRAINING_MENTION`.
- `computeDocumentTotals` — preços com ou sem IVA, desconto 0–100 %, isenção obrigatória com código M (`EXEMPTION_CODES`, tabela AT v4.0), totais por taxa e espaço fiscal.
- `buildQrPayload` / `qrTaxFieldsFromTotals` — mensagem do QR (especificação AT v1.1); isenções em I2, «não sujeito» (M99, `isNotSubjectCode`) em L.
- `checkIssue` — bloqueia séries não-formação sem certificado e datas anteriores ao último da série; avisa data futura e relógio atrasado.
- `SeriesMode` — normal / formação / recuperação.
- `formatAmount` (2 casas, ponto) e `decimal-ops` (soma, subtração, divisão arredondada sobre `Dec`).
- `InvoicingRuleError` — violação de regra fiscal; a F3 mapeia para 422.
- Invariantes: sem negativos nas linhas; taxa 0 % só como isenção com motivo; número só dígitos; chave de assinatura só RSA 1024.

## Ports

### Input (use cases)

- Ainda nenhum (F3).

### Output (domain dependencies)

- `SignerPort` — assina a mensagem com a chave privada do produtor; devolve hash (172) e versão da chave.
- `SignatureVerifierPort` — verifica com a chave pública (controlo de integridade).
- `ClockPort` — hora legal do estabelecimento nos formatos da AT.

## Adapters

### Input

- Nenhum ainda.

### Output

- `RsaSha1Signer` → `SignerPort` + `SignatureVerifierPort` com `node:crypto` (RSA-SHA1, PKCS#1 v1.5, Base64).
- `LisbonClock` → `ClockPort` com `Intl` (Europe/Lisbon, ao segundo).

## Design decisions (ADR summary)

- **Vetores oficiais da AT nos testes**: o SAF-T de demonstração (`saft_idemo599999999.xml`, 36 documentos) e o par de chaves de exemplo publicados pela AT estão em `__tests__/fixtures/at/`. A chave privada aí é a de **exemplo público da AT** (descarregada do Portal das Finanças), não a do Mezza — exceção consciente à regra «nunca chaves no repositório»; se um scanner de segredos a assinalar, marcar como falso positivo.
- **Aritmética `Dec` local** (`decimal-ops`) em vez de alterar `src/kernel/money`: o módulo fica isolado dos outros (decisão do utilizador); pode subir ao kernel quando outro módulo precisar.
- **Assinador recusa chaves que não sejam RSA 1024**: uma chave maior assinaria sem erro, mas o hash não caberia nos 172 caracteres do SAF-T.
- **Chave do produtor só por variável de ambiente** (`INVOICING_SIGNING_PRIVATE_KEY`); nunca no repositório nem na BD (Despacho 3.1.4, 4.3).
- **Antes do certificado só formação** (`checkIssue` → `uncertified-program`).
- **Dinheiro exato** com `kernel/money/decimal` (bigint); linhas sem IVA a 6 casas, totais a 2 (Despacho 3.2.3).
- **IVA incluído** (restauração): total por taxa fixo; IVA = total × p/(100+p); base = total − IVA — o cliente paga o preço do menu.
- Spec, pesquisa e fases: `.scratch/certificacao-at/`.

## How to test

- Domínio e adapters: `npx jest --config jest.config.cjs src/modules/invoicing` (sem BD nem rede).

## Known gaps / open debt

- Por confirmar com a AT/contabilista: fuso do `SystemEntryDate`; limite da fatura simplificada na restauração (100 € vs 1000 €); quando anular vs. emitir NC; campo do QR das autoliquidações (M30–M46: I2 ou L); o que vai em `R` (n.º de certificado) nos documentos de formação antes da certificação.
- Para a F3 (de `code-review` da F1): tabela de taxas por espaço fiscal (PT/PT-AC/PT-MA) com fonte oficial; menção legal de isenção ligada ao texto da tabela v4.0; desconto global (`SettlementAmount`); escolha das menções impressas pelo modo da série; configuração via `src/config/env.ts`; tipos de domínio de `document-totals` para `domain/entities/`.
- Os KMS de cloud podem não suportar RSA-1024 — a chave vive em variável de ambiente.
- Persistência, casos de uso, API, SAF-T e webservices: fases F2–F6.
