# Certificação AT de software de faturação: enquadramento jurídico, fiscal e processual

> Pesquisa feita a 3 de novembro de 2026 para o projeto Mezza (Angry Box).
> **Natureza:** apoio à decisão, não é parecer jurídico. Tudo o que é fiscal, legal ou contratual tem de ser validado por contabilista certificado ou jurista antes de qualquer uso oficial.
> **Convenção:** **[FACTO]** = confirmado em fonte primária (texto legal ou página oficial da AT/gov.pt), com a referência. **[SECUNDÁRIA]** = só confirmado em fonte secundária (software houses, OCC, imprensa, fóruns). **[OPINIÃO]** = sugestão ou inferência minha. **Não confirmado** = não consegui verificar.
> **Limitação técnica:** as páginas de detalhe do Diário da República (diariodarepublica.pt/dr/detalhe/...) não devolvem texto por acesso automático. Os textos legais foram lidos nas **versões consolidadas publicadas pela própria AT** (PDF «Legislação» do Portal das Finanças, que indicam o histórico de alterações) e, para o DL 9/2025, no PDF oficial do DR. As versões consolidadas da AT dizem expressamente «não dispensa a consulta do diploma original».

---

## Resumo executivo

**Pergunta: a Angry Box, com o CAE de restauração que tem, pode ser a «produtora» do Mezza e pedir a certificação?**

1. **Sim, a Angry Box pode ser a produtora e pedir a certificação.** Nenhum dos diplomas que regulam a certificação (Portaria n.º 363/2010 na redação atual, Despacho n.º 8632/2014, DL n.º 28/2019) exige um CAE de informática, nem um CAE específico, a quem pede a certificação. O pedido é feito pela «empresa produtora de software» através da declaração Modelo 24 no Portal das Finanças, com a chave pública RSA (Portaria 363/2010, art. 4.º). **[FACTO]**
2. **Há prova prática:** a lista pública de programas certificados da AT inclui produtores cuja atividade não é software, incluindo **restaurantes**: «Restaurante Malheiro» (RESTAURANTE MALHEIRO, LDA, cert. n.º 2125), «fonduegest» (RESTAURANTE O FONDUE LDA, n.º 1959), «GEPRO SQL» (POMPEU DOS FRANGOS-SOCIEDADE HOTELEIRA LDA, n.º 1997), «GestAlves» (GENTES & COSTUMES - RESTAURAÇÃO LDA, n.º 2279), «POSGest» (NAREST, n.º 2754), além de McDonald's, El Corte Inglés, CP, Auchan, etc. **[FACTO: lista da AT]** Que estas empresas não tenham CAE de informática é **inferência** pelo nome; não verifiquei os CAE.
3. **Uso próprio também obriga a certificar.** Até 2014 havia uma exceção para «software produzido internamente [...] do qual sejam detentores dos respetivos direitos de autor» (Portaria 363/2010, art. 2.º, n.º 2, al. a), na redação da Portaria 22-A/2012). Foi **revogada pela Portaria n.º 340/2013** (em vigor a 1/1/2014, com adiamentos por despacho até 31/12/2014). Hoje, quem fatura por programa informático tem de usar **exclusivamente programas previamente certificados** (DL 28/2019, art. 4.º, n.º 1). **[FACTO]** A Angry Box, como utilizadora, estaria sempre obrigada (usa programas de faturação e, se for sociedade, tem contabilidade organizada).
4. **CAE: distinguir certificação de comercialização.**
   - Para **certificar e usar o software só internamente** (a Angry Box a faturar as suas próprias vendas), não há venda de software, logo não há nova atividade económica a declarar. **[OPINIÃO]**
   - Para **vender o Mezza como SaaS a outros restaurantes**, passa a haver prestação de serviços sujeita a IVA. Isso obriga a **declarar a nova atividade** (declaração de alterações, CIVA art. 32.º, 15 dias), acrescentando um CAE secundário adequado da CAE-Rev.4, por exemplo **62100 «Atividades de programação informática»** ou **58290 «Edição de outros programas informáticos»** (DL 9/2025, anexo). A escolha do código é para o contabilista. **[FACTO quanto à obrigação e aos códigos; OPINIÃO quanto à escolha]** Falhar a declaração de alterações dá coima de 300 € a 7 500 € (RGIT art. 117.º, n.º 2). **[FACTO, via PGDL]**
   - O **objeto social** do pacto da Angry Box também deve abranger a atividade. **Não verificado** nesta pesquisa (direito societário).
5. **Uso próprio vs SaaS: o processo de certificação é o mesmo** (um certificado por programa, Modelo 24, testes da AT). O que muda com SaaS é: a obrigação de declarar a atividade, o IVA a 23 % sobre o serviço, a responsabilidade do produtor perante clientes e a AT (RGIT art. 128.º, n.º 1 e n.º 3 punem quem cria ou **transaciona** software não conforme), o papel RGPD de **subcontratante** (art. 28.º RGPD) e os requisitos de integração por cliente (subutilizador WFA de cada cliente para o e-Fatura).
6. **Uma empresa separada não é exigida por lei. Para SaaS, é a opção que recomendo avaliar** **[OPINIÃO]**: isola o risco contraordenacional e contratual do produtor face ao restaurante, deixa o certificado e a chave privada numa entidade transmissível, separa a contabilidade e o IVA, e evita que a Angry Box seja ao mesmo tempo produtora e utilizadora de um programa cuja chave privada deve ser «de conhecimento exclusivo do produtor» (Portaria 363/2010, art. 3.º, al. b)).

**Principais coisas por confirmar:** o conteúdo atual do formulário Modelo 24 e se existem pré-requisitos no Portal (atividade aberta, situação tributária regularizada); se há taxa (não encontrei nenhuma); o procedimento para novas versões; se o certificado é transmissível entre entidades; o estado final do OE 2027 (PDF/assinatura qualificada, SAF-T da contabilidade).

---

## 1. Enquadramento legal em vigor

### 1.1 Portaria n.º 363/2010, de 23 de junho (certificação prévia)

- **Estado:** vigente. Histórico de alterações indicado pela AT: **Portaria 22-A/2012 (24/01), Portaria 160/2013 (23/04), Portaria 340/2013 (22/11), DL 28/2019 (15/02)**. Republicada pela Portaria 340/2013. **[FACTO: [Portaria 363/2010 consolidada, AT](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/Portaria_363_2010.pdf)]**
- **Não encontrei alterações posteriores ao DL 28/2019.** A «Portaria 195/2020» **não altera** a 363/2010: regulamenta o QR e o ATCUD (ver 1.4). **[FACTO quanto à 195/2020; não confirmado no DR consolidado que não haja outra alteração]**
- **Artigos revogados pelo DL 28/2019:** arts. 1.º, 2.º, 8.º e 9.º (DL 28/2019, art. 44.º, al. i)). O art. 11.º também está revogado. A obrigação de uso de software certificado passou para o **DL 28/2019, art. 4.º**. **[FACTO]**
- **Artigos em vigor (texto consolidado AT):**
  - **Art. 3.º, requisitos cumulativos:** a) exportar o SAF-T (Portaria 321-A/2007); b) sistema que identifique a gravação de faturas e documentos retificativos «através de um algoritmo de cifra assimétrica e de uma chave privada de conhecimento exclusivo do produtor do programa»; c) controlo de acesso com autenticação de cada utilizador; d) nenhuma função que, no local ou remotamente, altere informação fiscal «sem gerar evidência agregada à informação original»; e) demais requisitos técnicos aprovados por despacho do diretor-geral da AT.
  - **Art. 4.º, obrigações:** «As empresas produtoras de software, antes da comercialização dos programas, para efeitos de certificação, devem enviar à AT: a) Uma declaração de modelo oficial [...]; b) A chave pública [...]».
  - **Art. 5.º, emissão do certificado:** n.º 1, a AT emite o certificado **no prazo de 30 dias** a contar da receção da declaração; n.º 2, a emissão pode ser precedida de **testes de conformidade**, e o prazo fica **suspenso** até à sua conclusão; n.º 3, a AT pode fazer testes **em qualquer momento**, e o produtor tem de disponibilizar um exemplar do programa e a documentação, «incluindo o dicionário de dados»; n.º 4, a AT mantém no seu sítio uma lista dos programas, versões e produtores; n.º 5, a versão certificada tem de cumprir os requisitos mesmo quando usada por quem não é obrigado.
  - **Art. 6.º, assinatura:** RSA sobre `InvoiceDate;SystemEntryDate;InvoiceNo;GrossTotal;Hash anterior` (mesmo tipo e série). Imprime-se: 4 carateres da assinatura (posições 1, 11, 21 e 31), a expressão «Processado por programa certificado n.º...» e a identificação única do documento.
  - **Art. 7.º, documentos de transporte e outros:** também se assinam as guias de transporte e «quaisquer outros documentos [...] suscetíveis de apresentação ao cliente para conferência [...], nomeadamente as designadas **consultas de mesa**» (n.º 1, al. b)), segundo a tabela 4.3 WorkingDocuments.
  - **Art. 10.º, revogação do certificado:** pelo membro do Governo das finanças, sob proposta do diretor-geral da AT, «quando deixarem de ser observados os requisitos previstos no artigo 3.º».
  **[FACTO: mesma fonte]**
- **O que cada alteração mudou:**
  - **Portaria 22-A/2012:** republicou a portaria e alargou o universo de obrigados. Mantinha as exclusões do art. 2.º, n.º 2: a) software produzido internamente ou por empresa do mesmo grupo, «do qual sejam detentores dos respetivos direitos de autor»; b) volume de negócios ≤ 100 000 €; c) menos de 1 000 faturas por ano; d) máquinas de venda automática, bilhetes, etc. **[FACTO: [Portaria 22-A/2012, versão AT](http://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/portaria%2022-A%20-%202012.pdf); [DR](https://diariodarepublica.pt/dr/detalhe/portaria/22-a-2012-402697)]**
  - **Portaria 160/2013:** segunda alteração da 363/2010, em conjunto com a alteração da Portaria 321-A/2007 (SAF-T). **[SECUNDÁRIA: resumo de pesquisa; conteúdo exato não lido]**
  - **Portaria 340/2013** (em vigor a 1/1/2014): **revoga as alíneas a) e c) do n.º 2 do art. 2.º**, ou seja, a exceção do software interno e a das menos de 1 000 faturas. O preâmbulo diz que a dispensa da al. a) «tem sido comprovadamente utilizada de forma abusiva». Introduz a expressão «Processado por programa certificado n.º...». **[FACTO: [Portaria 340/2013, versão AT](http://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/Portaria_340-2013.pdf); [DR](https://diariodarepublica.pt/dr/detalhe/portaria/340-2013-503842)]**
  - **Adiamentos da revogação para software interno:** Despacho SEAF n.º 616/2013-XIX (para 1/4/2014, com Modelo 24 a submeter até 31/12/2013) e Despacho n.º 345/2014-XIX (para 31/12/2014, para quem já tivesse entregue o Modelo 24 e os elementos dos n.os 2 e 3 do art. 5.º). **[SECUNDÁRIA: [Informador, 616/2013](https://informador.pt/legislacao/diploma/certificacao-dos-programas-informaticos-de-faturacao/); [Informador, 345/2014](https://informador.pt/legislacao/diploma/certificacao-de-programas-informaticos-de-faturacao-2/)]** Mostram que a AT trata as empresas com software interno como «produtoras» que submetem o Modelo 24.

### 1.2 Despacho n.º 8632/2014, de 3 de julho (requisitos técnicos)

- **Estado:** vigente, sem alterações segundo a AT. Revogou o Ofício-Circulado n.º 50001/2013. **[FACTO: [Despacho 8632/2014, versão AT](http://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/Despacho_n%C2%BA_8632_2014_03_07.pdf); [DR](https://diariodarepublica.pt/dr/detalhe/despacho/8632-2014-25703782)]**
- **Pontos com impacto jurídico e processual (detalhe técnico fica para a pesquisa técnica):**
  - **1.1:** assinar todos os documentos com eficácia externa, exceto recibos: faturas e retificativos, documentos de transporte e documentos de conferência, «nomeadamente as designadas consultas de mesa».
  - **1.2:** documentos que não são fatura levam «Este documento não serve de fatura».
  - **1.5:** modo de formação em série própria, com os dados da **empresa de software** no cabeçalho e a menção «Documento emitido para fins de Formação».
  - **2.1.4:** a mudança do par de chaves só pode ser feita **após comunicação à AT por nova declaração Modelo 24** com upload da chave pública.
  - **2.2.2:** formato impresso, por exemplo «AxAx-Processado por programa certificado n.º 0000/AT».
  - **2.2.3:** recibos levam «Emitido por programa certificado n.º 0000/AT».
  - **3.2.9:** formulários de impressão desenhados ou validados pelo produtor.
  - **3.3:** proibições, como alterar o NIF de clientes com documentos ou a descrição de produtos.
  - **4 a 6:** RSA, chave pública PEM em .txt entregue com o Modelo 24, 1024 bits, SHA-1, certificado autoassinado admitido.
  **[FACTO]**

### 1.3 Decreto-Lei n.º 28/2019, de 15 de fevereiro (regime de faturação e arquivo)

- **Estado e alterações:** vigente; alterado pelo **DL 48/2020 (03/08)** e pelo **DL 49/2025 (27/03)**. **[FACTO: [DL 28/2019 consolidado, AT](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/Decreto_Lei_28_2019.pdf)]**
- **Normas-chave:**
  - **Art. 3.º, meios de processamento:** programas informáticos de faturação, incluindo as aplicações da AT; outros meios eletrónicos; ou impressos de tipografia autorizada.
  - **Art. 4.º, n.º 1:** sujeitos passivos com sede, estabelecimento estável ou domicílio em PT «estão obrigados a utilizar, exclusivamente, programas informáticos que tenham sido objeto de prévia certificação pela AT, sempre que: a) volume de negócios > 50 000 € no ano anterior [...]; b) **Utilizem programas informáticos de faturação**; c) Sejam obrigados a dispor de contabilidade organizada ou por ela tenham optado». O texto não diz «cumulativamente». Fontes secundárias e a prática leem as alíneas como **alternativas**, e eu também. **[FACTO quanto ao texto; leitura alternativa = OPINIÃO/SECUNDÁRIA]**
  - **Art. 4.º, n.º 2:** requisitos e procedimento de certificação definidos por portaria, ou seja, a 363/2010. **N.º 3:** lista pública. **N.º 4:** se o programa estiver inoperacional, usam-se impressos de tipografia, recuperados depois para o programa.
  - **Art. 4.º-A (DL 49/2025, desde 1/7/2025):** aplicações de faturação da AT.
  - **Art. 5.º, n.º 1:** faturas emitidas pelo sujeito passivo, que **pode recorrer a terceiros** em seu nome e por sua conta, continuando **responsável** pela emissão e pelo conteúdo. **N.º 2:** se o terceiro não tiver sede ou estabelecimento em **nenhum Estado-Membro**, é precisa autorização prévia da AT.
  - **Art. 6.º:** autenticidade, integridade e legibilidade, com controlos de gestão documentados e disponíveis à AT.
  - **Art. 7.º:**
    - n.º 2: elementos dos documentos de conferência, incluindo a «indicação expressa de que não constituem fatura»;
    - n.º 3: QR e código único de documento;
    - n.º 4: séries numeradas progressivamente, por período não inferior a um ano fiscal;
    - n.º 5: registo em base de dados, incluindo anulados;
    - n.º 6: modo de treino.
  - **Art. 8.º:** dispensa de impressão em papel, se a fatura tiver o NIF do adquirente, for emitida por programa certificado e houver comunicação em tempo real.
  - **Art. 11.º:** deveres dos «**produtores e instaladores**» e dos utilizadores:
    - integridade operacional;
    - documentação técnica disponível para a AT: funcionalidades, ciclos operativos, controlos, mecanismos de integridade, modelo e dicionário de dados (n.º 3);
    - essa documentação conservada por versão (n.º 4);
    - exportação do SAF-T (n.º 5);
    - cópias de segurança (n.º 6).
  - **Art. 12.º:** fatura eletrónica com assinatura eletrónica qualificada, selo eletrónico qualificado (eIDAS) ou EDI.
  - **Art. 13.º:** requisitos dos programas de faturação eletrónica.
  - **Arts. 19.º a 30.º, arquivo:** **10 anos** (art. 19.º, n.º 1). Arquivo eletrónico, incluindo cópias de segurança, **em qualquer Estado-Membro**; fora da UE só com autorização prévia (art. 20.º, n.os 1, al. b), e 2; art. 21.º). Indicar a **localização do arquivo eletrónico** na declaração de início ou de alterações (art. 20.º, n.º 5).
  - **Art. 31.º:** a AT pode inspecionar também nas instalações de **entidades que prestem serviços de faturação** e aceder diretamente ao sistema. Se o sistema estiver fora de PT, o acesso tem de ser facultado a partir de território nacional (n.º 3).
  - **Art. 35.º:** comunicação das **séries** à AT **antes da sua utilização**, por meio de processamento. A AT atribui um código que integra o ATCUD.
  **[FACTO]**

### 1.4 Portaria n.º 195/2020, de 13 de agosto (QR e ATCUD)

- **Art. 2.º:** para a série comunica-se o identificador, o tipo de documento, o início da numeração e a data prevista de início.
- **Art. 3.º:** ATCUD = código de validação (mínimo 8 carateres) + «-» + número sequencial.
- **Art. 4.º:** formato «ATCUD:CodigodeValidação-NumeroSequencial», em todas as páginas; produtores e utilizadores garantem a legibilidade.
- **Arts. 5.º e 6.º:** QR segundo as especificações da AT, obrigatório nos documentos emitidos por programas certificados, garantido pelos produtores.
- **Vigência:** 1/1/2021 (art. 8.º).
**[FACTO: [Portaria 195/2020, versão AT](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/Portaria_195_2020.pdf); [DR](https://diariodarepublica.pt/dr/detalhe/portaria/195-2020-140210523)]**

O ATCUD só passou a ser obrigatório a **1/1/2023**, depois de adiamentos (Despacho n.º 351/2021-XXII). **[SECUNDÁRIA: OCC, Garrigues, InvoiceXpress]**

### 1.5 CIVA, arts. 36.º e 40.º

- **Art. 36.º:**
  - n.º 1, al. a): fatura até ao **5.º dia útil** seguinte à exigibilidade;
  - n.º 5: elementos obrigatórios;
  - n.º 10: emissão eletrónica «sob reserva de aceitação pelo destinatário»;
  - última alteração listada: DL 85/2022.
  **[FACTO: [CIVA art. 36.º, AT](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/civa_rep/Pages/iva36.aspx)]**
- **Art. 40.º, fatura simplificada:**
  - n.º 1, al. a): transmissões de bens por retalhistas a não sujeitos passivos até 1 000 €;
  - n.º 1, al. b): **outras transmissões de bens e prestações de serviços até 100 €**;
  - n.º 1, al. c), aditada pelo DL 35/2025: sujeitos passivos isentos pelo art. 53.º;
  - n.º 2: elementos;
  - n.º 3: NIF do adquirente particular só a pedido.
  **[FACTO: [CIVA art. 40.º, AT](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/civa_rep/Pages/iva40.aspx)]**

### 1.6 Decreto-Lei n.º 198/2012 (comunicação de faturas)

- **Art. 3.º, n.º 1:** comunicar à AT os elementos das faturas, **dos documentos de conferência** e dos recibos, em tempo real, por SAF-T ou no Portal. **N.º 2, redação atual:** «A comunicação [...] deve ser efetuada **até ao dia 5 do mês seguinte** ao da sua emissão». Redação do DL 85/2022, depois da Lei 12/2022 (OE 2022), com efeitos em 2023. **[SECUNDÁRIA fiável: consolidação da [PGD Lisboa, art. 3.º](https://pgdlisboa.pt/leis/lei_mostra_articulado.php?artigo_id=1782A0006&nid=1782&tabela=leis&ficha=1); confirmado na imprensa: [ECO, 22/12/2025](https://eco.sapo.pt/2025/12/22/prazo-para-comunicacao-de-faturas-prolongado-ate-9-de-janeiro/), prorrogação pontual das faturas de dezembro de 2025. A versão consolidada no DR não foi acedida.]**
- O DL 28/2019 (art. 41.º) reescreveu o art. 3.º e acrescentou o **código único de documento** aos elementos a comunicar (n.º 4, al. p)). **[FACTO]**
- **DR:** [DL 198/2012](https://diariodarepublica.pt/dr/detalhe/decreto-lei/198-2012-174543).

### 1.7 Ofícios-circulados

- **Ofício-Circulado n.º 50001/2013** (requisitos técnicos): **revogado** pelo Despacho 8632/2014, ponto 8. **[FACTO]**
- Não identifiquei ofícios-circulados em vigor específicos sobre certificação. **Não confirmado.**

### 1.8 Mudanças anunciadas para 2025–2027

| Tema | Estado em 3/11/2026 | Fonte |
|---|---|---|
| **PDF como fatura eletrónica sem assinatura/selo qualificado** | Aceite até 31/12/2026 (Lei 73-A/2025, OE 2026, art. 95.º, n.º 3, segundo a fonte). A **Proposta de Lei 110/XVII (OE 2027), art. 77.º, n.º 3,** propõe prolongar até 31/12/2027. Votação final global prevista para 24/11/2026, **ainda não é lei**. A regra de base continua a ser o DL 28/2019, art. 12.º. | **[SECUNDÁRIA: [Marcaweb](https://www.marcaweb.pt/blog/facturas-em-pdf-assinatura-qualificada-oe2027); [Almacode](https://almacode.pt/noticias/oe2027-faturas-pdf-saft)]**. Artigos **não confirmados** no DR nem no Parlamento. |
| **Fatura eletrónica B2G (contratos públicos)** | Obrigatória para grandes empresas desde 2021. Para PME, a dispensa (DL 111-B/2017, art. 9.º, n.º 4) iria até 31/12/2026; a proposta OE 2027 (art. 138.º, n.º 2) prorroga até 31/12/2027. | **[SECUNDÁRIA, não confirmado]** |
| **SAF-T da contabilidade** (Portaria 31/2019) | A proposta OE 2027 empurra para os períodos de 2028 e seguintes, com entrega em 2029. O calendário atualmente em vigor **não está confirmado**. | **[SECUNDÁRIA]** |
| **ViDA (UE)** | Diretiva (UE) 2025/516, de 11/3/2025, publicada a 25/3/2025. Permite aos Estados-Membros impor faturação eletrónica doméstica e torna obrigatória a fatura eletrónica estruturada e o reporte digital nas operações **intra-UE B2B a partir de 1/7/2030**. A transposição portuguesa **não está identificada**. | [EUR-Lex 2025/516](https://eur-lex.europa.eu/eli/dir/2025/516/oj); datas por artigo **[SECUNDÁRIA]** |
| **Assinatura qualificada em PDF** | Ver primeira linha. Para o Mezza: se o PDF enviado por email tiver de valer como fatura eletrónica a partir de 2027 ou 2028, precisa de selo eletrónico qualificado (QSCD/QTSP) ou de EDI. | DL 28/2019, art. 12.º **[FACTO]** + prazos **[SECUNDÁRIA]** |

---

## 2. Quem é obrigado e quem pode ser «produtor»

### 2.1 Obrigados a usar software certificado

- **DL 28/2019, art. 4.º, n.º 1** (ver 1.3): basta usar programa informático de faturação, ter volume de negócios acima de 50 000 € ou ter contabilidade organizada. **[FACTO]**
- **Software de desenvolvimento interno ou uso próprio: também tem de ser certificado.** A exceção do art. 2.º, n.º 2, al. a), da Portaria 363/2010 foi revogada pela Portaria 340/2013, com efeitos plenos a partir de 31/12/2014 após os despachos de adiamento (ver 1.1). O DL 28/2019, que hoje regula a obrigação, não tem nenhuma exceção para software interno. **[FACTO]**
- A FAQ da DGCI de 2010 (Q3) dizia que «não são certificados os programas não comercializados cujo utilizador seja o titular dos direitos de autor». **Está superada** pela revogação de 2013/2014. Não usar como orientação atual. **[FACTO histórico: [FAQ DGCI 2010, cópia Compulab](https://www.compulab.pt/wp-content/files/FAQs_Certificacao_Software_DGCI.pdf)]**

### 2.2 Quem pode ser produtor (requisitos para certificar)

| Requisito | Estado | Fonte |
|---|---|---|
| Ser «empresa produtora de software» | Exigido, mas a lei não define «produtor» nem exige CAE. Na prática, é quem detém o programa e a chave privada. | Portaria 363/2010, arts. 3.º, al. b), e 4.º **[FACTO]**; definição **[OPINIÃO]** |
| **CAE de informática** | **Não exigido** em nenhum dos diplomas consultados (Portaria 363/2010, Despacho 8632/2014, DL 28/2019, Declaração 169/2010 segundo o gov.pt). A lista da AT tem restaurantes, retalhistas e transportadoras como produtores. | **[FACTO: ausência de exigência nos textos lidos + [lista AT](https://www.portaldasfinancas.gov.pt/pt/consultaProgCertificadosM24.action)]** |
| **NIF português e acesso ao Portal das Finanças** | Necessário em termos práticos: o Modelo 24 entrega-se exclusivamente por via eletrónica no Portal. Entidades estrangeiras sem NIF pedem um e nomeiam representante com NIF e morada em PT. | FAQ DGCI 2010, Q14, Q42 e Q43 **[FACTO histórico]**; [gov.pt, consulta de estado](https://www.gov.pt/servicos/consultar-estado-da-certificacao-de-programa-de-faturacao) **[FACTO]** |
| **Situação tributária regularizada** | **Não encontrei exigência** para produtores de software. A lei exige-a expressamente noutros casos, como tipografias (DL 28/2019, art. 15.º, n.º 2) e arquivo fora da UE (art. 21.º, n.º 2, al. b)), o que sugere que não é requisito aqui. **Não confirmado** se o Portal bloqueia o Modelo 24 com dívidas. | DL 28/2019 **[FACTO]**; conclusão **[OPINIÃO]** |
| **Atividade aberta no IVA** | **Não confirmado** se o Modelo 24 exige atividade aberta ou um CAE particular. A Angry Box já tem atividade aberta, por isso a questão não se põe. | — |

### 2.3 Distinguir: certificar vs comercializar

- **Certificar:** depende do cumprimento técnico (art. 3.º) e do Modelo 24 (art. 4.º). O CAE não entra. **[FACTO]**
- **Comercializar (SaaS):**
  - Passa a haver **atividade sujeita a IVA** nova. Quem a exerce tem de a ter declarada: **CIVA art. 31.º, n.º 1** (declaração de início antes de iniciar) e **art. 32.º, n.os 1 e 2** (declaração de alterações **no prazo de 15 dias** a contar da alteração). **[FACTO: [CIVA art. 31.º](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/civa_rep/Pages/iva31.aspx); [art. 32.º](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/civa_rep/Pages/iva32.aspx)]**
  - Coima por falta ou atraso: **300 € a 7 500 €** (RGIT art. 117.º, n.º 2). **[SECUNDÁRIA fiável: [PGDL, RGIT](https://pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=259&tabela=leis&pagina=2&ficha=101&so_miolo=)]**
- **CAE-Rev.4:** aprovada pelo **DL n.º 9/2025, de 12 de fevereiro**, com efeitos a **1/1/2025** (art. 8.º). Revoga o DL 381/2007, que era a CAE-Rev.3 (art. 7.º). Equivale à NACE-Rev.2.1 (art. 4.º, n.º 2). **[FACTO: [DL 9/2025, PDF DR](https://files.diariodarepublica.pt/1s/2025/02/03000/0000800049.pdf)]** Subclasses relevantes no anexo:
  - **62100** «Atividades de programação informática»;
  - **58290** «Edição de outros programas informáticos»;
  - **63100** «Infraestruturas de computação, atividades de processamento de dados, domiciliação de informação e atividades relacionadas»;
  - **62900** «Outras atividades de serviços relacionados com as tecnologias da informação e informática»;
  - e, para comparação, **56111 a 56117** (restaurantes).
  **[FACTO]**
- **Qual escolher:** um SaaS de produto próprio tende a enquadrar-se em 58290 (edição de software próprio) ou 62100. A decisão é do contabilista, à luz das notas explicativas do INE. **[OPINIÃO]**

---

## 3. O processo de pedido

| Passo | Detalhe | Fonte |
|---|---|---|
| **Formulário** | **Declaração Modelo 24, «Certificação de programa de faturação»**, aprovada com instruções pela **Declaração n.º 169/2010, de 12 de agosto** (DR, 2.ª série, n.º 156). | [gov.pt, consulta de estado](https://www.gov.pt/servicos/consultar-estado-da-certificacao-de-programa-de-faturacao); [DR, Declaração 169/2010](https://diariodarepublica.pt/dr/detalhe/declaracao/169-2010-2213125) **[FACTO]**. Conteúdo dos quadros **não lido**. |
| **Onde** | Portal das Finanças, entrega eletrónica do Modelo 24, com autenticação do produtor. Serviço gov.pt «Pedir certificação de programa de faturação». | [gov.pt, pedir certificação](https://www.gov.pt/servicos/programa-de-faturacao-certificacao) **[FACTO]**; caminho exato no Portal **[SECUNDÁRIA: fórum Portugal-a-Programar]** |
| **Anexo obrigatório** | **Chave pública RSA** em PEM base-64, ficheiro .txt (no Modelo 24: Quadro 4, Campo 7). | Portaria 363/2010, art. 4.º, al. b); Despacho 8632/2014, 4.2 e 5.2 **[FACTO]**; quadro e campo: FAQ 2010, Q34 **[FACTO histórico]** |
| **Declaração do produtor** | Com o Modelo 24, o produtor compromete-se a cumprir a portaria e as regras técnicas. A FAQ 2010 (Q12) diz que a certificação passa «em primeira instância, pelo compromisso de observância dos requisitos». | FAQ DGCI 2010 **[FACTO histórico]** |
| **Autoteste** | A AT disponibiliza uma aplicação de validação (validador.exe, .NET 2.0) para o SAF-T de testes e as assinaturas, um par de chaves de exemplo e um SAF-T de exemplo. | [AT, Certificação de Software de Faturação](https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Negocios/Faturacao/Regras_mecanismos_comunicacao/Certificacao_programas/Certificacao_software_faturacao/Paginas/default.aspx) **[FACTO]** |
| **Testes da AT** | Podem preceder a emissão (o prazo fica suspenso) e podem repetir-se a qualquer momento. O produtor entrega um exemplar do programa e a documentação, incluindo o dicionário de dados. | Portaria 363/2010, art. 5.º, n.os 2 e 3 **[FACTO]** |
| **Como correm os testes, na prática** | Fase documental (descrição da aplicação, tipos de documentos, um exemplo de cada, layout de impressão, SAF-T com todos os documentos), seguida de verificação presencial; cada fase admite correção. Relatos de 2020 e de 2025. | **[SECUNDÁRIA: [fórum Portugal-a-Programar](https://www.portugal-a-programar.pt/forums/topic/78345-processo-de-certifica%C3%A7%C3%A3o-de-software/)]** |
| **Prazo** | 30 dias desde a receção, suspenso durante os testes. Prazos reais **não confirmados**. | Portaria 363/2010, art. 5.º, n.º 1 **[FACTO]** |
| **Custo / taxa** | **Não encontrei nenhuma taxa** na portaria, no despacho nem nas páginas gov.pt e AT (a página gov.pt não indica custos). **Não confirmado** que seja gratuito. | — |
| **Número de certificado** | Atribuído pela AT e impresso como «XXXX-Processado por programa certificado n.º NNNN/AT». Os números mais recentes da lista rondam o **3103** (outubro de 2026). | Despacho 8632/2014, 2.2.2 **[FACTO]**; [lista AT](https://www.portaldasfinancas.gov.pt/pt/consultaProgCertificadosM24.action) **[FACTO]** |
| **Lista pública** | Colunas: Programa, Versão, Produtor, N.º Certificado, Estado («Certificado» ou «Desativado»), Data. | Portaria 363/2010, art. 5.º, n.º 4; DL 28/2019, art. 4.º, n.º 3; lista AT **[FACTO]** |
| **Consulta do estado do pedido / dúvidas** | Serviço gov.pt «Consultar estado da Certificação». e-Balcão: Outras Obrigações > Certif Softw > Questões técnicas. | [gov.pt](https://www.gov.pt/servicos/consultar-estado-da-certificacao-de-programa-de-faturacao) **[FACTO]** |
| **Um certificado por programa** | Um pedido e uma chave por programa. | FAQ 2010, Q4 e Q16 **[FACTO histórico]** |

### Novas versões vs nova certificação

- **Novas releases do mesmo programa não exigem nova certificação.** O produtor assume o compromisso de manter os requisitos em todas as versões posteriores. Se falhar, a AT pode revogar. (FAQ 2010, Q13) **[FACTO histórico; a confirmar se continua a ser a posição atual]**
- **Mudança do par de chaves:** exige novo Modelo 24 com a nova chave pública (Despacho 8632/2014, 2.1.4). **[FACTO]**
- A lista pública mostra uma «Versão» por certificado. **Não encontrei procedimento normativo de «comunicação de versões».** Confirmar no e-Balcão se as versões maiores exigem atualização do Modelo 24. **Não confirmado.**
- O DL 28/2019, art. 11.º, n.º 4, obriga a guardar a documentação técnica **por versão** do sistema. **[FACTO]**

### Revogação e cancelamento

- **Fundamento:** deixarem de se verificar os requisitos do art. 3.º (Portaria 363/2010, art. 10.º). **[FACTO]**
- **Caso real:** anulação dos certificados «CR Mais» (1422/AT) e «WinPlus» (1751/AT) da Grupopie, por Despacho SEAF de 29/7/2016, ao abrigo do art. 168.º do CPA e do art. 10.º da Portaria, por funcionalidades que permitiam eliminar registos de vendas (violação das al. b), d) e e) do art. 3.º). Os utilizadores tiveram de migrar até 15/9/2016, sob pena de coima pelo art. 128.º, n.º 2, do RGIT. **[FACTO: [AT, anulação de certificados](https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Negocios/Faturacao/Regras_mecanismos_comunicacao/Certificacao_programas/Anulacao_certificados_programas_faturacao/Paginas/default.aspx)]**
- **Implicação para SaaS:** a revogação atinge **todos os clientes** de uma vez. **[OPINIÃO]**

---

## 4. Obrigações contínuas e sanções

### 4.1 Sanções (RGIT)

| Infração | Norma | Coima |
|---|---|---|
| Criar, ceder ou transacionar programas concebidos para impedir ou alterar o apuramento da situação tributária (quando não for crime) | RGIT art. 128.º, n.º 1 | 3 750 € a 37 500 € |
| **Não usar programas ou equipamentos de faturação certificados** | RGIT art. 128.º, n.º 2 (Lei 7/2021) | **1 500 € a 18 750 €** |
| **Transacionar ou usar** programas de faturação ou contabilidade que não cumpram os requisitos legais (abrange o produtor que vende) | RGIT art. 128.º, n.º 3 (Lei 7/2021) | 1 500 € a 18 750 € |
| Falta ou atraso das comunicações do DL 198/2012, arts. 3.º e 3.º-A (faturas, inventário); contraordenação grave | RGIT art. 117.º, n.º 9 | 200 € a 10 000 € |
| Falta ou atraso de declarações e comunicações em geral (abrangerá, presumivelmente, a comunicação de séries; **não confirmado**) | RGIT art. 117.º, n.º 1 | 150 € a 3 750 € |
| Falta ou atraso da declaração de início, alteração ou cessação de atividade | RGIT art. 117.º, n.º 2 | 300 € a 7 500 € |
| Não emitir fatura ou emiti-la fora de prazo | RGIT art. 123.º, n.º 1 | 150 € a 3 750 € |

**Fontes:** consolidação [PGD Lisboa do RGIT](https://pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=259&tabela=leis&pagina=2&ficha=101&so_miolo=) (atualizada até à Lei 26/2026) e [página AT do art. 128.º](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/rgit/Pages/rgit-artigo-128-ordm-ra2021_02.aspx). **[SECUNDÁRIA fiável + AT]** Para pessoas coletivas, o máximo é o dobro, segundo a [página AT da anulação](https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Negocios/Faturacao/Regras_mecanismos_comunicacao/Certificacao_programas/Anulacao_certificados_programas_faturacao/Paginas/default.aspx) (regra geral do RGIT art. 26.º, n.º 4; artigo não lido). Notas:
- A página da AT de 2016 cita valores antigos do art. 128.º, n.º 2 (375 € a 18 750 €).
- Os montantes atuais têm de ser confirmados pelo contabilista.

### 4.2 Obrigações do utilizador (cada restaurante, incluindo a Angry Box)

- **Comunicar as séries** antes de as usar (DL 28/2019, art. 35.º). Pode ser feito por webservice a partir do programa. **[FACTO]**
- **Comunicar as faturas** (e documentos de conferência e recibos) **até ao dia 5 do mês seguinte**, ou em tempo real (DL 198/2012, art. 3.º). **[SECUNDÁRIA fiável, ver 1.6]**
- **Arquivo e conservação:**
  - **10 anos**;
  - arquivo eletrónico em **qualquer Estado-Membro da UE**; fora da UE só com autorização;
  - cópias de segurança em local distinto;
  - documentação técnica por versão;
  - indicar a localização do arquivo eletrónico na declaração de início ou de alterações.
  (DL 28/2019, arts. 11.º, 19.º, 20.º e 27.º) **[FACTO]**
- **Facultar o SAF-T e o acesso à AT** em inspeção, incluindo acesso direto ao sistema e cópias em suporte digital. O SAF-T tem de ser exportável a todo o momento. (DL 28/2019, arts. 11.º, n.º 5, 31.º e 33.º; CIRC art. 123.º, n.º 8, por remissão) **[FACTO]**
- **Documentos de transporte:** pouco relevantes para restauração. Se existirem, são processados por programa certificado e comunicados antes do transporte. Quem teve volume de negócios ≤ 100 000 € no período anterior está dispensado da comunicação (Regime de Bens em Circulação, art. 5.º, n.os 1, 5 e 10, na redação do DL 28/2019, art. 40.º). **[FACTO]**
- **Responsabilidade:** a emissão pode ser delegada num terceiro, como o SaaS, mas o sujeito passivo **continua responsável** pela emissão e pela veracidade (DL 28/2019, art. 5.º, n.º 1). **[FACTO]**

### 4.3 Obrigações do produtor

- **Requisitos técnicos e integridade:** manter os requisitos em todas as versões (Portaria 363/2010, arts. 3.º e 10.º) e garantir a integridade operacional e a documentação técnica (DL 28/2019, art. 11.º, n.os 1 e 3, que abrange expressamente «produtores e instaladores»). **[FACTO]**
- **Controlo da AT:** disponibilizar o programa e a documentação para testes a qualquer momento (Portaria 363/2010, art. 5.º, n.º 3). **[FACTO]**
- **Chave privada:** de conhecimento **exclusivo** do produtor e protegida (art. 3.º, al. b); Despacho 8632/2014, 3.1.4 e 4.3). **[FACTO]**
- **QR e ATCUD:** garantir a geração correta do QR e a legibilidade do ATCUD (Portaria 195/2020, arts. 4.º e 6.º). **[FACTO]**
- **SaaS e e-Fatura:** cada cliente cria no Portal um **subutilizador** com perfil **WFA**, para o programa comunicar em seu nome. O produtor adere como «produtor de software» na página do e-Fatura, obtém o **certificado SSL** assinado pela AT para os seus programas certificados e indica NIF, nome e n.º de certificado. **[FACTO: [AT, Manual de integração e-Fatura, aspetos gerais](https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Outras_entidades/Suporte_tecnologico/Webservice/e_Fatura/Documents/Comunicacao_dos_elementos_dos_documentos_de_faturacao_aspetos_gerais.pdf)]**
- **Inspeção ao prestador:** a AT pode inspecionar também as instalações de quem presta serviços de faturação, ou seja, o operador SaaS (DL 28/2019, art. 31.º, n.º 1). **[FACTO]**
- **Coima do produtor:** o produtor fica exposto às coimas do RGIT art. 128.º, n.os 1 e 3, se o programa não cumprir. **[FACTO quanto à norma; aplicação concreta ao SaaS = OPINIÃO]**
- **Contrato e declaração ao cliente:** a lei **não exige** um contrato-tipo nem uma declaração do produtor ao cliente. Recomendo:
  - contrato SaaS com cláusulas de conformidade fiscal, SLA, apoio em inspeções e exportação do SAF-T;
  - acesso aos dados durante 10 anos, incluindo depois do fim do contrato (cf. DL 28/2019, art. 24.º, n.º 4, por analogia com o arquivo por terceiros);
  - limitação de responsabilidade e acordo de subcontratação RGPD.
  **[OPINIÃO]**

---

## 5. Especificidades da restauração

- **Consultas de mesa** (conferência de mesa, «pré-conta»):
  - têm de ser **assinadas** como as faturas (Portaria 363/2010, art. 7.º, n.º 1, al. b); Despacho 8632/2014, 1.1);
  - levam a menção «Este documento não serve de fatura» (Despacho, 1.2);
  - têm de ter os elementos do DL 28/2019, art. 7.º, n.º 2: número sequencial, data e hora, emitente, bens, preço e imposto, e indicação de que não constituem fatura;
  - a fatura posterior **referencia** a consulta de mesa em `OrderReferences` (Despacho, 1.3).
  **[FACTO]**
- **Tipo no SAF-T:** tabela 4.3 WorkingDocuments, **`WorkType = "CM"`**, «CM para consulta de mesa», no XSD oficial SAF-T (PT) 1.04_01. **[FACTO: [XSD AT 1.04_01](https://info.portaldasfinancas.gov.pt/apps/saft-pt04/SAFTPT1.04_01.xsd)]**
- **Comunicação das consultas de mesa à AT:** o DL 198/2012, art. 3.º, n.º 1, abrange «documentos que possibilitem a conferência», mas **não confirmei** se a AT já exige operacionalmente a sua comunicação mensal. As fontes secundárias divergem. **Validar.**
- **Faturas simplificadas:** a restauração é **prestação de serviços** (a Lista II do CIVA fala em «prestações de serviços de alimentação e bebidas»; **não lido nesta pesquisa**). Por isso, a fatura simplificada só serve para faturas **até 100 €** a particulares (CIVA art. 40.º, n.º 1, al. b)). Acima disso, emite-se fatura ou fatura-recibo. O limite de 1 000 € da al. a) é só para transmissões de bens por retalhistas. **[FACTO quanto ao art. 40.º; a qualificação como serviço deve ser confirmada pelo contabilista]**
- **Talões de venda:** **já não existem** como documento válido. No XSD, `InvoiceType` TV e TD são só «para os dados até 2012-12-31». **[FACTO: XSD AT]**
- **«Consumidor final»:** sem NIF, inutiliza-se a linha ou imprime-se «Consumidor final» (Despacho 8632/2014, 2.2.5). **[FACTO]**
- **Orientação setorial:** a AHRESP e a OCC (parecer técnico de julho de 2025) tratam as consultas de mesa como documentos fiscalmente relevantes. **[SECUNDÁRIA]** Não encontrei uma orientação da AT específica para restauração, para além das normas acima.
- **Integração Vendus e AirMenu:** se o Mezza **integrar** faturas emitidas por outros programas certificados, não as pode reassinar. Têm de ir para séries próprias, com `SourceBilling = "I"`, `Hash` igual ao original e `HashControl` igual a «n.º certificado original.versão da chave», impressas como «Cópia do documento original» (Despacho 8632/2014, 2.3). **[FACTO]**

---

## 6. Aspetos empresariais e contabilísticos

### 6.1 Angry Box como produtora vs empresa separada

| Critério | Angry Box produtora | Empresa separada (ex.: «Mezza, Lda») |
|---|---|---|
| **Admissível legalmente** | Sim. Não há exigência de CAE para certificar, e há restaurantes produtores na lista. **[FACTO]** | Sim. **[FACTO]** |
| Só para uso próprio | Mais simples: dispensa nova entidade e, a meu ver, novo CAE. **[OPINIÃO]** | Custo e burocracia de uma sociedade nova sem receita. **[OPINIÃO]** |
| Venda SaaS | Exige CAE secundário (art. 32.º CIVA) e confirmação do objeto social. O risco do produtor (RGIT art. 128.º, n.º 3; responsabilidade contratual perante clientes) recai sobre o restaurante. **[FACTO + OPINIÃO]** | Isola o risco, deixa o certificado e a chave na entidade que detém o produto (facilita venda e investimento) e permite contabilidade e IVA próprios. **[OPINIÃO]** |
| Chave privada «exclusiva do produtor» | Produtor e utilizador são a mesma entidade, e os gerentes do restaurante teriam, em teoria, acesso à chave. Exige controlos fortes (KMS, segregação). **[OPINIÃO]** | A segregação produtor/utilizador fica naturalmente demonstrável. **[OPINIÃO]** |
| Transmissibilidade do certificado | **Não confirmado** se a AT permite transferir um certificado para outro NIF ou se exige um Modelo 24 novo (e, com isso, novo n.º de certificado e migração das séries dos clientes). | — |

**Sugestão [OPINIÃO]:** se o objetivo a médio prazo é vender a outros restaurantes, criar a entidade produtora **antes** de submeter o Modelo 24, para não ter de recertificar mais tarde. Se for só para uso próprio, a Angry Box pode ser a produtora.

### 6.2 IVA na venda de SaaS

- **Clientes sujeitos passivos em Portugal (restaurantes):** a prestação localiza-se em PT (CIVA art. 6.º, n.º 6, al. a)) e aplica-se a **taxa normal de 23 %** (CIVA art. 18.º, n.º 1, al. c)). Taxas das regiões autónomas: ver a legislação regional. **[FACTO: [CIVA art. 6.º](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/civa_rep/Pages/iva6.aspx); [art. 18.º](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/civa_rep/Pages/iva18.aspx)]**
- **Clientes sujeitos passivos noutro Estado-Membro (ex.: Espanha):** autoliquidação pelo adquirente. A fatura emite-se até ao dia 15 do mês seguinte (CIVA art. 36.º, n.º 1, al. b)). **[FACTO]**
- **Mercado espanhol:** vender o Mezza **como software de faturação** a restaurantes espanhóis implicaria cumprir o regime espanhol (Verifactu/SIF). **Fora do âmbito; não pesquisado.**

### 6.3 RGPD

- O produtor SaaS que guarda e trata as faturas dos clientes (que podem ter NIF e nome de particulares) é, em regra, **subcontratante** (RGPD art. 4.º, n.º 8). Isso exige **contrato de subcontratação** com o conteúdo do **art. 28.º, n.º 3**, medidas de segurança (art. 32.º) e registo de atividades (art. 30.º, n.º 2). O restaurante é o responsável pelo tratamento. **[FACTO quanto às normas do RGPD; qualificação concreta = OPINIÃO]**
- **Alojamento na UE (Render Frankfurt, Vercel, Supabase):** encaixa no DL 28/2019, art. 20.º, n.º 1, al. b) (arquivo eletrónico em qualquer Estado-Membro). Se algum componente guardar ou replicar dados fora da UE, incluindo backups, logs ou CDN, é precisa autorização da AT (art. 20.º, n.º 2) e transferências RGPD válidas. Confirmar onde ficam os dados de cada fornecedor (regiões Supabase e Vercel). **[FACTO quanto à norma; verificação técnica pendente]**

### 6.4 Seguro de responsabilidade civil

- Não encontrei obrigação legal de seguro para produtores de software certificado. **[FACTO: ausência nos textos lidos]**
- Para SaaS, recomendo um seguro de **RC profissional/tecnológica e ciber**, porque uma falha de conformidade pode gerar coimas aos clientes e pedidos de indemnização. **[OPINIÃO]**

---

## Tabela «Legislação aplicável»

| Diploma | O que regula | Link |
|---|---|---|
| Portaria n.º 363/2010, de 23/06 (alterada pelas Portarias 22-A/2012, 160/2013 e 340/2013 e pelo DL 28/2019) | Requisitos e processo de certificação, assinatura RSA, consultas de mesa, lista pública, revogação | [AT (consolidada)](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/Portaria_363_2010.pdf) · [DR](https://diariodarepublica.pt/dr/detalhe/portaria/363-2010-335230) |
| Portaria n.º 22-A/2012, de 24/01 | 1.ª alteração e republicação. Mantinha a exceção do software interno | [AT](http://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/portaria%2022-A%20-%202012.pdf) · [DR](https://diariodarepublica.pt/dr/detalhe/portaria/22-a-2012-402697) |
| Portaria n.º 160/2013, de 23/04 | 2.ª alteração (com a do SAF-T, Portaria 321-A/2007) | Não lido (DR) |
| Portaria n.º 340/2013, de 22/11 | 4.ª alteração. **Revoga a exceção do software interno** (em vigor a 1/1/2014) | [AT](http://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/Portaria_340-2013.pdf) · [DR](https://diariodarepublica.pt/dr/detalhe/portaria/340-2013-503842) |
| Despachos SEAF 616/2013-XIX e 345/2014-XIX | Adiamento da revogação para software interno, até 31/12/2014 | [Informador](https://informador.pt/legislacao/diploma/certificacao-de-programas-informaticos-de-faturacao-2/) (secundária) |
| Declaração n.º 169/2010, de 12/08 | Aprova a declaração **Modelo 24** e as instruções | [DR](https://diariodarepublica.pt/dr/detalhe/declaracao/169-2010-2213125) |
| Despacho n.º 8632/2014, de 03/07 | Requisitos técnicos dos programas certificados | [AT](http://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/Despacho_n%C2%BA_8632_2014_03_07.pdf) · [DR](https://diariodarepublica.pt/dr/detalhe/despacho/8632-2014-25703782) |
| Decreto-Lei n.º 28/2019, de 15/02 (alterado pelos DL 48/2020 e 49/2025) | Obrigação de usar software certificado, processamento, séries, fatura eletrónica, arquivo 10 anos/UE, inspeção | [AT (consolidado)](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/Decreto_Lei_28_2019.pdf) |
| Portaria n.º 195/2020, de 13/08 | Código QR e ATCUD, comunicação de séries | [AT](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/Portaria_195_2020.pdf) · [DR](https://diariodarepublica.pt/dr/detalhe/portaria/195-2020-140210523) |
| Decreto-Lei n.º 198/2012, de 24/08 (atual: DL 85/2022) | Comunicação de faturas e documentos à AT (dia 5) | [DR](https://diariodarepublica.pt/dr/detalhe/decreto-lei/198-2012-174543) · [PGDL art. 3.º](https://pgdlisboa.pt/leis/lei_mostra_articulado.php?artigo_id=1782A0006&nid=1782&tabela=leis&ficha=1) |
| Portaria n.º 321-A/2007 / Portaria n.º 302/2016 | Estrutura SAF-T (PT); versão 1.04_01 | [XSD AT](https://info.portaldasfinancas.gov.pt/apps/saft-pt04/SAFTPT1.04_01.xsd) |
| CIVA, arts. 6.º, 18.º, 31.º, 32.º, 36.º, 40.º | Localização, taxa, início e alteração de atividade, fatura, fatura simplificada | [CIVA (AT)](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/civa_rep/Pages/iva36.aspx) |
| RGIT, arts. 117.º, 123.º, 128.º | Coimas: comunicações, faturas, software certificado | [PGDL](https://pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=259&tabela=leis&pagina=2&ficha=101&so_miolo=) · [AT art. 128.º](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/rgit/Pages/rgit-artigo-128-ordm-ra2021_02.aspx) |
| Decreto-Lei n.º 147/2003 (RBC), arts. 5.º e 6.º | Documentos de transporte | Via DL 28/2019, art. 40.º |
| Decreto-Lei n.º 9/2025, de 12/02 | CAE-Rev.4 (62100, 58290, 63100, 561xx) | [DR (PDF)](https://files.diariodarepublica.pt/1s/2025/02/03000/0000800049.pdf) |
| Decreto-Lei n.º 111-B/2017 | Fatura eletrónica em contratos públicos | Não lido |
| Lei n.º 73-A/2025 (OE 2026) / Proposta de Lei 110/XVII (OE 2027) | Prazos transitórios PDF / B2G / SAF-T da contabilidade | Não lido (secundária) |
| Diretiva (UE) 2025/516 (ViDA) | Faturação eletrónica e reporte digital na UE | [EUR-Lex](https://eur-lex.europa.eu/eli/dir/2025/516/oj) |
| Regulamento (UE) 2016/679 (RGPD), arts. 4.º, 28.º, 30.º e 32.º | Subcontratação de dados de faturas | EUR-Lex |
| Regulamento (UE) 910/2014 (eIDAS) | Assinatura e selo eletrónico qualificado (DL 28/2019, art. 12.º) | EUR-Lex |

---

## Perguntas a validar com contabilista/jurista (e com a AT via e-Balcão)

1. **AT (e-Balcão > Outras Obrigações > Certif Softw):**
   - O Modelo 24 exige atividade aberta com algum CAE específico, ou situação tributária regularizada?
   - Há alguma taxa?
2. **AT:** como são tratadas hoje as **novas versões**? Basta o compromisso (FAQ 2010, Q13), ou é preciso atualizar o Modelo 24 ou comunicar a versão na lista?
3. **AT:** um certificado pode ser **transferido** para outra entidade, por exemplo se o Mezza passar da Angry Box para uma nova sociedade? Ou é preciso um novo Modelo 24 e um novo número?
4. **AT:** num modelo SaaS **multiorganização** com um único programa e uma chave, há requisitos adicionais? Por exemplo, isolamento por cliente, modo de formação ou séries por estabelecimento (Despacho 8632/2014, 1.8).
5. **Contabilista:** que CAE secundário (62100 ou 58290) e em que momento declarar, só quando houver o primeiro cliente pagante? O objeto social da Angry Box cobre a atividade?
6. **Contabilista:** a Angry Box ser **produtora e utilizadora** do mesmo programa levanta alguma questão de independência ou controlo interno perante a AT (chave «exclusiva do produtor»)?
7. **Contabilista:** a AT já exige operacionalmente a **comunicação das consultas de mesa** (WorkingDocuments) no e-Fatura?
8. **Contabilista:** confirmar o regime em vigor depois do OE 2027 (votação final a 24/11/2026) para: PDF sem assinatura qualificada; SAF-T da contabilidade; B2G para PME.
9. **Jurista:**
   - modelo de contrato SaaS (conformidade fiscal, SLA, apoio a inspeção);
   - devolução e acesso aos dados durante 10 anos após o fim do contrato;
   - limitação de responsabilidade;
   - acordo de subcontratação RGPD (art. 28.º).
10. **Jurista/seguradora:** RC profissional e ciber para o produtor (âmbito, capitais).
11. **Contabilista:** montantes atuais das coimas do RGIT (art. 128.º, n.os 2 e 3; art. 117.º, n.º 9) e agravamento para pessoas coletivas (art. 26.º).
12. **Técnico/jurídico:** os fornecedores (Supabase, Render, Vercel) guardam ou replicam dados fora da UE, incluindo backups e logs? Se sim, é precisa autorização da AT (DL 28/2019, art. 20.º, n.º 2).

---

## Fontes consultadas (resumo)

**Primárias (AT, gov.pt, DR, UE):**
- [Portaria 363/2010 consolidada](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/Portaria_363_2010.pdf)
- [Portaria 22-A/2012](http://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/portaria%2022-A%20-%202012.pdf)
- [Portaria 340/2013](http://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/Portaria_340-2013.pdf)
- [Despacho 8632/2014](http://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/Despacho_n%C2%BA_8632_2014_03_07.pdf)
- [DL 28/2019 consolidado](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/Decreto_Lei_28_2019.pdf)
- [Portaria 195/2020](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/Portaria_195_2020.pdf)
- [DL 9/2025](https://files.diariodarepublica.pt/1s/2025/02/03000/0000800049.pdf)
- [AT, Certificação de Programas](https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Negocios/Faturacao/Regras_mecanismos_comunicacao/Certificacao_programas/Paginas/default.aspx)
- [AT, Certificação de Software de Faturação](https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Negocios/Faturacao/Regras_mecanismos_comunicacao/Certificacao_programas/Certificacao_software_faturacao/Paginas/default.aspx)
- [AT, Anulação CR Mais/WinPlus](https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Negocios/Faturacao/Regras_mecanismos_comunicacao/Certificacao_programas/Anulacao_certificados_programas_faturacao/Paginas/default.aspx)
- [Lista de programas certificados](https://www.portaldasfinancas.gov.pt/pt/consultaProgCertificadosM24.action)
- [gov.pt, pedir certificação](https://www.gov.pt/servicos/programa-de-faturacao-certificacao)
- [gov.pt, consultar estado](https://www.gov.pt/servicos/consultar-estado-da-certificacao-de-programa-de-faturacao)
- [CIVA (AT), arts. 6.º, 18.º, 31.º, 32.º, 36.º, 40.º](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/civa_rep/Pages/iva36.aspx)
- [RGIT art. 128.º (AT)](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/rgit/Pages/rgit-artigo-128-ordm-ra2021_02.aspx)
- [XSD SAF-T 1.04_01](https://info.portaldasfinancas.gov.pt/apps/saft-pt04/SAFTPT1.04_01.xsd)
- [Manual e-Fatura, aspetos gerais](https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Outras_entidades/Suporte_tecnologico/Webservice/e_Fatura/Documents/Comunicacao_dos_elementos_dos_documentos_de_faturacao_aspetos_gerais.pdf)
- [Diretiva (UE) 2025/516](https://eur-lex.europa.eu/eli/dir/2025/516/oj)

**Documento oficial antigo em cópia de terceiros:**
- [FAQ DGCI 2010 sobre a Portaria 363/2010](https://www.compulab.pt/wp-content/files/FAQs_Certificacao_Software_DGCI.pdf). Parcialmente superado.

**Secundárias (só pistas):**
- [PGD Lisboa: DL 198/2012](https://pgdlisboa.pt/leis/lei_mostra_articulado.php?artigo_id=1782A0006&nid=1782&tabela=leis&ficha=1) e [RGIT](https://pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=259&tabela=leis&pagina=2&ficha=101&so_miolo=)
- [Informador](https://informador.pt/legislacao/diploma/certificacao-de-programas-informaticos-de-faturacao-2/)
- [ECO](https://eco.sapo.pt/2025/12/22/prazo-para-comunicacao-de-faturas-prolongado-ate-9-de-janeiro/)
- [Marcaweb](https://www.marcaweb.pt/blog/facturas-em-pdf-assinatura-qualificada-oe2027)
- [Almacode](https://almacode.pt/noticias/oe2027-faturas-pdf-saft)
- [APCMC (CAE-Rev.4)](https://apcmc.pt/legislacao/cae-rev-4-nova-classificacao-das-atividades-economicas/)
- [fórum Portugal-a-Programar](https://www.portugal-a-programar.pt/forums/topic/78345-processo-de-certifica%C3%A7%C3%A3o-de-software/)
- OCC, Garrigues, InvoiceXpress (ATCUD)
