# Fase 2 — falar e parar na hora

Status: In progress (fase 2 do plano "tarefas visíveis, controláveis e que não se perdem")
Data: 2026-11-16

## Problema (medido numa instalação real, 14 dias)
- Toda mensagem passava pelo orquestrador (uma sessão por grupo, uma coisa por vez): espera mediana de 24 s, p90 de 110 s, 95 mensagens acima de 5 min, pior caso 1h30.
- Mais da metade das mensagens das pessoas é resposta citada a uma mensagem do agente.
- Um recado só entrava entre turnos da tarefa: do envio ao fim do turno que o consumia, mediana de 23 min. Uma tarefa publicava a versão antiga antes de ler a correção.
- ~30 pedidos de "pare / segura / cancele" em 14 dias, sujeitos à mesma espera.

## Decisões do dono
- Resposta citada é o principal sinal de roteamento; steer e pausa valem na hora.
- Para agir pelo painel, a pessoa escolhe o próprio nome na lista do grupo e confirma com um código enviado no WhatsApp dela (vale por aparelho; mantém a regra de quem pode liberar).

## Itens

### 1. Roteador — camada de regra (feito)
`RuleRouter` (contexto `thread`), antes de gravar a mensagem:
- cita uma mensagem ligada a uma issue (fase 0) → essa issue;
- nomeia exatamente uma issue pela chave curta (`APP-12`) → essa issue;
- só roteia issue **WORKING**; concluída ou esperando alguém segue para o orquestrador (reabrir é decisão dele);
- ambíguo (duas chaves, nenhuma) → caminho de sempre. A camada de regra nunca chuta.

A mensagem roteada vira um STEER da sessão da issue, assinado por quem escreveu, com o trecho citado; o grupo recebe só a reação 👀; a linha do tempo da issue mostra enviado/entregue/lido.

### 2. Pausa como comando
Palavra de controle (`pare`, `pausa`, `segura`) + alvo (citação ou chave) → a issue fica pausada no daemon na hora; as ferramentas de efeito externo recusam enquanto pausada; `continue` / `retome` despausa. Pausa do grupo inteiro por comando do operador.

### 3. Janela de arrependimento
Ações irreversíveis (merge, publicar, disparar push, escrever em produção) esperam alguns segundos e conferem a caixa de recados da issue; recado novo cancela a ação e volta para a sessão.

### 4. Steer imediato (`próximo passo` / `agora`)
`próximo passo` (padrão): o recado entra na próxima chamada de ferramenta da sessão. `agora`: interrompe o turno. Mecanismo a escolher medindo o runner (entrada em fluxo do CLI × hook entre ferramentas × interromper e retomar).

### 5. Entregue/lido no WhatsApp
Reação na mensagem roteada quando o recado é entregue à sessão e quando o turno que o leu termina.

### 6. Ações pelo painel (identificação por código no WhatsApp)
Depende do deploy da fase 1.

### Triagem paralela com modelo pequeno
Para o que a camada de regra não resolve (pedido novo, lista): triagens sem estado em paralelo, uma por mensagem. Depois dos itens 2–5.

## Fora de escopo
Mudar o comportamento do orquestrador em conversa geral; decisões como objeto (fase 3).
