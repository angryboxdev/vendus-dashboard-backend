Status: todo
Blocked by: 01

# Conta do colaborador e acesso

Backend: `AppRole` + `ROLE_LEVEL.employee = 0` + `isAppRole`; `GET /api/auth/me` devolve `employeeId` ligado. Ação "Dar acesso ao Portal" (admin/manager) na ficha: liga conta existente da org com o mesmo email, senão cria conta `employee` com palavra-passe temporária (`user_metadata.must_change_password`). Revogar acesso. Auditoria em `hr_audit_logs`.
Frontend: `OrgRole` aceita `employee`; após login, `employee` → `/portal`; rotas de gestão redirecionam para `/portal`; ecrã "Definir nova palavra-passe" no 1º login; gestor ligado vê "O meu portal".
Testes críticos: conta existente não duplica; employee recebe 403 nas rotas de gestão.
