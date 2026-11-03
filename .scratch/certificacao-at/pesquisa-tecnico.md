# Certificação AT de programa de faturação — requisitos técnicos e integrações

> **Âmbito:** o que um programa de faturação tem de cumprir para ser certificado pela Autoridade Tributária e Aduaneira (AT) e todas as integrações técnicas com a AT, com a situação a **3 de novembro de 2026**.
> **Para quem:** a equipa de engenharia do Mezza (backoffice SaaS multi-organização para restauração).
> **Estado:** pesquisa. **Não é parecer jurídico nem fiscal.** As matérias fiscais, legais e contratuais têm de ser validadas por um contabilista certificado ou por um jurista antes de qualquer uso oficial.

## Convenções deste documento

- **[F] Facto**: está no texto de uma fonte primária (Diário da República, legislação consolidada no Portal das Finanças ou documento técnico da AT). A fonte é sempre indicada: diploma e ponto, ou documento, versão e secção.
- **[S] Secundária**: vem de fontes não oficiais (fornecedores de software, consultoras, OCC). Serve só como pista.
- **[R] Recomendação/inferência**: proposta nossa de implementação ou leitura nossa da norma. Não é requisito legal.
- **Não confirmado**: não foi possível verificar numa fonte primária.

**Nota sobre os URL.** O Portal das Finanças reorganizou os conteúdos (os caminhos passaram de `/pt/apoio_contribuinte/...` para `/pt/apoio_ao_contribuinte/...`). Muitos links dentro dos PDF da AT já dão 404. Os links da secção 11 foram testados a 2026-11-03 (HTTP 200).

**Teste empírico feito nesta pesquisa.** Descarregámos o ficheiro SAF-T de demonstração da AT (`saft_idemo599999999.xml`) e o par de chaves de exemplo da AT (`Chave_Privada.txt` / `Chave_Publica.txt`). A cadeia de assinaturas foi reconstruída com o `crypto` nativo do Node 24 (`RSA-SHA1`). Resultado: **36/36 documentos (SalesInvoices, MovementOfGoods e WorkingDocuments) verificam corretamente** com o formato de mensagem descrito na secção 1. Este ficheiro deve ser usado como vetor de teste no CI (ver 1.9).

---

## 1. Assinatura dos documentos (hash)

### 1.1 Base legal
- [F] Os programas têm de ter um sistema que identifique a gravação das faturas e dos documentos retificativos "através de um algoritmo de cifra assimétrica e de uma chave privada de conhecimento exclusivo do produtor" (Portaria n.º 363/2010, art. 3.º, al. b), na redação republicada pela Portaria n.º 340/2013).
- [F] Os requisitos técnicos estão no **Despacho n.º 8632/2014, de 3 de julho** (DR, 2.ª série, n.º 126, pp. 17255–17261). Aplicam-se também a programas já certificados. O despacho revoga o Ofício-Circulado n.º 50001/2013 (ponto 8). Segundo a ficha do Portal, o despacho está "Vigente" e o histórico de alterações não regista nenhuma ("Histórico de alterações: -").

### 1.2 Documentos que têm de ser assinados
- [F] Têm de ser assinados todos os documentos emitidos com eficácia externa, **exceto recibos**: faturas e documentos retificativos, documentos de transporte (DL 147/2003) e quaisquer documentos de conferência, "nomeadamente as designadas **consultas de mesa**" (Despacho 8632/2014, ponto 1.1; Portaria 363/2010, art. 7.º, n.º 1).
- [F] Os recibos não são assinados, mas têm de imprimir **"Emitido por programa certificado n.º 0000/AT"** (Despacho, ponto 2.2.3).

### 1.3 Algoritmo e chave
| Parâmetro | Valor | Fonte |
|---|---|---|
| Algoritmo | RSA | Portaria 363/2010, art. 6.º, n.º 1; Despacho, ponto 4.1 |
| Hash da mensagem | SHA-1 | Despacho, ponto 6.2 |
| Padding | PKCS#1 v1.5. O despacho escreve "OAEP Padding = PKCS1 v1.5 padding"; na prática é uma assinatura RSASSA-PKCS1-v1_5 (`openssl dgst -sha1 -sign`) | Despacho, pontos 6.2 e 7.1 |
| Tamanho da chave privada | 1024 bits | Despacho, pontos 5.1 e 6.2 |
| Charset da mensagem | UTF-8 | Despacho, ponto 6.2 |
| Codificação da assinatura | Base64 numa só linha, **172 caracteres**, sem quebras de linha | Despacho, pontos 6.2 e 7.1 |
| Campo SAF-T `Hash` | texto, máximo 172 | XSD 1.04_01 (`SAFPTtextTypeMandatoryMax172Car`) |

- [R] Na prática, a chave de 1024 bits é obrigatória: uma assinatura RSA-2048 tem 344 caracteres em Base64 e não cabe no campo `Hash` (máximo 172).
- [F] Não é preciso certificado de uma entidade credenciada. O produtor pode usar um certificado autoassinado e extrair dele a chave pública (Despacho, ponto 6.1).

### 1.4 Mensagem exata a assinar
[F] Os campos são concatenados **por esta ordem**, com separador `;`, sem aspas e sem fim de linha (Portaria 363/2010, art. 6.º, n.º 1, e art. 7.º, n.º 2; Despacho, pontos 4.4–4.10 e 7.1):

| # | SalesInvoices (4.1) | MovementOfGoods (4.2) | WorkingDocuments (4.3) | Formato (tabela do ponto 4.5 do Despacho, original no DR) |
|---|---|---|---|---|
| a | `InvoiceDate` | `MovementDate` | `WorkDate` | `AAAA-MM-DD` |
| b | `SystemEntryDate` | `SystemEntryDate` | `SystemEntryDate` | `AAAA-MM-DDTHH:MM:SS` (ao segundo, sem fuso nem frações) |
| c | `InvoiceNo` | `DocumentNumber` | `DocumentNumber` | `código␠série/número`; regex `[^ ]+ [^/^ ]+/[0-9]+` |
| d | `GrossTotal` | `GrossTotal` | `GrossTotal` | duas casas decimais, separador `.`, sem separador de milhares |
| e | `Hash` do documento anterior **da mesma série/tipo** | idem | idem | Base64. **Fica vazio** no primeiro documento da série (ou do exercício) |

Exemplos:
- Primeiro documento da série (Despacho, ponto 7.1). A mensagem termina em `;` e a posição do hash anterior fica vazia:
  `2010-05-18;2010-05-18T11:22:19;FAC 001/14;3.12;`
- Documentos seguintes:
  `InvoiceDate;SystemEntryDate;InvoiceNo;GrossTotal;<Hash anterior em Base64>`

Regras adicionais:
- [F] **Encadeamento**: o hash anterior é o "do último documento emitido da mesma série/tipo". No primeiro documento de uma série/tipo, o hash anterior é considerado não preenchido. Em séries plurianuais, o primeiro documento de um exercício **pode** encadear com o último do exercício anterior (Despacho, ponto 2.1.5).
- [F] Nos documentos de transporte e de conferência, assina-se o `GrossTotal` que está na base de dados, mesmo que o documento seja impresso sem valores. Se não houver valor, usa-se `"0.00"` (Despacho, ponto 2.1.6).
- [F] Nos documentos em moeda estrangeira, assina-se o **contravalor em EUR**, que é o valor exportado para o SAF-T (Despacho, ponto 2.1.7).
- [F] O `GrossTotal` exportado para o SAF-T tem de ser igual ao valor assinado, arredondado a 2 casas (Despacho, ponto 2.6.7).
- [S/R] Gralhas no texto oficial que não devem ser copiadas: no exemplo do ponto 4.8 do Despacho aparece `T09;37:25` e no 2.º registo do ponto 7.1 aparece `T15:25`. O formato correto é o da tabela: `HH:MM:SS`. O teste empírico com o SAF-T de demonstração confirma-o.

### 1.5 Gravação, versão da chave e `HashControl`
- [F] A assinatura é gravada na BD do programa e mantida durante o prazo legal de arquivo, com ligação direta ao registo integral do documento. Segundo o Despacho, a BD "**não pode estar encriptada**" (Despacho, ponto 2.1.2).
  - [R] Leitura nossa: a encriptação transparente em repouso do Postgres/Supabase não deve ser problema. O que não pode existir é cifra aplicacional que torne os dados ilegíveis para a AT. **Não confirmado**: validar na certificação.
- [F] Grava-se também a **versão da chave privada** (inteiros sequenciais: 1, 2, …) usada em cada documento (Despacho, ponto 2.1.3). No SAF-T vai para o campo `HashControl` (Despacho, ponto 2.6.5).
- [F] Formatos do `HashControl` (Despacho, pontos 2.3.4 e), 2.4.5 e 2.5.5; regex do XSD `SAFPTHashControl`, máximo 70):
  - documento emitido no próprio programa: `1` (a versão da chave);
  - documento integrado de outro programa certificado (`SourceBilling = I`): `<n.º certificado>.<versão>`, ex.: `9999.1`;
  - documento integrado de programa não certificado: `HashControl = "Não certificado"` e `Hash = "0"`. Atenção: a regex do XSD 1.04_01 não aceita este texto. Antes de suportar este caso, confirmar com o validador da AT;
  - recuperação de documento manual (`SourceBilling = M`): `1-FTM abc/00001`, ou seja, versão, `-`, tipo + `M`, espaço, série manual, `/`, número manual;
  - recuperação a partir de duplicado (`SourceBilling = M`): `1-FTD XY 2013A/00099`, ou seja, versão, `-`, tipo + `D`, espaço, `InvoiceNo` original.

### 1.6 Impressão do hash e da menção de certificação
- [F] Os documentos assinados imprimem **4 caracteres da assinatura, nas posições 1.ª, 11.ª, 21.ª e 31.ª** (base 1; em JS são os índices 0, 10, 20 e 30). Seguem-se um hífen e a frase **"Processado por programa certificado n.º «n.º»/AT"**. Exemplo: `AxAx-Processado por programa certificado n.º 0000/AT` (Portaria 363/2010, art. 6.º, n.º 3, al. a) e b); Despacho, ponto 2.2.2).
- [F] Vetor de teste do SAF-T de demonstração da AT: documento `1T 1/1`, mensagem `2017-03-10;2017-03-10T15:58:01;1T 1/1;28.07;`. O hash começa por `vfinNfF+rT…` e os 4 caracteres são `vo6e`.

### 1.7 Gestão da chave privada
- [F] A chave privada é gerada pelo **produtor do software**, que a conhece em exclusivo e a protege no software (Despacho, pontos 4.3 e 3.1.4: "Proteger de forma eficaz a chave privada, incluindo durante o processo de assinatura").
- [F] A chave pública é extraída da privada em formato PEM/Base64, num ficheiro `.txt`. É entregue com a **declaração modelo 24** (Despacho, ponto 4.2; Portaria 363/2010, art. 4.º, al. b)). Comandos OpenSSL de referência: `openssl genrsa -out ChavePrivada.pem 1024` e `openssl rsa -in ChavePrivada.pem -out ChavePublica.pem -outform PEM -pubout` (Despacho, pontos 5.1–5.2).
- [F] Só se troca o par de chaves depois de comunicar à AT por nova declaração modelo 24, com o upload da nova chave pública (Despacho, ponto 2.1.4).
- [R] No Mezza, a chave é **uma só para todo o produto**, porque pertence ao produtor e não a cada organização. Recomendamos:
  - guardá-la num gestor de segredos, nunca no repositório nem na BD;
  - assinar num único componente do backend, com acesso auditado;
  - registar a versão da chave em cada documento.
  - [S] Os KMS geridos mais comuns (AWS KMS, GCP KMS) não suportam, que saibamos, chaves RSA de 1024 bits. **Não confirmado**: verificar antes de desenhar a solução.
- [R] Testar a assinatura SHA-1 no runtime de produção (Render). Algumas políticas de criptografia de sistema desativam assinaturas SHA-1 no OpenSSL 3. No Node v24.19.0 deste ambiente funciona.

### 1.8 Pseudocódigo de referência [R]
```ts
// domain/services — puro; a chave chega por porta de saída (SignerPort)
const msg = [doc.date, doc.systemEntryDate, doc.number, doc.grossTotal.toFixed(2), prevHashOfSameSeriesAndType ?? ''].join(';');
const hash = signer.signRsaSha1Base64(msg);       // 172 chars
const printed = hash[0] + hash[10] + hash[20] + hash[30];
```
- [R] A sequência (número + hash anterior) por série tem de ser serializada. Por exemplo, um lock de linha na série no Postgres, numa só transação que reserva o número, assina e grava. Não pode haver dois documentos com o mesmo "anterior".

### 1.9 Ferramentas de validação da AT
- [F] A AT disponibiliza:
  - uma "Aplicação de Validação de Assinaturas para Produtores de Software" (`validador.exe`, requer .NET Framework 2.0), que valida o SAF-T e as assinaturas com a chave pública submetida;
  - um par de chaves e um SAF-T de exemplo.

  Fonte: página "Certificação de Software de Faturação" do Portal (links na secção 11).
- [R] Pôr no CI um teste unitário que verifique a cadeia do `saft_idemo599999999.xml` com a `Chave_Publica.txt` da AT. É o mesmo procedimento usado nesta pesquisa (36/36 OK).

---

## 2. Requisitos funcionais (Despacho n.º 8632/2014 e legislação conexa)

Não encontrámos nenhuma revisão do Despacho 8632/2014. A ficha do Portal diz "Vigente", sem alterações. Desde então, as obrigações novas chegaram por outros diplomas: DL 28/2019, Portaria 195/2020 (ATCUD/QR) e Portaria 302/2016 (SAF-T). Os pontos referem-se ao Despacho, salvo indicação em contrário.

### 2.1 Inalterabilidade, não eliminação e integridade
- [F] Não se pode alterar informação fiscalmente relevante de um documento já assinado (ponto 1.11).
- [F] Nada pode ser impresso antes de o documento estar finalizado e assinado. Não há pré-visualizações impressas (pontos 1.10 e 2.2.1).
- [F] Uma série descontinuada é inibida e nunca apagada (ponto 1.9). Todos os documentos ficam no repositório (ponto 3.2.10). Os anulados também ficam registados na BD (DL 28/2019, art. 7.º, n.º 5).
- [F] O programa não pode ter nenhuma função que permita alterar, local ou remotamente, informação fiscal sem gerar evidência agregada à informação original (Portaria 363/2010, art. 3.º, al. d)).
- [F] DL 28/2019, art. 11.º, n.º 2:
  - controlos de integridade e deteção de alterações diretas ou anónimas;
  - **impedir a continuação da utilização** quando haja alterações que ponham em causa a integridade, até o produtor fazer relato técnico;
  - acesso da AT aos dados;
  - documentação técnica, incluindo modelo e **dicionário de dados** (n.º 3, al. e)).
- [F] O programa deve controlar a BD e registar o n.º de reposições de backups. Exemplo dado: validação da BD no fecho e no arranque, para evidenciar manipulações fora da aplicação (ponto 3.1.3). Tem de existir uma política de cópias de segurança periódicas (ponto 3.1.2).

### 2.2 Numeração e séries
- [F] Os documentos são emitidos cronologicamente, numa ou mais séries, com numeração progressiva e contínua dentro de cada série, por um período **não inferior a um ano fiscal** (ponto 1.6; DL 28/2019, art. 7.º, n.º 4).
- [F] O número é **exclusivamente numérico**. Ano, terminal ou outra informação vão para o identificador da série. Não se podem usar caracteres que violem o XSD ou que sejam operadores XML (pontos 1.7 e 2.2.4).
- [F] O código da série é específico do estabelecimento e/ou programa e nunca se repete no mesmo contribuinte para o mesmo tipo de documento (ponto 1.8).
- [F] A numeração segue a evolução da data/hora de emissão (ponto 3.2.1).
- [F] Uma série/tipo não pode misturar documentos de origens diferentes, por exemplo emitidos no programa e importados (ponto 2.3.3).
- [F] O mesmo código interno de tipo de documento não pode servir para tipos diferentes (Portaria 302/2016, nota ao campo 4.1.4.1).

### 2.3 Anulação vs. nota de crédito
- [F] Os documentos impressos não têm valores negativos. As correções fazem-se com nota de débito/crédito (CIVA, art. 29.º, n.º 7). Só há negativos na anulação de registos que já integram o próprio documento, e nunca acima do valor positivo da rubrica (ponto 2.2.6).
- [F] O programa **não pode** permitir:
  - NC sobre documentos anulados ou já totalmente retificados (ponto 3.3.7);
  - anular um documento que já tem NC/ND, ainda que parcial, sem anular primeiro essa NC/ND (ponto 3.3.8);
  - devoluções em documentos de venda, ou transmissões em documentos de retificação (ponto 3.3.9).
- [F] O programa controla as NC parciais face às quantidades e valores da fatura retificada (ponto 3.2.7). O documento retificativo identifica o documento retificado em `References` (ponto 1.4; CIVA, art. 36.º, n.º 6).
- [F] Anular um documento muda o estado para `A` (`InvoiceStatus`/`WorkStatus`/`MovementStatus`/`PaymentStatus`), com `Reason` (Portaria 302/2016, nota 4.1.4.3.3). No e-Fatura comunica-se com `ChangeInvoiceStatus` (secção 6).
- **Não confirmado**: não encontrámos em fonte primária uma regra que diga **quando** é permitido anular em vez de emitir NC (por exemplo, "só antes de entregue ao cliente"). Validar com o contabilista.

### 2.4 Documentos de conferência / consultas de mesa (restauração)
- [F] As consultas de mesa (`WorkType = CM`) são assinadas (ponto 1.1). Exportam-se em `WorkingDocuments` (tabela 4.3). Têm de conter **"Este documento não serve de fatura"** e mostrar claramente a sua natureza (ponto 1.2).
- [F] Elementos obrigatórios nos documentos de conferência (DL 28/2019, art. 7.º, n.º 2):
  - número sequencial;
  - **data e hora de emissão**;
  - denominação e NIF do fornecedor;
  - denominação usual e quantidades;
  - preço líquido e imposto, ou preço com imposto;
  - indicação expressa de que não constituem fatura.
- [F] A fatura que tem origem numa consulta de mesa identifica-a em `OrderReferences` (ponto 1.3).
- [F] Os documentos de conferência são comunicados à AT, tal como as faturas (DL 198/2012, art. 1.º, n.º 2, e art. 3.º, n.º 1), através de `RegisterWork` (secção 6).
- [F] Os estados possíveis de `WorkStatus` são `N`, `A` e `F` (faturado) (XSD 1.04_01).
- [F] Também levam ATCUD e QR, porque são "documentos fiscalmente relevantes" (DL 28/2019, art. 2.º, al. b), e art. 7.º, n.º 3).

### 2.5 Documentos de transporte
- [F] São assinados (ponto 1.1). Em `MovementOfGoods`, `MovementType` pode ser GR, GT, GA, GC ou GD. São comunicados à AT antes do início do transporte, por webservice próprio (secção 6.6).
- [R] Para restauração só é relevante se houver circulação de bens, por exemplo entre uma cozinha central e as lojas. Fora do âmbito da 1.ª fase.

### 2.6 Modo de recuperação / documentos manuais
- [F] Quando o programa está inoperacional, emitem-se documentos pré-impressos de tipografia autorizada, que depois são recuperados para o programa (DL 28/2019, art. 4.º, n.º 4). Regras da recuperação (ponto 2.4):
  - série específica, anual ou superior, numeração própria a começar em 1;
  - cria-se um novo documento do mesmo tipo, assinado, com a **data do documento manual**;
  - campos obrigatórios distintos para a série manual e para o número manual;
  - `SourceBilling = "M"` e `HashControl` no formato `1-FTM serie/num`;
  - referências posteriores (por exemplo, NC) apontam para a série/número **manual**.
- [F] Reposição de backup: fecham-se as séries em uso e criam-se séries novas. Os documentos em falta são recuperados a partir dos duplicados, numa série específica, com `HashControl` `1-FTD …` (ponto 2.5).
- [F] Na impressão aparece "Cópia do documento original - FTM abc/00001" ou "… - FTD XY 2013A/00099" (pontos 2.2.9–2.2.10).
- [F] Não pode haver mais de um documento ativo (estado `N`) resultante do mesmo documento manual ou duplicado (ponto 3.2.2).
- [F] No webservice de séries, as séries de recuperação comunicam-se com `tipoSerie = R` (secção 4).

### 2.7 Modo de formação
- [F] Série específica (`tipoSerie = F`). O cabeçalho mostra os dados da **empresa de software**, não os do cliente. Imprime-se **"Documento emitido para fins de Formação"** (ponto 1.5; DL 28/2019, art. 7.º, n.º 6).
- **Não confirmado**: se os documentos de formação são comunicados ao e-Fatura. [R] Assumir que não, e confirmar com a AT.

### 2.8 Segundas vias
- [F] A reimpressão preserva o conteúdo original (nome e morada originais do cliente, mesmo que a ficha tenha mudado) e indica que não é original (ponto 2.2.15).
- [F] Os documentos são processados em duplicado, com o original para o cliente (CIVA, art. 36.º, n.º 4).

### 2.9 Moeda
- [F] Assina-se e exporta-se o contravalor em EUR (ponto 2.1.7). No QR, os montantes vão sempre em EUR (especificação QR, §3 c)).

### 2.10 Data/hora do sistema
- [F] Se a data de emissão for posterior à atual, o programa alerta. A partir daí, não pode emitir na mesma série um documento com data atual ou anterior (ponto 3.4.2).
- [F] Se a data/hora do sistema for inferior à do último documento emitido, pede confirmação antes de emitir. A comparação usa o `SystemEntryDate` de qualquer tipo de documento, de qualquer série (ponto 3.4.3).
- [R] **Não confirmado** em fonte primária qual o fuso de `SystemEntryDate` (o formato não tem fuso). Recomendamos a hora legal do estabelecimento (Europe/Lisbon, ou Atlantic/Azores nos Açores), com relógio sincronizado por NTP. O servidor corre em UTC, por isso a conversão tem de ser explícita.

### 2.11 Descontos, IVA por linha, isenções e arredondamentos
- [F] Os descontos ficam entre 0 e 100 % (ponto 3.2.8).
- [F] Os cálculos usam mais de 2 casas decimais, para evitar erros de arredondamento com descontos, preços abaixo do cêntimo, quantidades fracionadas, câmbios e preços com IVA incluído (ponto 3.2.3).
- [F] Bens/serviços com taxas diferentes: base, taxa e imposto indicados separadamente por taxa (CIVA, art. 36.º, n.º 5, parte final). Cada linha fica associada à sua taxa ou motivo de isenção (ponto 2.2.14).
- [F] O programa **exige** o motivo de não liquidação quando não há imposto (ponto 3.2.6) e imprime a menção legal de isenção (ponto 2.2.14).
- [F] Os códigos de motivo vêm da "Tabela dos Códigos de Motivo de Isenção" da AT, **versão 4.0 de 18-06-2026**:
  - M01, M02, M04–M07, M09–M16, M19–M21, M25, M26, M30–M35, M40–M46 e M99;
  - M35 é novo: autoliquidação ligada ao DL 97/2026, para faturas após 1-7-2026;
  - M44–M46 entraram na versão 3.0 (14-08-2025).

  No SAF-T, o código é validado pela regex `(M[0-9]{2})+`. O `TaxExemptionReason` leva a menção.
- [F] Franquias, garantias e retenções vão em campos próprios, depois do `GrossTotal`, sem afetar os totais. Nunca como produtos (ponto 2.2.7).

### 2.12 Consumidor final sem NIF e limites
- [F] Fatura sem NIF do adquirente: inutiliza-se a linha do NIF ou imprime-se **"Consumidor final"** (ponto 2.2.5). No SAF-T usa-se o cliente genérico `CustomerTaxID = 999999990`, com `CompanyName` e `CustomerID` "Consumidor final" (Portaria 302/2016, notas 2.2.1, 2.2.3 e 2.2.4).
- [F] O NIF de uma ficha de cliente com documentos emitidos não pode ser alterado. Só se pode averbar um NIF em falta ou substituir 999999990 (ponto 3.3.3). O nome de um cliente sem NIF e com documentos emitidos também não pode ser alterado (ponto 3.3.4).
- [F] A `ProductDescription` de um produto com documentos emitidos não pode ser alterada (ponto 3.3.5). Os `SourceID` de utilizadores com movimentos não podem ser reutilizados (ponto 3.3.6).
- [F] O NIF do adquirente não sujeito passivo é obrigatório se ele o pedir (CIVA, art. 36.º, n.º 16, e art. 40.º, n.º 3).
- [F] **Fatura simplificada** (CIVA, art. 40.º, redação do DL 35/2025). Os limites contam-se **sem IVA** (Of.-Circ. 30141/2013):
  - até **1000 €** em transmissões de **bens** por retalhistas a não sujeitos passivos;
  - até **100 €** nas "outras transmissões de bens e prestações de serviços";
  - para sujeitos passivos do regime de isenção do art. 53.º.
  - Elementos obrigatórios da FS (art. 40.º, n.º 2): nome e NIF do fornecedor; quantidade e denominação; preço líquido + taxas + imposto, ou preço com IVA + taxa(s); NIF do adquirente sujeito passivo; motivo de não aplicação do imposto.
- [R] Restauração: o serviço de refeições é, em regra, prestação de serviços, por isso o limite de 100 € será o aplicável. Venda de bens para fora (take-away) poderá caber no limite de 1000 €. **Interpretação não confirmada**: validar com o contabilista. O limite deve ser parametrizável e o POS deve bloquear a FS acima dele.

### 2.13 Outros requisitos de aplicação (Despacho, ponto 3)
- [F] Controlo de acessos:
  - autenticação de cada utilizador (Portaria 363/2010, art. 3.º, al. c));
  - troca de password obrigatória no 1.º acesso;
  - password não pode ser vazia;
  - o administrador não vê a password, só pode despoletar uma nova (ponto 3.1.1).
- [F] Interface em português (ponto 3.2.11).
- [F] Os formulários de impressão são desenhados ou validados pelo produtor (ponto 3.2.9).
- [F] Regista-se a data em que os bens foram disponibilizados ou o serviço foi prestado (`TaxPointDate`) (ponto 3.2.12).
- [F] O utilizador **não** escolhe que tipos de documento são assinados ou exportados (pontos 2.6.4 e 3.3.1).
- [F] Não há recálculos sobre documentos integrados (ponto 3.3.2).
- [F] O programa alerta quando faltam campos obrigatórios do SAF-T nos dados mestres (ponto 3.4.1).
- [F] Soluções móveis: o programa garante a numeração e a assinatura dos últimos documentos por série depois da exportação para o integrador (ponto 3.2.4).

### 2.14 O que a AT verifica no pedido de certificação
- [F] O pedido faz-se por **declaração modelo 24**, com a chave pública. A AT emite o certificado em **30 dias**. Pode fazer **testes de conformidade**, que suspendem esse prazo, e pode testar em qualquer momento depois da certificação. Para isso o produtor entrega um exemplar do programa e a documentação, incluindo o **dicionário de dados** (Portaria 363/2010, arts. 4.º e 5.º).
- [F] A AT mantém uma lista pública dos programas certificados. O certificado pode ser revogado se os requisitos deixarem de ser cumpridos (arts. 5.º, n.º 4, e 10.º).
- **Não confirmado**: a AT não publica uma lista oficial dos testes de conformidade. [R] Lista indicativa, deduzida do Despacho, para preparar o pedido:
  1. SAF-T válido no XSD 1.04_01 e no validador da AT, com todas as tabelas aplicáveis.
  2. Cadeia de hash válida por série/tipo, incluindo o 1.º documento da série e uma série nova.
  3. FT, FS, FR, NC (total e parcial, com referência), ND, documento anulado e NC sobre FS.
  4. Consulta de mesa → fatura com `OrderReferences`; CM anulada.
  5. Documento em moeda estrangeira (assinado em EUR).
  6. Linha isenta com código M e menção impressa; várias taxas no mesmo documento; desconto de linha e global.
  7. Consumidor final 999999990; averbamento posterior do NIF; tentativa de alterar NIF/nome/descrição bloqueada.
  8. Recuperação de documento manual (M) e de duplicado (D); documento integrado (I).
  9. Modo formação.
  10. Data futura, relógio atrasado, reimpressão (2.ª via) com dados originais.
  11. Impressão com os 4 caracteres + n.º de certificado, ATCUD e QR; documento com várias páginas.
  12. Recibo com "Emitido por programa certificado".

---

## 3. SAF-T (PT)

### 3.1 Versão em vigor
- [F] Versão em vigor: **1.04_01**, aprovada pela **Portaria n.º 302/2016, de 2 de dezembro** (retificada pela Declaração de Retificação n.º 2-A/2017), com efeitos desde 1-1-2017.
  - Namespace: `urn:OECD:StandardAuditFile-Tax:PT_1.04_01`.
  - O XSD obriga `AuditFileVersion = 1.04_01`.
  - O XSD está em Windows-1252.
  - Fonte: página "SAF-T PT — Versão Portuguesa" do Portal, que lista 1.01_01 a 1.04_01 sem nenhuma posterior.
- [F] Base legal: Portaria n.º 321-A/2007, n.º 1, na redação da Portaria 302/2016, art. 2.º. O ficheiro é produzido a pedido da inspeção "ou para cumprimento de obrigações declarativas que o exijam". O programa tem de exportar no formato e com o esquema em vigor (Despacho, ponto 2.6.1; Portaria 363/2010, art. 3.º, al. a)).
- **Não confirmado / sem indícios**: nenhuma versão posterior à 1.04_01 anunciada para a faturação até à data. As fontes secundárias consultadas também não indicam nenhuma.
- [F] Só para contexto, não se aplica à faturação: o SAF-T da contabilidade (Portaria 31/2019) aplica-se aos períodos de 2027 e seguintes, com entrega em 2028 (Lei 73-A/2025, OE 2026, art. 95.º, n.º 2). [S] A proposta de OE 2027 adia-o para os períodos de 2028.

### 3.2 Estrutura (XSD 1.04_01)
- `Header` (1): `AuditFileVersion`, `CompanyID`, `TaxRegistrationNumber`, `TaxAccountingBasis`, `CompanyName`, `CompanyAddress`, `FiscalYear`, `StartDate`, `EndDate`, `CurrencyCode`, `DateCreated`, `TaxEntity`, `ProductCompanyTaxID`, `SoftwareCertificateNumber`, `ProductID`, `ProductVersion`, …
  - [F] `TaxAccountingBasis` aceita C, E, **F (Faturação)**, I, P (faturação parcial), R, S e T (Portaria 302/2016, nota 1.4).
  - [F] `TaxEntity` (no Header do SAF-T e no e-Fatura): identifica o estabelecimento ou "Global"; "Sede" em programas de contabilidade/integrados (manual e-Fatura, campo 1.4).
- `MasterFiles` (2): `GeneralLedgerAccounts` (só contabilidade), `Customer`, `Supplier`, `Product`, `TaxTable`.
- `GeneralLedgerEntries` (3): só contabilidade.
- `SourceDocuments` (4):
  - **`SalesInvoices` (4.1)**: `InvoiceType` FT, FS, FR, ND, NC (VD, TV, TD, AA e DA só para dados até 2012-12-31; RP, RE, CS, LD e RA para seguros); `InvoiceStatus` N, S, A, R, F.
  - **`MovementOfGoods` (4.2)**: GR, GT, GA, GC, GD; estados N, T, A, F, R.
  - **`WorkingDocuments` (4.3)**: CM, CC, FC, FO, NE, OU, OR, PF (DC é legado; RP, RE, CS, LD e RA para seguros); estados N, A, F.
  - **`Payments` (4.4)**: RC (IVA de caixa), RG (outros); estados N, A.
  - Em cada documento: `InvoiceNo`/`DocumentNumber`/`PaymentRefNo` (regex `[^ ]+ [^/^ ]+/[0-9]+`, máximo 60), **`ATCUD`** (texto, máximo 100), `Hash` (máximo 172), `HashControl` (máximo 70), `SourceBilling` (P, I, M), `SystemEntryDate` (`AAAA-MM-DDThh:mm:ss`), linhas, `DocumentTotals` (`TaxPayable`, `NetTotal`, `GrossTotal`; `Currency` opcional).
- [F] `PaymentMechanism` aceita CC, CD, CH, CI, CO, CS, DE, LC, MB, NU, OU, PR, TB e TR.
- [F] Atenção: a Portaria 302/2016 ainda diz, na nota 4.1.4.2, que o ATCUD se preenche com "0" até à regulamentação. Já foi regulamentado (Portaria 195/2020) e é obrigatório desde 2023 (secção 4), por isso exporta-se o ATCUD real.

### 3.3 Regras de validação a respeitar
- [F] Constam todos os campos obrigatórios e também os opcionais que tenham valor na aplicação (Despacho, ponto 2.6.2).
- [F] Os valores únicos são respeitados. Os elementos de 4.1–4.3 têm de existir nas tabelas mestres 2.2–2.5 (Despacho, ponto 2.6.3).
- [F] Um ficheiro de faturação por estabelecimento só se a faturação for independente. Se for centralizada, o ficheiro é único (Portaria 302/2016, nota geral e)).
- [F] Os totais de controlo (`TotalDebit`/`TotalCredit`) excluem os documentos anulados (Portaria 302/2016, notas 4.x.2/4.x.3).
- [F] Um programa integrado (contabilidade + faturação) que gere ficheiros separados tem de incluir tabelas comuns (Header, Customer, TaxTable, Payments) (nota geral f)).

### 3.4 Ficheiro mensal vs. integral
- [F] **Comunicação mensal**: uma das vias da comunicação de faturas é o ficheiro normalizado "estruturado com base no SAF-T (PT)" (DL 198/2012, art. 3.º, n.º 1, al. b)). Desde 2022 a AT chama-lhe **"Ficheiro Multidocumento"** e é submetido no e-Fatura, pelo browser ou por uma aplicação JAR de linha de comandos (documento "Sistema e-Fatura – alinhamento de funcionalidades", jun. 2022; página "Aplicação para envio de ficheiro SAF-T (PT) por linha de comandos").
- [F] Quem está obrigado a produzir SAF-T tem de escolher entre o envio em tempo real (webservice) e o ficheiro (art. 3.º, n.º 3).
- [F] **Ficheiro integral (anual ou por período)**: produzido a pedido da inspeção. Pode ser dividido por meses completos se for demasiado grande (Portaria 321-A/2007, n.º 1; Portaria 302/2016, nota geral i)).
- **Não confirmado**: as regras operacionais exatas do ficheiro mensal (por exemplo, se deve abranger só 1 mês e que tabelas exige). A página do envio requer autenticação e não foi possível consultá-la.

---

## 4. ATCUD e comunicação de séries

### 4.1 Base legal e datas
- [F] Antes de usar uma série, o sujeito passivo comunica-a à AT. A AT atribui um **código de validação** por série (DL 28/2019, art. 35.º, redação do DL 48/2020). As faturas e os documentos fiscalmente relevantes levam ATCUD e QR (art. 7.º, n.º 3).
- [F] A Portaria 195/2020 (em vigor desde 1-1-2021) regulamenta o ATCUD e o QR.
  - O Despacho SEAAF 412/2020-XXII adiou a obrigação do ATCUD e da comunicação de séries para 2022.
  - O Despacho SEAAF 351/2021-XXII, de 10-11-2021, al. e), suspendeu-a em 2022 ("aposição do ATCUD … facultativa").
  - [F+S] Por isso, **a obrigação está em vigor desde 1-1-2023**. As fontes secundárias (OCC, Garrigues) confirmam esta data.
- [F] O QR é obrigatório desde 1-1-2021. Até à operacionalização do ATCUD, o campo ATCUD do QR levava "0" (destaque "Código QR" do Portal, 29-10-2020).

### 4.2 Formato
- [F] Código de validação: cadeia com **mínimo de 8 caracteres** atribuída pela AT (Portaria 195/2020, art. 3.º, n.º 1).
- [F] **ATCUD = `<código de validação>-<número sequencial>`**. O número é a sequência numérica que vem **imediatamente a seguir à `/`** no `InvoiceNo`/`DocumentNumber`/`PaymentRefNo` (art. 3.º, n.os 2–3). Exemplo do QR: `FT AB2019/0035` → `CSDF7T5H-0035`.
- [F] Na impressão: **`ATCUD:CodigodeValidação-NumeroSequencial`**, perfeitamente legível. Em documentos com várias páginas, o ATCUD aparece em todas e, na página do QR, **imediatamente acima do QR** (art. 4.º).

### 4.3 Webservice de séries (SeriesWS)
Fontes: "Manual de Integração de Software – Comunicação de Séries Documentais, Aspetos Específicos" (histórico até **v1.2, 07-12-2022**; a capa diz v1.1) e "Aspetos Genéricos" **v1.2 (dez. 2022)**; WSDL `Comunicacao_Series.wsdl` (namespace `http://at.gov.pt/`).

- **Endpoints** [F]:
  - testes: `https://servicos.portaldasfinancas.gov.pt:722/SeriesWSService`
  - produção: `https://servicos.portaldasfinancas.gov.pt:422/SeriesWSService`
- **Operações** [F]: `registarSerie`, `anularSerie`, `finalizarSerie`, `consultarSeries`.
- **`registarSerie`**: `serie`, `tipoSerie`, `classeDoc`, `tipoDoc`, `numInicialSeq` (≥1), `dataInicioPrevUtiliz` (≥ data atual, senão erro 4049), `numCertSWFatur` (n.º de certificado; 0 se não aplicável), `meioProcessamento`. A resposta traz `codValidacaoSerie` (código 2001).
- **Códigos** [F]:
  - `tipoSerie`: N normal, F formação, R recuperação.
  - `classeDoc`: SI faturas e retificativos, MG transporte, WD conferência, PY recibos.
  - `tipoDoc`: FT, FS, FR, ND, NC; GR, GT, GA, GC, GD; CM, CC, FC, FO, NE, OU, OR, PF, RP, RE, CS, LD, RA; RC, RG.
  - `meioProcessamento`: PI programa informático, PF Portal, OM outros meios.
  - Estados: A ativa, N anulada, F finalizada.
- **Regras do identificador da série** [F] (manual específico, §1.3.2):
  - no máximo 35 caracteres de `[A-Za-z0-9._-]`;
  - sem separador no início, no fim ou repetido;
  - não pode começar por "AT";
  - é único por tipo de documento **sem distinguir maiúsculas de minúsculas**.
- **Anulação** [F]: só de uma série ativa, comunicada no próprio dia ou no anterior e ainda não usada. Exige `declaracaoNaoEmissao = true` e motivo `ER`. Depois de anulada, não se pode recomunicar o mesmo trio serie/classeDoc/tipoDoc.
- **Finalização** [F]: indica `seqUltimoDocEmitido`.
- **Credenciais** [F]: subutilizador do NIF do sujeito passivo com perfil **"WSE – Comunicação e Gestão de Séries por webservice"**. O manual diz que as credenciais do operador "não devem estar guardadas no programa" e que o software as pede quando forem necessárias (Aspetos Genéricos, §2).
- **Alternativa** [F]: comunicação manual no Portal (`https://processos.portaldasfinancas.gov.pt/series/pf/inicio`).
- Autenticação, certificado e cifra: iguais aos do e-Fatura (secção 6.3).
- [R] Multi-organização: cada organização é um sujeito passivo e tem as suas séries, por estabelecimento e por tipo. Sugere-se um identificador do tipo `<estab>-<ano>` (ex.: `L01-2027`), com a série ligada ao `org_id`. O código de validação é guardado e nunca editado.

---

## 5. Código QR

Fonte única: **"Especificações Técnicas – Código de Barras Bidimensional – Código QR", Portaria 195/2020, Versão 1.1, outubro 2020** (histórico: 13-08-2020 criação; 30-10-2020 revisão). Não encontrámos versão posterior no Portal.

### 5.1 Parâmetros gráficos [F] (§2)
- ECC (taxa de recuperação de erro): **M**
- Modo: **Byte**
- Pontos por módulo: **2**
- Versão: **mínimo v9**
- Tamanho da imagem: **mínimo 30×30 mm**
- Margem de segurança: **0,25 cm**

### 5.2 Composição da mensagem [F] (§3)
- Cada campo escreve-se `<código>:<valor>`, sem espaços. Os campos juntam-se com `*`, **pela ordem da tabela**.
- Valores monetários: em **EUR**, com `.` decimal, **sempre 2 casas**, sem separador de milhares.
- Campos obrigatórios (`+`) aparecem sempre. Campos opcionais (`++`) só aparecem se houver informação; sem informação, o campo não é criado.
- Espaços fiscais `I`, `J` e `K` (ex.: PT, PT-AC, PT-MA): pelo menos 1 e no máximo 3.
- Documento sem indicação de taxa de IVA (tabelas 4.2, 4.3 e 4.4) leva `I1:0`.
- `S` usa `;` como separador interno e não pode conter `*`.
- Em cada taxa, os campos levam os totais acumulados de base e de IVA.
- Nenhum valor pode passar o tamanho máximo.

### 5.3 Campos [F] (§4)
| Cód. | Conteúdo | Máx. | Obr. |
|---|---|---|---|
| A | NIF do emitente (sem prefixo) | 9 | + |
| B | NIF do adquirente (`999999990` para consumidor final) | 30 | + |
| C | País do adquirente (`Country` do cliente no SAF-T) | 12 | + |
| D | Tipo de documento (InvoiceType/MovementType/WorkType/PaymentType) | 2 | + |
| E | Estado do documento | 1 | + |
| F | Data `YYYYMMDD` | 8 | + |
| G | Identificação única (InvoiceNo/DocumentNumber/PaymentRefNo) | 60 | + |
| H | ATCUD | 70 | + |
| I1 | Espaço fiscal (`TaxCountryRegion`), ou `0` | 5 | + |
| I2 | Base isenta de IVA (inclui operações sujeitas a Imposto do Selo) | 16 | ++ |
| I3 / I4 | Base / IVA à taxa reduzida | 16 | ++ |
| I5 / I6 | Base / IVA à taxa intermédia | 16 | ++ |
| I7 / I8 | Base / IVA à taxa normal | 16 | ++ |
| J1–J8 | 2.º espaço fiscal (mesma estrutura que I) | 5/16 | ++ |
| K1–K8 | 3.º espaço fiscal | 5/16 | ++ |
| L | Não sujeito / não tributável / outras situações (incl. documentos sem discriminação de IVA, regime da margem) | 16 | ++ |
| M | Imposto do Selo | 16 | ++ |
| N | Total de impostos (`TaxPayable`) | 16 | + |
| O | Total com impostos (`GrossTotal`) | 16 | + |
| P | Retenções na fonte (`WithholdingTaxAmount`) | 16 | ++ |
| Q | 4 caracteres do hash | 4 | + |
| R | N.º do certificado (`SoftwareCertificateNumber`) | 4 | + |
| S | Outras informações (ex.: `TB;IBAN;valor` ou `MB;entidade;referência;valor`; exemplo `NU;0.80`) | 65 | ++ |

- [F] A coluna "Obr." da tabela do PDF fica desalinhada na extração de texto. A tabela acima foi reconstruída a partir dos exemplos do §5, que mostram sempre N, O, Q e R. A obrigatoriedade de I1 resulta da regra g).
- [F] Se o documento não mostrar valores (por exemplo, guia ou CM não valorizada), os valores também não vão no QR (exemplo 4, nota *).
- Exemplo FS [F] (§5.2):
  `A:123456789*B:999999990*C:PT*D:FS*E:N*F:20190812*G:FS CDVF/12345*H:CDF7T5HD-12345*I1:PT*I7:0.65*I8:0.15*N:0.15*O:0.80*Q:YhGV*R:9999*S:NU;0.80`
- [F] Colocação: o QR fica dentro do corpo do documento, legível em qualquer suporte. Em documentos com várias páginas, na 1.ª ou na última (Portaria 195/2020, art. 6.º).
- [R] Impressora térmica a 203 dpi (8 pontos/mm): v9 tem 53 módulos. A 5 pontos por módulo dá cerca de 33 mm, o que cumpre o mínimo. Gerar sempre com versão mínima 9 e ECC M. Uma biblioteca de QR (por exemplo, `qrcode` no npm) é uma **dependência nova**: segundo o CLAUDE.md, pedir aprovação antes de a adicionar.

---

## 6. Comunicação de faturas à AT (e-Fatura) e outros webservices

### 6.1 Obrigação e prazo
- [F] Comunicam-se à AT os elementos das **faturas, dos documentos de conferência e dos recibos** (DL 198/2012, art. 3.º, n.º 1, redação da Lei 12/2022). Vias possíveis:
  - a) tempo real (webservice);
  - b) ficheiro estruturado com base no SAF-T;
  - c) inserção direta no Portal.
- [F] **Prazo: até ao dia 5 do mês seguinte ao da emissão** (art. 3.º, n.º 2, redação da Lei 12/2022, em vigor desde 1-1-2023). Na versão consolidada do Portal, a última alteração listada é o DL 85/2022.
  - [S] Os despachos anuais costumam prorrogar prazos pontuais (por exemplo, dezembro de 2025 até 9-1-2026). Não altera a regra.
- [F] Um mês **sem emissão de documentos** também se comunica, pelo Portal, no mesmo prazo (art. 3.º, n.º 9). Segundo o documento de alinhamento de jun. 2022, o webservice para isto ficou "em aperfeiçoamentos futuros".
- [F] Elementos a comunicar (art. 3.º, n.º 4): NIF do emitente; número; data; tipo; NIF do adquirente (sujeito passivo, ou não sujeito passivo que o peça); valor tributável; taxas; motivo de isenção; IVA/IS; "IVA – regime de caixa"; **n.º de certificado**; documento de origem; documento retificado; país/região; **ATCUD**.
- [F] Dispensa de impressão (fatura sem papel): exige NIF do adquirente, programa certificado **e** comunicação em tempo real (DL 28/2019, art. 8.º).

### 6.2 Webservice e-Fatura (FATCOREWS)
Fontes:
- "Manual de Integração de Software – e-Fatura – Comunicação por webservice – **Aspetos genéricos**", capa "Versão 1.0, outubro 2025" e histórico "V2.0, 29-10-2025";
- "… **Aspetos Específicos**", **Versão 3.0, outubro 2025** (V3.0 de 29-10-2025);
- WSDL `Fatcorews.wsdl`, namespace `http://factemi.at.min_financas.pt/documents`.

- **Endpoints** [F] (Aspetos genéricos, §3.7–3.8):
  | Serviço | Testes | Produção |
  |---|---|---|
  | Comunicação (registo, estado, eliminação) | `https://servicos.portaldasfinancas.gov.pt:723/fatcorews/ws/` | `https://servicos.portaldasfinancas.gov.pt:423/fatcorews/ws/` |
  | Consulta de faturas (fatshare, novo em 2025) | `https://servicos.portaldasfinancas.gov.pt:725/fatshare/ws/fatshareFaturas` | `https://servicos.portaldasfinancas.gov.pt:425/fatshare/ws/fatshareFaturas` |
  - [F] O "Contrato de adesão" (anexo I) ainda indica um endereço antigo (`:400/fews/faturas`). Prevalece o manual de 2025.
  - [F] O `location` dentro dos WSDL publicados aponta para hosts internos da AT. É preciso configurar o endpoint à mão.
- **Operações** [F]: `RegisterInvoice`, `ChangeInvoiceStatus`, `DeleteInvoice`, `RegisterWork`, `ChangeWorkStatus`, `DeleteWork`, `RegisterPayment`, `ChangePaymentStatus`, `DeletePayment` (estas três para recibos do **IVA de caixa**). Consulta: `Invoices` (fatshare).
  - A eliminação é automática dentro do prazo de comunicação. Fora do prazo, trata-se no portal e-Fatura (Aspetos genéricos, §2.2, notas 1–2).
- **Corpo `RegisterInvoiceRequest`** [F] (Aspetos específicos, §2.1.1.1): `eFaturaMDVersion`, `AuditFileVersion` (ex.: `1.04_01`), `TaxRegistrationNumber`, `TaxEntity` ("Global" ou estabelecimento), `SoftwareCertificateNumber`, `InvoiceData` { `InvoiceNo`, `ATCUD`, `InvoiceDate`, `InvoiceType`, `SelfBillingIndicator`, `CustomerTaxID` (999999990 se não recolhido), `CustomerTaxIDCountry`, `DocumentStatus` { `InvoiceStatus`, `InvoiceStatusDate` }, **`HashCharacters`** (os 4 caracteres), `CashVATSchemeIndicator`, `PaperLessIndicator`, `EACCode`, `SystemEntryDate`, `LineSummary`[] { `OrderReferences`, `TaxPointDate`, `Reference`, `DebitCreditIndicator`, `TotalTaxBase` | `Amount`, `Tax` { `TaxType`, `TaxCountryRegion`, `TaxCode` (RED/INT/NOR/ISE/OUT/NS), `TaxPercentage` | `TotalTaxAmount` }, `TaxExemptionCode` }, `DocumentTotals` { `TaxPayable`, `NetTotal`, `GrossTotal` }, `WithholdingTax`[] }. Strings em UTF-8.
  - [F] O exemplo do manual usa `eFaturaMDVersion = 0.0.1`. **Não confirmado** se é o valor atual exigido: usar o que o WSDL ou o teste de conectividade indicarem.
  - [F] O manual v3.0 ainda diz, no campo `ATCUD`, para preencher "0" até à regulamentação. Esta nota está desatualizada face à obrigação de 2023: [R] enviar o ATCUD real.
- **Códigos de resposta** [F]:
  - `0` sucesso;
  - 1–99: erros de autenticação (por exemplo, 10 credencial expirada, 12 chave simétrica repetida, 99 senha errada ou acesso suspenso);
  - negativos: erros de dados (por exemplo, −3 documento registado com valores diferentes, −8 código de isenção inválido, −10 já registado, −16 sem permissões, −39 n.º de certificado inválido, −50 parâmetros em falta, −97/−99 erro interno ou de sistema).

### 6.3 Autenticação e segurança (comum a e-Fatura, Séries e Documentos de Transporte)
- [F] **Canal**: HTTPS com **autenticação mútua**, usando o certificado SSL de cliente do produtor, assinado pela AT.
- [F] **Credenciais**: subutilizador do NIF **emitente**, sempre no formato `<NIF>/<n.º subutilizador>`. Perfis:
  - **WFA** para a comunicação de faturas;
  - **WSE** para as séries;
  - **WDT** para os documentos de transporte.
  - O subutilizador é criado em `https://www.acesso.gov.pt/gestaoDeUtilizadores/...`.
- [F] **SOAP Header**: WS-Security, UsernameToken Profile 1.1, namespace `http://schemas.xmlsoap.org/ws/2002/12/secext`.
  - `Username`: `NIF/subutilizador`.
  - `Nonce`: `Base64( RSA_encrypt( KpubSA, Ks ) )`. `Ks` é uma chave AES de **128 bits**, aleatória e **diferente em cada pedido**.
  - `Password`: `Base64( AES-ECB-PKCS5Padding( Ks, senha ) )`.
  - `Created`: `Base64( AES-ECB-PKCS5Padding( Ks, timestamp UTC ISO 8601 ) )`, ex.: `2013-01-01T19:20:30.45Z`. É usado para validação temporal, por isso o relógio tem de estar certo.
  - **Não confirmado**: o padding RSA do `Nonce`, que o manual não especifica. [S] A AT publica o código-fonte do cliente de teste na página "Testar Webservice", que deve ser a referência.
- [F] **Chave pública do Sistema de Autenticação (KpubSA) e certificado de testes**: pedem-se por email a `asi-cd@at.gov.pt`, pelo e-balcão, ou na opção "Testar Webservice" do e-Fatura (Produtores de Software). Os manuais têm o modelo do email.
- [F] **Certificado de produção**:
  1. Fazer a adesão em "e-Fatura > Produtores de Software > Aderir ao Serviço" (`https://faturas.portaldasfinancas.gov.pt/consultarPedidosAdesao.action`), aceitando o contrato de adesão.
  2. Gerar o CSR **RSA 2048**, com `C=PT`, `ST`, `L`, `O`, `OU`, **`CN=NIF do produtor`** e email, sem caracteres acentuados. Comando: `openssl req -new -subj "/C=PT/ST=…/L=…/O=…/OU=…/CN=<NIF>/emailAddress=…" -newkey rsa:2048 -nodes -out <NIF>.csr -keyout <NIF>.key`.
  3. A AT devolve o certificado assinado por email. Junta-se com `openssl pkcs12 -export …` para um `.pfx`.
- [F] Validade do certificado: **12 meses** segundo o manual e-Fatura de 2025 e o contrato de adesão. O manual de Séries de 2022 diz 24 meses e manda renovar 1 mês antes. [R] Assumir 12 meses e alertar 45 dias antes.
- [F] Na adesão, a AT avalia se a empresa produz ou comercializa software, ou se usa software próprio ou do grupo (Contrato de adesão, cl. 7.ª, n.º 4).
  - [R] A entidade jurídica que detém o Mezza tem de ser o "produtor".
- [F] Nos testes, a autenticação é validada com as credenciais **de produção** do subutilizador do próprio produtor (Séries, Aspetos genéricos, §2.3).
- [F] Teste de conectividade: `https://faturas.portaldasfinancas.gov.pt/testarLigacaoWebService.action`. Página de produtores: `https://faturas.portaldasfinancas.gov.pt/painelInicialProdSoftware.action`.
- [F] Licença de utilização (anexo II do contrato): o contribuinte tem de aceitar os termos no software. Uma falha do webservice não justifica incumprir: nesse caso usam-se as outras vias.
- [R/conflito] Guardar as credenciais WFA de cada organização:
  - o manual e-Fatura prevê que o sujeito passivo as "configure no programa … através de opção própria";
  - o manual de Séries diz que não devem ficar guardadas no programa.
  - [R] Proposta: guardar a WFA cifrada num gestor de segredos, por organização, com acesso mínimo; pedir a WSE no momento da operação. Validar com a AT e com o DPO (RGPD).

### 6.4 SOAP no stack do Mezza [R]
- O Node faz o mTLS com `https.Agent({ pfx, passphrase })` e a cifra AES-ECB e RSA com o `crypto` nativo. O XML SOAP é simples o suficiente para ser gerado sem biblioteca SOAP. Cumpre a regra de não acrescentar dependências sem perguntar.
- Arquitetura hexagonal: as portas de saída `AtInvoiceReporter`, `AtSeriesGateway` e `DocumentSigner` ficam no domínio; os adapters SOAP ficam em `adapters/out`. Fila com retry idempotente: −10 "já registado" conta como sucesso, se os valores coincidirem. Reconciliação diária e alarme antes do dia 5.

### 6.5 Envio por ficheiro (alternativa)
- [F] Upload do "Ficheiro Multidocumento" (SAF-T) no portal e-Fatura, ou JAR de linha de comandos (`https://faturas.portaldasfinancas.gov.pt/envioBatchInfoNovo.action`, requer autenticação). Prazo: dia 5.

### 6.6 Documentos de transporte (se aplicável)
- [F] Manual "Comunicação dos Documentos de Transporte à AT" (última revisão no histórico: 13-04-2022). WSDL `documentosTransporte.wsdl`. Perfil **WDT**.
  - Endpoints: testes `https://servicos.portaldasfinancas.gov.pt:701/sgdtws/documentosTransporte`, produção `https://servicos.portaldasfinancas.gov.pt:401/sgdtws/documentosTransporte`.
  - A resposta devolve o `ATDocCodeID`, que vai para o SAF-T.

---

## 7. Faturação eletrónica

- [F] Uma fatura eletrónica é emitida **e** recebida em formato eletrónico, com aceitação do destinatário (DL 28/2019, art. 2.º, al. d), e art. 12.º, n.º 1; CIVA, art. 36.º, n.º 10).
- [F] Origem e integridade consideram-se garantidas, nomeadamente, com (DL 28/2019, art. 12.º, n.º 2):
  - a) **assinatura eletrónica qualificada**;
  - b) **selo eletrónico qualificado** (eIDAS, Reg. 910/2014);
  - c) **EDI** com acordo segundo o "Acordo tipo EDI europeu".
- [F] Funcionalidades exigidas aos programas que emitem e recebem faturas eletrónicas (art. 13.º): validação cronológica, não repúdio, não duplicação e verificação de que o certificado não está revogado.
- [F] **PDF simples aceite como fatura eletrónica até 31-12-2026** (Lei n.º 73-A/2025, OE 2026, **art. 95.º, n.º 3**).
  - [S] A Proposta de Lei do OE 2027 (n.º 110/XVII) prorroga para **31-12-2027** (art. 77.º, n.º 3, segundo OCC e EY). **Ainda não é lei**: confirmar quando a lei for publicada (votação final global prevista para 24-11-2026).
  - [R] Para o Mezza (B2C), isto só conta se o PDF for enviado por email como fatura. O talão em papel não é afetado. Planear um selo eletrónico qualificado num PDF/PAdES, a emitir por um prestador qualificado, com data-alvo 1-1-2027, salvo prorrogação.
- [F] Arquivo eletrónico: 10 anos (DL 28/2019, art. 19.º). Pode ficar em qualquer Estado-Membro da UE; fora da UE só com autorização prévia (art. 20.º, n.os 1 b) e 2).
  - [R] Supabase/Render na UE cumpre. Indicar a localização do arquivo eletrónico na declaração de atividade de cada cliente (art. 20.º, n.º 5).
- **B2G (CIUS-PT/UBL)** [S]: DL 111-B/2017 / art. 299.º-B do CCP e DL 123/2018. O formato é a norma CIUS-PT (Portaria 289/2019, segundo fontes secundárias).
  - **Não confirmado**: a data atual da obrigação para PME e microempresas. As fontes secundárias divergem entre 2023 e 1-1-2025.
  - [R] Não relevante para restauração B2C. Tratar só se houver clientes públicos.
- **Não confirmado**: não há calendário de faturação eletrónica obrigatória B2B ou B2C em Portugal na legislação consultada.

---

## 8. Impressão e talões (POS / impressoras térmicas)

[F] Não encontrámos regras específicas para impressoras térmicas, nem nenhum regime de "impressora fiscal" para programas certificados. Aplicam-se as regras gerais de conteúdo e legibilidade.

**Talão de fatura simplificada (restauração). Elementos a imprimir:**

| Elemento | Fonte |
|---|---|
| Designação do tipo de documento ("Fatura simplificada") | Of.-Circ. 30141/2013; Despacho, pontos 1.2 e 2.2.4 |
| Código interno do tipo + série + n.º sequencial (só dígitos) | Despacho, ponto 2.2.4; Portaria 363/2010, art. 6.º, n.º 3, al. c) |
| Data `AAAA-MM-DD` ou `DD-MM-AAAA` | Despacho, ponto 2.2.4 |
| Nome/denominação e NIF do emitente | CIVA, art. 40.º, n.º 2, al. a) |
| Quantidade e denominação usual | art. 40.º, n.º 2, al. b) |
| Preço líquido + taxa(s) + IVA, ou preço com IVA + taxa(s) | art. 40.º, n.º 2, al. c) |
| NIF do adquirente (se sujeito passivo ou se o pedir), senão "Consumidor final" | art. 40.º, n.os 2 d) e 3; Despacho, ponto 2.2.5 |
| Motivo de isenção (menção legal) por linha ou referenciado | art. 40.º, n.º 2, al. e); Despacho, ponto 2.2.14 |
| `XXXX-Processado por programa certificado n.º NNNN/AT` | Despacho, ponto 2.2.2 |
| `ATCUD:CODIGO-NUM` imediatamente acima do QR | Portaria 195/2020, art. 4.º |
| Código QR ≥ 30×30 mm | Especificação QR v1.1, §2 |
| Indicação de 2.ª via nas reimpressões | Despacho, ponto 2.2.15 |
| "Documento emitido para fins de Formação" (modo formação) | Despacho, ponto 1.5 |

- **Consulta de mesa**: os mesmos elementos de identificação e assinatura, mais data **e hora**, mais **"Este documento não serve de fatura"** (DL 28/2019, art. 7.º, n.º 2; Despacho, ponto 1.2). Leva também ATCUD e QR.
- **Fatura (FT/FR)**: além disto, o nome e a morada do adquirente sujeito passivo (CIVA, art. 36.º, n.º 5, al. a)) e as bases discriminadas por taxa.
  - [F] O Of.-Circ. 30141/2013 refere um limite de 1000 € para identificar o adquirente não sujeito passivo. Esse limite assentava no art. 36.º, n.º 15, **revogado pelo DL 28/2019**. **Não confirmado** se ainda se aplica alguma regra equivalente.
- **Legibilidade** [F]: os elementos do art. 6.º, n.º 3, da Portaria 363/2010 (4 caracteres, certificado, identificação) não vão na 1.ª nem na última linha, nem junto às margens (Despacho, ponto 2.2.12).
- **Documentos com várias páginas** [F]: tipo, numeração, transportes, "página x de y" e totais só na última (Despacho, ponto 2.2.11). ATCUD em todas as páginas.
- **Papel pré-impresso** [F]: todos os elementos fiscais são impressos pelo programa (Despacho, ponto 2.2.13).
- **Recibos** [F]: "Emitido por programa certificado n.º NNNN/AT" (ponto 2.2.3).
- [R] Com 80 mm de papel (cerca de 72 mm úteis) ou 58 mm (cerca de 48 mm úteis) cabe o QR de 30 mm. Imprimir o QR como imagem rasterizada a módulo inteiro (sem escalar com interpolação) e testar com o leitor da app e-Fatura.

---

## 9. Boas práticas de implementação (fontes secundárias e recomendações)

- [R] **Vetores de teste oficiais no CI**: `saft_idemo599999999.xml` + `Chave_Publica.txt` (cadeia 36/36), o exemplo do Despacho (`…;FAC 001/14;3.12;` com o fim `;`) e os exemplos do QR (§5.1–5.7 da especificação).
- [R] **Validar sempre** o SAF-T gerado com o XSD 1.04_01. Gerar em UTF-8 ou Windows-1252, mas de forma coerente com a declaração XML (o XSD e o exemplo da AT usam Windows-1252). Validar também com `validador_v1_04.exe` antes do pedido de certificação.
- [R] **Erros comuns que vale a pena evitar** (deduzidos das normas; não temos lista oficial):
  - assinar o `GrossTotal` sem 2 casas ou com vírgula;
  - quebra de linha no fim da mensagem;
  - hash anterior de outra série ou de outro tipo;
  - Base64 com quebras de linha (MIME);
  - `SystemEntryDate` com milissegundos ou fuso;
  - ATCUD com o número sem os zeros à esquerda que aparecem no `InvoiceNo`;
  - campos opcionais vazios no QR (não devem aparecer);
  - QR abaixo de v9 ou com ECC errado;
  - código interno de tipo reutilizado para tipos diferentes;
  - permitir editar NIF/nome/descrição depois de emitir;
  - numeração com prefixo de ano.
- [R] **Concorrência**: um único escritor por série (lock de linha ou advisory lock). Gerar número, `SystemEntryDate`, hash, ATCUD e QR na mesma transação. Imprimir só depois do commit.
- [R] **Imutabilidade na BD**: trigger que rejeita UPDATE/DELETE em documentos assinados, exceto a mudança de estado para anulado com motivo. Tabela de auditoria só de inserção. Registo de reposições de backup (Despacho, ponto 3.1.3).
- [R] **Multi-organização / RLS**: os documentos fiscais levam `org_id` e estabelecimento. A chave de assinatura e o certificado SSL pertencem ao produtor (globais). As credenciais AT são por organização.
- [S] **Bibliotecas open-source**: não encontrámos nenhuma biblioteca de referência mantida e reconhecida para a certificação AT. Existem módulos Odoo/OpenERP da comunidade (por exemplo `l10n_pt_signature`, sem estado de certificação conhecido). [R] O Node nativo cobre RSA-SHA1, AES-ECB e mTLS. O QR precisa de uma biblioteca, que é dependência nova (pedir aprovação).
- [S] O SAF-T da contabilidade usa o processo "CryptoSAF-T" (descaracterização). Não se aplica ao SAF-T de faturação.

---

## 10. Checklist de requisitos técnicos

| # | Requisito | Fonte |
|---|---|---|
| 1 | Assinar com RSA 1024 + SHA-1 (PKCS#1 v1.5) todas as faturas, retificativos, documentos de transporte e de conferência (incluindo CM); recibos não são assinados | Portaria 363/2010, arts. 6.º e 7.º; Despacho 8632/2014, pontos 1.1, 4.1 e 6.2 |
| 2 | Mensagem `Data;SystemEntryDate;Número;GrossTotal(2 casas);HashAnterior`, UTF-8, sem quebras de linha | Portaria 363/2010, art. 6.º, n.º 1; Despacho, pontos 4.4–4.10 e 7.1 |
| 3 | Encadear pelo último documento da mesma série/tipo; hash anterior vazio no 1.º | Despacho, ponto 2.1.5 |
| 4 | Assinatura em Base64 de 172 caracteres gravada na BD com a versão da chave (`HashControl`) | Despacho, pontos 2.1.2, 2.1.3 e 7.1 |
| 5 | GrossTotal assinado = valor da BD, ou `0.00`; contravalor em EUR | Despacho, pontos 2.1.6, 2.1.7 e 2.6.7 |
| 6 | Imprimir os caracteres 1, 11, 21 e 31 + "-Processado por programa certificado n.º X/AT" | Portaria 363/2010, art. 6.º, n.º 3; Despacho, ponto 2.2.2 |
| 7 | Recibos com "Emitido por programa certificado n.º X/AT" | Despacho, ponto 2.2.3 |
| 8 | Chave privada exclusiva do produtor, protegida; chave pública PEM entregue com o modelo 24; nova chave só com novo modelo 24 | Despacho, pontos 2.1.4, 3.1.4, 4.2 e 4.3 |
| 9 | Numeração contínua por série, só dígitos, séries de pelo menos um ano fiscal, únicas por tipo e contribuinte | Despacho, pontos 1.6–1.8 e 2.2.4; DL 28/2019, art. 7.º, n.º 4 |
| 10 | Nunca apagar; não alterar documentos assinados; não imprimir antes de assinar | Despacho, pontos 1.9–1.11 e 2.2.1; Portaria 363/2010, art. 3.º, al. d) |
| 11 | Sem valores negativos; NC/ND para retificar; controlo de NC parciais; regras de anulação | Despacho, pontos 2.2.6, 3.2.7 e 3.3.7–3.3.9 |
| 12 | Documentos de conferência (CM) com "Este documento não serve de fatura", data e hora; fatura referencia a CM | Despacho, pontos 1.2 e 1.3; DL 28/2019, art. 7.º, n.º 2 |
| 13 | Séries de recuperação M/D com `SourceBilling`/`HashControl` próprios | Despacho, pontos 2.4–2.5 e 3.2.2 |
| 14 | Modo formação em série própria com dados do produtor e menção | Despacho, ponto 1.5; DL 28/2019, art. 7.º, n.º 6 |
| 15 | 2.ª via preserva o conteúdo original | Despacho, ponto 2.2.15 |
| 16 | Alertas de data futura e de relógio atrasado | Despacho, pontos 3.4.2–3.4.3 |
| 17 | Cálculo com mais de 2 casas; descontos entre 0 e 100 %; IVA por taxa; motivo de isenção obrigatório (tabela M v4.0) | Despacho, pontos 3.2.3, 3.2.6, 3.2.8 e 2.2.14; Tabela de Códigos de Motivo de Isenção v4.0 |
| 18 | Consumidor final 999999990; bloquear alteração de NIF, nome e descrição de produto; não reutilizar `SourceID` | Despacho, pontos 2.2.5 e 3.3.3–3.3.6; Portaria 302/2016 |
| 19 | FS só dentro dos limites do art. 40.º do CIVA (sem IVA) | CIVA, art. 40.º; Of.-Circ. 30141/2013 |
| 20 | Controlo de acessos e de passwords | Portaria 363/2010, art. 3.º, al. c); Despacho, ponto 3.1.1 |
| 21 | Backups, controlo de reposições, deteção de alterações fora da aplicação, bloqueio perante alterações à integridade | Despacho, pontos 3.1.2–3.1.3; DL 28/2019, art. 11.º |
| 22 | Documentação técnica e dicionário de dados disponíveis para a AT | DL 28/2019, art. 11.º, n.º 3; Portaria 363/2010, art. 5.º, n.º 3 |
| 23 | Exportar SAF-T 1.04_01 válido; o utilizador não escolhe o que é exportado | Portaria 302/2016; Despacho, pontos 2.6.1–2.6.7 e 3.3.1 |
| 24 | Comunicar as séries antes de as usar (WS `registarSerie` ou Portal) e guardar o código de validação | DL 28/2019, art. 35.º; Portaria 195/2020, art. 2.º; Manual Séries v1.2 |
| 25 | ATCUD `CODIGO-NUM` no documento e no SAF-T; impresso como `ATCUD:…` acima do QR e em todas as páginas | Portaria 195/2020, arts. 3.º–4.º |
| 26 | QR com ECC M, Byte, v≥9, ≥30 mm, margem de 0,25 cm; campos A–S pela ordem e com o formato da especificação | Especificações Técnicas QR v1.1 (out. 2020) |
| 27 | Comunicar faturas, CM e recibos de IVA de caixa até ao dia 5 do mês seguinte (WS em tempo real ou ficheiro); comunicar meses sem faturação | DL 198/2012, art. 3.º, n.os 1, 2 e 9 |
| 28 | WS e-Fatura: mTLS com certificado do produtor (CSR RSA 2048, CN=NIF), subutilizador WFA, WS-Security com AES-128-ECB/PKCS5 + RSA (KpubSA), `Created` em UTC | Manual e-Fatura Aspetos genéricos (out. 2025) e específicos v3.0 |
| 29 | Fatura eletrónica: QES, selo qualificado ou EDI; PDF simples aceite até 31-12-2026 | DL 28/2019, arts. 12.º–13.º; Lei 73-A/2025, art. 95.º, n.º 3 |
| 30 | Arquivo durante 10 anos, na UE (fora da UE só com autorização) | DL 28/2019, arts. 19.º–21.º |
| 31 | Interface em português; formulários validados pelo produtor; legibilidade da impressão | Despacho, pontos 3.2.9, 3.2.11 e 2.2.12 |

---

## 11. Links oficiais (verificados a 2026-11-03)

**Certificação**
- Página "Certificação de Software de Faturação": https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Negocios/Faturacao/Regras_mecanismos_comunicacao/Certificacao_programas/Certificacao_software_faturacao/Paginas/default.aspx
- Despacho 8632/2014 (Portal): https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/Despacho_n%C2%BA_8632_2014_03_07.pdf
- Despacho 8632/2014 (original no DR, com a tabela de formatos do ponto 4.5): https://files.diariodarepublica.pt/2s/2014/07/126000000/1725517261.pdf
- Portaria 363/2010 (consolidada): https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/Portaria_363_2010.pdf
- Validador de assinaturas: https://info.portaldasfinancas.gov.pt/apps/saft-pt01/local/validador.exe
- SAF-T de demonstração: https://info.portaldasfinancas.gov.pt/apps/saft-pt01/local/saft_idemo599999999.xml
- Par de chaves de exemplo: …/Certificacao_software_faturacao/Documents/Chave_Privada.txt e …/Chave_Publica.txt (mesma pasta da página de certificação)
- Lista de programas certificados: http://www.portaldasfinancas.gov.pt/pt/Out/consultaProgCertificadosM24.action

**SAF-T**
- Página SAF-T (PT): https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Negocios/Faturacao/SAF_T_PT/SAF_T_PT_Versao_PT/Paginas/default.aspx
- XSD 1.04_01: https://info.portaldasfinancas.gov.pt/apps/saft-pt04/saftpt1.04_01.xsd
- Validador local 1.04: https://info.portaldasfinancas.gov.pt/apps/saft-pt04/validador_v1_04.exe
- Portaria 302/2016: https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/Portaria_302_2016.pdf

**ATCUD / séries / QR**
- Portaria 195/2020: https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/Portaria_195_2020.pdf
- Especificação do QR (v1.1): https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Negocios/Faturacao/Regras_mecanismos_comunicacao/Comunicacao_de_series_ATCUD/Codigo_barras_bidimensional/Documents/Especificacoes_Tecnicas_Codigo_QR.pdf
- Manuais de séries (Genéricos/Específicos): https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Negocios/Faturacao/Regras_mecanismos_comunicacao/Comunicacao_de_series_ATCUD/Comunicacao_Series_a_AT_e_ATCUD/Documents/Comunicacao_de_Series_Documentais_Manual_de_Integracao_de_SW_Aspetos_Genericos.pdf (e `…_Aspetos_Especificos.pdf`)
- WSDL de séries: https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Outras_entidades/Suporte_tecnologico/Webservice/Comunicacao_de_series_ATCUD/Documents/Comunicacao_Series.wsdl
- Endpoints de séries: testes `https://servicos.portaldasfinancas.gov.pt:722/SeriesWSService`; produção `https://servicos.portaldasfinancas.gov.pt:422/SeriesWSService`
- Portal de séries: https://processos.portaldasfinancas.gov.pt/series/pf/inicio?modo=false

**e-Fatura**
- Manual Aspetos gerais: https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Outras_entidades/Suporte_tecnologico/Webservice/e_Fatura/Documents/Comunicacao_dos_elementos_dos_documentos_de_faturacao_aspetos_gerais.pdf
- Manual Aspetos específicos (v3.0): https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Outras_entidades/Suporte_tecnologico/Webservice/e_Fatura/Documents/Comunicacao_dos_elementos_dos_documentos_de_faturacao.pdf
- WSDL de comunicação: https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Outras_entidades/Suporte_tecnologico/Webservice/e_Fatura/Documents/Fatcorews.wsdl
- WSDL de consulta: https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Outras_entidades/Suporte_tecnologico/Webservice/e_Fatura/Documents/fatshareInvoices.wsdl
- Endpoints: comunicação testes `:723/fatcorews/ws/`, produção `:423/fatcorews/ws/`; consulta testes `:725/fatshare/ws/fatshareFaturas`, produção `:425/fatshare/ws/fatshareFaturas` (host `servicos.portaldasfinancas.gov.pt`)
- Tabela de Códigos de Motivo de Isenção (v4.0): https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Negocios/Faturacao/Regras_mecanismos_comunicacao/e_Fatura/e_Fatura_Comunicacao_elementos_docs_faturacao_2022_seguintes/Documents/Tabela_Codigos_Motivo_Isencao.pdf
- Contrato de adesão WS: https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Negocios/Faturacao/Regras_mecanismos_comunicacao/e_Fatura/Documents/Contrato_de_adesao-ws.pdf
- Produtores de Software: https://faturas.portaldasfinancas.gov.pt/painelInicialProdSoftware.action
- Adesão: https://faturas.portaldasfinancas.gov.pt/consultarPedidosAdesao.action
- Teste de conectividade: https://faturas.portaldasfinancas.gov.pt/testarLigacaoWebService.action

**Documentos de transporte**
- Manual: https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Outras_entidades/Suporte_tecnologico/Webservice/Documentos_de_transporte/Documents/Comunicacao_Dados_Documentos_Transporte.pdf
- Endpoints: testes `:701/sgdtws/documentosTransporte`; produção `:401/sgdtws/documentosTransporte`

**Legislação**
- DL 28/2019 (consolidado até ao DL 49/2025): https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/Decreto_Lei_28_2019.pdf
- DL 198/2012 (consolidado): https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/Decreto-Lei%20n%20_198_2012_24_08.pdf
- Lei 73-A/2025 (OE 2026): https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/Lei-73-A-2025.pdf
- CIVA, art. 36.º: https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/civa_rep/Pages/iva36.aspx
- CIVA, art. 40.º: https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/civa_rep/Pages/iva40.aspx
- Of.-Circ. 30141/2013: https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/instrucoes_administrativas/Documents/30141_2013.pdf
- Despacho SEAAF 351/2021-XXII: https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/Despachos_SEAF/Documents/Despacho_SEAAF_351_2021_XXII.pdf

**Fontes secundárias usadas (só como pista)**
- OCC: notícias sobre ATCUD/séries e análise da proposta de OE 2027 (https://www.occ.pt/sites/default/files/public/2026-10/ANALISE_proposta_OE2027C.pdf)
- EY tax alert OE 2027 (https://www.ey.com/content/dam/ey-unified-site/ey-com/pt-pt/services/tax/documents/ey-taxalert2027.pdf)
- Garrigues (ATCUD 2023)
- Blogs de fornecedores (Vendus, InvoiceXpress, Cegid) sobre a fatura eletrónica B2G

---

## 12. Ainda por confirmar

1. A lista oficial dos testes de conformidade da AT (não é pública).
2. O caminho exato e os campos atuais da declaração modelo 24 no Portal.
3. O valor atual de `eFaturaMDVersion` e o padding RSA do `Nonce`.
4. A validade do certificado SSL: 12 meses (e-Fatura, 2025) ou 24 meses (Séries, 2022).
5. Se os documentos de formação são comunicados ao e-Fatura.
6. O fuso de `SystemEntryDate`.
7. O enquadramento das refeições no limite de 100 € ou de 1000 € da FS.
8. Se ainda há uma regra de identificação do adquirente acima de 1000 € depois da revogação do art. 36.º, n.º 15.
9. Quando é permitido anular em vez de emitir NC.
10. A aprovação final do OE 2027, com a prorrogação do PDF até 31-12-2027.
11. A data de obrigatoriedade B2G para PME.
12. O `HashControl` "Não certificado" face à regex do XSD.
13. Se os KMS de cloud suportam RSA-1024.
