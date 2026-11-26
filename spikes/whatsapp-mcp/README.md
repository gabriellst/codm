# Spike: MCP do WhatsApp do codm (só leitura)

Servidor MCP pequeno que lê as mensagens que o gateway Go do codm já grava no `codm.db`
(`gateway_messages` + `gateway_remotes`) e expõe para um cliente MCP remoto (Claude).
É descartável: um processo Bun separado, que não altera o gateway e não escreve no banco.

| | |
|---|---|
| `list_chats(limit)` | conversas, mais recente primeiro |
| `list_new_messages(since_cursor, limit, include_sent)` | mensagens que chegaram depois do cursor; devolve `next_cursor` |
| `get_conversation(chat_id, limit)` | últimas mensagens de uma conversa |
| resource `whatsapp://inbox` | assinável; o servidor olha o banco a cada `POLL_MS` e emite `notifications/resources/updated` |

Não existe ferramenta de envio. O cursor usa `observed_at` (quando o codm viu a mensagem), porque o
sync de histórico grava mensagens antigas com `occurred_at` antigo.

## Rodar no Mac mini

```bash
cd spikes/whatsapp-mcp
bun install
export MCP_TOKEN=$(openssl rand -hex 32)   # guarde: ele faz parte da URL
bun server.ts
# padrão: banco em ~/Library/Application Support/app.codm.desktop/data/codm.db, porta 3940, só 127.0.0.1
```

Variáveis: `CODM_DB` (outro caminho do banco), `PORT`, `HOST`, `POLL_MS` (padrão 5000).
`GET /health` responde `ok` sem token.

## Expor com cloudflared

Nunca exponha a porta 3032 do gateway: com `GLOBAL_API_KEY` vazio ela aceita envio sem autenticação.
Exponha só esta porta.

```bash
brew install cloudflared
# teste rápido, sem conta (a URL muda a cada reinício):
cloudflared tunnel --url http://127.0.0.1:3940
# URL do conector: https://<gerado>.trycloudflare.com/mcp/<MCP_TOKEN>
```

Para uma URL fixa, use um túnel nomeado (`cloudflared tunnel create codm-wa` + DNS num domínio seu na Cloudflare).

## Testar sem o Mac mini

```bash
bun test                                   # sobe o servidor contra um banco seed e usa o cliente MCP oficial
bun seed.ts ./test.db                      # banco com o schema real (aplica as migrations do repo) + dados de exemplo
CODM_DB=./test.db MCP_TOKEN=$(openssl rand -hex 32) bun server.ts
bun seed.ts ./test.db --add "oi"           # simula uma mensagem chegando
bunx @modelcontextprotocol/inspector       # Streamable HTTP, URL http://127.0.0.1:3940/mcp/<token>
```

Para testar com dados reais sem tocar no banco em uso: `sqlite3 codm.db ".backup /tmp/copia.db"` e aponte `CODM_DB` para a cópia.

## Em aberto

- Se o Claude Duet acorda uma conversa quando recebe `notifications/resources/updated`. O plano B é uma rotina chamando `list_new_messages` com o cursor salvo.
- Se o conector personalizado do claude.ai aceita esta URL com token no caminho (sem OAuth). Se exigir OAuth, isso fica para depois do spike.
- O token vai na URL e pode aparecer em logs do túnel. Para um spike isso basta, mas não para algo definitivo.
