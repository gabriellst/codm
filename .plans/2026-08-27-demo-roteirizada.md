# Demo roteirizada — attach → thread → issue → terminal → artefato

**Data:** 2026-08-27
**Decisão do founder:** roteirizado (não Claude Code real), Chromium, DOM recorder (não `PW_VIDEO`).

## O filme

Um take contínuo, inteiro dentro do console, sem nenhuma tela de WhatsApp:

1. `/attach` — o wizard clicado com cursor animado (contato → workspace → agentes → revisão).
2. A thread abre. Uma mensagem do contato chega.
3. O agente responde. "Pensando…" some quando a resposta entra.
4. O agente forka uma issue. A thread vira **Em execução**.
5. Clique na issue → o painel escuro de terminal enche ao vivo, pausado no ritmo de leitura.
6. A issue declara dois artefatos (a imagem da tela construída, o link do PR) e se declara **Concluída**.
7. Volta pra conversa: a imagem e o link do PR estão lá, thread **Ociosa** de novo.

## O que já existe (não se reconstrói)

| Peça | Onde | Provada por |
|---|---|---|
| Cursor animado (bezier, jitter, troca de glifo) | `packages/e2e/utils/cursor.ts` | `90-demo-onboarding` |
| DOM recorder (CDP DOMSnapshot → HTML/SVG) | `packages/e2e/utils/recorder.ts`, `scripts/generate-{html,svg}.ts` | `scripts/record-free.ts` |
| Camada de tweaks de captura (só DOM, nunca app) | `91-demo-thread-artifacts` | idem |
| Mensagem de entrada sem WhatsApp | `injectInboundMessage` → `/_test/gateway` | `04-inbound-issue` |
| Turno do agente disparado com o painel já anexado | `runIssueTurn` → `/_test/agent/run-turn` | `10-terminal-tool-frame` |
| Declaração por MCP real (fork, artefato, conclusão) | `agent/mcp/E2eMcpDriver` | `04`, `10` |
| Artefato IMAGE/LINK renderizado inline | `ArtifactPreview`, aba Artefatos | `91` |

## O que falta — e o desenho de cada peça

### 1. O roteiro do agente vira contrato declarado

Hoje `E2eStubAgentRunner` é hardcoded: duas linhas fixas, um par de tool frames sintético, e
duas declarações fixas via `E2eMcpDriver.forkIssue` / `.declareIssueWorkComplete`. Vira um
**cenário declarado**, exatamente o que o lado Go já faz (`mock.Scenario` / `defaultE2eScenario`,
`internal/channel/overlay.go`: "roteiro declarado no boot").

```
AgentScenario
├── orchestrator: AgentScenarioAct   // o turno de conversa
└── work:         AgentScenarioAct   // o turno da issue (o que enche o terminal)

AgentScenarioAct
├── echoesRunHeader: boolean         // a linha `$ <agente> (e2e-stub) in <cwd>`
├── beats:        AgentScenarioBeat[]        // SAY | TOOL, com `afterMs` de pausa
└── declarations: AgentScenarioDeclaration[] // FORK_ISSUE | RECORD_ARTIFACT | COMPLETE_ISSUE
```

**Duas regras que o contrato tem que respeitar:**

- **Nenhuma chave de identidade** (`ownerId`/`issueId`/`threadId`) pode aparecer sob
  `services/AgentRunner/**` — é a invariante AC-6.12, e é por isso que o `E2eMcpDriver` (em
  `agent/mcp/`) é quem preenche os ids a partir da identidade resolvida do token.
- **Onde ficam os bytes de um artefato é resolvido em tempo de run**, não declarado: um workspace
  de scratch não tem nome que um cenário possa conhecer. Daí `AgentScenarioArtifactRef` ser
  `{ at: 'WORKSPACE', relativePath }` | `{ at: 'URL', url }`, resolvido contra `request.cwd`.

**Cenário `default` = as constantes de hoje**, byte a byte — `04`, `09`, `10` e `13` continuam
verdes sem tocar numa linha delas.

### 2. Seleção por porta de teste, não por env key

A porta `POST /_test/agent/scenario { scenarioId }` seleciona o cenário ativo; os cenários
seguem declarados no daemon e a porta só escolhe entre eles (`z.enum` sobre os ids, nunca string
livre). Montada só sob `CODM_ENV=e2e`, do mesmo jeito que `TestRunIssueTurnController`.

**Por que não uma env key.** O `.env.example` é GERADO do registry de `template.config.ts` para
clones novos, e há um rail de resíduo de produto. Uma `CODM_AGENT_SCENARIO` na superfície pública
do produto para servir um filme é exatamente o resíduo que o rail existe para pegar. A porta
`/_test/*` já é o seam declarado para isto.

### 3. Ritmo

O stub cospe todos os frames num laço apertado — o terminal encheria num piscar. Cada beat ganha
`afterMs`. O orçamento é folgado: o lease do mailbox é de 10 min com heartbeat, e a porta de turno
é um request HTTP sem timeout no cliente da SDK.

### 4. Assets sintéticos

A "tela construída" é renderizada pelo próprio Playwright (`setContent` de um HTML sintético →
`screenshot`) direto dentro do workspace da thread, e o cenário a referencia por caminho relativo.
Zero blob commitado, zero dado real — mesma régua de `writeSampleWav`/`writeSampleFile`.

### 5. A spec

`packages/e2e/tests/92-demo-attach-artefato.spec.ts`, gated em `DEMO=on` como as outras duas,
gravando com o DOM recorder do começo ao fim.

## Ordem de execução

1. Contrato do cenário + registry (`default` + `demo`).
2. `E2eMcpDriver` com dispatch fechado sobre os tipos de declaração.
3. `E2eStubAgentRunner` dirigido por cenário, com ritmo.
4. Porta de seleção + montagem `e2e`.
5. Helper `selectAgentScenario` no e2e.
6. A spec 92 + o asset sintético.
7. Gates: `bun tsc`, `bun lint`, `bun test` no pacote, e `04`/`10`/`13` verdes.

## Estado

**Entregue em dois idiomas, a 60 fps, em MP4.**

```bash
DEMO=on FILM=pt bun scripts/run-e2e.ts tests/92-demo-attach-artefato.spec.ts
DEMO=on FILM=en bun scripts/run-e2e.ts tests/92-demo-attach-artefato.spec.ts
bun scripts/render-mp4.ts films/demo-attach-artefato-pt
bun scripts/render-mp4.ts films/demo-attach-artefato-en
```

| | frames | duração | arquivo |
|---|---|---|---|
| `demo-attach-artefato-pt` | 2.748 DOM · 2.748 cursor | 46,3 s | 1,31 MB, H.264 1920×1080 **60 fps** |
| `demo-attach-artefato-en` | 2.716 DOM · 2.715 cursor | 46,5 s | 1,23 MB, H.264 1920×1080 **60 fps** |

### O cursor veio do canon da família

`utils/cursor.ts` estava atrasado em relação ao template e ao bk-products, e o atraso custava caro:
o movimento era uma rajada de eventos AGUARDADOS a cada 4 px, com o easing na densidade dos pontos.
Medido aqui antes do porte: **258 px/s de mediana, 39% dos quadros do filme gastos em deslocamento**
— 27 dos 71 segundos eram o ponteiro rastejando entre alvos.

O canônico faz do movimento uma animação amostrada pelo tempo: `speedPxPerMs: 1.6`, um evento por
quadro de captura (`MOVE_TICK_MS = 16`), easing no relógio e não na geometria, e fire-and-forget nos
eventos intermediários com um único flush aguardado no destino exato. A causa que a família mediu e
que eu não tinha: **todas as sessões CDP dividem um websocket**, e a 60 fps o recorder despeja
~34 MB/s de DOMSnapshot nele — o ack de cada evento de mouse espera atrás dos snapshots (~9 ms na
página leve, ~47 ms na pesada). Ou seja, subir para 60 fps AGRAVA o problema.

Depois do porte: **1.297 px/s (pt) e 1.322 (en), 12% dos quadros em movimento**, e o filme caiu de
71 s para 46 s sem perder um beat. O `afterMs` de entrada do ato de trabalho desceu de 9 s para 5 s
junto — ele fora calibrado contra o cursor lento e deixaria 4 s de painel de terminal vazio em cena.

O clamp de clique em alvo estreito que eu tinha escrito foi substituído pela grafia canônica: mesmo
defeito, encontrado de forma independente duas vezes na família (um `IconButton` de 40×40 no
bk-products, a aba "Chat" aqui).

**Um filme por invocação.** `OperatorMiddleware` carimba um operador constante, então um daemon tem
UMA linha de onboarding e UM roster de contatos vinculados — o segundo filme encontraria o onboarding
concluído e a Ada já vinculada. `run-e2e.ts` cria um data dir novo por invocação, e é isso que compra
dois daemons limpos.

**Os dois filmes são o mesmo filme.** `demoScenario` constrói `demo-pt` e `demo-en` de UMA estrutura,
e um teste unitário afirma igualdade corte a corte (mesmos beats, mesmas pausas) além de garantir que
nenhuma linha de copy é compartilhada. Trocar de idioma é trocar palavras, e nada mais.

### 60 fps, medido

A captura sustenta 60 fps na página real: **59,64 fps de DOM e 58,82 de cursor obtidos**, 0,6% de
descarte (`inflight > 2`). Custo: 1,1 GB por take em disco e em memória até o `save()`. O tempo NÃO é
custo — ver abaixo.

## O caminho do DOM até o vídeo

`scripts/render-mp4.ts` reconstrói cada frame com o MESMO `lib/reconstruct.ts` que o
`generate-html.ts` e a extensão usam, rasteriza num Chromium de verdade e encoda com ffmpeg. Três
coisas nele não são óbvias e estão comentadas no arquivo:

- **`promisify(execFile)` fazia o script nunca sair.** Ele acumula stdout E stderr do filho em
  memória, e o ffmpeg narra cada frame no stderr. O encode terminava, o MP4 ficava completo e correto
  em disco, e o script ficava parado para sempre — PNGs não limpos, linha final não impressa. Isso
  produziu TRÊS conclusões erradas de "a rasterização é lenta" antes de eu medir a fase isolada.
  Trocado por `spawn` com saída herdada, mais `-loglevel error` no ffmpeg.
- **`-r 30` fixo dizimava uma captura de 60 fps.** `-r` reamostra nos dois sentidos, e para baixo ele
  DESCARTA: um take de 60 fps saiu com 2.114 frames em 70,5 s — metade do que a captura pagou,
  silenciosamente. A taxa do contêiner agora é derivada e nunca fica abaixo da captura.
- **A taxa é derivada, nunca assumida.** O recorder não carimba timestamp por snapshot, mas carimba
  a linha do tempo do cursor — a duração real do take é o último offset dela, então a taxa é
  `snapshots / duração`. Sempre abaixo do `domFps` pedido (snapshot que chega com três em voo é
  descartado); encodar na taxa pedida tocaria o filme adiantado exatamente nessa diferença.
- **As animações são congeladas na rasterização.** O frame reconstruído carrega a folha de estilo
  real do app, `@keyframes` inclusive, e carregá-la REINICIA todas do zero — o screenshot pegava o
  `animate-in fade-in` do wizard no começo e todo frame do attach saía lavado. Com `animation:none`
  cada nó descansa no estilo computado que o recorder mediu, inclusive um que estava mesmo no meio
  de um fade. Esperar a animação terminar faria o oposto: apagaria o movimento que o take capturou.
- **As fontes são stacks de sistema**, então rasterizar offline na mesma máquina rende os mesmos
  glifos. Um take que passe a usar webfont precisa embuti-las antes disso continuar verdadeiro.

## O que a gravação ensinou (não estava no desenho)

1. **Um contato 1:1 NÃO pode acionar o agente por padrão.** `AttachThread` semeia o roster como
   "operador aciona, o outro lado observa" (`canInvoke: false`), e `Thread.addressedToAgent` checa o
   roster ANTES do portão de menção. A primeira mensagem da Ada foi transcrita e ignorada — o filme
   ficou parado numa thread Ociosa. É comportamento correto do produto, não defeito; a spec concede o
   direito por `SetParticipantInvocation` (C13) fora de cena. **Vale virar beat em cena**: "você
   decide quem pode acionar o agente" é a postura de controle do produto inteira, em dois cliques.
2. **O slugger de chave de issue transforma marca combinante em traço** (`cobrança` →
   `cobranc-a`) — documentado de propósito em `shared/utils/slug.ts`, e o `MentionGate` recusa se
   acoplar a ele justamente para os dois poderem divergir. Para um produto PT-first isso é estranho
   num close-up, então o roteiro fala com acento na CONVERSA e mantém o TÍTULO sem cedilha.
3. **O cursor de demo errava alvos estreitos.** `getClickPoint` desloca o ponto pela origem do
   ponteiro (o overlay desenha a imagem com o canto superior esquerdo no mouse), e num link de ~36px
   ("Chat") isso somado ao jitter caía FORA da caixa — o clique ia para o que estivesse atrás. A aba
   Chat nunca navegava. Corrigido com clamp em `utils/cursor.ts`; alvos largos não mudam.
4. **A última linha da transcrição fica cortada quando há uma mídia alta antes dela.** Medido em três
   takes: depois que a imagem do artefato decodifica na altura real (448 px), o scroller da conversa
   descansa ~18 px acima da própria última linha — a linha fica em y≈974 e o scroller termina em
   y≈956, cortada mesmo estando bem dentro do viewport de 1080. Forçar `scrollTop = scrollHeight`
   traz ela para dentro e a lista volta atrás em menos de 300 ms, em todos os frames amostrados
   depois. **Consequência de produto**: a mensagem final do agente — a que fecha o assunto — não é
   alcançável por scroll numa conversa que terminou com uma imagem. Não consertado aqui (é
   `@codm/app-ui/virtual-list`); o filme encerra no frame da imagem + PR e a fala fica fora de cena.
   Nota: `toBeInViewport()` NÃO pega isso — ele cruza a linha com o viewport, e uma linha cortada por
   um ancestral com scroll passa. Dois takes se perderam acreditando nele.
5. **`recorder.save()` não limpava o diretório.** Frames são `snapshot-<índice>`, então um take mais
   curto deixava os finais do anterior para trás — indistinguíveis, e emendados no fim do vídeo
   renderizado. Medido: um take de 722 frames salvo sobre um de 731, e os últimos nove frames do
   filme vinham de uma gravação que ninguém tinha feito naquele dia. Corrigido em `utils/recorder.ts`
   (limpa `snapshots/` e `cursor/`, preserva o resto do diretório).
6. **`recordings/` é o `outputDir` do Playwright**, que ele limpa a cada run — o primeiro take foi
   apagado por uma execução posterior de uma spec sem relação. Filmes agora vão para
   `packages/e2e/films/`, gitignorado, fora do alcance do runner.
7. **`givenCompletedOnboarding` está quebrado no HEAD** — a reescrita draft/atomic-commit de 26/08
   fez `CompleteOnboarding` revalidar um rascunho do servidor, e a chamada nua apresenta um vazio
   (`ONBOARDING_DRAFT_INCOMPLETE`). Derruba 6 specs numa suíte cheia (06, 10, 11, 12, 13). NÃO
   consertado aqui: é defeito de outra frente e o conserto certo exige decidir o que "concluído"
   significa para uma spec que não tem canal nenhum. A 92 se vira sozinha, percorrendo o wizard de
   onboarding de verdade fora de cena.

## Sabido e aceito

- `summarize()` (TerminalOutputAccumulator) só considera entradas escalares de topo, então uma
  chamada MCP aparece no terminal como `⏺ mcp__codm__RecordArtifact threadId: <uuid>` — o `data`
  aninhado, que é a metade interessante, é descartado. Comportamento de produto, fora do escopo
  deste filme; a camada de tweaks apaga os pares `<nome>Id: <uuid>` no take.
- Concluir o onboarding SEMPRE materializa uma thread (o rascunho exige contato), então o console
  nunca chega vazio. O filme usa isso a favor: a conversa anterior é o Alan Turing no outro projeto,
  que é como o console de um operador real se parece.
