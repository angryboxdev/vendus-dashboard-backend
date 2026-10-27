# Faturas por email: webhook sem organização e processamento sem fila

Decidido em 2026-10-27 (task «Integração Resend e Receção Automática de Faturas»).

## Contexto

As faturas chegam por email a endereços exclusivos de cada empresa (Resend Inbound). O webhook da Resend não
traz organização: a empresa só se descobre pelo destinatário. O projeto exige `org_id` + RLS em todas as tabelas
e não tem fila nem worker; o import de uma fatura demora até ~20 s mais a IA, e o webhook tem de responder logo.

## Decisão

- **Tabela técnica sem `org_id`** — `inbound_email_events` (id do webhook, id do email, data, empresa quando se
  sabe, estado, motivo; sem remetente nem conteúdo). É a exceção à convenção: a idempotência tem de existir antes
  de se saber a empresa e os emails para endereços desconhecidos não têm empresa. RLS ativa sem políticas (só o
  service role) e acesso só por `src/infra/scoped-db/inbound-email-store.ts`, a única porta que procura um
  endereço sem filtro de empresa e cria o `OrganizationId` (como `device-token-lookup.ts`).
- **Sem fila**: o webhook grava o evento e um registo por PDF (`invoice_inbound_attachments`, por empresa) e
  responde; o processamento corre a seguir no mesmo processo e um `node-cron` de 10 em 10 minutos retoma falhas
  passageiras e anexos que ficaram a meio. Cada anexo é reservado por atualização condicional, por isso dois
  processos nunca tratam o mesmo.
- **Rotação do endereço numa função SQL** (`fn_rotate_invoice_inbound_address`, lock por empresa + índice único
  parcial «um ativo por empresa»), executável **só pelo service role** — ao contrário dos RPCs antigos (grant a
  todos os roles), porque `p_org_id` não pode vir de quem chama.

## Consequências

- Os emails em quarentena ficam só na base de dados (sem ecrã).
- Um reinício do servidor a meio de um import não perde o anexo (volta a «received» depois de 15 min), mas pode
  atrasá-lo até ao próximo ciclo do cron.
- Se no futuro houver fila/outbox (dívida já registada em `audit`, `notifications` e `stock-purchase-review`), o
  processamento passa para lá sem mudar o modelo de dados.
