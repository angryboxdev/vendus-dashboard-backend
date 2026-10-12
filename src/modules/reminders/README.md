# Module: reminders

> Status: active
> Last updated: 2026-10-12

---

## What it is and what it's for (business perspective)

**Avisos automáticos** do Novo RH (FE-111): o sistema lembra quem precisa,
sem ninguém ter de vigiar.

- **Entrada em falta** — X minutos depois do início do horário sem entrada: avisa o colaborador (se tiver conta) e o responsável direto.
- **Saída por registar** — registo ainda aberto X minutos depois do fim do horário: lembra o colaborador.
- **Fim do período experimental / fim de contrato** — X dias antes: avisa os administradores e o responsável direto.

Tudo desligado por omissão; liga-se em Novo RH → Configurações → Notificações
(geral, por centro, grupo ou pessoa — cascata D3). Os avisos aparecem no sino
de notificações (só na aplicação — D12).

---

## Technical purpose

Sem tabelas. `RemindersUseCases.run(org)` lê, por colaborador ativo, as regras
efetivas (`notifications.*`), o dia apurado pela assiduidade e os contratos, e
envia os avisos devidos pelo centro de notificações. Cada aviso tem uma chave
estável (`reminder:missing_in:<pessoa>:<dia>`, `contract:end:<contrato>:<data>`…):
o centro de notificações não repete a mesma.

## Domain concepts

- `ReminderRules` (`rulesFrom`), `ReminderDay`, `Notice`.
- `dayNotices` — entrada em falta (só até 4 h depois do início; nunca com ausência/feriado) e saída por registar (horários noturnos terminam no dia seguinte).
- `contractNotices` — contratos ativos dentro da antecedência.

## Ports

### Input (use cases)

- `RemindersUseCases.run(org)` → `{ people, notices, byKind }`.

### Output (domain dependencies)

- `RemindersSourcesPort` — hoje, colaboradores, dia da assiduidade, regras efetivas, contratos, conta do colaborador, responsáveis diretos, administradores (ligado no `server.ts`).
- `RemindersNotifierPort` — centro de notificações.

## Adapters

### Input

- `POST /api/novo-rh/reminders/run` (`governance.settings`) — "Verificar agora".
- `POST /api/internal/cron/novo-rh-reminders` (CRON_SECRET) — todas as organizações reais (as de demonstração ficam de fora). **Agendar de 10 em 10 minutos no Render** quando o Novo RH entrar em produção.

## Design decisions (ADR summary)

- Opt-in: nenhum aviso sai sem alguém o ligar nas Configurações.
- Só na aplicação (D12, ADR-0033): e-mail/push/WhatsApp continuam desligados.

## How to test

- `npx jest --config jest.config.cjs src/modules/reminders src/routes`

## Known gaps / open debt

- Lembrete antes do fim da jornada, pausas, documentos a expirar e bloqueios de envio (FE-111) ainda não existem.
