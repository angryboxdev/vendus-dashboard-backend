# Rollback das migrações do Novo RH

As migrações em `supabase/migrations/` só andam para a frente. Cada migração
nova do Novo RH traz aqui o seu script de reversão, com o **mesmo nome**
(ADR-0022, task RH §4.6.7):

```
supabase/migrations/20261012100000_hr_x.sql
docs/migrations/rollback/20261012100000_hr_x.sql
```

Regras:

- Reverter só o que a migração criou, pela ordem inversa.
- Alterações destrutivas (apagar/renomear colunas, reescrever dados) precisam
  de um plano escrito antes do merge: cópia dos dados afetados e como repor.
- Tabelas de auditoria nunca se apagam, nem no rollback.
- Testar o rollback no stack local (`supabase db reset` + aplicar + reverter)
  antes do merge.
