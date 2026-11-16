import { injectable } from 'tsyringe-neo'
import { Controller, z } from '@codm/core-typescript'

export const PanelPageInputSchema = z.object({ params: z.object({ token: z.string().min(16).max(128) }) })
export const PanelPageOutputSchema = z.string().example(['<html>…</html>'])

/**
 * PUBLIC — the per-group panel page (fase 1). One self-contained HTML document: it reads
 * `./board` and `./issues/:id` (same origin, same token) and re-reads the board every 15 s. Every value
 * from the daemon is inserted as TEXT (`textContent`), never as markup — titles and messages are written
 * by people in a chat.
 *
 * The page itself holds no data: an unknown token renders the shell and the board call answers 404,
 * which the page shows as "link inválido". Same answer for every way a link can be wrong.
 */
@injectable()
export class PanelPageController extends Controller<typeof PanelPageInputSchema, typeof PanelPageOutputSchema> {
	readonly path = '/panel/g/:token'
	readonly method = 'get' as const
	readonly description = 'The per-group panel page (public HTML)'
	readonly inputSchema = PanelPageInputSchema
	readonly outputSchema = PanelPageOutputSchema

	async handle(): Promise<this['output']> {
		return this.rawResponse(
			new Response(PANEL_HTML, {
				headers: {
					'Content-Type': 'text/html; charset=utf-8',
					// The token is in the path: never send it onward as a referrer, never let the page be framed.
					'Referrer-Policy': 'no-referrer',
					'X-Frame-Options': 'DENY',
					'Cache-Control': 'no-store',
				},
			}),
		)
	}
}

const PANEL_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Painel de tarefas</title>
<style>
:root{color-scheme:light dark;--bg:#f6f6f4;--card:#fff;--fg:#1c1c1a;--muted:#6b6b66;--line:#e4e4df;--warn:#b45309}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--card:#1f1f1d;--fg:#ededea;--muted:#a3a39d;--line:#2e2e2b;--warn:#f59e0b}}
*{box-sizing:border-box}body{margin:0;font:14px/1.45 system-ui,sans-serif;background:var(--bg);color:var(--fg)}
header{padding:16px;display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;justify-content:space-between}
h1{font-size:18px;margin:0}.muted{color:var(--muted);font-size:12px}.warn{color:var(--warn)}
.board{display:flex;gap:12px;overflow-x:auto;padding:0 16px 16px;scroll-snap-type:x mandatory}
.col{flex:0 0 260px;scroll-snap-align:start;background:color-mix(in srgb,var(--line) 40%,transparent);border-radius:12px;padding:8px}
.col h2{font-size:11px;letter-spacing:.06em;text-transform:uppercase;margin:4px 6px 8px;display:flex;justify-content:space-between;color:var(--muted)}
.card{display:block;width:100%;text-align:left;border:1px solid var(--line);background:var(--card);color:inherit;border-radius:10px;padding:10px;margin-bottom:8px;cursor:pointer;font:inherit}
.key{font-family:ui-monospace,monospace;font-weight:700;font-size:12px}.title{margin-top:4px}
dialog{max-width:640px;width:calc(100% - 32px);border:1px solid var(--line);border-radius:14px;background:var(--card);color:var(--fg);padding:0}
dialog::backdrop{background:rgb(0 0 0/.4)}.dh{padding:16px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:8px}
.tl{list-style:none;margin:0;padding:12px 16px;max-height:70vh;overflow:auto}.tl li{padding:8px 0;border-bottom:1px solid var(--line)}
.tl .k{font-weight:600;font-size:12px}.tl .t{white-space:pre-wrap;word-break:break-word;color:var(--muted)}
button.x{border:0;background:none;color:inherit;font-size:20px;cursor:pointer}
</style>
</head>
<body>
<header><h1 id="name">Painel de tarefas</h1><span id="seen" class="muted"></span></header>
<main class="board" id="board"></main>
<dialog id="detail"><div class="dh"><div><div id="dkey" class="key"></div><div id="dtitle"></div></div><button class="x" id="close" aria-label="Fechar">×</button></div><ol class="tl" id="tl"></ol></dialog>
<script>
(() => {
  const COLS = [['QUEUED','Na fila'],['RUNNING','Fazendo'],['WAITING_PERSON','Aguardando pessoa'],['WAITING_PROVIDER','Esperando cota'],['STALLED','Parada'],['DONE','Concluída']];
  const COLUMN_OF = {QUEUED:'QUEUED',RUNNING:'RUNNING',WAITING_PERSON:'WAITING_PERSON',WAITING_PROVIDER:'WAITING_PROVIDER',REMINDED:'STALLED',STALLED:'STALLED',DONE:'DONE'};
  const KIND = {CREATED:'Criada',TURN_STARTED:'Turno iniciado',MESSAGE:'Mensagem',STEER:'Orientação',ARTIFACT:'Artefato',STOP_RAISED:'Pediu alguém',STOP_RESOLVED:'Respondida',COMPLETED:'Concluída',ARCHIVED:'Arquivada'};
  const base = location.pathname.replace(/\\/+$/, '');
  const fmt = iso => new Date(iso).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  async function board() {
    const res = await fetch(base + '/board', {cache:'no-store'});
    if (!res.ok) { document.getElementById('name').textContent = 'Link inválido ou trocado'; document.getElementById('board').replaceChildren(); return; }
    const data = await res.json();
    document.getElementById('name').textContent = data.group.name;
    document.title = data.group.name + ' · tarefas';
    const seen = document.getElementById('seen');
    if (data.daemonLastSeenAt) {
      const min = Math.round((Date.now() - new Date(data.daemonLastSeenAt).getTime()) / 60000);
      seen.textContent = min <= 2 ? 'atualizado agora' : 'sem contato com o codm há ' + min + ' min';
      seen.className = min <= 2 ? 'muted' : 'muted warn';
    } else seen.textContent = '';
    const byCol = Object.fromEntries(COLS.map(([c]) => [c, []]));
    for (const issue of data.issues) byCol[COLUMN_OF[issue.lifeState]].push(issue);
    const cols = COLS.map(([c, label]) => {
      const col = el('section', 'col'); const h = el('h2'); h.append(el('span', null, label), el('span', null, String(byCol[c].length))); col.append(h);
      for (const issue of byCol[c]) {
        const card = el('button', 'card'); card.type = 'button';
        card.append(el('div', 'key', issue.key), el('div', 'title', issue.title));
        if (issue.waitingForProviderUntil) card.append(el('div', 'muted', 'Esperando cota até ' + fmt(issue.waitingForProviderUntil)));
        if (issue.lifeState === 'REMINDED') card.append(el('div', 'muted', 'Lembrada de declarar'));
        card.addEventListener('click', () => open(issue.issueId));
        col.append(card);
      }
      return col;
    });
    document.getElementById('board').replaceChildren(...cols);
  }
  async function open(issueId) {
    const res = await fetch(base + '/issues/' + encodeURIComponent(issueId), {cache:'no-store'});
    if (!res.ok) return;
    const data = await res.json();
    document.getElementById('dkey').textContent = data.issue.key;
    document.getElementById('dtitle').textContent = data.issue.title;
    document.getElementById('tl').replaceChildren(...data.timeline.map(item => {
      const li = el('li'); li.append(el('div', 'k', fmt(item.at) + ' · ' + (KIND[item.kind] || item.kind)));
      const text = item.text ?? item.title ?? item.name ?? '';
      if (text) li.append(el('div', 't', text));
      return li;
    }));
    document.getElementById('detail').showModal();
  }
  document.getElementById('close').addEventListener('click', () => document.getElementById('detail').close());
  board(); setInterval(board, 15000);
})();
</script>
</body>
</html>`
