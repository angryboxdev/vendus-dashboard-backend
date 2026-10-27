# Módulo: invoice-email-intake

**Área:** Financeiro / Stock · **Estado (README):** active · **Código:** `src/modules/invoice-email-intake/`

## Objetivo
Faturas por email: cada empresa recebe faturas PDF num endereço exclusivo e renovável (Resend Inbound); os PDFs
entram pelo import das faturas (Faturas «Por rever») ou, para quem só usa o Stock, em Compras por rever.

## Estado atual
Etapa B (backend) feita no ramo `financeiro-faturas-email` (sem commits até autorização): webhook, assinatura,
endereços com rotação, processamento idempotente com novas tentativas, ligação ao import, testes e migração
`20261203100000_invoice_email_intake` validada em PGlite. Por fazer: Etapa C (frontend) e D (produção
«desligada», teste com a Resend).

## Arquitetura
- Código: `src/modules/invoice-email-intake/`; composição: `invoice-email-intake.module.ts`; documentação: o
  README do módulo; decisão da tabela técnica: [ADR-0042](../adr/0042-faturas-por-email.md).
- Endpoints: `POST /api/webhooks/resend` (público, assinatura Svix); `GET|POST|PATCH /api/invoices/email-intake…`
  (`finance.invoices`) e `/api/stock-purchase-reviews/email-intake…` (`stock.purchase_reviews`).
- Variáveis: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `INBOUND_EMAIL_DOMAIN`, `INBOUND_EMAIL_ALLOWED_ORGS`
  (piloto). Sem as três primeiras a funcionalidade fica desligada.

## Dependências
[invoices](invoices.md) (`ImportInvoiceFromEmailPort`, que usa o import em lote e o `import-for-stock`).

## Regras de negócio
Ver «Conceitos do domínio» e «Decisões de design» no README do módulo.

## Problemas conhecidos
Originais com URL pública (herdado do import manual); quarentena sem ecrã.

## Próximos trabalhos
Etapas C e D da task `TASK_MEZZA_RESEND_RECECAO_AUTOMATICA_FATURAS`.
