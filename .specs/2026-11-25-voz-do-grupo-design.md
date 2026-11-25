# A voz do grupo — o útil da fase 3 com a leitura de antes

> Status: **proposta** (25/11). Comparativo medido + desenho. Nenhum código ainda.
> Origem: no primeiro dia com a 0.10.0, o grupo mais ativo reclamou que o agente "fala todo quebrado, cheio de código, com os nomes BDA" e que está "pior que antes". O painel na nuvem quase não foi usado.

## O que mudou (medido)

Banco local somente leitura, três grupos ativos (A, B, C). **Antes** é a 0.9.0, de 19/11 até a instalação. **Depois** é da instalação (24/11 ~13h) até 25/11 ~14h. Mensagens de texto do agente que chegaram ao WhatsApp, sem as legendas de imagem. Na conta de slug, os links ficam de fora.

| Medida | A antes → depois | B antes → depois | C antes → depois |
|---|---|---|---|
| Tamanho mediano (caracteres) | 221 → **636** | 223 → **643** | 244 → **499** |
| Com chave `XXX-n` | 26% → **61%** | 8% → **43%** | 0% → **67%** |
| Com código `· D#` | 0% → **46%** | 0% → **26%** | 0% → **33%** |
| Com slug de chave antiga | 1% → **34%** | 1% → **22%** | 4% → **19%** |
| Com link do painel | 1% → **55%** | 3% → **48%** | 0% → **52%** |
| Começa por chave/slug | 0% → **48%** | 0% → **43%** | 0% → **41%** |
| Códigos por mensagem | 0,29 → **2,48** | 0,09 → **1,52** | 0,04 → **2,26** |
| Mensagens do agente por mensagem de pessoa | 2,02 → 2,15 | 0,92 → 1,53 | 2,17 → 1,59 |

Limites: o depois é **um dia**, com cerca de 2,7× a atividade normal do grupo A. O volume por pedido quase não mudou. O que mudou foi a **forma**: as mensagens ficaram ~3× mais longas e de 8 a 50× mais carregadas de código.

## De onde vem cada problema

1. **Prefixos dos formatos fixos** (`SIGNAL_PT` em `thread/i18n/messages.ts`). Todo sinal de issue começa com chave e código: `❓ APP-7 · D1 — …`, `APP-7 · prévia — …`, `✅ APP-7 · <título inteiro> — …`, `⚠️ APP-7 — …`. Todos terminam com o link do painel. A pergunta termina com `Sigo com <rótulo> se ninguém disser o contrário em 15 min.`, e quando o padrão é texto livre isso sai como "Sigo com Sigo pesquisando…". A prévia ainda diz `(+N no console)`, um lugar que o grupo não vê. **É a maior parte da reclamação, e está num arquivo só.**
2. **Slugs.** As issues criadas até 18/11 nasceram sem chave curta, e a chave delas é o slug do pedido (`pedido-do-operador-17-11-21-14-…`). 347 issues ao todo; **23 ainda abertas** (22 esperando alguém). Quase todas estão paradas há dias e aparecem no boletim como "parou sem dizer o que falta". **É dado, não formato.**
3. **Duas vozes sobre o mesmo fato.** A issue manda a decisão e, segundos depois, o orquestrador, acordado por outra mensagem, repete o estado da mesma issue (`agent.orchestrator_replied` 6 s depois do `stop_raised`, rastreado). Outros pares parecidos ainda não foram rastreados.
4. **Prosa longa.** Com o fim do `ISSUE_RESULT`, o texto da issue vai ao grupo quase literal, depois do prefixo. Antes, o orquestrador reescrevia o resultado na voz dele, curto (a spec da fase 3 já listava "a voz do orquestrador" como risco não medido).
5. **Correção no meio de um turno fica muda.** Uma resposta citando uma issue que está rodando vira STEER e espera o turno acabar. Medido: uma correção esperou ~6 min, o grupo não recebeu nada e a pessoa repetiu. A issue concluiu e só então leu a correção. **Não é regressão**: desde a 0.9.0 só "agora" corta o turno. Respostas a perguntas abertas recebem confirmação imediata (9 de 11 respostas citando tarefa tiveram retorno em 2 min). O silêncio é específico de STEER para issue em turno.
6. **Painel pouco usado, mas linkado em metade das mensagens.**

## Proposta

### 1. Formatos (um arquivo, sem mudança de contrato)

A mensagem começa pelo **assunto em palavras**, não pela chave. Os códigos deixam de ser **impressos** e continuam **aceitos**: quem digitar `APP-7`, `D1` ou `APP-7 · D1` continua sendo entendido (`parseAskCode`, `RuleRouter`, linha do tempo, painel e console seguem iguais).

| Nível | Hoje | Proposto |
|---|---|---|
| Decisão | `❓ APP-7 · D1 — O vídeo está ok para publicar?` + opções + link | `❓ video-na-landing — posso publicar?` + opções numeradas + `Responda com o número ou citando esta mensagem.` |
| Pergunta | `APP-7 · D2 — …` + opções + `Sigo com X se ninguém disser o contrário em 15 min.` + link | `Pergunta — Vídeo na página inicial: …` + opções + `Se ninguém responder em 15 min: X.` |
| Prévia | `APP-7 · prévia — … (+2 no console)` + link | `👀 Prévia — Vídeo na página inicial` + texto; os prints vão como imagem (os que sobram não são citados) |
| Fechamento | `✅ APP-7 · <título inteiro> — <texto>` + link | `✅ Pronto — Vídeo na página inicial` + texto |
| Bloqueio | `⚠️ APP-7 — <título>.` + texto + link | `⚠️ Parei — Vídeo na página inicial: <motivo>` |
| Resumo por pessoa | `operator, 2 coisas:` + itens com chave + link | **sai do padrão**: cada item vai como a sua própria mensagem curta (no grupo A, em um dia, juntou duas coisas sem relação num texto de mais de 1.800 caracteres) |
| "Para qual?" | `Para qual? APP-7 · D1 ou APP-9 · D1 — responda citando a pergunta.` | `Tenho duas perguntas abertas: a do vídeo na página inicial e a do aviso do app. Responda citando a que for.` |

**O nome da tarefa é um slug curto e legível, não um código (decisão do grupo, 25/11).** Entre `APP-7` e o slug antigo, o grupo prefere o slug, porque ele diz do que se trata. O slug antigo era feio porque vinha do título cru do pedido (`pedido-do-operador-17-11-21-14-abra-o-ch`, cortado em 40 caracteres). A correção:
- `ForkIssue` / `DeclareIssueOpen` recebem um **nome** de 2 a 4 palavras (≤ 24 caracteres, ex.: "vídeo na landing"), declarado pelo orquestrador além do título.
- A chave nova é `uniqueSlugKey(nome)`, única por workspace (`video-na-landing`, colisão → `video-na-landing-2`). A sequência `PREFIXO-n` deixa de ser a chave visível.
- `slugify` passa a tirar os acentos em vez de trocá-los por hífen (hoje `conversação` → `conversac-a-o`, um defeito).
- As chaves `APP-n` que já existem continuam valendo e continuam aceitas quando alguém digitar.
- As mensagens nomeiam a tarefa pelo slug: `❓ video-na-landing — posso publicar?`.

Isso muda o contrato do `ForkIssue` (campo novo), então vai como passo próprio, depois dos formatos.

**Link do painel:** sai de todas as mensagens. Fica só no boletim (`boletim`) e quando alguém pedir ("painel"/"link").

### 2. Limpeza de dados (uma vez, com o operador aprovando)

As 23 issues abertas com slug longo: listar por grupo com idade e último sinal. As inativas há mais de 7 dias são **concluídas como abandonadas** (operador confirma a lista). As vivas recebem um **slug curto** pela regra nova (não um `APP-n`). Assim o boletim e o kanban deixam de mostrar dezenas de "parou sem dizer o que falta" que ninguém acompanha.

### 3. Voz e tamanho (prompt das ferramentas da issue)

Nas descrições de `AskDecision` / `AskQuestion` / `RequestFeedback` / `DeclareIssueComplete`, para o texto que vai ao grupo: até 3 frases curtas, sem jargão de bastidor (PR, merge, worktree, commit, deploy, "console"), sem chave nem código. O detalhe fica na linha do tempo. Medir de novo a mediana; a meta é voltar para ~250 caracteres.

**Opção, se não bastar:** o fechamento volta a passar pelo orquestrador, que reescreve o resultado numa frase. Custa um turno curto por tarefa concluída, contra ~6,9 por issue antes da fase 3.

### 4. Correção no meio de um turno (comportamento novo, precisa de ok)

Regra proposta, para uma mensagem de quem pode comandar que cai numa issue em turno, por citação ou por chave:
- **Confirmação imediata no grupo**, por regra e sem modelo: `Recebi — vou ajustar a tarefa do vídeo na página inicial com isso.`
- **O turno é cortado** do mesmo jeito que o "agora" já corta (`IssueTurnAborter.interrupt`, a sessão é mantida), e o próximo turno começa pela correção.
- "agora" continua valendo. Uma aprovação ou resposta a uma pergunta aberta continua seguindo o caminho de resposta (não corta).

Alternativa mais conservadora: só a confirmação imediata, sem cortar.

### 5. Duas vozes

O orquestrador não repete o estado de uma issue que falou nos últimos 2 min: o prompt dele recebe "acabou de ser dito ao grupo por <tarefa>". Os outros pares duplicados precisam ser rastreados antes.

## O que fica

- Decisões como stops de verdade, com o padrão de 15 min.
- Roteamento por citação (respostas indo direto para a tarefa certa).
- Menos turnos do orquestrador por tarefa.
- `relatorio` escrito pelo orquestrador (0.11.1) e o `boletim` por regra.
- Painel e console com chaves e códigos: são ferramentas do operador.

## O que retiro da conversa anterior

- **Modo `EVERYTHING`**: não resolve. Ele só adiciona mais linhas `APP-7 — texto` ao grupo.
- **Reverter o painel React (#81)**: não ajuda um painel que ninguém abre. O que resolve é parar de mandar o link.

## Ordem

1. Formatos + link (§1): uma release pequena, testes de formato por nível. Até o passo 2, a mensagem nomeia a tarefa pelo título curto.
2. Nome por slug curto (§1, contrato do `ForkIssue`) + correção do `slugify`.
3. Limpeza das issues com slug longo (§2): script somente leitura gera a lista, o operador aprova, depois aplica.
4. Voz e tamanho (§3), depois medir de novo.
5. Correção no meio do turno (§4), depois do ok do dono sobre a regra.
6. Duas vozes (§5), depois de rastrear os outros pares.

## Como medir de novo

Mesma janela e mesma conta (texto do agente no WhatsApp, sem legendas, links fora da conta de slug), por grupo: mediana de tamanho, % com chave/código/slug/link, % que começa por código, e correções em turno sem confirmação em 2 min.
