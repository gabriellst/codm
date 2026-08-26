# Handoff — adequação do app ao design D3

Prompts prontos para colar numa sessão nova com o Pencil MCP conectado.
Plano completo: `.plans/2026-08-11-adequacao-design-d3.md`.

**Rode uma fase por sessão.** Medido neste repo: um agente que tenta uma fatia vertical
grande num contexto só termina as primeiras entregas e engaveta as últimas sob pressão de
budget. Cada bloco abaixo é uma sessão.

---

## Preâmbulo comum (cole no topo de qualquer fase)

```
Você vai portar um design já aprovado para o app CODM. O design é a fonte da verdade
visual; o código é a fonte da verdade estrutural. Quando os dois divergirem, PARE e
pergunte — não escolha sozinho.

LEIA PRIMEIRO, NESTA ORDEM:
1. .plans/2026-08-11-adequacao-design-d3.md — o plano, com as divergências já resolvidas
2. CLAUDE.md — regras da casa (não-negociáveis, skills, gates)
3. mcp__pencil__get_guidelines({category:"guide", name:"Code"}) — o guia de gerar código de .pen

O DESIGN vive em design/codm.pen, no macro `KCYNk`. Grupos:

  ciUsJ   Início ...................... 4 telas (container FKpts)
  Q6TEB   Conversa .................... 4 telas (container tj1nj)
  yrVGJ   Tarefa & Config da conversa . 4 telas (container rFwV0)
  a5AkeG  Projetos & Canais ........... 8 telas (container mVA9Z)
  JcWnl   Tarefas, Configurações & Conta 5 telas (container S0emi)
  m7WRD   Onboarding, Login & Attach .. 11 telas (container qiKdc)
  ji2y3   Site público ................ 3 telas (containers ln8Uq, A33G8)

  ZMw1S   Component — Rail MESCLADO (29 instâncias)
          nav rows: A1BcE Início · uw9Ba Projetos · u405aA Tarefas · fGU8T Canais · TIEvr Configurações

COMO LER O DESIGN (use mcp__pencil__execute com Get/Print, não adivinhe):

  Print(Get("<id>", {depth: 4}))                  estrutura de um nó
  Print(Get("<id>", {resolveVariables: true}))    valores computados em vez de $token
  Get("<id>", (n,c) => Print(n.name, JSON.stringify(c.bounds)))   geometria real

  mcp__pencil__get_screenshot({nodeId})           referência visual — use no MENOR nó útil
  mcp__pencil__export_html({nodeIds, format:"html-tailwind", outputPath})
        → gera ESPECIFICAÇÃO, nunca código de produção. Não conhece a SDK, o i18n
          nem a arquitetura de -components/. Serve para conferir espaçamento e cor exatos.

REGRAS DURAS:
- Atualize componentes existentes. NUNCA crie um paralelo com nome novo.
- Nenhum valor hardcoded: cor, raio e sombra saem de token.
- Tailwind 4 ordena utilitários ALFABETICAMENTE, não por peso. Se a mesma propriedade
  aparecer na base do CVA e na variante, o twMerge não vê o par e vence a ordem do
  stylesheet. Ver .specs/2026-08-07-conflitos-de-utilitario-fora-do-twmerge.md.
- i18n: pt.json e en.json SEMPRE juntos — existe teste de paridade.
- NADA aqui toca SDK, contratos ou schemas. Se um PR pedir regeneração de contrato,
  saiu do escopo — pare e avise.

GATES (antes de considerar pronto):
  bun tsc · bun lint · bun run test · bun review
  visual: bun dev, então mcp__pencil__browser({action:"load-page", url:"http://localhost:5173/..."})
          e compare com get_screenshot do nó correspondente.
```

---

## Sessão 1 — Fase 0 + 1: reconciliação e tokens

```
[PREÂMBULO COMUM]

ESCOPO DESTA SESSÃO: reconciliação e tokens. Nenhuma mudança visual perceptível ao final.

PARTE A — RECONCILIAÇÃO (faça antes de escrever qualquer código)

Abra e compare com o design os arquivos que ainda não foram auditados:
  components/ui/card.tsx · badge.tsx
  components/console/PageHeader.tsx
  routes/(app)/threads/$threadId/-components/ThreadSettingsDialog
  routes/(app)/workspaces/-components/WorkspacesSection
  packages/app/astro/src/pages/[locale]/_components/*.astro

Para cada divergência encontrada, classifique:
  DESIGN VENCE  → decisão estética do founder, aplicar
  CÓDIGO VENCE  → o código sabe algo que o design ignorou (dado, estado, acessibilidade)
  PERGUNTAR     → ambíguo

Dois precedentes já resolvidos, para calibrar o julgamento:
  · O checklist de setup que o design põe no onboarding pertence ao DASHBOARD
    (SetupChecklist) — steps.ts documenta que `impact` governa o dashboard. CÓDIGO VENCE.
  · O botão de texto é rounded-full no código, com medição documentada; o design usa a
    escada assimétrica. DESIGN VENCE (decisão 6B do merge).

Anexe a lista ao final de .plans/2026-08-11-adequacao-design-d3.md, na Fase 0.

PARTE B — TOKENS
packages/app/styles/tokens.css

1. Adicione os neutros derivados por alfa, no padrão que o arquivo já usa no bloco .dark:
     --fg-60: oklch(from var(--foreground) l c h / 0.6);
     --fg-20: oklch(from var(--foreground) l c h / 0.2);
   Escritos assim, o tema escuro inverte sozinho — não crie pares "inverse".

2. Elevação, duas e só duas:
     flutuante (card, chip, selo): y 4 · blur 15 · spread -6 · preto a 10%
     modal sobre scrim:            y 18 · blur 48 · #16161640
   Os valores saem do design; confirme com Get(resolveVariables:true) antes de escrever.

3. Consolide a escada de raio. Hoje está duplicada entre react/src/index.css e
   web-utilities.css — o próprio tokens.css registra o follow-up ("the react-only copy in
   index.css can be deleted once primitives read from here"). Faça agora.

NÃO FAÇA NESTA SESSÃO: botão, surfaces.ts, nenhuma tela.

PRONTO QUANDO: gates passam, nada mudou visualmente, a lista de reconciliação está no plano.
```

---

## Sessão 2 — Fase 2: primitivos

```
[PREÂMBULO COMUM]

ESCOPO: components/ui/button.tsx e components/ui/surfaces.ts. Nenhuma tela.
Esta é a sessão de MAIOR risco: os nomes que você redefine têm 100+ call sites.

VOCABULÁRIO FINAL (decidido pelo founder, 11/08 — não reabra):

  default      primária, verde sólido ................... inalterada
  outline      secundária vazada ........................ border-foreground/20,
               (Voltar, Cancelar, Assumir, Pular)         text-foreground/60, sem fill.
                                                          PRESERVE o hover:border-primary,
                                                          que é medido.
  ghost        utilitária, sem borda .................... texto foreground/60. Mantém o
               (Editar, Reescanear, Fechar)               hover pastel dos tamanhos icon
                                                          (compound variant já existe).
  soft         NOVA — flat neutra ....................... bg-muted, sem borda.
               (pausar e configurar da thread)
  secondary    RESSIGNIFICADA — só "estado ligado" ...... o CSS não muda (já é o pastel
               (Ocultar arquivadas)                       verde). Muda o significado.
  destructive  vermelho sólido .......................... inalterada (13 usos)

  Botões de alerta (Resolver, Aprovar, Reiniciar, Negar) NÃO viram variante — ficam em
  surfaces.ts como preset composto. O arquivo já é dono do par alertSurface/
  alertActionButton e registra em comentário que duplicar isso fez os dois painéis
  divergirem. Não recrie o problema.

FORMA (decisão 6B): tamanhos com texto migram de rounded-full para a escada assimétrica.
Os tamanhos icon-only JÁ usam a escada e não mudam. Isso vive em `size`, não em `variant`.
Reescreva o comentário do topo do arquivo — ele hoje justifica o pill com medição da
referência, e vai passar a descrever código que não existe mais.

MIGRAÇÕES (não faça replace cego):
  · 16 usos de variant="secondary" → auditoria individual. Os que são AÇÃO secundária vão
    para outline; os que já expressam ESTADO ficam. Um replace cego quebra silenciosamente.
  · play/config da thread: hoje variant="outline" size="icon" → soft.

LIMPEZA no mesmo PR:
  · primaryAlt tem ZERO usos — remova.
  · warning tem 1 uso e o tokens.css registra que nenhuma cor de warning foi medida na
    referência. Proponha a remoção; confirme antes de executar.

SURFACES.TS:
  · surface hoje é bg-card (cinza); o design usa branco + hairline, que é o trigger atual.
    Remapeie — não crie um terceiro preset.
  · row já tem hover:bg-hover-accent hover:border-primary, com correção sua de 07/08 no
    comentário. O design não modelou hover. MANTENHA o do código.
  · Adicione sectionLabel (bold em tamanho de corpo + hairline embaixo), que substitui
    .label-eyebrow (16 usos).

VERIFICAÇÃO: Storybook. As stories já existem e são o lugar mais barato de ver as variantes
lado a lado. Compare com get_screenshot dos botões no design.

PRONTO QUANDO: gates passam, Storybook mostra as 6 variantes, zero usos de primaryAlt.
```

---

## Sessão 3 — Fase 3: casca

```
[PREÂMBULO COMUM]

ESCOPO: components/Navbar/index.tsx e components/console/PageHeader.tsx.

Rail — leia o componente do design: Print(Get("ZMw1S", {depth: 4}))
  · lockup do logo: marca verde + coluna com "CODM" e a versão em mono
  · contagem da linha ATIVA vira chip verde sólido com texto branco; inativa segue número neutro
  · fundo cinza, hairline à direita
  · a linha de nav de workspaces passa a ler "Projetos" — via i18n (nav.workspaces),
    NÃO renomeie rota, hook nem enum

PageHeader
  · perde o botão circular de voltar
  · perde o subtítulo — EXCETO no Início, onde a linha de status fica colada ao título
  · onde o subtítulo carregava dado (a linha de estatísticas de Tarefas), ele desce para o
    corpo como primeira linha, não some

PRONTO QUANDO: gates passam e as 29 instâncias do rail no design batem com o render.
```

---

## Sessões 4+ — Fase 4: telas, uma por grupo

```
[PREÂMBULO COMUM]

ESCOPO: um único grupo do design. Não toque em outro.
  GRUPO: <cole o id e o nome, ex.: a5AkeG — Projetos & Canais, 8 telas, container mVA9Z>

Liste as telas antes de começar:
  Get("<container>", (n,c) => c.depth===1 && Print(n.id, n.name))

Para CADA tela, nesta ordem:
  1. get_screenshot do nó → referência visual
  2. Get(depth:4) → estrutura e tokens
  3. localize o componente que já existe (routes/.../-components/) e ATUALIZE
  4. bun dev + mcp__pencil__browser contra a rota → compare com o screenshot
  5. só então passe para a próxima

Se a tela do design contradisser um comportamento do código (estado, dado, gate), PARE e
pergunte. Foi assim que descobrimos o checklist no lugar errado.

PRONTO QUANDO: cada tela do grupo tem paridade visual verificada e os gates passam.
```

---

## Sessão paralela — Fase 5: Astro

```
[PREÂMBULO COMUM]

ESCOPO: packages/app/astro. Independente das Sessões 2-4 — só depende dos tokens (Sessão 1).
DESIGN: grupo ji2y3, containers ln8Uq (landing + índice do blog) e A33G8 (post).

22 arquivos. A landing tem 8 seções em pages/[locale]/_components/ + Nav/Footer/BaseLayout;
o blog tem 4. Note: PricingSection.astro JÁ EXISTE — a seção de preço é rebrand, não criação.

Mudanças de conteúdo pedidas pelo founder:
  · remover Marquee.astro (a esteira de integrações) do fluxo da home
  · CTA "Download para macOS" com ícone da Apple; "GitHub" com ícone
  · remover a nota de assinatura Apple e o "Windows e Linux em breve"
  · adicionar o termo de planos futuros na seção de preço (texto no design, nó do grupo)

DotWave.tsx é a única ilha React — é onde entraria three.js, se entrar. O design representa
a profundidade com gradientes radiais compostos porque o .pen não roda WebGL.

PRONTO QUANDO: landing, índice e post batem com o design, e os gates passam.
```
