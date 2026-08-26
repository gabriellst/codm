# PRD — codm

**Atualizado:** 2026-08-25 · **Fonte:** `.specs/2026-08-25-posicionamento-dev-clientes-design.md`

Este documento é a fonte de verdade de **segmento, promessa, tese de PMF e régua de copy**. Toda spec (`/brainstorm`) e toda peça de copy (landing, console, README, blog) parte daqui. Quando o produto mudar o que entrega, este arquivo muda primeiro.

## Vision

**Problem Statement:** Quem opera projetos, clientes e processos recebe demandas onde as pessoas já estão — grupos de WhatsApp — mas a execução acontece em outro lugar (terminal, agentes de código, scripts). Entre o pedido e o resultado entra burocracia (ticket, Jira, e-mail, fila) que quem pede ignora e quem executa carrega sozinho.

**Target Users:** Primário — dev solo, freelancer ou agência pequena que atende clientes pelo WhatsApp (2–15 clientes ativos, cada um com seu grupo) e já usa Claude Code. Secundário — o time e os clientes desse dev, que só precisam mandar mensagem no grupo. O dono de negócio não-técnico entra **pela mão do dev** (o dev escreve as skills; o cliente as roda no grupo), nunca como alvo direto enquanto o onboarding exigir Claude Code + pasta de projeto + macOS.

**Value Proposition:** Um pedido no grupo vira trabalho executado por agentes na máquina do dev, que aprova antes — sem ticket, sem fila, sem sair do WhatsApp. O produto vende **orquestração**, não inferência: o usuário traz a própria conta Claude, o próprio WhatsApp e as próprias pastas; tudo roda local.

**Success Metrics:** os três sinais de PMF da seção "Tese de PMF", medidos com design-partners antes de qualquer campanha.

## Posicionamento

**Promessa (hero da landing):**

> **Sem ticket, sem fila, sem sair do grupo.**
> Agentes na sua máquina executam projetos, clientes e processos a partir de uma mensagem no WhatsApp. Você aprova antes.

O hero é específico no **como** (pedido no grupo → agente executa → você aprova) e livre no **quem** — o produto tem vários usos (cliente reportando bug, time pedindo deploy, processo agendado de cobrança/relatório) e os casos de uso da landing mostram essa variedade. O segmento-alvo vive aqui e na **ordem** dos casos de uso, não como restrição do hero.

**Contra o quê:** burocracia de intake — ticket, Jira, e-mail, fila. Não contra outros produtos de agentes.

**Mecanismo, em três batidas (o que nunca sai do copy):**
1. **Manda no grupo** — a mensagem no WhatsApp (contato ou grupo) é o pedido; sem formulário.
2. **O agente executa na sua máquina** — sessão de terminal na pasta do projeto, com as skills que já existem lá; pedidos concorrentes rodam em paralelo, não em fila.
3. **Você aprova antes** — sussurros (orientação privada ao agente), pausa em erros e decisões sensíveis, resposta volta no grupo com o label da tarefa.

**Ferramentas são prova, não promessa.** Claude Code, pasta de projeto, skills, Tauri, SQLite aparecem abaixo da dobra (como funciona, capacidades), nunca no hero.

## ICP & operador

| | |
|---|---|
| **Quem instala** | O **operator**: dono do repositório e da máquina. Técnico. Já paga Claude Code. |
| **Quem pede** | Clientes e time do operator, nos grupos. Não instalam nada; só mandam mensagem. |
| **Situação** | 22h, o cliente manda "o cupom quebrou no mobile" no grupo. Hoje o operator abre o notebook, acha o repo, corrige, sobe, responde — e não escala além de N clientes. |
| **Alternativas que ele usa hoje** | Nada (responde na mão) ou uma ferramenta de gestão que o cliente ignora e volta pro grupo. |
| **Por que compra** | Vira **revisor** em vez de executor: mais clientes com as mesmas noites livres. Uso por cliente vira linha de fatura. |
| **Por que o cliente dele gosta** | Nunca saiu do grupo; recebe ack, status e o resultado (link de preview, print) no mesmo lugar. |

## Tese de PMF

**Hipótese:** o dev que atende clientes pelo WhatsApp é o único segmento onde, hoje, coincidem (a) o produto entrega sem mudar (macOS + Claude Code + pasta é trivial pra ele), (b) há dinheiro (ele cobra do cliente), e (c) a distribuição é orgânica por construção — cada grupo onde o codm responde expõe a marca a quem ainda não é usuário.

**Sinais que confirmam (todos os três, com ≥10 design-partners e grupos reais):**

1. **Sean Ellis ≥ 40%** — respondem "ficaria muito decepcionado" se o codm sumisse.
2. **Retenção semana-4 ≥ 50%** dos que ativaram (checklist de 3 passos completo + primeira issue respondida no grupo).
3. **≥ 30% dos novos installs** originados de um grupo onde o codm já respondia (o loop orgânico é real).

Se (3) não aparecer, o loop é hipótese, não fato — a distribuição precisa ser paga ou por conteúdo. Se (1) ou (2) falharem, o problema é produto, não marketing: voltar ao "O que falta".

## O que falta para o PMF (na ordem)

Os itens 1–4 precedem qualquer campanha. Nada abaixo é feature existente até que uma spec própria a entregue.

1. **Landing e console dizem a promessa e só ela** — hero acima; "conta grátis · sem cartão" no lugar de "sem conta"; Codex e OpenCode como "em breve" (hoje só o Claude Code tem runner). *(entregue por esta rodada — spec 2026-08-25)*
2. **Time-to-first-wow < 10 minutos, medido** — DMG → QR → pasta → vincular grupo → primeira mensagem respondida com um artefato. Instrumentar o funil no metering existente; caçar cada minuto.
3. **Loop voltado a quem pede, impecável** — ack imediato, indicador de "trabalhando", entrega como link de preview ou print, aprovação do operator antes de qualquer resposta sensível. Uma resposta errada no grupo do cliente queima o dev, não o codm.
4. **10–20 design-partners** com grupos reais; medir os três sinais semanalmente; escrever os números antes de começar.
5. **Camada de gestão de clientes** (só depois de 4 confirmar o segmento) — visão de issues cruzando grupos, configuração de agente por cliente, **uso por cliente** para faturar, kit inicial de skills para o cenário SMB (relatório, status, deploy preview), loops como cron-no-grupo.
6. **Distribuição** — assinatura discreta nas respostas do agente (com opt-out) para explorar o loop do item 4; conteúdo para a comunidade dev BR em PT primeiro; o blog já tem os dois posts certos (*plantão sem fila*, *roteando issues pelo chat*).
7. **Monetização** — free local como está; pago nas features do item 5 e, mais tarde, num runner "sempre ligado", que tensiona o local-first e exige decisão própria.
8. **Segundo agente e segundo canal** — runner real para Codex/OpenCode; Telegram como segundo canal (ver Riscos).

## Riscos

- **macOS-only.** Parcela relevante dos devs freelancers no Brasil está em Windows/Linux; o teto do segmento é menor do que parece até existir build para essas plataformas.
- **WhatsApp não-oficial (whatsmeow).** Banimento de número é risco real — e o número é o do operator, que usa com os clientes. O onboarding deve recomendar número dedicado; é o argumento para Telegram vir cedo.
- **Reputação no grupo do cliente.** O gate de aprovação e o sussurro são a defesa; qualquer afrouxamento é decisão de produto, não de UX.
- **Enquadramento "assistente pessoal".** Se o copy ficar genérico ("agentes de IA no seu WhatsApp"), o produto é lido como variante de assistente pessoal self-hosted e perde a diferença. Manter o mecanismo específico.

## Régua de copy

1. **Nunca prometer o que o onboarding nega.** Se o console pede conta, a landing não diz "sem conta". Se só o Claude Code roda, Codex/OpenCode são "em breve". A régua vale para landing, console, README, blog e release notes.
2. **Mecanismo no hero, ferramentas abaixo da dobra.** Nomes de agente/framework são prova, não promessa.
3. **Ator livre.** O hero não fixa quem pede (cliente, time, processo); os casos de uso mostram a variedade, com o cenário do cliente em primeiro.
4. **"Sem burocracia" é literal:** sem ticket, sem fila, sem sair do grupo, conta grátis, sem cartão. Cada termo tem que ser verdadeiro no produto instalado.
5. **Copy agnóstica de plataforma** ("computador", não "Mac") salvo no botão de download e na permissão de disco.
6. PT é a língua-fonte; EN espelha 1:1 as mesmas chaves.

## Vizinhos & concorrentes

**OpenClaw** (openclaw.ai) — assistente pessoal genérico, self-hosted, MIT, 29+ canais, público "developers and power users", instalação por `curl | bash`. Compartilha a **infraestrutura** com o codm (gateway local, dados na máquina, grátis, open source) mas não o **job**: OpenClaw é o assistente (inbox, agenda, browser, skills comunitárias); codm é o roteador entre a conversa e os agentes de código que o dev já usa, com issue como unidade de trabalho e aprovação como gate. Tratar como vizinho — "use um assistente pessoal pra sua agenda; use codm pro seu repo" — nunca citar na landing, nunca disputar largura de canais/integrações.

**Ferramentas de gestão (Jira, ClickUp, tickets por e-mail)** — são o "contra o quê". O codm não as substitui; ele remove a necessidade de o cliente entrar nelas.

**Diferenciais defensáveis (os que lideram o copy):** workspace = pasta do projeto com skills detectadas; issue como fork paralelo com estado; grupo com cliente + sussurro + aprovação; app desktop de instalar e usar (DMG + QR + 3 passos). "Roda local", "open source", "grátis" são paridade com o vizinho — necessários, não vendem.
