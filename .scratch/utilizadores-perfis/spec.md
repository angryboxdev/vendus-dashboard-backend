# Spec — Utilizadores & Perfis de Acesso 2.0

Status: todo
Origem: `Task_Utilizadores_Perfis_Acesso_2_0.md` + 4 mockups (enviados pelo
utilizador em 2026-10-06). Revisão e decisões no mesmo dia.
Branch: `branch-rh` (backend + frontend).

## Objetivo

Substituir os papéis rígidos (`admin|manager|hr_viewer|employee`) por
`Perfil de acesso → permissões herdadas → exceções individuais`, com
autorização única `can(user, permissão)` aplicada no backend. Criar
utilizador = escolher perfil e guardar; exceções só quando preciso.

## Estado atual (2026-10-06)

- Autorização por nível de papel em cada rota: `requireMinRole(...)` no mount
  ou inline; regras ligadas ao papel também em mascaramento de dados
  sensíveis (`sensitive-field-masking`), visibilidade de documentos da
  Empresa e do calendário, ações só-admin (Locais, Empresa, feriados,
  confirmar contagem, PIN quiosque).
- Papel vem no token (`org_role`, `custom_access_token_hook`); 1 membership
  por utilizador. ADR-0003 já assinalava a taxonomia como questão em aberto.
- Página `/admin/users` + `/api/auth/users`: legado, só admin; sem
  histórico, sem estado (só apagar), sem ligação à ficha.
- Portal do Colaborador (`.scratch/portal-colaborador`): papel `employee`,
  `hr_employees.user_id`, barreira `restrictEmployeeToPortal`.

## Decisões

| # | Decisão |
|---|---|
| U1 | Níveis por funcionalidade `INHERIT / NONE / READ / MANAGE`; override individual prevalece; herança dinâmica; "Restaurar padrão" remove o override. |
| U2 | Perfis iniciais: Admin (protegido, acesso total), Manager, RH, Financeiro, Colaborador (protegido, só Portal) + **Visualizador RH legado** (preserva acessos atuais). |
| U3 | READ = GET; MANAGE = escritas. Operações sensíveis como **permissões especiais**: Fechar mês, Reabrir mês, **Ver dados sensíveis (RH)** (decisão 3), gerir utilizadores/perfis, configurações críticas. Fecho mensal não é funcionalidade nem caixa de verificação dentro de Assiduidade. |
| U4 | Backend é a fonte de verdade; perfil/exceções/estado lidos da BD **por pedido** (cache curta invalidada nas escritas) — revogação e desativação têm efeito no pedido seguinte. O token mantém só identidade + organização. |
| U5 | **Nenhum módulo é editável na UI antes de o backend o aplicar** (parity first). |
| U6 | Acesso ao Portal: Admin, ou quem tem **RH → Colaboradores: Gerir**, mas apenas com perfil Colaborador (decisão 1). Restantes perfis: só Admin. |
| U7 | Editar utilizador: ecrã largo com resumo (mockup 3) (decisão 2). |
| U8 | Restrição por Local fora desta fase (decisão 4). |
| U9 | Auditoria em `organization_audit_logs` (sem tabela nova). Concorrência: `version` em perfis e membership (409 se mudou). Nunca 0 Admins ativos. |
| U10 | "Último acesso" = `last_sign_in_at` (Supabase); sem tipo de dispositivo (minimização). Sem "pedidos" em Férias (não existem). Sino de notificações não entra. |
| U11 | Migração: admin→Admin, manager→Manager (com as exceções só-admin de hoje), hr_viewer→Visualizador RH legado, employee→Colaborador; matriz de acessos rota a rota igual antes/depois. Uma migração única, a juntar à do Portal para o Raul. |

## Fora de âmbito

Permissões por Cargo, temporárias, por horário, por IP, por campo, aprovação
de acesso, SSO, nova autenticação/auditoria, restrição por Local.

## Tickets

1. `01-catalogo` — inventário de rotas → módulo/funcionalidade/nível; validar com o utilizador.
2. `02-modelo-e-migracao`
3. `03-motor-de-autorizacao`
4. `04-aplicacao-por-modulo`
5. `05-utilizadores-backend`
6. `06-perfis-backend`
7. `07-frontend-utilizadores-e-perfis`
8. `08-frontend-por-permissoes`
9. `09-colaborador-e-portal`
