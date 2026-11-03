# Module: invoicing

> Status: active (em construção — F2 de 7; fora do `server.ts`)
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
- `planNextDocument` — a partir do estado da série (`SeriesState`): número n+1, ATCUD, mensagem encadeada e o estado esperado (`SeriesExpectation`) para o compare-and-swap; recusa série não comunicada e datas/horas anteriores ao último da série.
- `IssuerSnapshot` / `CustomerSnapshot` / `FINAL_CONSUMER` / `DocumentReference` — cópias gravadas no documento (2.ª via fiel).
- Erros: `InvoicingRuleError` (regra fiscal, 422 na F3), `StaleSeriesError` (série mudou: recomeçar), `InvoicingNotFoundError`.
- Invariantes: sem negativos nas linhas; taxa 0 % só como isenção com motivo; número só dígitos; chave de assinatura só RSA 1024.

## Ports

### Input (use cases)

- Ainda nenhum (F3).

### Output (domain dependencies)

- `SignerPort` — assina a mensagem com a chave privada do produtor; devolve hash (172) e versão da chave.
- `SignatureVerifierPort` — verifica com a chave pública (controlo de integridade).
- `ClockPort` — hora legal do estabelecimento nos formatos da AT.
- `InvoicingStorePort` — ler a série e a última emissão do emitente; gravar o documento assinado (atómico, compare-and-swap); anular com motivo.

## Adapters

### Input

- Nenhum ainda.

### Output

- `RsaSha1Signer` → `SignerPort` + `SignatureVerifierPort` com `node:crypto` (RSA-SHA1, PKCS#1 v1.5, Base64).
- `LisbonClock` → `ClockPort` com `Intl` (Europe/Lisbon, ao segundo).
- `SupabaseInvoicingStore` → `InvoicingStorePort`: leituras pelo `ScopedQuery`; escritas só pelas RPC `invoicing_issue_document` / `invoicing_cancel_document` (`ScopedQuery.issueInvoicingDocument` / `cancelInvoicingDocument`); `errcode` P0001→`StaleSeriesError`, P0002→`InvoicingNotFoundError`, P0003/P0004→`InvoicingRuleError`.

### Base de dados (`20261220100000_invoicing_certified_documents.sql`)

- Tabelas: `invoicing_series`, `invoicing_documents`, `invoicing_document_lines`, `invoicing_document_taxes`, `invoicing_events` (RLS de leitura por organização; escrita pelo backend).
- Triggers (valem também para a service role): documentos, linhas e impostos só entram pela RPC de emissão; nada se apaga; documentos só mudam de estado (N→A com motivo, CM N→F) e só pelas RPC; o fim da cadeia da série só avança de 1 em 1 pela emissão; o código de validação da AT não se altera depois de preenchido; série só se anula sem documentos.
- RPC fechadas a `anon`/`authenticated` (só `service_role`).

## Design decisions (ADR summary)

- **Vetores oficiais da AT nos testes**: o SAF-T de demonstração (`saft_idemo599999999.xml`, 36 documentos) e o par de chaves de exemplo publicados pela AT estão em `__tests__/fixtures/at/`. A chave privada aí é a de **exemplo público da AT** (descarregada do Portal das Finanças), não a do Mezza — exceção consciente à regra «nunca chaves no repositório»; se um scanner de segredos a assinalar, marcar como falso positivo.
- **Aritmética `Dec` local** (`decimal-ops`) em vez de alterar `src/kernel/money`: o módulo fica isolado dos outros (decisão do utilizador); pode subir ao kernel quando outro módulo precisar.
- **Emissão por compare-and-swap** (D4 da spec): a app lê a série, monta e assina o n+1 e grava com o estado esperado; a RPC bloqueia a série (`for update`), confere número, ATCUD e datas contra a série e falha com `stale_series` se outro terminal emitiu — assim não há buracos nem cadeias bifurcadas e a chave privada nunca entra na BD.
- **Sinalizador `invoicing.rpc`** (`set_config` local à transação) distingue a escrita legítima das RPC de qualquer outra escrita; não é segurança contra quem tem a service role — essa é a cadeia de assinaturas (`verifySignatureChain`), que denuncia qualquer alteração aos dados assinados.
- **Fuso horário: Europe/Lisbon** (decisão do utilizador, 2026-11-03) para o `SystemEntryDate`.
- **Assinador recusa chaves que não sejam RSA 1024**: uma chave maior assinaria sem erro, mas o hash não caberia nos 172 caracteres do SAF-T.
- **Chave do produtor só por variável de ambiente** (`INVOICING_SIGNING_PRIVATE_KEY`); nunca no repositório nem na BD (Despacho 3.1.4, 4.3).
- **Antes do certificado só formação** (`checkIssue` → `uncertified-program`).
- **Dinheiro exato** com `kernel/money/decimal` (bigint); linhas sem IVA a 6 casas, totais a 2 (Despacho 3.2.3).
- **IVA incluído** (restauração): total por taxa fixo; IVA = total × p/(100+p); base = total − IVA — o cliente paga o preço do menu.
- Spec, pesquisa e fases: `.scratch/certificacao-at/`.

## How to test

- Domínio e adapters: `npx jest --config jest.config.cjs src/modules/invoicing` (sem BD nem rede; precisa das variáveis fictícias de `docs/`/memória: `VENDUS_BASE_URL`, `AIRMENU_*`, `CREDENTIALS_ENCRYPTION_KEY`).
- BD real (concorrência e imutabilidade): `npx jest --config jest.config.cjs src/modules/invoicing/__tests__/integration` com `supabase start` + `supabase db reset` (não corre nesta máquina — sem Docker).

## Known gaps / open debt

- Por confirmar com a AT/contabilista: limite da fatura simplificada na restauração (100 € vs 1000 €); quando anular vs. emitir NC; campo do QR das autoliquidações (M30–M46: I2 ou L); o que vai em `R` (n.º de certificado) nos documentos de formação antes da certificação.
- Para a F3 (de `code-review` da F1): tabela de taxas por espaço fiscal (PT/PT-AC/PT-MA) com fonte oficial; menção legal de isenção ligada ao texto da tabela v4.0; desconto global (`SettlementAmount`); escolha das menções impressas pelo modo da série; configuração via `src/config/env.ts`; tipos de domínio de `document-totals` para `domain/entities/`.
- Os KMS de cloud podem não suportar RSA-1024 — a chave vive em variável de ambiente.
- O teste de integração da BD ainda não correu (sem stack local); a migração não está aplicada em lado nenhum.
- Casos de uso, API, SAF-T e webservices: fases F3–F6.
