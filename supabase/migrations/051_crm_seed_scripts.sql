-- CRM Module · Biblioteca de Scripts (textos exatos do framework)
-- Variáveis: [Nome], [Item], [Código], [Data], [Nome do indicador], [Nome do indicado]

insert into public.crm_scripts
  (code, name, segment, body, variants, channel, trigger_timing, one_shot, cooldown_days, active)
values

-- ════════════════════════════════════════════════════════════════
-- SEG-01 · NOVO
-- ════════════════════════════════════════════════════════════════

('2.1.1', 'Agradecimento Pessoal', 'SEG-01',
$$Olá [Nome], sou o Raul, dono da Angry Box.

Como a plataforma é nova, ando a pedir feedback dos primeiros clientes.
Correu tudo bem com o teu pedido hoje?$$,
null, 'WhatsApp', 'D+0 do 1º pedido (2-4h depois da entrega)', false, null, true),

('2.1.2', 'Instagram + Canal Direto', 'SEG-01',
$$Para a próxima qualquer coisa falas comigo direto por aqui.

Entretanto deixo-te o insta da Angry Box pra ires vendo as novidades:
https://www.instagram.com/angryboxpizzashop/$$,
null, 'WhatsApp', 'D+3 (se sem resposta ao 2.1.1)', false, null, true),

('2.1.3', 'Oferta de 2ª Compra', 'SEG-01',
$$[Nome], é o Raul.

Já cá não te vemos há uns dias. No próximo pedido vai uma sobremesa por minha conta — código VOLTA10, prazo 7 dias.$$,
null, 'WhatsApp', 'D+10 após 1º pedido', false, null, true),

('2.1.4', 'Bem-vindo à Casa', 'SEG-01',
$$[Nome], é o Raul.

Já vai a 2ª pizza connosco. Passas a ser dos nossos 🍕

Daqui para a frente vou estar mais por perto — qualquer coisa, falas comigo direto.$$,
null, 'WhatsApp', 'D+0 do 2º pedido', false, null, true),

-- ════════════════════════════════════════════════════════════════
-- SEG-02 · EM ATIVAÇÃO
-- ════════════════════════════════════════════════════════════════

('2.2.0', 'Resposta a Ausência Justificada', 'SEG-02',
$$[Nome], tranquilo 🙌

Quando te apetecer.

Raul$$,
null, 'WhatsApp', 'Resposta manual a ausência justificada', false, null, true),

('2.2.0.b', 'Resposta a "Só Não Pedi"', 'SEG-02',
$$[Nome], compreendo perfeitamente 🙌

Cá estamos quando te apetecer.

Raul$$,
null, 'WhatsApp', 'Resposta manual quando cliente diz que gostou mas não voltou', false, null, true),

('2.2.1', 'Está Tudo Bem?', 'SEG-02',
$$[Nome], é o Raul.

Notei que ainda não voltaste a pedir desde a primeira vez. Aconteceu alguma coisa do nosso lado?

Sem stress se não houve, só queria perceber.

Raul$$,
null, 'WhatsApp', 'D+18 após 1º pedido', false, null, true),

('2.2.2', 'Empurrão Final — 20% off', 'SEG-02',
$$[Nome], é o Raul.

Tens 20% off no próximo pedido — código VOLTA20, 5 dias.

Se não for desta, sem stress 🙌

Raul$$,
null, 'WhatsApp', 'D+25 após 1º pedido (ou D+7 após ausência justificada)', false, null, true),

('2.2.3', 'Bem-vindo de Volta', 'SEG-02',
$$[Nome], que bom ver-te de volta 🙌

Espero que tenha corrido bem. Qualquer coisa, fala comigo direto.

Raul$$,
null, 'WhatsApp', 'D+0 quando cliente volta após SEG-02 ou SEG-06', false, null, true),

-- ════════════════════════════════════════════════════════════════
-- SEG-03 · RECORRENTE
-- ════════════════════════════════════════════════════════════════

('2.3.1', 'Pós-Pedido Recorrente', 'SEG-03',
$$[Nome], correu tudo bem hoje?

Raul$$,
null, 'WhatsApp', 'D+1 de qualquer pedido de Recorrente', false, null, true),

('2.3.2', 'Novidade / Conteúdo', 'SEG-03',
$$[Nome], é o Raul.

Esta semana acrescentei [nome do item] ao menu — [descrição curta].

Se experimentares, diz-me o que achaste.

Raul$$,
'[
  {"label":"A","body":"[Nome], é o Raul.\n\nEsta semana acrescentei [nome do item] ao menu — [descrição curta].\n\nSe experimentares, diz-me o que achaste.\n\nRaul"},
  {"label":"B","body":"[Nome], é o Raul.\n\nHoje estive a [contar algo dos bastidores]. Achei que ias gostar de saber.\n\nRaul"},
  {"label":"C","body":"[Nome], é o Raul.\n\nReparei que pedes muito [item habitual]. Se um dia te apetecer mudar, prova [recomendação] — vai com o que costumas pedir.\n\nRaul"}
]'::jsonb,
'WhatsApp', 'Cíclico a cada 21 dias desde último contacto comercial', false, 21, true),

('2.3.3', 'Gatilho Contextual', 'SEG-03',
$$[Nome], chove à séria lá fora 🌧️

Se a ideia é não sair, podemos tratar do jantar.

Raul$$,
'[
  {"label":"Chuva","body":"[Nome], chove à séria lá fora 🌧️\n\nSe a ideia é não sair, podemos tratar do jantar.\n\nRaul"},
  {"label":"Jogo","body":"[Nome], jogo do [Benfica/Porto/Sporting/seleção] hoje às [hora] ⚽\n\nCombo certo: pizza + sofá. Pede até às [hora-1h] para chegar a tempo do apito.\n\nRaul"},
  {"label":"Sexta","body":"[Nome], é sexta 🍕\n\nSemana feita, fim-de-semana à porta. Se for noite de pizza, conta connosco.\n\nRaul"}
]'::jsonb,
'WhatsApp', 'Pontual: chuva forte / jogo importante / sexta-feira', false, 30, true),

('2.3.4', 'Pedido de Review — Recorrente', 'SEG-03',
$$[Nome], obrigado a sério ❤️

Mensagens como a tua dão-nos gás. Se conseguires escrever isso mesmo numa review do Google, ajuda-nos muito mais do que imaginas: [LINK]

Raul$$,
null, 'WhatsApp', 'Após elogio, com 3+ pedidos, sem tag review_solicitada', true, null, true),

-- ════════════════════════════════════════════════════════════════
-- SEG-04 · VIP
-- ════════════════════════════════════════════════════════════════

('2.4.1', 'Reconhecimento Upgrade VIP', 'SEG-04',
$$[Nome], é o Raul.

Chegaste a um momento que para mim conta — passas a ser um dos clientes da casa.

O que muda: vais receber brindes-surpresa de vez em quando, ter acesso antecipado a novidades, e o meu contacto direto para qualquer coisa.

Obrigado por andares aqui connosco.

Raul$$,
null, 'WhatsApp', 'D+0 quando cliente atinge VIP (4º pedido ou LTV ≥ 100€)', true, null, true),

('2.4.2', 'Brinde-Surpresa (Bilhete à Mão)', 'SEG-04',
$$[Nome],

Hoje vai uma sobremesa por minha conta. Continua a aparecer.

Raul$$,
null, 'WhatsApp', '1x a cada 2-3 pedidos do VIP, sem padrão fixo. Bilhete físico no pacote.', false, null, true),

('2.4.3', 'Acesso Antecipado a Novidades', 'SEG-04',
$$[Nome], é o Raul.

Antes de pôr no menu, queria que provasses primeiro: [item novo].

Para os outros sai dia [data], mas para ti está cá já. Aceitas?

Raul$$,
null, 'WhatsApp', '1-2 dias antes de cada lançamento novo', false, null, true),

('2.4.4', 'Aniversário VIP', 'SEG-04',
$$[Nome], parabéns 🎂

Espero que tenhas um dia ótimo.

Da minha parte vai uma pizza média por minha conta no próximo pedido.
Quando te apetecer durante este mês.

Um abraço e feliz aniversário, Raul$$,
null, 'WhatsApp', 'D+0 do aniversário, antes das 11h (só VIPs)', false, null, true),

('2.4.5', 'Check-in VIP', 'SEG-04',
$$[Nome], é o Raul.

Há um tempinho que não falamos. Tá-se bem?

Andamos a pensar em [novidade] — achei que ias gostar de saber primeiro.

Raul$$,
null, 'WhatsApp', 'A cada 60-90 dias desde último contacto, ou se 25+ dias sem pedido', false, 60, true),

-- ════════════════════════════════════════════════════════════════
-- SEG-05 · EM RISCO
-- ════════════════════════════════════════════════════════════════

('2.5.1', 'Curiosidade Genuína — Recorrente', 'SEG-05',
$$[Nome], é o Raul.

Há um tempinho que não apareces por cá. Aconteceu alguma coisa?

Não estou a empurrar nada — só queria perceber. Se houve algo que não correu bem, diz-me.

Raul$$,
null, 'WhatsApp', 'D+35 (4 dias após entrar em SEG-05 vindo de SEG-03)', false, null, true),

('2.5.1-VIP', 'Curiosidade Genuína — VIP Caído', 'SEG-05',
$$[Nome], é o Raul.

Há um tempinho que não apareces por cá. Sabes que aqui em casa fazes falta.

Aconteceu alguma coisa?

Só queria perceber. Se houve algo que não correu bem, diz-me.

Raul$$,
null, 'WhatsApp', 'D+50 (4 dias após entrar em SEG-05 vindo de SEG-04)', false, null, true),

('2.5.2', 'Combo de Retorno — 25% off', 'SEG-05',
$$[Nome], é o Raul.

Vou facilitar-te a vida — 25% off no próximo pedido se vieres nos próximos 10 dias.

Código REGRESSO, até [data D+60]. Sem letras pequeninas.

Raul$$,
null, 'WhatsApp', 'D+50 vindo de Recorrente / D+58 vindo de VIP', false, null, true),

-- ════════════════════════════════════════════════════════════════
-- SEG-06 · PERDIDO
-- ════════════════════════════════════════════════════════════════

('2.6.1', 'Win-back Final — 40% off', 'SEG-06',
$$[Nome], é o Raul.

Já passou um tempo desde que pediste connosco. Quero que voltes a experimentar — esta vai por nossa conta.

40% off no próximo pedido: código VOLTA40, válido 14 dias.

Raul$$,
null, 'WhatsApp', 'D+65 após último pedido (única tentativa — se falhar, dorme)', true, null, true),

-- ════════════════════════════════════════════════════════════════
-- SEG-07 · CARRINHO ABANDONADO
-- ════════════════════════════════════════════════════════════════

('2.7.0', 'Boas-vindas Curtas — Caminho A', 'SEG-07',
$$[Nome], é o Raul, dono da Angry Box. Vi que criaste conta connosco, bem-vind[o/a] 🙌

Estamos com 50% off em itens selecionados por tempo limitado, vê se há alguma coisa que te apeteça.

Quando te apetecer experimentar, falas comigo direto.

Raul$$,
'[{"label":"Email","body":"[Nome], é o Raul, dono da Angry Box.\n\nVi que criaste conta connosco, bem-vind[o/a] 🙌\n\nEstamos com 50% off em itens selecionados por tempo limitado — vê se há alguma coisa que te apeteça.\n\nJá agora: se quiseres ficar a par de descontos exclusivos e novidades em primeira mão, partilha o teu WhatsApp comigo. É por aí que aviso primeiro.\n\nQuando te apetecer experimentar, falas comigo direto.\n\nRaul"}]'::jsonb,
'WhatsApp', 'D+1 do registo (Caminho A: só criou conta, nunca chegou ao carrinho)', false, null, true),

('2.7.1', 'Está Tudo Bem Por Aí? — Caminho B', 'SEG-07',
$$[Nome], é o Raul.

Reparei que ontem chegaste perto de fazer um pedido mas algo te impediu.

Foi alguma coisa do nosso lado? Bug, pagamento, dúvida no menu? Diz-me, eu resolvo.

Raul$$,
null, 'WhatsApp', 'D+1 do abandono do carrinho (Caminho B: teve itens no carrinho)', false, null, true),

('2.7.2', 'Oferta de 1º Pedido — 20% off', 'SEG-07',
$$[Nome], é o Raul.

Para experimentares connosco, tens 20% off — código BEMVINDO, 14 dias.

Raul$$,
null, 'WhatsApp', 'D+7 do registo/abandono (se sem conversão)', false, null, true),

-- ════════════════════════════════════════════════════════════════
-- CENÁRIOS
-- ════════════════════════════════════════════════════════════════

('CEN-01a', 'Reclamação — Resposta Inicial', 'global',
$$[Nome], lamento sinceramente que isto tenha acontecido.

Vou tratar disto pessoalmente já. Podes contar-me em mais detalhe o que se passou? Quanto mais perceber, melhor posso resolver.

Raul$$,
null, 'WhatsApp', 'Imediato após reclamação ser reportada (prazo: 2h)', false, null, true),

('CEN-01b', 'Reclamação — Resolução', 'global',
$$[Nome],

Já percebi o que se passou e a culpa foi nossa.

[Solução concreta: reposição / reembolso / sobremesa por conta da casa no próximo pedido / etc.]

Lamento mesmo. Espero que dês outra oportunidade — vou estar atento para garantir que da próxima vez é como deve ser.

Raul$$,
null, 'WhatsApp', 'Após investigação da reclamação', false, null, true),

('CEN-01c', 'Reclamação — Follow-up D+7', 'global',
$$[Nome], reparei que voltaste a pedir connosco. Correu como devia desta vez?

Raul$$,
null, 'WhatsApp', 'D+7 do próximo pedido após reclamação resolvida', false, null, true),

('CEN-03', 'Review Pública Negativa', 'global',
$$[Nome], lamento sinceramente que a tua experiência não tenha sido como devia ser.

Gostava de perceber em detalhe o que se passou e resolver contigo diretamente. Podes contactar-me em [contacto direto: WhatsApp / email]?

Vou tratar disto pessoalmente.

Raul$$,
null, 'WhatsApp', 'Imediato após review negativa (≤3★) ser reportada (prazo: 4h)', false, null, true),

('CEN-04a', 'Pedido Cancelado — Investigação', 'global',
$$[Nome], é o Raul.

Vi que cancelaste o pedido de ontem. Aconteceu alguma coisa do nosso lado?

Sem stress, só quero perceber para não tropeçarmos da próxima vez.

Raul$$,
null, 'WhatsApp', 'D+1 após cancelamento de pedido', false, null, true),

('CEN-04b', 'Pedido Cancelado — Resposta a Motivo Operacional', 'global',
$$[Nome], já percebi.

Vou tratar disto internamente. Quando te apetecer voltar, falas comigo direto e eu garanto que sai redondo.

Raul$$,
null, 'WhatsApp', 'Resposta manual após motivo operacional confirmado', false, null, true),

('CEN-05', 'Resposta a Elogio + Pedido de Review', 'global',
$$Obrigado a sério 🫶🏻

Fico muito feliz de ouvir isso [Nome]. São esses os feedbacks que nos dão gás.

Se conseguires escrever isso numa review do Google, ajuda-nos muito mais do que imaginas 😊

https://g.page/r/CQ1I9fOCisH3EBM/review$$,
null, 'WhatsApp', 'D+0/D+1 após elogio (enquanto entusiasmo está alto) — disparo único por cliente', true, null, true),

('CEN-06a', 'Indicação — Agradecimento ao Indicador', 'global',
$$[Nome], é o Raul.

Soube que mandaste o/a [Nome do indicado] cá. Obrigado a sério ❤️ No teu próximo pedido vai uma sobremesa por minha conta.

Raul$$,
null, 'WhatsApp', 'Imediato após registo do cliente indicado', false, null, true),

('CEN-06b', 'Indicação — Boas-vindas ao Indicado', 'global',
$$[Nome], é o Raul, dono da Angry Box.

Soube que o/a [Nome do indicador] te disse para experimentares — fico contente que tenhas vindo. Correu tudo bem com o teu pedido hoje?

Raul$$,
null, 'WhatsApp', 'Substitui o 2.1.1 para cliente que veio indicado', false, null, true),

('CEN-07', 'Pedido Acima do Ticket Médio', 'global',
$$[Nome], é o Raul.

Reparei que o pedido de [data] foi maior do que o costume — espero que tenha corrido bem 🙌 Foi um evento, uma reunião, jantar com amigos?

Pergunto para te poder ajudar melhor da próxima.

Raul$$,
null, 'WhatsApp', 'D+1 quando pedido ≥ 2× ticket médio (ou ≥ 50€ no 1º pedido)', false, null, true),

('CEN-08', 'Mudança de Padrão', 'global',
$$[Nome], é o Raul.

Reparei que ontem mudaste o costume — geralmente pedes [item habitual] e desta vez foi [novo item]. Como achaste?

Raul$$,
null, 'WhatsApp', 'D+1 quando cliente muda completamente de padrão de itens', false, null, true),

('CEN-09', 'Convite Exclusivo — Queda de Frequência', 'SEG-04',
$$[Nome], é o Raul.

Notei que andas um pouco mais espaçado nos pedidos — e antes de pôr no menu, queria que viesses provar uma coisa nova.

[Item novo / item especial / experiência exclusiva] · por minha conta, quando te apetecer.

Raul$$,
null, 'WhatsApp', 'Quando VIP/Recorrente passa 25+ dias sem pedir (dentro da janela do segmento)', false, null, true),

('CEN-10', 'Aniversário — Cliente Não VIP', 'global',
$$[Nome], parabéns 🎂

Espero que tenhas um dia ótimo.

Da minha parte vai sobremesa por minha conta no próximo pedido este mês.

Um abraço, Raul$$,
null, 'WhatsApp', 'D+0 do aniversário, antes das 11h (clientes não-VIP)', false, null, true),

('CEN-11', 'Data Comemorativa', 'global',
$$[Nome], Boa Páscoa por aí 🌷

Da nossa parte cá estamos como sempre — se a ideia for jantar à pizza, contas connosco.

Raul$$,
'[
  {"label":"A","body":"[Nome], Boa Páscoa por aí 🌷\n\nDa nossa parte cá estamos como sempre — se a ideia for jantar à pizza, contas connosco.\n\nRaul"},
  {"label":"B","body":"[Nome], é o Raul. [São Valentim / o nosso aniversário] está à porta.\n\nPara celebrar, deixo-te [oferta — ex: pizza média grátis na compra de uma grande]. Código: [CODIGO] · prazo: até [data].\n\nRaul"},
  {"label":"C","body":"[Nome],\n\nAntes do Natal, queria mesmo só agradecer — encontramo-nos do outro lado.\n\nRaul"}
]'::jsonb,
'WhatsApp', 'Antecedência configurável antes de cada data comemorativa', false, null, true)

on conflict (code) do nothing;
