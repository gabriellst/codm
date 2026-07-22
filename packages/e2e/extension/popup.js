/* eslint-env browser, webextensions */
/* global chrome, document */

const content = document.getElementById('content')

async function load() {
	const snapshots = await chrome.runtime.sendMessage({ type: 'LIST_SNAPSHOTS' })
	const domains = Object.keys(snapshots || {})

	if (domains.length === 0) {
		content.innerHTML =
			'<div class="empty">No snapshots yet.<br>Click the camera button on any page.<br>Files are saved to your Downloads folder.</div>'
		return
	}

	content.innerHTML = domains
		.map(domain => {
			const items = snapshots[domain]
			return `
      <div class="domain">
        <div class="domain-name">${domain}</div>
        <div class="snap-list">
          ${items
						.map(
							s => `
            <div class="snap-item" data-domain="${domain}" data-id="${s.id}">
              <span class="snap-id" title="${s.url}">${s.id}</span>
              <span class="snap-time">${new Date(s.timestamp).toLocaleTimeString()}</span>
              <div class="snap-actions">
                <button class="btn-html" title="Reveal HTML in folder" data-action="show" data-dl="${s.downloads.html}">H</button>
                <button class="btn-svg" title="Reveal SVG in folder" data-action="show" data-dl="${s.downloads.svg}">S</button>
                <button class="btn-json" title="Reveal JSON in folder" data-action="show" data-dl="${s.downloads.json}">J</button>
                <button class="btn-del" title="Hide from list" data-action="remove">&times;</button>
              </div>
            </div>
          `,
						)
						.join('')}
        </div>
      </div>
    `
		})
		.join('')
}

content.addEventListener('click', async e => {
	const btn = e.target.closest('button[data-action]')
	if (!btn) return

	const action = btn.dataset.action

	if (action === 'show') {
		const downloadId = Number(btn.dataset.dl)
		if (Number.isFinite(downloadId)) chrome.downloads.show(downloadId)
		return
	}

	if (action === 'remove') {
		const item = btn.closest('.snap-item')
		await chrome.runtime.sendMessage({ type: 'REMOVE_SNAPSHOT', domain: item.dataset.domain, id: item.dataset.id })
		load()
	}
})

load()
