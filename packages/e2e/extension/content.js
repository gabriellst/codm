/* eslint-env browser, webextensions */
/* global chrome, document, setTimeout, prompt, getComputedStyle, location, console, FileReader, fetch */
;(() => {
	if (document.getElementById('dom-snapshot-btn')) return

	let snapCount = 0

	const btn = document.createElement('button')
	btn.id = 'dom-snapshot-btn'
	btn.textContent = '\u{1F4F7}'
	btn.title = 'Take DOM Snapshot (Cmd+Shift+X)'
	document.body.appendChild(btn)

	const toast = document.createElement('div')
	toast.id = 'dom-snapshot-toast'
	document.body.appendChild(toast)

	function showToast(msg, durationMs = 2500) {
		toast.textContent = msg
		toast.classList.add('visible')
		setTimeout(() => toast.classList.remove('visible'), durationMs)
	}

	function capture() {
		const description = prompt('Snapshot description (optional):') ?? ''

		// ── Fast phase: collect DOM data synchronously ──
		let css = ''
		for (const sheet of document.styleSheets) {
			try {
				for (const r of sheet.cssRules) css += `${r.cssText}\n`
			} catch {}
		}

		const cs = getComputedStyle(document.documentElement)
		const computedStyles = Array.from({ length: cs.length }, (_, i) => cs[i])

		// Canvas → img replacement (sync, fast)
		document.querySelectorAll('canvas').forEach((canvas, _i) => {
			try {
				const dataUri = canvas.toDataURL('image/png')
				const img = document.createElement('img')
				img.src = dataUri
				img.width = canvas.width
				img.height = canvas.height
				img.style.cssText = canvas.style.cssText
				img.className = canvas.className
				canvas.replaceWith(img)
			} catch {}
		})

		snapCount++
		const num = snapCount
		showToast(`Capturing #${num}...`)
		btn.classList.add('capturing')

		// ── Slow phase: CDP + storage runs in background ──
		chrome.runtime
			.sendMessage({
				type: 'CAPTURE_SNAPSHOT',
				computedStyles,
				css,
				description,
				url: location.href,
				title: document.title,
			})
			.then(response => {
				if (response?.success) {
					showToast(`#${num} saved! (${response.id})`)
				} else {
					showToast(`#${num} failed: ${response?.error}`, 4000)
				}
			})
			.catch(err => {
				showToast(`#${num} error: ${err.message}`, 4000)
				console.error('[DOM Snapshot]', err)
			})
			.finally(() => {
				// Only remove capturing state when no more pending
				snapCount--
				if (snapCount <= 0) {
					snapCount = 0
					btn.classList.remove('capturing')
				}
			})
	}

	btn.addEventListener('click', capture)

	// Listen for hotkey trigger from background (chrome.commands API)
	chrome.runtime.onMessage.addListener(msg => {
		if (msg.type === 'TRIGGER_CAPTURE') capture()
	})
})()
