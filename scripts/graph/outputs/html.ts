// Proprietary code-graph viewer — vanilla SVG + DOM. Replaces the cytoscape-based version.
// Renders nodes in layered LR columns, with inter-column edges as bezier curves.

import { REPO } from '../../../template.config'
import type { Graph, Node as GraphNode, NodeKind } from '../core/graph'
import { serializeGraph } from '../core/graph'

// ── Layer assignment ──
// Each kind sits in a column. Lower = further left = "user-facing".
const LAYER_INDEX: Record<string, number> = {
	'frontend-route': 0,
	'frontend-route-search': 1,
	'frontend-section': 1,
	'frontend-dialog': 1,
	'frontend-form': 1,
	'frontend-component': 2,
	'frontend-ui-primitive': 2,
	'frontend-store': 3,
	'frontend-hook': 3,
	'frontend-label-map': 3,
	'frontend-error-handler': 3,
	'sdk-hook': 4,
	'sdk-zod': 5,
	'sdk-type': 5,
	'sdk-http': 5,
	'sdk-enum': 5,
	'sdk-error-enum': 5,
	'sdk-operation': 6,
	'zod-schema': 7,
	schema: 7,
	controller: 8,
	middleware: 8,
	usecase: 9,
	'ui-query': 9,
	'agent-tool': 10,
	agent: 10,
	handler: 10,
	job: 10,
	event: 11,
	'integration-event': 11,
	entity: 12,
	'value-object': 12,
	enum: 12,
	'enum-member': 12,
	'error-code': 12,
	'service-interface': 13,
	'service-impl': 13,
	'repository-interface': 14,
	'di-registry': 14,
	'repository-impl': 15,
	'db-table': 16,
	'db-relation': 16,
	'locale-key': 17,
}

const LAYER_LABELS: { index: number; label: string; description: string }[] = [
	{ index: 0, label: 'Routes', description: 'TanStack Router pages' },
	{ index: 1, label: 'Views', description: 'Sections, dialogs, forms, search schemas' },
	{ index: 2, label: 'Components', description: 'Reusable UI + design-system primitives' },
	{ index: 3, label: 'Frontend State', description: 'Stores, hooks, label maps, error handlers' },
	{ index: 4, label: 'SDK Hooks', description: 'React Query hooks generated from OpenAPI' },
	{ index: 5, label: 'SDK Types/Zod', description: 'Generated types, zod schemas, enums, http clients' },
	{ index: 6, label: 'SDK Operations', description: 'Logical operations from the OpenAPI spec' },
	{ index: 7, label: 'Backend Schemas', description: 'Zod schemas defined in usecases / controllers' },
	{ index: 8, label: 'HTTP Layer', description: 'Controllers and middlewares' },
	{ index: 9, label: 'Application', description: 'Use cases and BFF queries' },
	{ index: 10, label: 'Reactions', description: 'Handlers, agents, agent-tools, jobs' },
	{ index: 11, label: 'Events', description: 'Domain + integration events' },
	{ index: 12, label: 'Domain', description: 'Entities, value objects, enums, error codes' },
	{ index: 13, label: 'Services', description: 'Service abstractions + implementations' },
	{ index: 14, label: 'Repos', description: 'Repository contracts + DI registries' },
	{ index: 15, label: 'Drizzle', description: 'Concrete Drizzle repositories' },
	{ index: 16, label: 'Database', description: 'Drizzle pgTable definitions' },
	{ index: 17, label: 'i18n', description: 'Locale keys (pt + en)' },
]

const COLOR_BY_KIND: Record<string, string> = {
	entity: '#ef4444',
	'value-object': '#f97316',
	enum: '#fb923c',
	'enum-member': '#fdba74',
	'error-code': '#dc2626',
	usecase: '#eab308',
	'ui-query': '#facc15',
	event: '#a855f7',
	'integration-event': '#7c3aed',
	handler: '#9333ea',
	'service-interface': '#84cc16',
	'service-impl': '#65a30d',
	agent: '#22c55e',
	'agent-tool': '#16a34a',
	job: '#15803d',
	controller: '#3b82f6',
	middleware: '#60a5fa',
	schema: '#93c5fd',
	'zod-schema': '#a78bfa',
	'repository-interface': '#64748b',
	'repository-impl': '#475569',
	'di-registry': '#334155',
	'db-table': '#0f172a',
	'sdk-operation': '#14b8a6',
	'sdk-hook': '#0d9488',
	'sdk-type': '#5eead4',
	'sdk-zod': '#2dd4bf',
	'sdk-http': '#99f6e4',
	'sdk-enum': '#0891b2',
	'sdk-error-enum': '#0369a1',
	'frontend-route': '#ec4899',
	'frontend-route-search': '#f9a8d4',
	'frontend-section': '#db2777',
	'frontend-component': '#be185d',
	'frontend-dialog': '#9d174d',
	'frontend-ui-primitive': '#fda4af',
	'frontend-store': '#e11d48',
	'frontend-hook': '#f43f5e',
	'frontend-form': '#fb7185',
	'frontend-label-map': '#fbbf24',
	'frontend-error-handler': '#f59e0b',
	'locale-key': '#64748b',
}

// Default visible kinds — keep first-paint <1000 nodes by hiding heavy generated stuff.
const DEFAULT_VISIBLE_KINDS: NodeKind[] = [
	'entity',
	'value-object',
	'enum',
	'usecase',
	'ui-query',
	'event',
	'integration-event',
	'handler',
	'controller',
	'middleware',
	'repository-interface',
	'repository-impl',
	'service-interface',
	'service-impl',
	'di-registry',
	'db-table',
	'sdk-operation',
	'sdk-hook',
	'sdk-zod',
	'sdk-error-enum',
	'sdk-enum',
	'zod-schema',
	'frontend-route',
	'frontend-section',
	'frontend-component',
	'frontend-dialog',
	'frontend-store',
	'frontend-hook',
	'frontend-form',
	'frontend-label-map',
	'frontend-error-handler',
	'frontend-form',
	'frontend-route-search',
	'agent',
	'agent-tool',
	'job',
]

// ── Server-side layout ──
// Reserved for future SSR — the browser currently computes positions on demand.
export interface LayoutResult {
	positions: Record<string, { x: number; y: number; layer: number }>
	bounds: { width: number; height: number }
	layers: { x: number; width: number; label: string; description: string }[]
}

export function computeLayoutSSR(nodes: GraphNode[]): LayoutResult {
	const COL_WIDTH = 260
	const ROW_HEIGHT = 30
	const TOP_PADDING = 80
	const LEFT_PADDING = 24

	const byColumn = new Map<number, GraphNode[]>()
	for (const node of nodes) {
		const layer = LAYER_INDEX[node.kind] ?? 9
		if (!byColumn.has(layer)) byColumn.set(layer, [])
		byColumn.get(layer)!.push(node)
	}

	// Stable sort within column: by context, then name
	for (const [, arr] of byColumn) {
		arr.sort((a, b) => {
			const ca = a.context ?? ''
			const cb = b.context ?? ''
			if (ca !== cb) return ca.localeCompare(cb)
			return a.name.localeCompare(b.name)
		})
	}

	const positions: LayoutResult['positions'] = {}
	const tallest = Math.max(...[...byColumn.values()].map(arr => arr.length), 1)
	const totalHeight = tallest * ROW_HEIGHT + TOP_PADDING * 2

	const layers: LayoutResult['layers'] = []
	const knownLayerIndexes = Array.from(byColumn.keys()).sort((a, b) => a - b)
	const compactIndex = new Map<number, number>()
	knownLayerIndexes.forEach((real, idx) => {
		compactIndex.set(real, idx)
	})

	for (const real of knownLayerIndexes) {
		const idx = compactIndex.get(real)!
		const x = LEFT_PADDING + idx * COL_WIDTH
		const labelMeta = LAYER_LABELS.find(l => l.index === real)
		layers.push({
			x,
			width: COL_WIDTH,
			label: labelMeta?.label ?? `Layer ${real}`,
			description: labelMeta?.description ?? '',
		})
		const arr = byColumn.get(real)!
		arr.forEach((node, i) => {
			positions[node.id] = { x, y: TOP_PADDING + i * ROW_HEIGHT, layer: real }
		})
	}

	return {
		positions,
		bounds: {
			width: LEFT_PADDING * 2 + knownLayerIndexes.length * COL_WIDTH,
			height: totalHeight,
		},
		layers,
	}
}

// ── HTML generation ──
export function renderGraphHtml(graph: Graph): string {
	const serialized = serializeGraph(graph)
	const dataJson = JSON.stringify(serialized)

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${REPO.brand} Code Graph</title>
<style>
  :root {
    --bg: #0a0e1a;
    --surface: #11172a;
    --surface-2: #18223d;
    --border: #1e2a44;
    --text: #e2e8f0;
    --text-dim: #94a3b8;
    --text-muted: #64748b;
    --accent: #38bdf8;
    --accent-pink: #f472b6;
    --accent-amber: #fbbf24;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; background: var(--bg); color: var(--text); font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto; font-size: 12.5px; overflow: hidden; }
  #app { display: grid; grid-template-columns: 280px 1fr 380px; height: 100vh; }

  aside { background: var(--surface); border-right: 1px solid var(--border); overflow-y: auto; padding: 14px; }
  aside.right { border-right: none; border-left: 1px solid var(--border); }

  h1 { font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text); margin-bottom: 4px; }
  h2 { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-dim); font-weight: 700; margin: 14px 0 8px; }
  .stats { color: var(--text-dim); font-size: 11px; margin-bottom: 12px; }
  .stats strong { color: var(--text); font-variant-numeric: tabular-nums; }

  .input { width: 100%; padding: 8px 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; color: var(--text); font-size: 12px; outline: none; }
  .input:focus { border-color: var(--accent); }

  .toolbar { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0; }
  button { background: var(--surface-2); border: 1px solid var(--border); color: var(--text); padding: 5px 10px; border-radius: 5px; font: inherit; font-size: 11px; cursor: pointer; }
  button:hover { background: var(--border); }
  button.active { background: var(--accent); border-color: var(--accent); color: var(--bg); }

  .kind-list { display: flex; flex-direction: column; gap: 2px; }
  .kind-row { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 4px; cursor: pointer; user-select: none; }
  .kind-row:hover { background: var(--surface-2); }
  .kind-row input { margin: 0; cursor: pointer; }
  .swatch { display: inline-block; width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .kind-name { flex: 1; font-size: 11px; }
  .kind-count { color: var(--text-dim); font-variant-numeric: tabular-nums; font-size: 10.5px; }

  details { margin-bottom: 8px; }
  details summary { cursor: pointer; padding: 4px 0; font-size: 10.5px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; }
  details summary:hover { color: var(--text); }
  .layer-list { font-size: 11px; color: var(--text-dim); line-height: 1.6; padding-left: 18px; margin: 4px 0 8px; }
  .layer-list li strong { color: var(--text); display: block; }
  .layer-list li span { font-size: 10.5px; color: var(--text-muted); }

  main { position: relative; overflow: hidden; }
  #stage-wrapper { position: absolute; inset: 0; overflow: hidden; cursor: grab; }
  #stage-wrapper.panning { cursor: grabbing; }
  #stage { position: absolute; top: 0; left: 0; transform-origin: 0 0; }

  .top-bar { position: absolute; top: 12px; left: 12px; z-index: 5; background: rgba(17,23,42,0.92); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border); display: flex; gap: 8px; align-items: center; backdrop-filter: blur(8px); font-size: 11px; color: var(--text-dim); }

  .zoom-controls { position: absolute; bottom: 16px; right: 16px; z-index: 5; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; display: flex; flex-direction: column; }
  .zoom-controls button { border: none; border-radius: 0; padding: 6px 10px; font-size: 13px; }
  .zoom-controls button + button { border-top: 1px solid var(--border); }

  .layer-header { fill: var(--text-dim); font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
  .layer-divider { stroke: var(--border); stroke-width: 1; stroke-dasharray: 4 4; }

  .node { position: absolute; padding: 4px 8px 4px 24px; border-radius: 4px; background: var(--surface-2); border: 1px solid var(--border); color: var(--text); font-size: 11px; line-height: 1.3; white-space: nowrap; cursor: pointer; transition: opacity 0.15s, transform 0.1s; max-width: 240px; overflow: hidden; text-overflow: ellipsis; user-select: none; }
  .node::before { content: ''; position: absolute; left: 8px; top: 50%; transform: translateY(-50%); width: 8px; height: 8px; border-radius: 50%; background: var(--node-color, #888); }
  .node:hover { background: var(--border); transform: translateX(2px); }
  .node.selected { background: var(--accent); color: var(--bg); border-color: var(--accent); font-weight: 600; }
  .node.selected::before { background: var(--bg); }
  .node.related { background: var(--surface); border-color: var(--accent-pink); color: var(--accent-pink); }
  .node.faded { opacity: 0.18; }

  #edges { position: absolute; inset: 0; pointer-events: none; }
  .edge { fill: none; stroke: var(--text-muted); stroke-width: 1; opacity: 0.4; }
  .edge.inferred { stroke-dasharray: 3 3; stroke: #6366f1; opacity: 0.3; }
  .edge.highlighted { stroke: var(--accent-pink); stroke-width: 2; opacity: 1; }
  .edge.faded { opacity: 0.05; }

  /* Detail panel */
  .detail-empty { padding: 32px 16px; text-align: center; color: var(--text-muted); font-style: italic; font-size: 11px; }
  .detail h3 { font-size: 13px; color: var(--accent); margin-bottom: 6px; word-break: break-all; }
  .detail .id { font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; font-size: 10px; color: var(--text-muted); margin-bottom: 14px; word-break: break-all; padding: 6px 8px; background: var(--bg); border-radius: 4px; }
  .kvp { display: flex; gap: 6px; padding: 3px 0; font-size: 11px; }
  .kvp .k { color: var(--text-dim); min-width: 70px; flex-shrink: 0; }
  .kvp .v { color: var(--text); word-break: break-all; }
  .kvp .v code { font-family: ui-monospace, monospace; font-size: 10.5px; background: var(--bg); padding: 1px 5px; border-radius: 3px; }

  .neighbor { display: block; padding: 5px 8px; margin: 2px -8px; border-radius: 4px; cursor: pointer; font-size: 11px; color: var(--text); border-left: 3px solid transparent; transition: background 0.1s; }
  .neighbor:hover { background: var(--surface-2); }
  .neighbor .n-edge { color: var(--accent-pink); font-size: 10px; margin-right: 4px; font-weight: 600; }
  .neighbor .n-id { font-family: ui-monospace, monospace; word-break: break-all; color: var(--text-dim); font-size: 10.5px; }
  .neighbor.has-target { border-left-color: var(--accent); }

  .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 9.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--bg); }
</style>
</head>
<body>
<div id="app">
  <aside class="left">
    <h1>${REPO.brand} Code Graph</h1>
    <div class="stats">
      <strong id="visible-nodes">0</strong> / <strong id="total-nodes">0</strong> nodes &middot;
      <strong id="visible-edges">0</strong> / <strong id="total-edges">0</strong> edges
    </div>

    <input id="search" class="input" placeholder="Search nodes by id / name…" />

    <div class="toolbar">
      <button id="btn-fit">Fit</button>
      <button id="btn-toggle-inferred" class="active">INFERRED</button>
      <button id="btn-show-all">Show all</button>
      <button id="btn-show-default">Default</button>
    </div>

    <details open>
      <summary>Layer order (LR)</summary>
      <ol id="layer-list" class="layer-list"></ol>
    </details>

    <h2>Filter by kind</h2>
    <div id="kind-list" class="kind-list"></div>
  </aside>

  <main>
    <div class="top-bar">
      <span>Layered LR &middot; click a node to inspect &middot; drag to pan &middot; scroll to zoom</span>
    </div>
    <div id="stage-wrapper">
      <div id="stage">
        <svg id="edges" xmlns="http://www.w3.org/2000/svg"></svg>
        <svg id="layer-headers" xmlns="http://www.w3.org/2000/svg" style="position:absolute; top:0; left:0; pointer-events:none;"></svg>
        <div id="nodes-layer"></div>
      </div>
    </div>
    <div class="zoom-controls">
      <button id="zoom-in" title="Zoom in">+</button>
      <button id="zoom-out" title="Zoom out">-</button>
      <button id="zoom-reset" title="Reset">⟲</button>
    </div>
  </main>

  <aside class="right">
    <div id="detail" class="detail">
      <div class="detail-empty">Click any node to inspect its dependencies and consumers.</div>
    </div>
  </aside>
</div>

<script>
const GRAPH = ${dataJson};
const COLOR_BY_KIND = ${JSON.stringify(COLOR_BY_KIND)};
const LAYER_INDEX = ${JSON.stringify(LAYER_INDEX)};
const LAYER_LABELS = ${JSON.stringify(LAYER_LABELS)};
const DEFAULT_VISIBLE_KINDS = ${JSON.stringify(DEFAULT_VISIBLE_KINDS)};

// ── Index data ──
const nodesById = new Map(GRAPH.nodes.map(n => [n.id, n]));
const incomingByNode = new Map();
const outgoingByNode = new Map();
for (const e of GRAPH.edges) {
  const inn = incomingByNode.get(e.to) ?? []; inn.push(e); incomingByNode.set(e.to, inn);
  const out = outgoingByNode.get(e.from) ?? []; out.push(e); outgoingByNode.set(e.from, out);
}

// ── State ──
const state = {
  visibleKinds: new Set(DEFAULT_VISIBLE_KINDS),
  showInferred: true,
  searchQuery: '',
  selectedId: null,
  zoom: 0.55,
  pan: { x: 24, y: 24 },
};

// ── Stat counters ──
const kindCounts = {};
for (const n of GRAPH.nodes) kindCounts[n.kind] = (kindCounts[n.kind] || 0) + 1;
document.getElementById('total-nodes').textContent = GRAPH.nodes.length;
document.getElementById('total-edges').textContent = GRAPH.edges.length;

// ── Sidebar: layer legend ──
const layerListEl = document.getElementById('layer-list');
layerListEl.innerHTML = LAYER_LABELS
  .filter(l => GRAPH.nodes.some(n => LAYER_INDEX[n.kind] === l.index))
  .map(l => \`<li><strong>\${l.label}</strong><span>\${l.description}</span></li>\`)
  .join('');

// ── Sidebar: kind filters ──
const kindListEl = document.getElementById('kind-list');
const sortedKinds = Object.entries(kindCounts).sort((a, b) => b[1] - a[1]);
function renderKindList() {
  kindListEl.innerHTML = sortedKinds.map(([k, c]) => {
    const checked = state.visibleKinds.has(k) ? 'checked' : '';
    const color = COLOR_BY_KIND[k] || '#888';
    return \`<label class="kind-row" data-kind="\${k}">
      <input type="checkbox" \${checked} />
      <span class="swatch" style="background:\${color}"></span>
      <span class="kind-name">\${k}</span>
      <span class="kind-count">\${c}</span>
    </label>\`;
  }).join('');
}
renderKindList();
kindListEl.addEventListener('change', e => {
  const target = e.target;
  if (target.tagName !== 'INPUT') return;
  const row = target.closest('[data-kind]');
  if (!row) return;
  const kind = row.dataset.kind;
  if (target.checked) state.visibleKinds.add(kind);
  else state.visibleKinds.delete(kind);
  redraw();
});

// ── Layout ──
const COL_WIDTH = 260;
const ROW_HEIGHT = 32;
const TOP_PADDING = 80;
const LEFT_PADDING = 24;
const NODE_WIDTH = 230;

function computeLayout() {
  const visible = GRAPH.nodes.filter(n => state.visibleKinds.has(n.kind));
  const byCol = new Map();
  for (const n of visible) {
    const layer = LAYER_INDEX[n.kind] ?? 9;
    if (!byCol.has(layer)) byCol.set(layer, []);
    byCol.get(layer).push(n);
  }
  const sortedLayerIdx = [...byCol.keys()].sort((a, b) => a - b);
  const compactIdx = new Map();
  sortedLayerIdx.forEach((l, i) => compactIdx.set(l, i));

  const positions = new Map();
  const layers = [];
  let maxRows = 0;
  for (const layerIdx of sortedLayerIdx) {
    const arr = byCol.get(layerIdx);
    arr.sort((a, b) => {
      const ka = (a.context || '') + ':' + a.name;
      const kb = (b.context || '') + ':' + b.name;
      return ka.localeCompare(kb);
    });
    const x = LEFT_PADDING + compactIdx.get(layerIdx) * COL_WIDTH;
    const meta = LAYER_LABELS.find(l => l.index === layerIdx);
    layers.push({ x, layerIdx, label: meta?.label || \`Layer \${layerIdx}\`, count: arr.length });
    arr.forEach((n, i) => {
      positions.set(n.id, { x, y: TOP_PADDING + i * ROW_HEIGHT, layerIdx });
    });
    if (arr.length > maxRows) maxRows = arr.length;
  }

  return {
    positions,
    layers,
    width: LEFT_PADDING * 2 + sortedLayerIdx.length * COL_WIDTH,
    height: TOP_PADDING * 2 + maxRows * ROW_HEIGHT,
    visibleCount: visible.length,
  };
}

// ── Render ──
const stage = document.getElementById('stage');
const stageWrapper = document.getElementById('stage-wrapper');
const edgesSvg = document.getElementById('edges');
const layerHeaderSvg = document.getElementById('layer-headers');
const nodesLayer = document.getElementById('nodes-layer');

let layoutCache = null;

function redraw() {
  const layout = computeLayout();
  layoutCache = layout;
  document.getElementById('visible-nodes').textContent = layout.visibleCount;

  // Set stage size
  stage.style.width = layout.width + 'px';
  stage.style.height = layout.height + 'px';
  edgesSvg.setAttribute('width', layout.width);
  edgesSvg.setAttribute('height', layout.height);
  edgesSvg.setAttribute('viewBox', \`0 0 \${layout.width} \${layout.height}\`);
  layerHeaderSvg.setAttribute('width', layout.width);
  layerHeaderSvg.setAttribute('height', TOP_PADDING);
  layerHeaderSvg.setAttribute('viewBox', \`0 0 \${layout.width} \${TOP_PADDING}\`);

  // Layer headers + dividers
  let headersHtml = '';
  for (const l of layout.layers) {
    headersHtml += \`<text class="layer-header" x="\${l.x}" y="32">\${l.label}</text>\`;
    headersHtml += \`<text class="layer-header" x="\${l.x}" y="50" style="font-weight:400;font-size:10px;opacity:0.7;letter-spacing:0">\${l.count} nodes</text>\`;
    headersHtml += \`<line class="layer-divider" x1="\${l.x - 4}" y1="60" x2="\${l.x - 4}" y2="\${layout.height}" />\`;
  }
  layerHeaderSvg.innerHTML = headersHtml;
  // Headers actually need to span the whole stage, not just top, so move dividers into edges-svg
  const dividers = headersHtml; // we already drew dividers inside the header svg via line tags above
  layerHeaderSvg.setAttribute('height', layout.height);
  layerHeaderSvg.setAttribute('viewBox', \`0 0 \${layout.width} \${layout.height}\`);

  // Render nodes
  const visibleIds = new Set();
  let nodesHtml = '';
  for (const [id, pos] of layout.positions) {
    visibleIds.add(id);
    const node = nodesById.get(id);
    if (!node) continue;
    const color = COLOR_BY_KIND[node.kind] || '#888';
    nodesHtml += \`<div class="node" data-id="\${escapeHtmlAttr(id)}" style="--node-color:\${color};left:\${pos.x}px;top:\${pos.y}px;width:\${NODE_WIDTH}px" title="\${escapeHtmlAttr(id)}">\${escapeHtml(shortLabel(node))}</div>\`;
  }
  nodesLayer.innerHTML = nodesHtml;

  // Render edges
  let edgesHtml = '';
  let edgeCount = 0;
  for (const e of GRAPH.edges) {
    if (!visibleIds.has(e.from) || !visibleIds.has(e.to)) continue;
    if (!state.showInferred && e.audit === 'INFERRED') continue;
    const a = layout.positions.get(e.from);
    const b = layout.positions.get(e.to);
    if (!a || !b) continue;
    edgeCount++;
    const path = bezierPath(a.x + NODE_WIDTH, a.y + 12, b.x, b.y + 12);
    const cls = e.audit === 'INFERRED' ? 'edge inferred' : 'edge';
    edgesHtml += \`<path class="\${cls}" data-eid="\${escapeHtmlAttr(e.id)}" d="\${path}" />\`;
  }
  edgesSvg.innerHTML = edgesHtml;
  document.getElementById('visible-edges').textContent = edgeCount;

  applyTransform();
  if (state.selectedId) highlightSelection();
  if (state.searchQuery) applySearchHighlight();
}

function shortLabel(node) {
  if (node.kind === 'frontend-route') {
    const m = node.id.match(/frontend-route:([^:]+)$/);
    if (m) {
      const path = m[1].replace(/^packages\\/app\\/src\\/routes\\//, '').replace(/\\/index$/, '');
      return path || '/';
    }
  }
  if (node.kind === 'locale-key') {
    return \`[\${node.context}] \${node.name}\`;
  }
  if (node.context && !['db-table'].includes(node.kind)) {
    return \`\${node.name}\`;
  }
  return node.name;
}

function bezierPath(x1, y1, x2, y2) {
  const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
  const c1x = x1 + dx;
  const c2x = x2 - dx;
  return \`M \${x1} \${y1} C \${c1x} \${y1}, \${c2x} \${y2}, \${x2} \${y2}\`;
}

function escapeHtml(s) {
  if (typeof s !== 'string') s = String(s ?? '');
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeHtmlAttr(s) { return escapeHtml(s); }

// ── Pan / Zoom ──
function applyTransform() {
  stage.style.transform = \`translate(\${state.pan.x}px, \${state.pan.y}px) scale(\${state.zoom})\`;
}

let isPanning = false;
let panStart = null;
stageWrapper.addEventListener('mousedown', e => {
  if (e.target.closest('.node')) return;
  isPanning = true;
  stageWrapper.classList.add('panning');
  panStart = { x: e.clientX - state.pan.x, y: e.clientY - state.pan.y };
});
window.addEventListener('mousemove', e => {
  if (!isPanning) return;
  state.pan.x = e.clientX - panStart.x;
  state.pan.y = e.clientY - panStart.y;
  applyTransform();
});
window.addEventListener('mouseup', () => {
  isPanning = false;
  stageWrapper.classList.remove('panning');
});

stageWrapper.addEventListener('wheel', e => {
  e.preventDefault();
  const rect = stageWrapper.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  const factor = e.deltaY < 0 ? 1.12 : 0.89;
  const newZoom = Math.max(0.05, Math.min(3, state.zoom * factor));
  // Zoom around cursor: keep the point under cursor stable
  const ratio = newZoom / state.zoom;
  state.pan.x = cx - (cx - state.pan.x) * ratio;
  state.pan.y = cy - (cy - state.pan.y) * ratio;
  state.zoom = newZoom;
  applyTransform();
}, { passive: false });

document.getElementById('zoom-in').onclick = () => { state.zoom = Math.min(3, state.zoom * 1.2); applyTransform(); };
document.getElementById('zoom-out').onclick = () => { state.zoom = Math.max(0.05, state.zoom / 1.2); applyTransform(); };
document.getElementById('zoom-reset').onclick = () => { state.zoom = 0.55; state.pan = { x: 24, y: 24 }; applyTransform(); };
document.getElementById('btn-fit').onclick = fitToViewport;

function fitToViewport() {
  if (!layoutCache) return;
  const rect = stageWrapper.getBoundingClientRect();
  const scaleX = (rect.width - 40) / layoutCache.width;
  const scaleY = (rect.height - 40) / layoutCache.height;
  state.zoom = Math.max(0.05, Math.min(scaleX, scaleY));
  state.pan = { x: 20, y: 20 };
  applyTransform();
}

// ── Click node ──
nodesLayer.addEventListener('click', e => {
  const target = e.target.closest('.node');
  if (!target) return;
  selectNode(target.dataset.id);
});

function selectNode(id) {
  state.selectedId = id;
  showDetail(id);
  highlightSelection();
}

function highlightSelection() {
  const id = state.selectedId;
  if (!id) return;
  // Compute related node ids
  const related = new Set([id]);
  const edgeIds = new Set();
  for (const e of (incomingByNode.get(id) ?? [])) { related.add(e.from); edgeIds.add(e.id); }
  for (const e of (outgoingByNode.get(id) ?? [])) { related.add(e.to); edgeIds.add(e.id); }

  for (const el of nodesLayer.querySelectorAll('.node')) {
    const eid = el.dataset.id;
    el.classList.remove('selected', 'related', 'faded');
    if (eid === id) el.classList.add('selected');
    else if (related.has(eid)) el.classList.add('related');
    else el.classList.add('faded');
  }
  for (const el of edgesSvg.querySelectorAll('path')) {
    el.classList.remove('highlighted', 'faded');
    if (edgeIds.has(el.dataset.eid)) el.classList.add('highlighted');
    else el.classList.add('faded');
  }
}

function clearHighlight() {
  state.selectedId = null;
  for (const el of nodesLayer.querySelectorAll('.node')) {
    el.classList.remove('selected', 'related', 'faded');
  }
  for (const el of edgesSvg.querySelectorAll('path')) {
    el.classList.remove('highlighted', 'faded');
  }
  document.getElementById('detail').innerHTML = '<div class="detail-empty">Click any node to inspect its dependencies and consumers.</div>';
}

// Click empty stage to clear
stageWrapper.addEventListener('click', e => {
  if (e.target.closest('.node')) return;
  if (isPanning) return;
  if (state.selectedId) clearHighlight();
});

// ── Detail panel ──
function showDetail(id) {
  const node = nodesById.get(id);
  if (!node) return;
  const incoming = incomingByNode.get(id) ?? [];
  const outgoing = outgoingByNode.get(id) ?? [];
  const detailEl = document.getElementById('detail');
  const color = COLOR_BY_KIND[node.kind] || '#888';

  let html = '';
  html += \`<h3>\${escapeHtml(node.name)}</h3>\`;
  html += \`<div class="id">\${escapeHtml(node.id)}</div>\`;
  html += '<div>';
  html += \`<div class="kvp"><span class="k">kind</span><span class="v"><span class="badge" style="background:\${color}">\${node.kind}</span></span></div>\`;
  html += \`<div class="kvp"><span class="k">service</span><span class="v"><code>\${node.service}</code></span></div>\`;
  if (node.context) html += \`<div class="kvp"><span class="k">context</span><span class="v"><code>\${escapeHtml(node.context)}</code></span></div>\`;
  if (node.location?.file) {
    const loc = node.location.line ? \`\${node.location.file}:\${node.location.line}\` : node.location.file;
    html += \`<div class="kvp"><span class="k">file</span><span class="v"><code>\${escapeHtml(loc)}</code></span></div>\`;
  }
  if (node.metadata) {
    for (const [k, v] of Object.entries(node.metadata).slice(0, 12)) {
      if (v === undefined || v === null || v === '') continue;
      const s = typeof v === 'string' ? v : JSON.stringify(v);
      const truncated = s.length > 100 ? s.slice(0, 100) + '…' : s;
      html += \`<div class="kvp"><span class="k">\${escapeHtml(k)}</span><span class="v"><code>\${escapeHtml(truncated)}</code></span></div>\`;
    }
  }
  html += '</div>';

  html += \`<details \${incoming.length > 0 ? 'open' : ''}><summary>↑ Incoming (\${incoming.length})</summary>\`;
  for (const e of incoming) html += renderNeighbor(e, true);
  html += '</details>';

  html += \`<details \${outgoing.length > 0 ? 'open' : ''}><summary>↓ Outgoing (\${outgoing.length})</summary>\`;
  for (const e of outgoing) html += renderNeighbor(e, false);
  html += '</details>';

  detailEl.innerHTML = html;
  detailEl.querySelectorAll('.neighbor[data-target]').forEach(el => {
    el.addEventListener('click', () => {
      const targetId = el.dataset.target;
      if (!nodesById.has(targetId)) return;
      // Make sure the kind is visible
      const targetNode = nodesById.get(targetId);
      if (!state.visibleKinds.has(targetNode.kind)) {
        state.visibleKinds.add(targetNode.kind);
        renderKindList();
        redraw();
      }
      selectNode(targetId);
      // Scroll into view in stage
      const pos = layoutCache?.positions.get(targetId);
      if (pos) {
        const rect = stageWrapper.getBoundingClientRect();
        state.pan.x = rect.width / 2 - (pos.x + NODE_WIDTH / 2) * state.zoom;
        state.pan.y = rect.height / 2 - (pos.y + 12) * state.zoom;
        applyTransform();
      }
    });
  });
}

function renderNeighbor(edge, incoming) {
  const otherId = incoming ? edge.from : edge.to;
  const other = nodesById.get(otherId);
  const otherKind = other?.kind || 'unknown';
  const color = COLOR_BY_KIND[otherKind] || '#888';
  const star = edge.audit === 'INFERRED' ? '*' : '';
  const arrow = incoming ? '←' : '→';
  const targetable = nodesById.has(otherId) ? 'has-target' : '';
  return \`<a class="neighbor \${targetable}" data-target="\${escapeHtmlAttr(otherId)}">
    <span class="n-edge">\${arrow} [\${edge.kind}\${star}]</span>
    <span class="badge" style="background:\${color}">\${otherKind}</span><br>
    <span class="n-id">\${escapeHtml(otherId)}</span>
  </a>\`;
}

// ── Search ──
const searchEl = document.getElementById('search');
searchEl.addEventListener('input', () => {
  state.searchQuery = searchEl.value.trim().toLowerCase();
  applySearchHighlight();
});

function applySearchHighlight() {
  const q = state.searchQuery;
  if (!q) {
    if (state.selectedId) highlightSelection();
    else clearHighlight();
    return;
  }
  // Avoid clobbering selection — prioritize search
  for (const el of nodesLayer.querySelectorAll('.node')) {
    const id = el.dataset.id;
    const node = nodesById.get(id);
    if (!node) continue;
    const matches = id.toLowerCase().includes(q) || node.name.toLowerCase().includes(q);
    el.classList.remove('related', 'selected');
    if (matches) {
      el.classList.add('related');
      el.classList.remove('faded');
    } else {
      el.classList.add('faded');
    }
  }
  for (const el of edgesSvg.querySelectorAll('path')) {
    el.classList.add('faded');
  }
}

// ── Toolbar ──
document.getElementById('btn-toggle-inferred').addEventListener('click', e => {
  state.showInferred = !state.showInferred;
  e.target.classList.toggle('active', state.showInferred);
  redraw();
});
document.getElementById('btn-show-all').addEventListener('click', () => {
  state.visibleKinds = new Set(sortedKinds.map(([k]) => k));
  renderKindList();
  redraw();
});
document.getElementById('btn-show-default').addEventListener('click', () => {
  state.visibleKinds = new Set(DEFAULT_VISIBLE_KINDS);
  renderKindList();
  redraw();
});

// ── Initial render ──
redraw();
applyTransform();
setTimeout(fitToViewport, 60);
</script>
</body>
</html>`
}
