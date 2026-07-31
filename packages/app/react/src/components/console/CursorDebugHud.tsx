import { useEffect, useState } from 'react'

/**
 * TEMPORARY debug instrument — remove after the macOS cursor investigation.
 * Shows, live, what the DOM hit-test sees under the pointer: the element, its computed
 * cursor, and the coordinates. If this reads `pointer` while the OS icon shows an arrow,
 * the DOM layer is fine and the defect is in the native cursor pipeline (WKWebView/AppKit).
 */
export function CursorDebugHud() {
	const [info, setInfo] = useState('move the mouse')

	useEffect(() => {
		const onMove = (e: MouseEvent) => {
			const el = document.elementFromPoint(e.clientX, e.clientY)
			const cursor = el ? getComputedStyle(el).cursor : '—'
			const tag = el ? `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 24)}` : '—'
			setInfo(`x:${e.clientX} y:${e.clientY} | cursor:${cursor} | ${tag}`)
		}
		window.addEventListener('mousemove', onMove)
		return () => window.removeEventListener('mousemove', onMove)
	}, [])

	return (
		<div
			style={{
				position: 'fixed',
				bottom: 8,
				left: 8,
				zIndex: 9999,
				pointerEvents: 'none',
				background: 'rgba(0,0,0,0.85)',
				color: '#0f0',
				font: '12px/1.4 monospace',
				padding: '6px 10px',
				borderRadius: 6,
				whiteSpace: 'nowrap',
			}}
		>
			{info}
		</div>
	)
}
