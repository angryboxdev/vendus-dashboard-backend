# Remoção faseada do RH antigo

Decidido em 2026-10-20 (pedido do utilizador: «o RH antigo acho que já podemos remover»).

## Contexto

O RH antigo (frontend `pages/hr`, `modules/hr`, `pages/kiosk`; backend
`routes/hr*`, `services/hr*`, `modules/hr`) tem cerca de 45 mil linhas e 600+
testes. O Novo RH substitui-o, mas ainda há quatro dependências reais:

1. **Acesso** — o Novo RH estava só para Admin; gestores e perfis só de leitura
   do RH só tinham o RH antigo.
2. **Portal do Colaborador** — usa o `meRouter` antigo enquanto
   `time_tracking.portal.uses_novo_rh` estiver desligado (por omissão), e os
   documentos/recibos passam sempre pelo `modules/hr` antigo.
3. **Quiosque** — só existe no RH antigo (`/api/hr/kiosk/*`, PIN em
   `PATCH /api/hr/employees/:id/kiosk-pin`); o fecho de caixa também usa
   `hr_employees.kiosk_pin_hash`.
4. **Documentos** — o separador Documentos da ficha no Novo RH reutiliza
   `EmployeeDocumentsTab`/`HrProvider` do `modules/hr` antigo.

As tabelas `hr_employees`, `hr_positions`, `hr_employee_locations`, documentos,
categorias, feriados e o bucket `hr-documents` são partilhadas com o Novo RH e
**ficam sempre**.

## Decisões

- Remover por fases, nunca em big bang (`docs/agents/legacy-module-refactor.md`).
- Gestores não-Admin passam já ao Novo RH: cada área pela sua permissão
  (`hr.employees`, `hr.schedules`, `hr.attendance`, `hr.leave`,
  `hr.documents`); a administração do Novo RH continua só Admin.
- O quiosque é **refeito no Novo RH** (não retirado), com o PIN gerido em
  Pessoas; até lá o antigo continua.
- Dados do RH antigo (turnos, presenças, férias, pedidos, pagamentos,
  auditoria): **arquivar, não migrar** (D-P2 do Portal). Só se apagam depois
  de exportados e de a retenção ser validada (RGPD/laboral).
- **Sem histórico no Novo RH** (utilizador, 2026-10-20): o Novo RH começa sem
  registo passado — nada do histórico/auditoria antigo é lido nem mostrado.
  Passam só as informações dos colaboradores que já existem (fichas e
  documentos, que já estão em tabelas partilhadas).

## Fases

0. Código morto fora; esta decisão registada; READMEs em descontinuação. *(feito 2026-10-20)*
1. Desacoplar o Novo RH: lista de colaboradores das Configurações já lê do
   Novo RH e a ficha deixou de ligar à página antiga *(feito 2026-10-20)*;
   falta mover documentos (`/api/hr/people/:id/documents*`, `/api/me/documents*`
   e o separador da ficha) para o módulo de documentos/pessoas — backend feito
   2026-10-20 (D1: módulo `documents`, rotas `/api/novo-rh/...` + aliases
   `/api/hr/*`; auditoria em `document_audit_logs`, sem histórico antigo);
   frontend feito (D2, 2026-10-20); a limpeza das rotas `/api/hr/employees/:id/documents*` (D3) fica para a fase 3/4, porque a página antiga `/hr/employees/:id` ainda as usa. O PIN do
   quiosque já se define na ficha do Novo RH (`PUT /api/novo-rh/people/:id/kiosk-pin`,
   `hr.kiosk_pin`, mesmo hash) *(feito 2026-10-20)*.
2. Acesso e passagem: Novo RH aberto por permissão *(feito 2026-10-20)*; saldos
   de abertura e piloto do Portal; `uses_novo_rh` ligado em todas as
   organizações; quiosque no Novo RH.
3. Remover o frontend antigo (com redirecionamentos para `/hr/novo/*`).
4. Remover o backend antigo e as regras `/api/hr/*` da matriz.
5. Arquivar e apagar as tabelas só do RH antigo (com rollback), depois da validação da retenção.
