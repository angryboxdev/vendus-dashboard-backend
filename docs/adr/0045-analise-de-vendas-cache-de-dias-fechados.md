# Análise de Vendas guarda os dias fechados em blocos dia × hora × canal; a AirMenu só a pedido

A página «Análise de Vendas» (Operação) mostra até 12 meses comparados com o ano
anterior e o mês anterior, ao nível da hora. Pedir isso à Vendus a cada abertura
custaria milhares de pedidos (um por documento). A API da AirMenu é lenta (1
pedidos a cada 2 s, um por encomenda) e falha com frequência.

Decidido:

- Cada dia **fechado** (anterior a hoje, em Lisboa) é guardado uma vez, por
  fonte, em blocos agregados (`sales_analysis_buckets`: dia, hora, canal, bruto,
  líquido, n.º de vendas) e marcado como coberto em `sales_analysis_days`. Um dia
  coberto **nunca mais é pedido** à fonte. O dia de hoje nunca é guardado.
- **Vendus:** os dias em falta enchem-se sozinhos, em segundo plano, aos blocos
  de 7 dias; hoje vem sempre em direto (cache de 5 min).
- **AirMenu:** nunca é chamada ao abrir a página. O utilizador busca **um mês de
  cada vez**; só os dias desse mês ainda não guardados (mais hoje) são pedidos.
  Os meses pedidos entram numa **fila única** (um mês de cada vez, mesmo com
  vários cliques) e cada mês é buscado **uma semana de cada vez**, com pausa
  entre semanas e guardando cada semana — para nunca carregar a API de uma vez
  e deixar os outros ecrãs da AirMenu (fechos de caixa, KDS) respirar.
  Um erro propaga-se: um dia falhado nunca fica guardado como «sem vendas».
- Os cálculos (KPIs, destaques, mapa de calor, detalhes) fazem-se no frontend a
  partir dos blocos; o backend só fornece dados e a previsão.
- A previsão do mês corrente usa o fornecedor de IA do Assistente, recebe só
  totais diários e é validada; sem IA ou com resposta inválida usa-se a mediana
  do mesmo dia da semana nas últimas 6 semanas.

## Consequências

- A primeira abertura de um período longo é lenta (a página mostra o progresso);
  as seguintes são imediatas, mesmo depois de um deploy.
- Correções posteriores a um documento de um dia já guardado (por exemplo, uma
  NC emitida com data antiga) não aparecem. A NC conta no dia em que é emitida,
  como no Resultados, por isso este caso é raro.
- A AirMenu pode deixar de fora encomendas que falhem duas vezes sem dar erro;
  esses dias ficam guardados assim. Aceite pela gerência: não se volta a pedir.
- Só valores agregados são guardados (sem dados de clientes).
