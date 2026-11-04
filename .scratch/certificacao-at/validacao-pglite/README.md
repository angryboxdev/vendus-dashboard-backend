# Validação da migração da faturação em Postgres real (PGlite)

Sem Docker nesta máquina, a migração `20261220100000_invoicing_certified_documents` valida-se em PGlite
(Postgres 17 em WebAssembly), com stubs do Supabase (papéis, privilégios por omissão, `auth`, `storage`).

```sh
# numa pasta à parte (não é dependência do projeto)
npm init -y && npm i @electric-sql/pglite@0.3.7
cp <repo>/.scratch/certificacao-at/validacao-pglite/*.mjs .
node validate-invoicing.mjs "<caminho do repo backend>"
```

`validate-invoicing.mjs` aplica a cadeia completa de migrações, reaplica a da faturação, verifica
emissão/compare-and-swap, as verificações da função, a escrita direta recusada (service_role e dono),
NC/anulação, consultas de mesa, HashControl, mudança de hora, rollback e reaplicação.
Resultado em 2026-11-03: 42 verificações OK, 0 falhas.
