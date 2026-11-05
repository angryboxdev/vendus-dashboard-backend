# Module: invoicing

> Status: active (em construção — F3 de 7; API em `/api/invoicing`, só formação até haver certificado)
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

Emissão de documentos fiscais certificáveis (séries, numeração, assinatura,
ATCUD, QR, totais e IVA, imutabilidade na BD), consulta (2.ª via) e anulação. NÃO é responsável por canais existentes: não lê nem
escreve Vendus, AirMenu, DRE, stock ou custos, e nenhum desses módulos o importa.

## Domain concepts

- `buildSignatureMessage` — `Data;SystemEntryDate;Número;GrossTotal(2 casas);HashAnterior` (vazio no 1.º da série).
- `verifySignatureChain` / `SignedDocumentRecord` — verifica a cadeia por série/tipo (`chainKey`) e aponta o 1.º documento adulterado.
- `parseDocumentNumber` — único parser de `TIPO SÉRIE/NÚMERO` (regex do SAF-T); usado pela assinatura, pela cadeia e pelo ATCUD.
- `validateSeriesId` / `documentNumber` / `atcud` / `printedAtcud`.
- `printedSignatureCode` / `certifiedProgramMention` / `receiptCertificationMention` / `TRAINING_MENTION`.
- `computeDocumentTotals` — preços com ou sem IVA, desconto 0–100 %, isenção obrigatória com código M (`EXEMPTION_CODES`, tabela AT v4.0), totais por taxa e espaço fiscal.
- `buildQrPayload` / `qrTaxFieldsFromTotals` — mensagem do QR (especificação AT v1.1); isenções em I2, «não sujeito» (M99, `isNotSubjectCode`) em L.
- `checkIssue` — bloqueia séries não-formação sem certificado; avisa data futura e relógio atrasado (por instantes UTC).
- `SeriesMode` — normal / formação (recuperação de documentos manuais numa fase seguinte). `FiscalDocumentType` — FT, FS, FR, NC, ND, CM (recibos depois).
- `LineProduct` (código, tipo P/S/O/E/I, unidade) — obrigatório para gravar (SAF-T); `PaymentMechanism` (SAF-T).
- `formatAmount` (2 casas, ponto) e `decimal-ops` (soma, subtração, divisão arredondada sobre `Dec`).
- `planNextDocument` — a partir do estado da série (`SeriesState`): número n+1, ATCUD, mensagem encadeada e o estado esperado (`SeriesExpectation`) para o compare-and-swap; recusa série não comunicada, data anterior ao último da série e instante UTC anterior ao último da série.
- `IssuerSnapshot` / `CustomerSnapshot` / `FINAL_CONSUMER` / `DocumentReference` — cópias gravadas no documento (2.ª via fiel).
- Erros: `InvoicingRuleError` (regra fiscal, 422 na F3), `StaleSeriesError` (série mudou: recomeçar), `InvoicingNotFoundError`.
- Invariantes: sem negativos nas linhas; taxa 0 % só como isenção com motivo; número só dígitos; chave de assinatura só RSA 1024.

## Ports

### Input (use cases)

Portas em `domain/ports/in/invoicing.ports.ts`: `IssueDocumentPort` e `InvoicingPort` (o controller depende delas, não das classes).

- `IssueDocumentUseCase.execute` — emite FT/FS/FR/NC/ND/CM: série e bloqueios (certificado, data futura, relógio), taxas oficiais (`vatRate`) e menções de isenção (`exemptionMention`), regras por tipo (FS ≤ 100 € sem IVA; FR com meio de pagamento; NC/ND com documento retificado ativo do mesmo emitente e NC ≤ valor por creditar; faturas referem consultas de mesa ativas), cliente (NIF PT validado; sem cliente = consumidor final), QR, assinatura e gravação com recomeço se outro terminal emitiu (até 3 tentativas). Avisos → `IssueNeedsConfirmationError` (repetir com `confirmWarnings`).
- `AtCommunicationUseCases` (`AtCommunicationPort`, `ports/in/at-communication.ports.ts`) — comunicação à AT (F6): `status` (pendentes, prazo do dia 5, recusas, credenciais), `saveCredentials`/`removeCredentials` (subutilizador WFA do NIF do emitente; evento sem a senha), `communicatePending` (registo ou mudança de estado no e-Fatura, até 100 por execução; `force` repete os dados recusados; uma execução de cada vez por organização — `AtBusyError`), `documentCommunications`, `registerSeries`/`finalizeSeries`/`cancelSeries` (credenciais WSE no momento, nunca guardadas; guardam o código de validação ou o estado local só com confirmação da AT).
- `InvoicingUseCases` — `listSeries`, `createSeries` (normal só com certificado), `setValidationCode`, `listDocuments`, `getDocument` (2.ª via com `printed.atcud` e `printed.mentions`), `cancel` (motivo da lista fechada `CANCEL_REASONS`), `meta` (certificação, limites, taxas, isenções ativas, motivos de anulação).

### Output (domain dependencies)

- `SignerPort` — assina a mensagem com a chave privada do produtor; devolve hash (172) e versão da chave.
- `SignatureVerifierPort` — verifica com a chave pública (controlo de integridade).
- `ClockPort` — hora legal de Lisboa nos formatos da AT + instante UTC.
- `InvoicingStorePort` — séries (ler, listar, criar, código de validação), documentos (por ids, total já creditado, ler com linhas e impostos, listar), gravar o documento assinado (atómico, compare-and-swap) e anular.
- `IssuerDirectoryPort` — dados do emitente (entidade legal); ligado no `server.ts` ao módulo `legal-entities`.
- `AtGatewayPort` — envia um corpo SOAP a um serviço da AT (`series` | `efatura`) com as credenciais; devolve o XML da resposta; rede → `AtTransportError`.
- `AtCredentialsPort` — credenciais WFA por emitente e ambiente (senha cifrada em repouso; `get` traz a data da última gravação).
- `AtCommunicationStorePort` — fila (`queue`), registo append-only dos envios (`record`), histórico de um documento e estado local da série (finalizada/anulada).

## Adapters

### Input

- `createInvoicingRouter` → `/api/invoicing` (permissão `sales.invoicing`: GET = READ, resto = MANAGE — exceto o SAF-T, que exige MANAGE; só o Admin a tem por omissão):
  - `GET /invoicing/meta` · `GET /invoicing/series` · `POST /invoicing/series` `{legalEntityId, locationId?, documentType, seriesId, mode}` → 201
  - `PUT /invoicing/series/:id/validation-code` `{validationCode}` → 200 com a série (código da AT, uma só vez)
  - `GET /invoicing/saft?legalEntityId&from&to&training=1` → ficheiro SAF-T (PT) 1.04_01 (`application/xml`, `SAFT_<NIF>_<de>_<até>.xml`); um só ano fiscal; formação só com `training=1`; cada exportação fica em `invoicing_events` (`saft.exported`: quem, período, n.º de documentos)
  - `GET /invoicing/documents?from&to&type&status&limit` · `GET /invoicing/documents/:id` (2.ª via)
  - `POST /invoicing/documents` (**`Idempotency-Key` obrigatório**) `{seriesRef, documentDate?, customer?, pricesIncludeTax?, lines[{productCode, productType, unit, description, quantity, unitPrice, discountPct?, tax:{region, rate}|{region, exemptionCode, exemptionNorm?}}], paymentMechanism?, references?[{documentId, reason}], orderReferences?[ids], confirmWarnings?}` → 201 `{documentId, documentNumber, atcud}`
  - `POST /invoicing/documents/:id/cancel` `{reasonCode, note?}` → 200 com o documento anulado
  - Comunicação à AT (F6), em `/invoicing/at/*` — fora de `/series` e `/documents` de propósito: o middleware de idempotência guarda um hash do corpo e estes pedidos levam senhas:
    - `GET /invoicing/at` → estado (configurado, ambiente, credenciais sem senha, fila e prazo, recusas)
    - `PUT /invoicing/at/credentials/:legalEntityId` `{username, password}` → `{legalEntityId, username}` · `DELETE …` → 204
    - `POST /invoicing/at/communicate` `{force?}` → `{attempted, accepted, rejected, failed, withoutCredentials}`
    - `GET /invoicing/at/documents/:id` → histórico de envios do documento
    - `POST /invoicing/at/series/:id/register|finalize|cancel` `{username, password, justification?}` (WSE, não guardado)
  - Erros (Problem Details): 400 corpo inválido; 404; 409 `confirmation_required` (com `warnings`), `series_busy` ou `at_busy`; 422 `fiscal_rule` (inclui recusas da AT nas séries); 503 `invoicing_unavailable` (sem chave ou sem certificado da AT) ou `at_unavailable` (AT sem resposta).

### Output

- `RsaSha1Signer` → `SignerPort` + `SignatureVerifierPort` com `node:crypto` (RSA-SHA1, PKCS#1 v1.5, Base64).
- `LisbonClock` → `ClockPort` com `Intl` (Europe/Lisbon, ao segundo).
- `AtSoapGateway` → `AtGatewayPort`: `https` com mTLS (`.pfx` do produtor assinado pela AT), cabeçalho WS-Security (AES-128 nova por pedido cifrada com a chave pública da AT em RSA PKCS#1 v1.5; senha e instante UTC em AES-ECB-PKCS5), endereços fixos por ambiente (testes: séries 722, e-Fatura 723), resposta até 1 MB, tempo limite por inatividade e total; erros de rede só com a categoria (detalhe no log, nunca o pedido).
- `SupabaseAtCredentials` → `AtCredentialsPort` (`invoicing_at_credentials`, senha com `infra/crypto` AES-256-GCM e `CREDENTIALS_ENCRYPTION_KEY`).
- `SupabaseAtStore` → `AtCommunicationStorePort` (`fn_invoicing_at_queue` por `ScopedQuery.invoicingAtQueue`; `invoicing_at_communications`; estado da série).
- `SupabaseInvoicingStore` → `InvoicingStorePort`: leituras pelo `ScopedQuery`; escritas só pelas funções `fn_invoicing_issue_document` / `fn_invoicing_cancel_document` (`ScopedQuery.issueInvoicingDocument` / `cancelInvoicingDocument`); `errcode` P0001→`StaleSeriesError`, P0002→`InvoicingNotFoundError`, P0003/P0004→`InvoicingRuleError`; referências enviadas em snake_case (`document_id`); recusa linha sem produto.

### Base de dados (`20261220100000_invoicing_certified_documents.sql`)

- Tabelas: `invoicing_series`, `invoicing_documents`, `invoicing_document_lines`, `invoicing_document_taxes`, `invoicing_events` (RLS de leitura por organização).
- Documentos guardam o `SystemEntryDate` assinado (hora de Lisboa) **e** o instante UTC (`system_entry_at`), o `software_certificate_number` à data de emissão e, por linha, `product_code`/`product_type`/`unit_of_measure`/`reference_line` (SAF-T).
- Privilégios: `anon`/`authenticated`/`service_role` sem escrita nos registos fiscais (só leitura); a `service_role` cria e atualiza séries (código de validação, estado), guardada pelo trigger.
- Triggers: documentos, linhas e impostos só entram pelas funções; nada se apaga nem trunca (trigger de `TRUNCATE` por tabela); documentos só mudam de estado (N→A com motivo, CM N→F); o fim da cadeia da série só avança de 1 em 1 pela emissão; série nasce ativa e vazia; código de validação imutável depois de preenchido; série só se anula sem documentos.
- `fn_invoicing_issue_document` (security definer, só `service_role`): bloqueia a série e faz compare-and-swap; confere número, ATCUD, data e instante, NIF do emitente contra a entidade legal, documentos referidos pelas NC/ND (ativos, do mesmo emitente, bloqueados contra anulação concorrente), soma do resumo de impostos face aos totais e CM faturadas uma só vez; fixa `SourceBilling` P e `HashControl` (versão da chave, ou «0» sem certificado).
- `fn_invoicing_cancel_document`: motivo obrigatório; recusa documento não ativo ou com NC/ND ativa.
- Validada em Postgres 17 (PGlite): cadeia completa de migrações, reaplicação, 42 verificações de comportamento, rollback e reaplicação — `.scratch/certificacao-at/validacao-pglite/`.

### Base de dados — comunicação à AT (`20261220120000_invoicing_at_communication.sql`)

- `invoicing_at_communications`: cada envio ao e-Fatura (ambiente, operação, estado comunicado, resultado, código e mensagem da AT); append-only (trigger e privilégios), leitura por organização. É também a outbox: `fn_invoicing_at_queue(org, ambiente, limite)` (security invoker, só `service_role`) devolve os documentos cujo estado atual ainda não foi aceite, com falhas desde o último aceite e o último resultado. Em produção só entram séries normais.
- `invoicing_at_credentials`: subutilizador WFA por organização, emitente e ambiente; senha cifrada pelo backend; sem privilégios nem políticas para `anon`/`authenticated` (o browser nunca a lê).
- Validada em PGlite: 22 verificações (fila, aceites, mudança de estado, ambientes, imutabilidade, privilégios, rollback e reaplicação) — `validacao-pglite/validate-at.mjs`.

## Design decisions (ADR summary)

- **Emitente = a Empresa** (2026-11-05): o emitente continua a ser uma entidade legal, mas criada/atualizada ao gravar Empresa & Estrutura → Empresa (ver README do `organization`).
- **Vetores oficiais da AT nos testes**: o SAF-T de demonstração (`saft_idemo599999999.xml`, 36 documentos) e o par de chaves de exemplo publicados pela AT estão em `__tests__/fixtures/at/`. A chave privada aí é a de **exemplo público da AT** (descarregada do Portal das Finanças), não a do Mezza — exceção consciente à regra «nunca chaves no repositório»; se um scanner de segredos a assinalar, marcar como falso positivo.
- **Aritmética `Dec` local** (`decimal-ops`) em vez de alterar `src/kernel/money`: o módulo fica isolado dos outros (decisão do utilizador); pode subir ao kernel quando outro módulo precisar.
- **Emissão por compare-and-swap** (D4 da spec): a app lê a série, monta e assina o n+1 e grava com o estado esperado; a RPC bloqueia a série (`for update`), confere número, ATCUD e datas contra a série e falha com `stale_series` se outro terminal emitiu — assim não há buracos nem cadeias bifurcadas e a chave privada nunca entra na BD.
- **Escrita só pelas funções**: o sinalizador `invoicing.rpc` (local à transação) só vale a correr como o dono da função — um cliente com a service role não passa, e não tem privilégios de escrita. Um superutilizador da BD pode sempre contornar; contra isso, a cadeia de assinaturas (`verifySignatureChain`) denuncia qualquer alteração aos dados assinados.
- **Fuso: Europe/Lisbon para o `SystemEntryDate` assinado** (decisão do utilizador, 2026-11-03), **instante UTC para a cronologia**: na madrugada da mudança de hora de outubro a hora local repete-se; ordenar e bloquear pela hora local travaria a emissão durante uma hora.
- **Antes do certificado**: `SoftwareCertificateNumber` e `HashControl` «0», `R:0` no QR (Portaria 302/2016 campos 1.15 e 4.1.4.5; manual e-Fatura) — `pesquisa-perguntas-abertas.md` §4.
- **`invoicing_events` em vez de `audit_events`**: o registo fiscal é escrito na mesma transação das funções da BD e não depende do módulo `audit` (que tem cadeia e numeração próprias por organização).
- **Assinador recusa chaves que não sejam RSA 1024**: uma chave maior assinaria sem erro, mas o hash não caberia nos 172 caracteres do SAF-T.
- **Chave do produtor só por variável de ambiente** (`INVOICING_SIGNING_PRIVATE_KEY`); nunca no repositório nem na BD (Despacho 3.1.4, 4.3).
- **Antes do certificado só formação** (`checkIssue` → `uncertified-program`; `createSeries` recusa séries normais).
- **Permissão própria `sales.invoicing`**, fora dos `moduleAll("sales")` dos perfis Manager/Financeiro: em testes só o Admin a vê (migração `20261220110000_invoicing_access`).
- **Emissão idempotente**: `Idempotency-Key` obrigatório no `POST /invoicing/documents` — um reenvio ou duplo clique devolve a mesma resposta, nunca um segundo documento.
- **Taxas e menções em código, com fonte** (`vat-rates.ts`, `exemption-reasons.ts`): são lei nacional, não configuração por organização; v1 só ativa M10 e M99 (decisão §8.7).
- **Configuração errada não derruba o servidor**: chave ilegível ou variáveis inválidas → emissão desligada (503) e erro registado sem o conteúdo da chave (`safeInvoicingConfig`).
- **Formação não se mistura com documentos reais**: o modo da série fica gravado no documento; NC/ND e faturas de consultas de mesa só referem documentos do mesmo modo (e as NC/ND do mesmo cliente).
- **Configuração** (`src/config/env.ts`): `INVOICING_SIGNING_PRIVATE_KEY`, `INVOICING_SIGNING_KEY_VERSION`, `INVOICING_CERTIFICATE_NUMBER`; produtora no SAF-T `INVOICING_PRODUCER_TAX_ID` / `INVOICING_PRODUCER_NAME` (vazio = o emitente) e `INVOICING_PRODUCT_VERSION`; `INVOICING_PRODUCT_NAME` (por omissão «Mezza») forma o `ProductID` `<produto>/<produtora>`.
- **SAF-T** (`saft.service.ts`, puro): XML por ordem do XSD 1.04_01 a partir dos documentos gravados. Valor sem IVA de cada linha = base do grupo de imposto gravada, repartida pelas linhas ao cêntimo com soma exata (`kernel/money` `distribute`); `UnitPrice` = esse valor ÷ quantidade (sem IVA, já com descontos). Totais de controlo (Portaria 302/2016): em `SalesInvoices` excluem anulados (A) e faturados (F); em `WorkingDocuments` só os anulados — uma consulta de mesa faturada conta. NC a débito. `SourceID` do `DocumentStatus` = quem anulou/faturou. Carateres que o XML 1.0 não admite são retirados; a emissão já os recusa nas descrições (mínimo 2 carateres). O adapter lê documentos/linhas/impostos em páginas de 1000 (limite do PostgREST). Textos com limite do XSD cortados (SourceID 30, Reason 50, nome 100, localidade 50) — a BD guarda o texto completo.
- **SourceID** = id estável do utilizador sem hífens, 30 caracteres (`sourceIdFor`), nunca o email (longo e mutável; Despacho 3.3.6 proíbe reutilizar).
- **Dinheiro exato** com `kernel/money/decimal` (bigint); linhas sem IVA a 6 casas, totais a 2 (Despacho 3.2.3).
- **Comunicação à AT por webservice (F6), só ambiente de testes** até haver certificado (`INVOICING_AT_ENVIRONMENT` recusa outro valor). Sem `.pfx` e chave pública da AT, desligada (503) e sem cron.
- **Mensagens SOAP escritas à mão** a partir dos WSDL oficiais (`__tests__/fixtures/at/Fatcorews.wsdl`, `Comunicacao_Series.wsdl`), sem biblioteca SOAP (sem dependências novas); validadas contra o esquema dos WSDL (`validacao-saft/validar-wsdl.ps1`, 0 erros). Séries: o esquema não qualifica os elementos locais — só o da operação leva namespace.
- **e-Fatura a partir do documento gravado**: uma `LineSummary` por linha do resumo de impostos; referências (NC/ND) e documentos de origem (CM faturadas) em cada linha; `HashCharacters` «0» enquanto o certificado é «0»; `TaxEntity` «Global»; consumidor final 999999990 com o país do cliente.
- **Outbox = registo das comunicações** (não há tabela de fila): o que falta enviar deriva do estado do documento face ao último aceite — sem passos que possam ficar dessincronizados com a emissão. Resposta −10 («já registado») conta como aceite. Falhas repetem-se com espera de 5 min a 6 h; dados recusados só com «Repetir recusados»; credenciais recusadas só depois de regravadas (nem com `force`, para não bloquear o subutilizador).
- **Uma comunicação de cada vez por organização** (o pedido manual e o cron): bloqueio em memória — o servidor corre numa só instância; com várias, passar a um lock na BD.
- **Credenciais**: WFA (faturas) guardada por emitente, cifrada, porque o envio é automático (o manual e-Fatura prevê configurá-la no programa); WSE (séries) pedida no momento e nunca guardada (manual de Séries, Aspetos genéricos §2). Decisão a confirmar com o encarregado de proteção de dados.
- **Cron no processo** (`node-cron`, a cada 10 min, todas as organizações) só com a comunicação configurada.
- **IVA incluído** (restauração): total por taxa fixo; IVA = total × p/(100+p); base = total − IVA — o cliente paga o preço do menu.
- Spec, pesquisa e fases: `.scratch/certificacao-at/`.

## How to test

- Domínio, casos de uso e adapters (sem BD nem rede; as variáveis fictícias só satisfazem o `src/config/env.ts`):

  ```sh
  VENDUS_BASE_URL=https://vendus.example.invalid AIRMENU_ENTERPRISE_ID=0 AIRMENU_SALES_SUMMARY_ENTERPRISE_ID=0 \
  CREDENTIALS_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= \
  npx jest --config jest.config.cjs src/modules/invoicing --testPathIgnorePatterns=integration
  ```

- Migração em Postgres real sem Docker (PGlite): `.scratch/certificacao-at/validacao-pglite/README.md` (48 verificações; comunicação à AT: 22).
- Mensagens da AT contra os WSDL oficiais: os testes escrevem `__tests__/fixtures/*.test-output.xml`; validar com `.scratch/certificacao-at/validacao-saft/validar-wsdl.ps1`.
- SAF-T contra o XSD oficial: `.scratch/certificacao-at/validacao-saft/README.md` (estrutural, 0 erros) e validador oficial da AT `validador_v1_04.exe` (exemplo dos testes validado com sucesso, 2026-11-04).
- BD real com duas ligações (concorrência): `npx jest --config jest.config.cjs src/modules/invoicing/__tests__/integration` com `supabase start` + `supabase db reset` (não corre nesta máquina — sem Docker).

## Known gaps / open debt

- Por confirmar com a AT (e-Balcão, `pesquisa-perguntas-abertas.md` §9): campo do QR das autoliquidações (M30–M46, desligadas na v1); `R` antes do certificado (assumido «0»); se os documentos de formação vão ao e-Fatura (assumido que não); alerta 3.4.3 na hora repetida de outubro.
- Em falta: recibos (RC); recuperação de documentos manuais (M/D); desconto global (`SettlementAmount`); controlo das NC parciais por linha/quantidade e devoluções no tipo errado (Despacho 3.2.7, 3.3.9 — hoje pelo valor total, conferido também na BD); limite da FS por organização e exceção do art. 53.º (hoje 100 € fixo); cabeçalho com os dados do produtor nos documentos de formação (Despacho 1.5 — hoje o emitente; iguais se a Angry Box for a produtora); taxa por produto e canal (sala 13 %/23 %, take-away) — hoje a taxa vem em cada linha; tipos de `document-totals` ainda em `services/`.
- Os KMS de cloud podem não suportar RSA-1024 — a chave vive em variável de ambiente.
- O teste de integração (duas ligações) não correu; as migrações foram validadas em PGlite (uma ligação) e não estão aplicadas em lado nenhum.
- SAF-T validado pelo validador oficial da AT só com o exemplo dos testes; repetir com um ficheiro exportado da produção.
- Comunicação à AT (F6) **sem teste real**: falta o certificado de testes e a chave pública do Sistema de Autenticação (pedido por email a `asi-cd@at.gov.pt`) e um subutilizador WFA/WSE. Por confirmar no ambiente de testes: padding RSA do `Nonce` (assumido PKCS#1 v1.5), formato do `Created`, `CustomerTaxIDCountry` do consumidor final, se os documentos de formação são aceites, e os códigos de sucesso das operações de séries (o código decide pelo `infoSerie` devolvido). Em falta: recibos (`RegisterPayment`), eliminação (`DeleteInvoice`), comunicação de mês sem documentos, alerta por email antes do dia 5 (hoje só no ecrã), renovação do certificado.
