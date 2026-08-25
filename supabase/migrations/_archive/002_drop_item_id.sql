-- Se já correste 001 com a coluna item_id, executa isto para passar a usar id (uuid) como identificador.

alter table public.dre_custos_variaveis
  drop constraint if exists dre_custos_variaveis_year_month_categoria_item_id_key;

alter table public.dre_custos_variaveis
  drop column if exists item_id;
