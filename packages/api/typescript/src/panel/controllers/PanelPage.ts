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
.me{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.btn{border:1px solid var(--line);background:var(--card);color:inherit;border-radius:8px;padding:6px 10px;font:inherit;cursor:pointer}
.ib{padding:16px;display:grid;gap:10px}.ib select,.ib input{font:inherit;padding:8px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:inherit}
.ib input{letter-spacing:.3em;font-family:ui-monospace,monospace;font-size:18px}
.acts{padding:12px 16px;border-top:1px solid var(--line);display:grid;gap:8px}.row{display:flex;gap:8px;flex-wrap:wrap}
.acts textarea{font:inherit;padding:8px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:inherit;min-height:64px;resize:vertical}
</style>
</head>
<body>
<header><h1 id="name">Painel de tarefas</h1><div class="me"><span id="seen" class="muted"></span><span id="who" class="muted"></span><button class="btn" id="identify" type="button" hidden>Identificar-me</button><button class="btn" id="forget" type="button" hidden>Sair</button></div></header>
<main class="board" id="board"></main>
<dialog id="detail"><div class="dh"><div><div id="dkey" class="key"></div><div id="dtitle"></div></div><button class="x" id="close" aria-label="Fechar">×</button></div><ol class="tl" id="tl"></ol>
<div class="acts" id="acts" hidden><div class="row" id="ctl"></div><div class="row" id="stopbtns" hidden></div><textarea id="steer" maxlength="2000" placeholder="Orientar esta tarefa…" aria-label="Orientação para a tarefa"></textarea><div class="row"><button class="btn" id="sendsteer" type="button">Orientar</button></div><div id="astatus" class="muted" role="status"></div></div></dialog>
<dialog id="ident"><div class="dh"><strong>Identificar-me</strong><button class="x" id="iclose" aria-label="Fechar">×</button></div>
<div class="ib" id="istep1"><label for="pick">Quem é você neste grupo?</label><select id="pick"></select><button class="btn" id="send" type="button">Enviar código no meu WhatsApp</button></div>
<div class="ib" id="istep2" hidden><div id="isent" class="muted"></div><input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" aria-label="Código"><button class="btn" id="confirm" type="button">Confirmar</button><button class="btn" id="again" type="button">Escolher outro nome</button></div>
<div class="ib"><div id="ierr" class="warn" role="alert"></div></div></dialog>
<script>
(() => {
  const COLS = [['QUEUED','Na fila'],['RUNNING','Fazendo'],['WAITING_PERSON','Aguardando pessoa'],['WAITING_PROVIDER','Esperando cota'],['STALLED','Parada'],['DONE','Concluída']];
  const COLUMN_OF = {QUEUED:'QUEUED',RUNNING:'RUNNING',WAITING_PERSON:'WAITING_PERSON',WAITING_PROVIDER:'WAITING_PROVIDER',REMINDED:'STALLED',STALLED:'STALLED',PAUSED:'STALLED',DONE:'DONE'};
  const KIND = {CREATED:'Criada',TURN_STARTED:'Turno iniciado',MESSAGE:'Mensagem',STEER:'Orientação',ARTIFACT:'Artefato',STOP_RAISED:'Pediu alguém',STOP_RESOLVED:'Respondida',COMPLETED:'Concluída',ARCHIVED:'Arquivada',PAUSED:'Pausada',RESUMED:'Retomada'};
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
        if (issue.lifeState === 'PAUSED') card.append(el('div', 'muted', 'Pausada'));
        card.addEventListener('click', () => open(issue.issueId));
        col.append(card);
      }
      return col;
    });
    document.getElementById('board').replaceChildren(...cols);
  }
  let current = null;
  async function open(issueId) {
    current = issueId; document.getElementById('astatus').textContent = ''; document.getElementById('steer').value = '';
    if (await load(issueId)) document.getElementById('detail').showModal();
  }
  async function load(issueId) {
    const res = await fetch(base + '/issues/' + encodeURIComponent(issueId), {cache:'no-store'});
    if (!res.ok) return false;
    const data = await res.json();
    document.getElementById('dkey').textContent = data.issue.key;
    document.getElementById('dtitle').textContent = data.issue.title;
    document.getElementById('tl').replaceChildren(...data.timeline.map(item => {
      const li = el('li'); li.append(el('div', 'k', fmt(item.at) + ' · ' + (KIND[item.kind] || item.kind)));
      const text = item.text ?? item.title ?? item.name ?? '';
      if (text) li.append(el('div', 't', text));
      return li;
    }));
    renderActs(data);
    return true;
  }
  document.getElementById('close').addEventListener('click', () => document.getElementById('detail').close());

  // Who this device is (fase 2, item 6a). The device token lives in an HttpOnly cookie this script never sees.
  const $ = id => document.getElementById(id);
  const ERR = {PANEL_CODE_INVALID:'Código incorreto.',PANEL_CODE_EXPIRED:'Este código venceu ou já foi usado. Peça um novo.',PANEL_CODE_ATTEMPTS_EXCEEDED:'Muitas tentativas. Peça um novo código.',PANEL_CODE_RATE_LIMITED:'Muitos pedidos de código. Espere um minuto e tente de novo.',PANEL_MEMBER_NOT_FOUND:'Essa pessoa não está mais na lista do grupo.',PANEL_NOT_FOUND:'Link inválido ou trocado.'};
  const post = (path, body) => fetch(base + path, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body || {}), cache:'no-store', credentials:'same-origin'});
  const fail = async res => { const body = await res.json().catch(() => ({})); $('ierr').textContent = ERR[body.code] || 'Não deu certo. Tente de novo.'; };
  let picked = null;
  let meMember = null;
  async function me() {
    const res = await fetch(base + '/me', {cache:'no-store', credentials:'same-origin'});
    const data = res.ok ? await res.json() : {};
    meMember = data.member || null;
    $('who').textContent = data.member ? 'Você é ' + data.member.name + ' neste aparelho' : '';
    $('identify').hidden = !!data.member || !res.ok;
    $('forget').hidden = !data.member;
  }
  async function openIdent() {
    $('ierr').textContent = ''; $('istep1').hidden = false; $('istep2').hidden = true; $('code').value = '';
    const res = await fetch(base + '/members', {cache:'no-store'});
    if (!res.ok) return fail(res);
    const data = await res.json();
    $('pick').replaceChildren(...data.members.map(m => { const o = el('option', null, m.name); o.value = m.memberId; return o; }));
    $('ident').showModal();
  }
  $('identify').addEventListener('click', openIdent);
  $('iclose').addEventListener('click', () => $('ident').close());
  $('again').addEventListener('click', () => { $('ierr').textContent = ''; $('istep1').hidden = false; $('istep2').hidden = true; });
  $('send').addEventListener('click', async () => {
    $('ierr').textContent = '';
    const opt = $('pick').selectedOptions[0];
    if (!opt) return;
    picked = {memberId: opt.value, name: opt.textContent};
    const res = await post('/identify', {memberId: picked.memberId});
    if (!res.ok) return fail(res);
    $('isent').textContent = 'O codm vai mandar um código no WhatsApp de ' + picked.name + ' em até 15 segundos. Ele vale 10 minutos.';
    $('istep1').hidden = true; $('istep2').hidden = false; $('code').focus();
  });
  $('confirm').addEventListener('click', async () => {
    $('ierr').textContent = '';
    const code = $('code').value.replace(/\\D/g, '');
    if (!picked || code.length !== 6) { $('ierr').textContent = 'Digite os 6 números do código.'; return; }
    const res = await post('/verify', {memberId: picked.memberId, code});
    if (!res.ok) return fail(res);
    $('ident').close(); me();
  });
  $('forget').addEventListener('click', async () => { await post('/forget'); me(); });

  // Acting on an issue as the identified member (fase 2, item 6b). The daemon executes within ~15 s; the page polls.
  const RES = {APPROVE:'Aprovar',DENY:'Recusar',RETRY:'Tentar de novo'};
  const ACT_ERR = {PANEL_MEMBER_NOT_FOUND:'Identifique-se de novo para agir.',PANEL_CANNOT_RELEASE:'Só quem pode liberar responde a este pedido.',PANEL_RESOLUTION_NOT_OFFERED:'Essa resposta não está disponível aqui.',PANEL_ACTION_RATE_LIMITED:'Muitas ações seguidas. Espere um minuto.',PANEL_NOT_FOUND:'Esta tarefa não está mais neste painel.',ISSUE_ALREADY_PAUSED:'a tarefa já estava pausada.',ISSUE_NOT_PAUSED:'a tarefa não estava pausada.',ISSUE_NOT_PAUSABLE:'a tarefa já terminou.',ISSUE_NOT_FOUND:'a tarefa não está mais nesta conversa.',STOP_NOT_FOUND:'o pedido já foi respondido.',STOP_ALREADY_RESOLVED:'o pedido já foi respondido.',PARTICIPANT_CANNOT_RELEASE:'você não pode mais liberar neste grupo.',PARTICIPANT_CANNOT_ACT:'você não pode acionar o agente neste grupo.',PARTICIPANT_NOT_FOUND:'você não está mais na lista do grupo.'};
  function renderActs(data) {
    const acts = $('acts');
    acts.hidden = !meMember || data.issue.lifeState === 'DONE';
    if (acts.hidden) return;
    const paused = data.issue.lifeState === 'PAUSED';
    const ctl = el('button', 'btn', paused ? 'Retomar' : 'Pausar'); ctl.type = 'button';
    ctl.addEventListener('click', () => act({kind: paused ? 'RESUME' : 'PAUSE', issueId: data.issue.issueId}));
    $('ctl').replaceChildren(ctl);
    const stop = data.openStop && meMember.canRelease ? data.openStop : null;
    $('stopbtns').replaceChildren(...(stop ? stop.resolutions.map(resolution => {
      const b = el('button', 'btn', RES[resolution] || resolution); b.type = 'button';
      b.addEventListener('click', () => act({kind:'ANSWER_STOP', issueId: data.issue.issueId, stopId: stop.stopId, resolution}));
      return b;
    }) : []));
    $('stopbtns').hidden = !stop;
  }
  let polling = 0;
  async function act(body) {
    $('astatus').textContent = 'Enviando…';
    const res = await post('/actions', body);
    if (!res.ok) { const b = await res.json().catch(() => ({})); $('astatus').textContent = ACT_ERR[b.code] || 'Não deu certo. Tente de novo.'; return false; }
    const sent = await res.json();
    $('astatus').textContent = 'Pedido enviado — o codm faz em até 15 segundos.';
    const mine = ++polling; const started = Date.now(); const issueId = current;
    const tick = async () => {
      if (mine !== polling) return;
      const r = await fetch(base + '/actions/' + encodeURIComponent(sent.actionId), {cache:'no-store', credentials:'same-origin'});
      const s = r.ok ? await r.json() : {status:'EXPIRED'};
      if (s.status === 'PENDING' && Date.now() - started < 240000) { setTimeout(tick, 3000); return; }
      $('astatus').textContent = s.status === 'DONE' ? 'Feito.' : s.status === 'REFUSED' ? 'Recusado: ' + (ACT_ERR[s.code] || 'o codm não pôde fazer isso agora.') : 'Sem resposta do codm. Tente de novo.';
      board();
      if (issueId && issueId === current && $('detail').open) load(issueId);
    };
    setTimeout(tick, 3000);
    return true;
  }
  $('sendsteer').addEventListener('click', async () => {
    const text = $('steer').value.trim();
    if (!text || !current) return;
    if (await act({kind:'STEER', issueId: current, text})) $('steer').value = '';
  });

  board(); setInterval(board, 15000); me();
})();
</script>
</body>
</html>`
