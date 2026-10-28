/**
 * Textos fictícios com a estrutura do texto extraído (pdf-parse) dos extratos reais da Uber e da Glovo.
 * Valores inventados mas coerentes: as linhas somam o total a transferir.
 */

export const UBER_MONTHLY_TEXT = `Extrato
Mensal
March 2026
Restaurante Teste
Rua Fictícia 1,
Porto, PT, 4000-000
Número do extrato
#ABC123XY
Data
Mar 01-31, 2026
ID do estabelecimento
am_000
Resumo mensal consolidado
Rendims
Vendas (10 Pedidos) \t1 300,00 €
Gratificações \t0,00 €
Taxas do recipiente \t0,00 €
Outros rendimentos \t0,00 €
Rendimentos totais \t1 300,00 €
Taxas Uber
Taxas de mercado \t-439,74 €
Outros débitos \t0,02 €
Taxas Uber totais \t-439,72 €
Despesas de marketing
Ofertas em artigos \t-30,00 €
Ajuste de Marketing \t0,00 €
Outras taxas da oferta \t-1,23 €
Despesas com anúncios \t-24,60 €
Créditos de anúncio \t0,00 €
Despesas totais com marketing \t-55,83 €
Alterações
Montante líquido do estorno (1 Pedidos) \t-5,00 €
Ajustes \t0,01 €
Alterações totais \t-4,99 €
Total líquido \t799,46 €*

-- 1 of 3 --

Restaurante Teste
Período de pagamento:
Feb 23, 2026 - Mar 01, 2026
Ref. de pagamento ID:
REF000001
Depósito iniciado :
Mar 02, 2026
Pagamentos recebidos no mês
Rendims
Vendas (2 Pedidos) \t40,00 €
Taxas Uber
Taxas de mercado \t-14,76 €
Pagamento líquido \t25,24 €

-- 2 of 3 --

Restaurante Teste
Período de pagamento:
Mar 02, 2026 - Mar 08, 2026
Ref. de pagamento ID:
REF000002
Depósito iniciado :
Mar 09, 2026
Pagamentos recebidos no mês
Rendims
Vendas (3 Pedidos) \t60,00 €
Taxas Uber
Taxas de mercado \t-22,14 €
Pagamento líquido \t37,86 €
`;

export const GLOVO_STATEMENT_TEXT = `Glovoapp Portugal, Unipessoal Lda 000000000 Rua Fictícia, 1, 1000-000 Lisboa
0000-0000-0000 1 de 2
Restaurante Teste Lda
Rua Fictícia 2
Porto 4000-000
999999990
I26TESTE0000001\tExtrato n.º:
Serviço prestado entre 2026-03-01 e 2026-03-15
Data: 2026-03-17
Taxa de acesso à plataforma Glovo 81,00 €
Taxa de serviço da plataforma 40,50 €
Taxa de serviço de estafetas 40,50 €
Taxa de manutenção 2,50 €
Taxa por pedido com Glovo Prime 1,12 €
Marketing promocional 10,00 €
Taxas de Ofertas Flash 5,00 €
Subtotal 99,62 €
IVA (23 %) 22,91 €
Total fatura
(IVA incluído)
122,53 €
+ Produtos 1.300,00 €
+ Serviço de entrega 0,00 €
- Total fatura -122,53 €
- Promoção de produtos paga pelo Parceiro -20,00 €
- Promoção Flash Paga pelo Parceiro -10,00 €
- Custo dos incidentes sobre os produtos -2,50 €
+ Reembolso de incidentes relativos a produtos 0,00 €
- Custo de cancelamentos e incidentes relativos ao serviço 0,00 €
- Entrega grátis devido a incidente 0,00 €
- Pagamentos já efetuados em dinheiro -15,00 €
- Dívida acumulada 0,00 €
Valor a transferir para o Parceiro 1.129,97 €

-- 1 of 2 --

Glovo Data Hora Estafeta # Fatura de estafeta Descrição
101000000001 2026-03-02 12:00 N/A N/A 1 x Pizza Teste 15,00 € 0,00 €
101000000002 2026-03-03 20:15 N/A N/A 1 x Pizza Teste ALERGIAS: nota fictícia 15,00 € -3,00 €
`;
