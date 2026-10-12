# Convites: procura do código sem organização (porta sem âmbito)

Decidido em 2026-10-12 (FE-054, Novo RH — opção recomendada, sem decisão
pendente do utilizador). Acrescenta uma terceira "porta sem âmbito" às do
ADR-0008 (`membership-lookup`, `device-token-lookup`).

## Contexto

Um trabalhador que pede a adesão não tem sessão: a organização só é conhecida
depois de resolver o código do convite. O resto do código só consulta a BD
através do `createScopedQuery`, que exige a organização.

## Decisões

- **Uma função nomeada** em `src/infra/scoped-db/invitation-lookup.ts`
  (`findInvitationScopeByCodeHash`) procura `invitations` pelo **hash** do
  código e devolve só `org_id` e o id do convite. Tudo o resto (estado,
  validade, utilizações, criar o pedido) volta a passar pelo scoped query.
- **O código em claro nunca é guardado** — SHA-256 com prefixo de domínio
  (`invitation:`), índice único global, e os últimos 4 caracteres para a lista
  mascarada. O código completo só é mostrado uma vez, a quem o criou.
- **Sem enumeração** — código inexistente, expirado, esgotado ou revogado dão
  a mesma resposta (400 `invalid_invitation`, mesma mensagem). As rotas
  públicas (`/api/public/join/:code`) têm limite por IP (20 pedidos / 15 min,
  memória do processo).
- **Utilizações sem RPC** — "comparar e trocar" no `uses` (até 3 tentativas);
  um check na BD garante `uses <= max_uses`.
- **Minimização** — o pedido só tem nome, apelidos e e-mail.

## Consequências

- O limite por IP é por instância (o Render pode ter várias); chega para
  travar tentativas de adivinhar códigos de 10 caracteres (31¹⁰ combinações).
- A retenção dos pedidos recusados/expirados depende da decisão D4 (ainda
  por tomar) — não há anonimização automática.
- O requerente não recebe e-mail (D12: avisos só na aplicação; ele ainda não
  tem conta).
