# Adequação do app ao design D3 (macro MESCLADO)

**Status:** Draft · **Origem:** `design/codm.pen` → `KCYNk` (39 telas, 7 grupos)

## O achado que define a abordagem

Isto **não é implementar um design novo**. O `tokens.css` e o `web-utilities.css` já
contêm o sistema quase inteiro, com a medição documentada linha a linha:

- a escada de raio assimétrico e o `--radius-corner-ratio: 0.333`;
- `--radius-callout-flip: 22px 22px 6px 22px` — o canto invertido que eu "inventei"
  para o "Resolver" **já existe como token**, documentado como "exception, not a rule";
- os tokens derivados por alfa (`oklch(from var(--foreground) l c h / 0.14)`) — exatamente
  o padrão que o founder pediu para os botões neutros;
- presets de superfície (`surface`, `trigger`, `row`, `alertSurface`, `alertActionButton`)
  com correções de founder já registradas.

Logo, o trabalho é **remapeamento semântico de um sistema existente**, não construção.
O risco não é "não saber o que fazer" — é **redefinir um nome que 100+ call sites usam**.

Contagens que dimensionam isso:

| Símbolo | Call sites |
|---|---|
| `variant="outline"` | 64 |
| `variant="ghost"` | 22 |
| `variant="secondary"` | 16 |
| `.heading-display` | 17 |
| `.label-eyebrow` | 16 |

## Divergências deliberadas (o design vence o código)

Cada uma destas **contraria uma decisão medida e comentada no código**. Todas foram
decididas pelo founder no merge; o plano é aplicá-las e **reescrever o comentário que
justifica a decisão antiga** — deixar o comentário velho é pior que o código velho.

**D1 · Forma do botão de texto.** O código usa `rounded-full` nos tamanhos com texto
(`default`/`xs`/`sm`/`lg`), com justificativa medida ("as CTAs da referência — 'Nova
conversa', 'Conectar canal' — são todas 999px"). A decisão 6B do merge escolheu a escada
assimétrica. Os tamanhos icon-only já usam a escada e **não mudam** — coincidem com o design.

**D2 · Secundário deixa de ser verde.** `variant: secondary` hoje é `bg-secondary`
(pastel verde). O founder rejeitou: "dá sensação de dupla responsabilidade". O novo
secundário é vazado: borda `foreground/20`, texto `foreground/60`, sem preenchimento.
16 call sites mudam de significado sem mudar de nome.

**D3 · Superfície de card.** `surface` = `bg-card` (cinza). O design usa branco + hairline,
que é exatamente o `trigger` de hoje. Remapear, não criar terceiro preset.

**D4 · Rótulo de seção.** `.label-eyebrow` (caixa alta espaçada) → bold em tamanho de corpo
com hairline embaixo. 16 usos mudam juntos se a utilidade for redefinida.

## Correções onde o código vence o design

**C1 · O checklist não é do onboarding.** Desenhei "Configuração inicial" como tela do
wizard. O `steps.ts` já trata `CHANNEL`/`WORKSPACE`/`CONTACT`/`AGENTS`/`REVIEW` como cinco
passos separados, e documenta que `impact` governa o **dashboard** — onde vive o
`SetupChecklist`. O design cede: a tela sai do wizard.

**C2 · Attach entra no route group `(app)`.** *(resolvido pelo founder, 11/08)* — a rota
vai para `routes/(app)/attach/` e herda o rail do layout que já existe. Não há wrapper novo.

Verificado: o `OnboardingGate` só redireciona quando `completedAt` está ausente, e pular
preenche esse campo — então quem pulou o onboarding alcança `/attach` normalmente (é o
cenário do checklist no dashboard). Sem regressão.

Herança consciente: dentro de `(app)`, o attach também recebe `SupervisionBanner`, as pílulas
de agentes/update e o `useServerEventSource`. Coerente com ser rota de console, mas o design
mostra a tela limpa.

Restrição que permanece: `CONTACT`/`AGENTS`/`REVIEW` continuam sendo renderizados dentro do
wizard de onboarding, **sem rail**. Os componentes de passo não podem assumir a casca.

**C3 · Hover não foi modelado no design.** `row` já tem `hover:bg-hover-accent
hover:border-primary`, com correção de founder registrada. Adotar como está.

## Fases

### Fase 0 — Reconciliação (bloqueia todas as outras)

Varredura design ↔ código antes de escrever qualquer linha. Encontrei dois desvios (C1, C2)
abrindo dois arquivos; em 39 telas há mais. Saída: uma lista de divergências classificadas
como "design vence" ou "código vence", anexada a este plano.

Não li ainda: `card.tsx`, `badge.tsx`, `PageHeader.tsx`, `ThreadSettingsDialog`,
`WorkspacesSection`, e o conteúdo das seções Astro. Entram aqui.

### Fase 1 — Tokens (1 PR)

`packages/app/styles/tokens.css`

- `--fg-60` / `--fg-20` como `oklch(from var(--foreground) l c h / 0.6 | 0.2)` — assim o tema
  escuro inverte sozinho e não precisamos dos pares `inverse`.
- Elevação única para elemento flutuante + a profunda para modal sobre scrim.
- Consolidar a escada de raio: hoje está duplicada entre `react/src/index.css` e
  `web-utilities.css`. O próprio arquivo já registra o follow-up ("the react-only copy in
  index.css can be deleted once primitives read from here"). É a hora.

Sem mudança visual perceptível ao final desta fase — é preparação.

### Fase 2 — Primitivos (1 PR, o mais arriscado)

`components/ui/button.tsx` · `components/ui/surfaces.ts`

Aplica D1–D4. **Armadilha do repo:** Tailwind 4 ordena utilitários alfabeticamente, não por
peso; se a mesma propriedade aparecer na base do CVA e na variante, o `twMerge` não vê o par
e vence a ordem do stylesheet. Foi o bug do `font-medium` derrotando `font-bold` na sidebar
(`.specs/2026-08-07-conflitos-de-utilitario-fora-do-twmerge.md`). Nenhuma propriedade em dois
lugares.

#### Vocabulário de variantes *(resolvido pelo founder, 11/08)*

Seis variantes + um preset. **Não** adotamos um segundo eixo (`variant` × `tone`): obrigaria
102 call sites a aprender API nova e criaria combinações que o produto não usa.

| Papel | Exemplos | Variante | Ação |
|---|---|---|---|
| Primária | Continuar, Vincular conversa | `default` | inalterada |
| Secundária | Voltar, Cancelar, Assumir, Pular | `outline` | redefinir: `border-foreground/20`, `text-foreground/60`, sem fill — **preservando** o `hover:border-primary`, que é medido |
| Utilitária | Editar, Reescanear, Novo loop, Fechar | `ghost` | redefinir: texto `foreground/60`; mantém o hover pastel dos tamanhos icon |
| Flat neutra | Pausar, Configurar (thread) | `soft` | **nova**: `bg-muted`, sem borda |
| Estado ligado | Ocultar arquivadas | `secondary` | **ressignificada**: deixa de ser "ação secundária" e passa a ser só "on" — que é o que já renderiza |
| Destrutiva | Apagar conversa, Excluir conta | `destructive` | inalterada (13 usos) |
| Alerta semântica | Resolver, Aprovar, Reiniciar, Negar | — | fica em `surfaces.ts` como preset composto |

**Por que o alerta não vira variante:** só aparece em duas superfícies (callout do dashboard
e painel de parada). O `surfaces.ts` já é dono do par e registra em comentário que duplicar
isso foi o que fez os dois painéis divergirem.

**Migração dos 16 `secondary`:** auditoria individual — os que são ação secundária vão para
`outline`; os que já expressam estado ficam.

**Migração dos play/config:** hoje usam `variant="outline" size="icon"` → `soft`.

**Limpeza no mesmo PR:** `primaryAlt` tem **zero usos** (variante morta). `warning` tem um
único uso, e o `tokens.css` registra que nenhuma cor de warning foi medida na referência.

Verificação: Storybook. As stories já existem e são o lugar mais barato de ver as variantes.

### Fase 3 — Casca (1 PR)

`components/Navbar/index.tsx` · `components/console/PageHeader.tsx`

Lockup do logo com CODM + versão, contagem ativa em chip verde sólido, rail cinza. O
`PageHeader` perde botão de voltar e subtítulo — exceto no Início, onde a linha de status
fica colada ao título.

### Fase 4 — Telas, por rota (paralelizável)

Os 7 grupos do canvas mapeiam quase 1:1 com fatias de rota. Cada um vira um handoff
independente, no padrão da seção "Modeling from another system" do `CLAUDE.md`: contrato
congelado, identificadores exatos, cercas de escopo, gates de fechamento.

**Exceção:** o attach (C2) é PR isolado, feito antes do onboarding e por quem entende do
roteamento — é o único item estrutural de risco alto.

### Fase 5 — Astro (100% paralelo desde a Fase 1)

22 arquivos. A landing tem 8 seções em `_components/` + `Nav`/`Footer`/`BaseLayout`; o blog
tem 4. Já existem `PricingSection.astro` (a seção de preço não é nova — é rebrand) e
`Marquee.astro` (a esteira que o founder pediu para remover).

O `DotWave.tsx` é a única ilha React — é onde o gradiente 3D/three.js entraria, se entrar.

## Gates

Por PR: `bun tsc`, `bun lint`, `bun run test`, `bun review`.
i18n: `pt.json` e `en.json` juntos — existe teste de paridade.
Visual: `bun dev` + a ferramenta de browser do Pencil contra `localhost:5173`, comparando com
o `get_screenshot` do nó correspondente no canvas.

## Fora de escopo

Nada aqui toca SDK, contratos ou schemas — é mudança de apresentação de ponta a ponta.
Se algum PR pedir regeneração de contrato, saiu do escopo.

"Projetos" é **só i18n** (`nav.workspaces`, `workspaces.*`). A rota `/workspaces`, o hook
`useListWorkspaces` e o enum `WorkspaceBadge` não mudam.

---

## Fase 0 — Lista de reconciliação (Sessão 1, 11/08/2026)

Varredura dos arquivos ainda não auditados contra o `.pen`. Classificação:
**DESIGN VENCE** (aplicar na fase indicada) · **CÓDIGO VENCE** (design cede).

> **Decisão do founder (11/08, pós-Sessão 1): "Tudo vai ser como o design diz."**
> Os dois itens que estavam PERGUNTAR (R11, R12) viraram DESIGN VENCE. A regra vale
> como default daqui em diante: divergência estética resolve a favor do design sem
> nova consulta. As exceções continuam sendo as já ratificadas onde o código sabe
> algo que o design ignora (C1 checklist no dashboard, C3 hover não modelado, R4
> variável morta) — dado, estado e gate não são estética.

### Tokens / sistema

| # | Divergência | Veredicto | Fase |
|---|---|---|---|
| R1 | O D3 tem paleta de status que o D2 não tinha: `status-attention` #E4572E, `attention-surface` #FBE7DF, `attention-foreground` #8A3417, `status-idle` #CFCFCF, `status-paused` #9A9A9A, `skeleton` #EDEDED / `skeleton-strong` #E1E1E1, `destructive` #DC2626. O comentário do tokens.css ("nenhum red/orange na referência") era verdade no D2 e está obsoleto no D3. | DESIGN VENCE | tokens entram quando a 1ª tela consumir (Início/Tarefas, Fase 4); a remoção de `warning` na Fase 2 deve considerar a família `attention` como substituta do único uso |
| R2 | "Danger Badge" do modal de apagar usa **#FBE5E5 hardcoded no design** (sem variável). Gap dos DOIS lados: precisa de um token (`destructive-surface` ou reuso de `attention-surface`) | DESIGN VENCE com token novo — nunca hex inline | Fase 4 (grupo yrVGJ) |
| R3 | Scrim de modal: design `#161616B8` sólido (72%); código `bg-black/20 dark:bg-black/40` + backdrop-blur (dialog.tsx) | DESIGN VENCE | Fase 4 (1º grupo com modal) |
| R4 | `$radius-2xs` do design declara 8px (código: 12px) — mas tem **zero usos** no `.pen`; os chips reais medem 12px literal | CÓDIGO VENCE (variável morta no design; escada do código correta) | nenhuma |
| R5 | Elevações confirmadas por medição: flutuante `0 4 15 -6 #0000001A` (Update Card, cards flutuantes do hero) · modal `0 18 48 0 #16161640` (todos os modais) | — (é a Parte B desta sessão) | Fase 1 ✓ |
| R6 | `fg-60`/`fg-20` existem como variáveis no design (#16161699/#16161633) e são usadas em botões ghost/cancelar. O design também tem `fg-inverse-*`, que NÃO portamos — o padrão `oklch(from var(--foreground))` inverte sozinho | — (Parte B desta sessão) | Fase 1 ✓ |

### card.tsx · badge.tsx

| # | Divergência | Veredicto | Fase |
|---|---|---|---|
| R7 | Card: alinhado com o D3 via remap de `surface` (D3 do plano) — cards de conteúdo do design são branco+hairline `r=[20,20,20,7]`, exatamente o `rounded-asymmetric-lg` que o código já usa. Sem divergência nova | CÓDIGO ≈ DESIGN | Fase 2 (remap já planejado) |
| R8 | Badge: o D3 **abandona o canon "pill monocromática + dot"**. Chips de status têm fill colorido: "Em execução" = `$secondary` + dot `$primary` + texto `$secondary-foreground`; "Precisa de atenção" = `$foreground` (near-black) + dot `$success-bright` + texto branco. O comentário-canon do badge.tsx fica obsoleto | DESIGN VENCE — redefinir variantes de status; reescrever o comentário | Fase 2 (primitivo) + Fase 4 (usos) |
| R9 | Raio de chip: design usa `[12,12,12,4]` (2xs) nos chips de status/projeto e `[9,9,9,3]` (3xs) nos badges menores (loops). Código: tudo 3xs | DESIGN VENCE — badge ganha dois tamanhos (default 2xs, compact 3xs) | Fase 2 |

### PageHeader.tsx

| # | Divergência | Veredicto | Fase |
|---|---|---|---|
| R10 | Nenhuma tela do design tem botão de voltar; subtítulo só no Início (status line) e Tarefas (stats line vira 1ª linha do corpo) | DESIGN VENCE (já no handoff da Fase 3) | Fase 3 |
| R11 | Título de página: design `fs=30 fw=800 sentence-case` em TODAS as telas; código `.heading-display text-4xl` = 36px UPPERCASE. O D3 não tem NENHUM display uppercase (nem no site: H1 fs=76 sentence-case). `.heading-display` tem 17 usos e é "a voz DM YOUR CODEBASE" | **DESIGN VENCE** *(founder, 11/08: "tudo vai ser como o design diz")* — o uppercase morre como identidade: redefinir `.heading-display` (sentence-case, 800) e ajustar o tamanho no PageHeader (30px); reescrever o comentário "DM YOUR CODEBASE voice" | Fase 3 |

### ThreadSettingsDialog

| # | Divergência | Veredicto | Fase |
|---|---|---|---|
| R12 | Design: modal 640×840 **coluna única** com scroll (telas 02+03 são o mesmo modal em dois estados de rolagem, header fixo). Código: 2 colunas em `lg` (`lg:max-w-4xl`) com racional documentado (prompt abaixo da dobra; janela mínima do shell 520px) | **DESIGN VENCE** *(founder, 11/08: "tudo vai ser como o design diz")* — coluna única com scroll e header fixo; o teto `max-h` existente segue valendo para a janela de 520px; REMOVER os comentários que defendem as 2 colunas ao aplicar | Fase 4 (grupo yrVGJ) |
| R13 | Ordem das seções: design Gatilho → Agentes → Buffer → Prompt → Participantes → Loops → Perigo. Código: Gatilho → Agentes → Participantes → Buffer ∥ Prompt ∥ Loops ∥ Perigo. (Participantes/Loops/Perigo EXISTEM no design — tela 03, abaixo da dobra) | DESIGN VENCE (na ordem; condicionado ao R12) | Fase 4 |
| R14 | Buffer de contexto: design usa **stepper** (− · valor · +); código usa 4 pílulas discretas. Nota dura: os valores continuam sendo o enum `BufferSize` ('25'\|'50'\|'100'\|'200') — o stepper navega a lista fechada, nunca incremento livre | DESIGN VENCE | Fase 4 |
| R15 | Tag de menção: design tem campo próprio com label "Tag de menção"; código embute o input na linha do switch | DESIGN VENCE | Fase 4 |
| R16 | "Salvar prompt": design `$primary` cheio; código `variant="outline"` | DESIGN VENCE | Fase 4 (vocabulário na Fase 2) |
| R17 | `SectionLabel` local do dialog: design `fs=13.5 fw=700 $foreground` + hairline (= o novo `sectionLabel` de surfaces.ts / D4); código `text-sm font-medium text-muted-foreground`. O comentário do código ("deliberately not label-eyebrow, quieter") descreve uma decisão que o D3 revogou — reescrever | DESIGN VENCE | Fase 2 (preset) + Fase 4 (adoção) |
| R18 | Modal de apagar: estrutura equivalente (confirm separado ✓), mas o design tem Danger Badge com ícone (ver R2) e Cancelar como ghost `$fg-60` | DESIGN VENCE (cosmético) | Fase 4 |

### WorkspacesSection

| # | Divergência | Veredicto | Fase |
|---|---|---|---|
| R19 | Card de projeto: código já bate (branco+hairline, `asymmetric-lg`, tile do ícone `secondary` + `asymmetric-sm` ✓). Nome da pasta: design `fs=17 fw=700` vs código `text-sm font-semibold`; contagem `fs=13` vs `text-xs` | DESIGN VENCE (tipografia) | Fase 4 (grupo a5AkeG) |
| R20 | Design tem **tile "Adicionar pasta"** na própria grade (card cinza com +), além do botão primário no header. Código só tem o botão | DESIGN VENCE | Fase 4 |
| R21 | "Pastas de projeto" usa o rótulo de seção novo (fs=14 fw=700 + hairline); código usa `.label-eyebrow` | DESIGN VENCE (= D4, já planejado) | Fase 2 + 4 |

### Astro (grupo ji2y3)

| # | Divergência | Veredicto | Fase |
|---|---|---|---|
| R22 | **ClosingCta não existe como seção no design** — a chamada final (headline "Seu time já está no grupo.\nAgora seu código também." + CTAs) vive DENTRO do Rodapé escuro. Fusão, não remoção | DESIGN VENCE — ClosingCta.astro morre; conteúdo migra para Footer.astro | Fase 5 |
| R23 | Seções escuras da landing usam **#111111** (não `$foreground` #161616). Precisa de token próprio do site (ex.: `--site-dark`), nunca hex inline | DESIGN VENCE com token novo | Fase 5 |
| R24 | Hero: estrutura H1 bold+light ✓ já existe; copy nova ("Fale com seus agentes / sem sair do grupo."); mocks viram **cards flutuantes** no próprio hero (mensagem/tarefa/skill/resposta/terminal) — mapeamento com ChatMock/TerminalMock/DemoSection a detalhar na fase | DESIGN VENCE | Fase 5 |
| R25 | Strings a remover localizadas: `hero.gatekeeperNote` (nota de assinatura Apple), `hero.otherOs` ("Windows e Linux em breve."), e o "Windows e Linux em breve" dentro de `closingCta.note` (em `pages/[locale]/_content/home.{pt,en}.json`) | DESIGN VENCE (ordem do founder) | Fase 5 |
| R26 | Seção de preço: 2 colunas ("O que está incluído" + "Plano Local") + **"Termo — planos futuros"** (`$secondary`) + chips flutuantes MIT/sem-conta. `PricingSection.astro` existe (rebrand) | DESIGN VENCE | Fase 5 |
| R27 | Mapeamento seção↔componente: Como funciona (escura)↔DemoSection · Capacidades (bento)↔FeaturesSection · Casos de uso (numerada)↔RouterSection · Preço↔PricingSection · Marquee → REMOVER (founder) | — (inventário) | Fase 5 |
