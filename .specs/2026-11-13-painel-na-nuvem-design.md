# Painel das tarefas na nuvem, por link de grupo

Status: Draft (fase 1, itens 2 e 3 do plano "tarefas visíveis")
Data: 2026-11-13

## Decisões do dono
- A projeção mora no **mesmo serviço cloud e no mesmo Postgres** (tabelas novas).
- Artefatos no **Cloudflare R2**.
- O painel abre **no domínio atual da nuvem**, num caminho (sem DNS novo).
- **Acesso por grupo**: cada grupo tem um link; quem abre vê só aquele grupo; o link é trocável no console.
- Painel **somente leitura** nesta fase (ações pelo painel são a fase 2, depois de decidir a identificação da pessoa).

## Restrições encontradas no código
- Contexto com tabela pg precisa de placement cloud (rails TRK-01/02). As tabelas não podem ficar sob `issue` (local).
- O daemon só tem o token de sessão better-auth do usuário (`FileCloudSession`, bearer); a porta não expõe o token; não existe cliente daemon→nuvem além de `GET /session`.
- A nuvem não serve estáticos; o console não tem build web. HTML sai por `rawResponse` (como `SignInLoopback`).
- Migração pg é manual (`bun migrate:deploy:cloud`); o boot recusa schema atrasado.

## Desenho

### Contexto `panel` (placement: só cloud, pg)
Tabelas em `pgSchema('panel')`:
- `panel_groups` — `thread_id` (pk), `owner_id`, `name`, `token` (aleatório, 32 bytes base64url, único), `created_at`, `rotated_at`.
- `panel_issues` — `issue_id` (pk), `owner_id`, `thread_id`, `key`, `title`, `status`, `life_state`, `waiting_for_provider_until`, `archived`, `timeline` (jsonb: os itens de `GetIssueTimeline`), `updated_at`.
- `panel_daemons` — `owner_id` (pk), `last_seen_at`.

Endpoints:
- `PUT /panel/sync` — autenticado com o bearer da sessão do usuário (`AuthAccountMiddleware`). Corpo: grupos (thread id + nome) e issues (snapshot + linha do tempo). Upsert idempotente por id; grava `panel_daemons.last_seen_at`. Responde com o token de cada grupo (criado na primeira vez). Só aceita linhas do próprio dono.
- `POST /panel/groups/:threadId/rotate` — troca o token (mesmo bearer).
- Públicos, sem sessão, pelo token: `GET /panel/g/:token` (página HTML), `GET /panel/g/:token/board` (JSON do quadro), `GET /panel/g/:token/issues/:issueId` (JSON da tarefa com linha do tempo). Uma issue de outro grupo responde 404 igual a token inexistente.

### Lado do daemon
- A porta `CloudSession` ganha `bearer()` (o token atual ou nada), sem expor o arquivo.
- Porta `PanelPublisher` (Service abstrato por ambiente: `mock`/`integration` em memória, `real` via SDK do perfil cloud).
- Job `PublishPanelSnapshot` (a cada 15 s) no contexto `issue`: lê os grupos com issues e as issues alteradas desde o último envio (lista + linha do tempo, pelas consultas já existentes), envia e guarda os tokens devolvidos. Sem login, não faz nada.
- Console: na configuração da conversa, "Link do painel" (copiar) e "Trocar link".

### Artefatos (R2) — etapa seguinte
Upload por URL pré-assinada emitida pela nuvem; a linha do tempo passa a ter a URL pública. Depende do bucket (`wrangler login`).

## Fora de escopo
Ações pelo painel; SSE na web (a página recarrega o JSON a cada 15 s); domínio próprio.

## Riscos
- Token de grupo é segredo de quem está no grupo: 32 bytes aleatórios; rota pública sem rate limit hoje.
- Token de sessão expira em 30 dias: o envio para silenciosamente; o painel mostra "sem contato há N min" a partir de `panel_daemons.last_seen_at`.
- Deploy exige `bun migrate:deploy:cloud` antes do boot novo.
