-- Rollback de 20261205100000_delivery_platform_statements.sql
-- Apaga os extratos importados das plataformas de delivery (Uber, Glovo, Bolt). Perdem-se as
-- importações — os ficheiros originais continuam com o utilizador e podem voltar a importar-se.
-- Fazer antes o rollback do código (a API lê e escreve esta tabela).

drop table if exists public.delivery_platform_statements;
