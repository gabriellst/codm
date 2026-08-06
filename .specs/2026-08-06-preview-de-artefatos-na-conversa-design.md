# Preview de artefatos na conversa — Design Spec

**Date:** 2026-08-06
**Status:** Implemented
**Bounded Context:** `artifact` (BC6 Artifact Registry) + `thread` (o read model da conversa) + `app-react`
**Kind:** feature
**Story Points:** 5 — um endpoint novo, dois campos novos em dois read models, uma extensão de enum de contrato com a migração que ela obriga, e a frente de frontend que é o motivo de tudo isso existir. Nenhuma entidade nova, nenhum agregado novo, nenhum evento novo.

## Context

Um **Artifact** (`packages/api/typescript/src/artifact/entities/Artifact.ts`) é a saída não-código de um agente: `{ ownerId, threadId, issueId?, kind, name, ref, meta, recordedAt }`. O agente o cataloga chamando a ferramenta MCP `RecordArtifact` (C30, `McpScope.ISSUE_HANDLING`) — a única escrita — e `ref` é, pelo comentário na entidade, *"Local path (IMAGE/FILE) or URL (LINK)"*.

Hoje existem exatamente duas superfícies de leitura, e nenhuma das duas mostra o artefato:

1. **`ListArtifacts`** (`artifact/usecases/ListArtifacts.ts`) devolve `{ artifactId, issueId?, kind, name, meta, recordedAt }`. Repare no que **não** está ali: `ref`. O identificador do conteúdo — o path, a URL — não cruza o fio. O console recebe o nome de uma coisa e nenhuma forma de alcançá-la.
2. **`ArtifactsSection`** (`app/react/.../threads/$threadId/-components/ArtifactsSection/`) é a aba "Artefatos" da página da thread. Para `kind === 'IMAGE'` ela renderiza uma faixa de 128px de altura preenchida com um `repeating-linear-gradient` diagonal cinza — um **placeholder listrado**, literalmente um desenho de xadrez no lugar da imagem. Para `LINK` renderiza um ícone de corrente e o nome, sem `href`: o "deploy de preview" que o agente registrou não é clicável.

E a `GetSessionChat` (`thread/usecases/GetSessionChat.ts`), que monta a conversa, não sabe que artefatos existem. O `transcript` é uma lista de linhas de texto (`TranscriptKind` = CONTACT | SYSTEM | DIRECT | WHISPER | ACTION) e nada mais. Um agente que tira uma captura de tela no meio de uma issue não deixa rastro nenhum na conversa em que o operador está olhando.

A autenticação não é um obstáculo aqui e vale dizer por quê: desde o colapso do eixo de auth existe **um** operador constante (`OperatorMiddleware` estampa `OPERATOR_ID` incondicionalmente, sem sessão, sem cookie, sem lookup). Um `<img src="http://localhost:3030/...">` alcança o daemon sem credencial nenhuma.

## Problem

O artefato é o único tipo de saída de agente que o produto cataloga e não mostra. Isso tem três consequências, em ordem de gravidade:

1. **A captura de tela não existe para o operador.** É a saída mais óbvia de um agente que mexeu em UI — "olha como ficou" — e o operador recebe um retângulo listrado com um nome embaixo. Ele não tem como ver o que o agente viu sem sair do produto, abrir o Finder e caçar o path que o produto nem lhe mostrou (`ref` não cruza o fio).
2. **O link de preview não é clicável.** `ArtifactKind.LINK` é traduzido em `pt.json` como *"Deploy de preview"* — é o caso de uso nomeado do próprio enum — e é renderizado como texto morto. A informação inteira do artefato é a URL, e ela é a única coisa que não chega.
3. **Áudio e vídeo não são sequer representáveis.** `ArtifactKind` é `IMAGE | FILE | LINK`. Uma nota de voz, um screen recording de um fluxo, um vídeo de repro de bug: hoje tudo isso é `FILE`, que é a caixa "sem forma" — e uma caixa sem forma não pode ganhar um player, porque não há discriminante que diga qual player.

Somando: o operador olha a conversa, que é onde ele mora, e o trabalho visual dos agentes é invisível ali. A aba Artefatos existe e é um catálogo de nomes.

## Goal

O que o agente produz aparece **na conversa**, no momento em que foi produzido, já renderizado: a imagem se vê, o áudio e o vídeo tocam, o link se clica, o arquivo se abre. E a aba Artefatos passa a ser o mesmo preview em forma de catálogo, não um segundo desenho do mesmo dado.

## Decisions

1. **`ArtifactKind` ganha `AUDIO` e `VIDEO` — a forma tem que estar no discriminante.** O enum passa a ser `IMAGE | AUDIO | VIDEO | FILE | LINK`. A alternativa era deixar tudo como `FILE` e adivinhar o player pela extensão do `ref` no browser, e ela é exatamente o que o Não-Negociável #5 proíbe: informação estrutural derivada de parse de string em vez de declarada no contrato. Um `<video controls>` e uma linha de download são UIs diferentes; o backend modela a diferença ou o frontend a inventa. `FILE` continua existindo e continua sendo a resposta certa para um PDF, um `.zip`, um CSV — é a caixa "sem player", não a caixa "sem forma".

2. **Um endpoint de conteúdo, e o path nunca vem do request.** `GET /threads/:threadId/artifacts/:artifactId/content` (`GetArtifactContent`) lê a linha, confere dono e thread, e transmite os bytes do arquivo em `artifact.ref` com o `Content-Type` derivado da extensão e `Content-Disposition: inline`. O request carrega **ids**; o caminho no disco sai da linha do banco. Essa é a fronteira inteira: o endpoint só consegue servir um arquivo que um agente já registrou naquela thread, e nenhuma string do cliente participa da resolução do path — não há travessia a defender porque não há entrada de path.

3. **O endpoint existe porque o `file://` não alcança nem o browser nem o webview.** A alternativa desktop-only era o `convertFileSrc` do Tauri (protocolo `asset:`), e ela morre no primeiro requisito: o console roda no navegador em `bun dev` e dentro do shell Tauri, e as duas metades têm que mostrar a mesma imagem. Uma origem HTTP serve as duas. O custo é um endpoint; o benefício é não ter dois caminhos de renderização para manter.

4. **O endpoint NÃO é ferramenta MCP.** `static mcpScopes` fica ausente — que é o default e o default significa não exposto. Um agente que quer ler um arquivo tem o sistema de arquivos; esse endpoint existe para o **browser**, que não tem. Expô-lo seria abrir uma porta cujo único ganho é para quem já entra pela janela.

5. **`ref` cruza o fio, nos dois read models.** `ListArtifacts` e a conversa passam a devolver `ref`. Para `LINK` ele **é** o `href` — não há bytes para servir e o endpoint de conteúdo recusa esse `kind` (o alvo é externo; o daemon não vira proxy de URL alheia). Para os quatro kinds locais ele é a legenda honesta do que se está vendo (`~/Desktop/shot.png`), que é a informação que hoje falta quando o operador quer achar o arquivo.

6. **A linha do tempo é composta pela VIEW, a partir das duas leituras que ela já tem.** O `SessionChatSection` chama `useGetSessionChat` **e** `useListArtifacts` — os dois já existem — e funde `transcript` com `artifacts` por `at` numa união discriminada (`{ item: 'ENTRY' } | { item: 'ARTIFACT' }`) que o `VirtualList` renderiza por despacho no discriminante. **`GetSessionChat` não muda.**

   A alternativa era `GetSessionChat` ganhar uma lista irmã de artefatos, e ela morre no mapa de contextos: `GetSessionChat` mora em `thread` e o `ArtifactRepository` mora em BC6, que **já** depende de `thread` (`RecordArtifact` valida a thread pelo `ThreadRepository`, aresta declarada em `CONTEXT_MAP`). Ler artefatos de dentro do `thread` inverteria essa aresta e exigiria um 2-ciclo anotado — acoplamento bidirecional permanente entre dois contextos — para comprar uma ordenação por timestamp que é uma linha no cliente. O preço é desproporcional ao ganho.

   E o caminho barato é o que o próprio frontend já manda fazer: *"cada componente é dono dos seus próprios dados"*. A seção que mostra a linha do tempo busca as duas listas que a compõem. Composição de união, não achatamento: cada membro mantém sua forma concreta e cada um tem seu componente.

7. **O preview é UM componente, usado nos dois lugares.** `ArtifactPreview` despacha por `ArtifactKind` num `Record<ArtifactKind, ...>` colocado no módulo — mapa exaustivo, sem cadeia de `if`, `CMP-P18`. A aba Artefatos e a bolha da conversa envolvem o mesmo componente em molduras diferentes. Duas renderizações do mesmo dado divergem; uma não.

8. **Arquivo sumido é um estado esperado, não um erro.** O `ref` aponta para o disco do operador e um agente escreve em `/tmp`. Quando os bytes não vêm (404 do endpoint, `onError` do `<img>`/`<video>`/`<audio>`), o preview cai para a linha de arquivo com o path — que é a informação útil que sobrou — em vez de mostrar o ícone de imagem quebrada do navegador. É `useState` local e transitório, o caso 5 da regra de colocação de estado.

9. **`Range` é servido, porque sem ele vídeo não navega.** O endpoint responde `Accept-Ranges: bytes` e honra `Range: bytes=a-b` com `206`. Não é polimento: `<video>` pede range para buscar (seek) e alguns navegadores se recusam a começar sem isso. É o único detalhe de transporte que o endpoint carrega além do content-type.

10. **`MimeTypes` do core é corrigido, não contornado.** O enum `MimeTypes` (`core/src/types/Http.ts`) tem `'.jpeg' = '.jpg'` e `'.mid' = '.midi'` — valores que são **outra chave do enum**, não content-types, e para os quais não existe membro de destino. Não há `.jpg`, não há `.mp4`, não há `.m4a`. Servir `Content-Type: .jpg` é servir lixo. Os membros faltantes entram e os dois aliases quebrados passam a valer o tipo real (Não-Negociável #1: corrigir a causa; o alvo natural do bug é o arquivo que o tem).

11. **Nada muda em `RecordArtifact`.** A escrita já aceita qualquer `ArtifactKind` (`z.enum(ArtifactKind)`), então os dois membros novos ficam graváveis pela ferramenta MCP no instante em que o contrato regenera, sem tocar no use case, no controller ou no evento. O `ArtifactRecordedEvent` (interno e de integração) carrega `kind` e continua carregando — a extensão do enum é aditiva no fio.

12. **A conversa já fica fresca, e isso é consequência da Decisão 6.** `integration.artifact.recorded` já é assinado por `useThreadRealtime` e já invalida `listArtifactsQueryKey` — que agora é *a* fonte dos artefatos da conversa. Nada a acrescentar ao mapa de invalidação: a leitura que o operador vê ficar fresca é a mesma que já era invalidada. Se os artefatos tivessem entrado no payload da conversa (a alternativa recusada), este seria mais um lugar para lembrar de mexer.

## User Stories

- **Story 1:** Como operador, quero ver na conversa a captura de tela que o agente acabou de tirar, para conferir o trabalho sem sair do produto.
  - Given uma thread minha em que um agente gravou um artefato `IMAGE`, when eu abro a aba de conversa, then a imagem aparece renderizada na posição cronológica em que foi gravada, entre as mensagens daquele momento.
  - Given essa imagem na conversa, when eu clico nela, then ela abre em tamanho cheio.
  - Given que o arquivo foi apagado do disco depois de gravado, when a conversa carrega, then vejo a linha do arquivo com o path em vez de uma imagem quebrada.

- **Story 2:** Como operador, quero clicar no deploy de preview que o agente registrou, para abrir o que ele subiu.
  - Given um artefato `LINK`, when ele aparece na conversa ou na aba Artefatos, then é um link clicável que abre a URL numa aba nova.

- **Story 3:** Como operador, quero ouvir e assistir o que o agente produziu, para não precisar de um player fora do produto.
  - Given um artefato `AUDIO`, when ele aparece, then há um player de áudio que toca sem sair da página.
  - Given um artefato `VIDEO`, when ele aparece, then há um player de vídeo que toca e permite navegar no tempo (seek).

- **Story 4:** Como operador, quero que a aba Artefatos mostre o mesmo que a conversa, para o catálogo ser útil e não um segundo desenho.
  - Given artefatos de vários kinds, when eu abro a aba Artefatos, then cada card traz o preview real do seu kind — nunca o placeholder listrado.

- **Story 5:** Como operador, quero que o conteúdo de uma thread minha não vaze por id de outra, para que o endpoint de bytes não seja uma porta lateral.
  - Given um `artifactId` que pertence a outra thread, when o pedido usa o `threadId` da minha, then é recusado com 404 e nada é servido.
  - Given um artefato `LINK`, when o pedido é de conteúdo, then é recusado — não há bytes locais e o daemon não busca a URL por ninguém.

## Acceptance Criteria

- [x] AC-1: `ArtifactKind` vale `IMAGE | AUDIO | VIDEO | FILE | LINK` nas três linguagens geradas (ts, go, rust) e no CHECK da tabela `artifact_artifacts`, com migração aplicada e a cópia `//go:embed` byte-a-byte igual (`db:check-go` verde).
- [x] AC-2: `RecordArtifact` grava um artefato `AUDIO` e um `VIDEO` e ambos são lidos de volta pelo repositório com o kind que foi enviado — sem nenhuma mudança no use case.
- [x] AC-3: `ListArtifacts` devolve `ref` e `recordedAt` para todos os kinds, apenas os do dono pedido.
- [x] AC-4: `GetSessionChat` fica **inalterado** — nenhum campo novo, nenhuma aresta nova no `CONTEXT_MAP`, e o rail de mapa de contextos continua verde.
- [x] AC-5: `GetArtifactContent` transmite os bytes de um artefato `IMAGE` com o `Content-Type` da extensão do arquivo e `Content-Disposition: inline`.
- [x] AC-6: O mesmo endpoint responde `206` com o fatiamento correto para `Range: bytes=a-b`, e anuncia `Accept-Ranges: bytes`.
- [x] AC-7: O endpoint recusa com 404 (a) um `artifactId` inexistente, (b) um de outro dono, (c) um cujo `threadId` não bate com o do path, (d) um cujo arquivo não existe mais no disco.
- [x] AC-8: O endpoint recusa um artefato `LINK` — sem tentar buscar a URL.
- [x] AC-9: `GetArtifactContent` não aparece em nenhuma superfície MCP (`mcpExposure()` e o `x-mcp-scopes` do `openapi.json`).
- [x] AC-10: `MimeTypes` resolve `.jpg`/`.jpeg` para `image/jpeg`, `.mp4` para `video/mp4`, `.m4a` para `audio/mp4` e `.mid`/`.midi` para `audio/midi` — e nenhum membro do enum tem como valor a chave de outro membro.
- [x] AC-11: `ArtifactPreview` despacha por um `Record<ArtifactKind, …>` exaustivo: `IMAGE` → `<img>`, `AUDIO` → `<audio controls>`, `VIDEO` → `<video controls>`, `LINK` → âncora com `href` = `ref` e `target="_blank"`, `FILE` → linha com nome, path e ação de abrir.
- [x] AC-12: Falha de carga em `IMAGE`/`AUDIO`/`VIDEO` cai para a linha de arquivo com o path, sem imagem quebrada.
- [x] AC-13: A conversa renderiza uma linha do tempo única, ordenada por `at`, fundindo o `transcript` de `useGetSessionChat` com os artefatos de `useListArtifacts`; a chave de virtualização é estável e distinta entre os dois tipos.
- [x] AC-14: A aba Artefatos usa o mesmo `ArtifactPreview` e o `repeating-linear-gradient` listrado não existe mais no repositório.
- [x] AC-15: `threadInvalidations` continua invalidando `listArtifactsQueryKey` em `integration.artifact.recorded` — e é isso que mantém a conversa fresca (Decisão 12).
- [x] AC-16: Todo texto novo de UI passa por `t()` e existe em `pt.json` e `en.json`, incluindo os rótulos de `enums.ArtifactKind.AUDIO` e `.VIDEO`.
- [x] AC-17: `bun tsc`, `bun lint` e `bun run test` verdes.

## Riscos

- **A URL de conteúdo é montada no cliente.** O `previewUrl` é `${Config.baseUrl}${getArtifactContentQueryKey(...)[0].url}` com os params substituídos — a mesma manobra que `useTerminalStream` e `useServerEventSource` já fazem para SSE, e pela mesma razão (um `<img>`/`<video>`/`EventSource` não passa pelo cliente ky da SDK). O path continua derivado da SDK, nunca digitado; o que o cliente acrescenta é a origem, que é dele. Mitigado por ser um helper único, não uma string por call-site.
- **Um arquivo grande trava a aba.** Um vídeo de 500MB é servido inteiro se o navegador pedir inteiro. O `Range` (Decisão 9) é o que faz o navegador pedir em pedaços, e é o motivo de ele não ser opcional. Não há limite de tamanho no endpoint — o disco é do operador e o dado é dele.
- **Extensão mentirosa.** O content-type sai da extensão do path, não dos bytes. Um `.png` que é na verdade um PDF chega ao navegador como `image/png` e não renderiza. Sniffing de magic bytes é a correção completa e fica de fora: o produtor é um agente na máquina do próprio operador, e o custo do erro é um preview que cai para a linha de arquivo (Decisão 8).
- **A extensão do enum toca Go e Rust.** `ArtifactKind` regenera nas três linguagens e o CHECK do SQLite obriga recriação de tabela (o precedente é a migração `0011`, que fez exatamente isso para `thread_loops.kind`). Aditivo em valores: nenhuma linha existente vira inválida.

## Follow-ups (fora de escopo)

- Miniaturas geradas server-side para imagens grandes (hoje o `<img>` baixa o original e o navegador reduz).
- Sniffing de content-type por magic bytes, se a extensão mentirosa aparecer na prática.
- Preview de mídia recebida do contato pelo canal (WhatsApp `MessageType.IMAGE/AUDIO/VIDEO`) — é a projeção `messages` do gateway Go, outro dado e outra frente.
- Unfurl de URLs escritas no texto de uma mensagem — é enriquecimento de transcript, não artefato.
