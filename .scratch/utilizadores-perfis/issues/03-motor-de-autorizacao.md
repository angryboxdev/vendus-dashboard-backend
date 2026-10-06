Status: done (motor + guardas + /api/me/access; aplicação às rotas no ticket 04)
Blocked by: 02

# Motor de autorização

`can(acesso, permissão)` puro no domínio; resolução perfil + overrides + estado por pedido (cache curta, invalidação nas escritas); `requirePermission(perm, nível)`; utilizador desativado → 403 no pedido seguinte; `GET /api/me/access` para o frontend. `requireMinRole` passa a derivar do motor durante a transição (sem segundo motor).
