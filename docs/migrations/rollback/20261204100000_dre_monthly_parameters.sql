-- Rollback de 20261204100000_dre_monthly_parameters.sql
-- Apaga os parâmetros mensais da DRE (taxas do delivery/TPA, IVA teórico e marketing das plataformas).
-- Perdem-se os valores lançados à mão. Fazer antes o rollback do código (a API lê e escreve esta tabela).

drop table if exists public.dre_monthly_parameters;
