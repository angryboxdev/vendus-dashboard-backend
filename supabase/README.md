# Supabase – DRE

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Em **Project Settings → API** copie **Project URL** e **anon public** key para o `.env`:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
3. No dashboard do Supabase, abra **SQL Editor** e execute o conteúdo de `migrations/001_dre_custos_variaveis.sql`.
4. A tabela `dre_custos_variaveis` pode ser inspecionada e editada em **Table Editor**.

Os dados são organizados por `year`, `month` e `categoria` (`producao` | `venda`).
