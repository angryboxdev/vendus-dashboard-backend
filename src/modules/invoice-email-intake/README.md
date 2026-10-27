# Módulo: invoice-email-intake

> Status: active
> Última atualização: 2026-10-27 (Etapa B — backend; frontend e validação em produção «desligada» por fazer)

---

## O que é e para que serve (perspetiva de negócio)

**Faturas por email.** Cada empresa tem um endereço exclusivo (ex.: `k7m2…@<domínio>`) que dá aos
fornecedores. Quando chega um email com faturas em PDF, o Mezza importa-as sozinho para a mesma revisão do
import manual. Ninguém confirma nada por email: receber uma fatura **não** a lança, não a paga e não mexe no stock.

**O problema que resolve:** hoje cada fatura recebida por email tem de ser descarregada e importada à mão.

**O fluxo do ponto de vista do negócio:**

```
Fornecedor                         Mezza                                  Empresa
─────────────────                  ──────────────────────────             ──────────────────────────
1. Envia a fatura (PDF) para  →    2. Recebe, confirma de que empresa
   o endereço da empresa              é (só pelo destinatário)
                                   3. Lê o PDF com o import das faturas →  4. Vê-a em Faturas «Por rever»
                                      (ou Compras por rever, se a             (ou Stock → Compras por rever)
                                      empresa só usa o Stock)              5. Confirma, como no import manual
```

**Conceitos-chave para o negócio:**

- **Endereço de receção** — o email da empresa para faturas. Um só ativo; «Gerar novo endereço» substitui-o
  (o antigo deixa de ser aceite; os fornecedores têm de receber o novo).
- **Destino** — `Faturas (Financeiro)` por defeito: a fatura passa pelo Financeiro, que decide se vai para o
  Stock depois de aprovada. `Stock → Compras por rever` para empresas que só usam o Stock.
- **Estados de cada PDF** — Recebido, Em processamento, Por rever (importado), Duplicado, Erro de leitura,
  Rejeitado.

---

## Propósito técnico

Recebe o webhook `email.received` da Resend (Inbound), verifica a assinatura, decide a empresa pelo destinatário,
regista cada PDF e importa-o pela porta `ImportInvoiceFromEmailPort` do módulo `invoices` (o mesmo pipeline do
import manual — leitura QR/IA, duplicados por hash e identidade fiscal, regras financeiras). **Não** tem leitor
de faturas nem fila de revisão próprios.

## Conceitos do domínio

- `InboundAddress` (`domain/entities/inbound-address.ts`) — identificador aleatório de 16 caracteres (alfabeto sem
  ambíguos, ~79 bits) gerado de bytes criptográficos (`RandomBytesPort`). `addressAcceptedAt`: um email conta
  pela hora a que a Resend o recebeu — aceite se o endereço já existia e ainda não estava desativado nesse
  momento (regra dos eventos atrasados depois de uma rotação).
- `InboundAttachment` (`domain/entities/inbound-attachment.ts`) — estados `received → processing → imported |
  duplicate | rejected | read_error`. Falha passageira → `read_error` com nova tentativa (5 min, 30 min, 2 h;
  4 tentativas no total); estados finais nunca se repetem.
- Regras (`domain/services/intake-rules.ts`): só destinatários do nosso domínio decidem a empresa (aceita «Nome
  <a@b>» e «+etiqueta»); só PDFs anexados (não inline), até 20 MB e 10 por email; conteúdo real `%PDF-`.

## Ports

### Entrada (use cases)

- `ReceiveInboundEmailUseCase` (`ReceiveInboundEmailPort`) — webhook já verificado: regista o evento
  (idempotente), resolve a empresa, grava um registo por PDF. Quarentena: endereço desconhecido, desativado, ou
  endereços de empresas diferentes no mesmo email. Não descarrega nada (responde depressa).
- `ProcessInboundAttachmentsUseCase` (`ProcessInboundAttachmentsPort`) — por empresa: reserva cada anexo pendente
  (atualização condicional), descarrega da Resend, valida e importa. Corre logo a seguir ao webhook e de 10 em
  10 minutos (novas tentativas e anexos que ficaram «em processamento» > 15 min).
- `GetEmailIntakeUseCase`, `RotateInboundAddressUseCase`, `SetEmailIntakeDestinationUseCase` — ecrã «Faturas por
  email»: endereço, endereços anteriores, destino, contagens dos últimos 30 dias, últimos 20 PDFs.

### Saída (dependências do domínio)

- `InboundAddressRepositoryPort` (por empresa) e `InboundAddressLookupPort` (sem empresa — a empresa só se sabe
  por aqui).
- `InboundEventStorePort` — eventos do webhook (tabela técnica sem `org_id`, ADR-0042).
- `InboundAttachmentRepositoryPort`, `IntakeSettingsRepositoryPort`.
- `ResendReceivingPort` — API Receiving da Resend.
- `InvoiceIntakePort` — import no módulo `invoices`.
- `RandomBytesPort`.

## Adapters

### Entrada

- `createResendWebhookHandler` (`adapters/in/resend-webhook.controller.ts`) → `POST /api/webhooks/resend`.
  Público, montado no `server.ts` com `express.raw` **antes** do `express.json` global e da autenticação (a
  assinatura é sobre o corpo original). Sem configuração → 503; assinatura inválida → 401; corpo inválido → 400;
  aceite/quarentena/repetido → 200; falha nossa → 500 (a Resend repete; o evento é retomado).
- `verifySvixSignature` (`adapters/in/svix-signature.ts`) — esquema Svix/Standard Webhooks sem SDK
  (`node:crypto`, comparação em tempo constante, janela de 5 min).
- `createEmailIntakeRouter` → `GET /api/invoices/email-intake`, `POST …/address`, `PATCH …/settings`
  (`finance.invoices`) e o mesmo em `/api/stock-purchase-reviews/email-intake` (`stock.purchase_reviews`).
  Montado **antes** do router das faturas (senão `/invoices/:id` apanhava o caminho).

### Saída

- `SupabaseInboundAddressRepository` → `invoice_inbound_addresses` + RPC `fn_rotate_invoice_inbound_address`
  (`ScopedQuery.rotateInvoiceInboundAddress`).
- `SupabaseInboundAttachmentRepository` → `invoice_inbound_attachments`.
- `SupabaseIntakeSettingsRepository` → `invoice_email_intake_settings` (sem linha = Faturas).
- `InfraInboundEmailStoreAdapter` → `infra/scoped-db/inbound-email-store.ts` (procura do endereço e eventos, sem
  filtro de empresa).
- `ResendReceivingAdapter` → `GET https://api.resend.com/emails/receiving/:email_id/attachments` + descarga do
  `download_url` (válido 1 h), `fetch` nativo com timeout de 30 s.
- `InvoicesIntakeAdapter` → `ImportInvoiceFromEmailPort` (módulo invoices, ligado em `server.ts`).
- `NodeRandomBytesAdapter` → `crypto.randomBytes`.

## Decisões de design

- **Sem fila nova**: o webhook só regista; o processamento corre fora do pedido (`setImmediate`) e o cron em
  processo (`node-cron`, como o consumo Vendus) recupera o que falhou ou ficou a meio. Idempotência em camadas:
  `svix-id`/`email_id` únicos (evento), `(email_id, attachment_id)` único (anexo), reserva condicional por anexo,
  e no import o hash SHA-256 do ficheiro e a identidade fiscal (NIF, tipo, série/número, ATCUD).
- **A empresa só pelo destinatário** — `received_for` do evento (a quem a Resend entregou, inclui Bcc e
  reencaminhamentos); sem ele, to + cc. Nunca pelo remetente nem pelo conteúdo.
- **Só PDF** (decisão do utilizador): imagens de assinatura/logótipo nem ficam no histórico.
- **Destino por empresa** (decisão do utilizador): por defeito as Faturas (o Financeiro decide o Stock depois de
  aprovar); `stock` usa `import-for-stock` (Compras por rever). Ainda não há registo de «módulos contratados»,
  por isso é uma escolha no ecrã.
- **Documento de cobrança AT/SS** recebido por email → rejeitado com indicação para importar à mão (o import
  manual trata-o à parte).
- **Piloto**: `INBOUND_EMAIL_ALLOWED_ORGS` limita que empresas geram endereço.

## Como testar

- `npx jest src/modules/invoice-email-intake` (com as variáveis fictícias do `jest` do projeto) e
  `npx jest src/modules/invoices/__tests__/use-cases/import-invoice-from-email.test.ts`.
- Migração: validada em PGlite (aplicar, reaplicar, rotação, unicidades, FK composta, permissões, rollback,
  reaplicar).

## Pontos de atenção / dívidas conhecidas

- Os originais continuam no bucket `invoice-documents` com URL pública (igual ao import manual) — a task pede
  armazenamento privado; fica como dívida do módulo invoices.
- O endereço antigo continua a ser aceite pelo SMTP da Resend; só o Mezza deixa de o aceitar (quarentena).
- Os eventos em quarentena não têm ecrã (só na base de dados, para os administradores técnicos).
- Rotação concorrente garantida na base (lock por empresa + índice único parcial) — sem teste automático de
  concorrência real (não há base local; validada a lógica em PGlite, sequencialmente).
