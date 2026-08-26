/* eslint-env browser, webextensions */
/* global chrome, URL, TextEncoder, Uint8Array, btoa, fetch */
/**
 * Background service worker — uses chrome.debugger API to call
 * DOMSnapshot.captureSnapshot (same CDP protocol as recorder.ts).
 *
 * Snapshot validation and capture logic comes from lib/cdp-snapshot.ts
 * (shared with e2e/utils/recorder.ts). Reconstruction into HTML/SVG/JSON
 * happens here in the service worker so files land on disk at capture time
 * instead of accumulating in chrome.storage.local.
 *
 * Captures are queued per-tab since chrome.debugger only allows one
 * session per tab at a time.
 */

import { getValidComputedStyles, captureSnapshot } from './lib/cdp-snapshot.js'
import { reconstructHtml, reconstructSvg, collectImageUrls } from './lib/reconstruct.js'

/** Wrap chrome.debugger as a CDPTransport (same interface as Playwright CDPSession). */
function chromeTransport(debuggee) {
	return {
		send: (method, params) => chrome.debugger.sendCommand(debuggee, method, params),
	}
}

// ── Per-tab capture queue (CDP only allows 1 session per tab) ──

const tabQueues = new Map()

function enqueueCapture(tabId, task) {
	if (!tabQueues.has(tabId)) tabQueues.set(tabId, Promise.resolve())
	const queued = tabQueues
		.get(tabId)
		.then(task)
		.catch(() => {})
	tabQueues.set(tabId, queued)
	return queued
}

// Forward keyboard shortcut to content script
chrome.commands.onCommand.addListener(async command => {
	if (command === 'take-snapshot') {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
		if (tab?.id) {
			chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_CAPTURE' })
		}
	}
})

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	if (msg.type === 'CAPTURE_SNAPSHOT') {
		const tabId = sender.tab.id
		enqueueCapture(tabId, () => handleCapture(msg, sender))
			.then(sendResponse)
			.catch(err => sendResponse({ success: false, error: err.message }))
		return true
	}

	if (msg.type === 'LIST_SNAPSHOTS') {
		listSnapshots().then(sendResponse)
		return true
	}

	if (msg.type === 'REMOVE_SNAPSHOT') {
		removeSnapshot(msg.domain, msg.id).then(sendResponse)
		return true
	}
})

async function handleCapture(msg, sender) {
	const tabId = sender.tab.id
	const debuggee = { tabId }

	try {
		await chrome.debugger.attach(debuggee, '1.3')
		await chrome.debugger.sendCommand(debuggee, 'DOMSnapshot.enable')

		const cdp = chromeTransport(debuggee)
		const computedStyles = await getValidComputedStyles(cdp, msg.computedStyles)
		const snapshot = await captureSnapshot(cdp, computedStyles)

		await chrome.debugger.detach(debuggee)

		const url = new URL(msg.url)
		const domain = url.hostname
		const route = url.pathname.replace(/\//g, '_').replace(/^_/, '') || 'root'
		const desc = (msg.description || '')
			.trim()
			.replace(/[^a-zA-Z0-9À-ɏ _-]/g, '')
			.replace(/\s+/g, '-')
			.toLowerCase()

		const id = await nextId(domain, route, desc)
		const base = `snapshots/${domain}/${id}`
		const css = msg.css || ''

		const imageMap = await resolveImageMap(snapshot)
		const html = reconstructHtml(snapshot, computedStyles, css, imageMap)
		const svg = reconstructSvg(snapshot, computedStyles, css, imageMap)
		const json = JSON.stringify({ snapshot, computedStyles, css })

		const [htmlId, svgId, jsonId] = await Promise.all([
			saveFile(`${base}.html`, html, 'text/html'),
			saveFile(`${base}.svg`, svg, 'image/svg+xml'),
			saveFile(`${base}.json`, json, 'application/json'),
		])

		const entry = {
			id,
			route,
			description: msg.description || '',
			url: msg.url,
			title: msg.title,
			timestamp: Date.now(),
			basePath: base,
			downloads: { html: htmlId, svg: svgId, json: jsonId },
		}

		await addIndexEntry(domain, entry)

		return { success: true, id, domain, basePath: base }
	} catch (err) {
		try {
			await chrome.debugger.detach(debuggee)
		} catch {}
		return { success: false, error: err.message }
	}
}

function saveFile(filename, data, mimeType) {
	const dataUrl = toDataUrl(data, mimeType)
	return new Promise((resolve, reject) => {
		chrome.downloads.download({ url: dataUrl, filename, saveAs: false }, downloadId => {
			if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
			else resolve(downloadId)
		})
	})
}

function toDataUrl(data, mimeType) {
	const bytes = new TextEncoder().encode(data)
	return `data:${mimeType};base64,${bytesToBase64(bytes)}`
}

function bytesToBase64(bytes) {
	let binary = ''
	const chunkSize = 0x8000
	for (let i = 0; i < bytes.length; i += chunkSize) {
		binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize))
	}
	return btoa(binary)
}

async function resolveImageMap(snapshot) {
	const urls = collectImageUrls(snapshot)
	if (urls.length === 0) return {}
	const imageMap = {}
	await Promise.all(
		urls.map(async url => {
			try {
				const res = await fetch(url)
				if (!res.ok) return
				const blob = await res.blob()
				const bytes = new Uint8Array(await blob.arrayBuffer())
				imageMap[url] = `data:${blob.type};base64,${bytesToBase64(bytes)}`
			} catch {}
		}),
	)
	return imageMap
}

// ── Session-only index (no heavy payload — files live on disk) ──

async function nextId(domain, route, desc) {
	const entries = await getIndex(domain)
	const base = desc ? `${route}_${desc}` : route
	const sameBase = entries.filter(e => e.id === base || e.id.startsWith(`${base}-`))
	const seq = sameBase.length > 0 ? `-${sameBase.length + 1}` : ''
	return `${base}${seq}`
}

async function getIndex(domain) {
	const key = `index:${domain}`
	return (await chrome.storage.session.get(key))[key] || []
}

async function addIndexEntry(domain, entry) {
	const key = `index:${domain}`
	const entries = await getIndex(domain)
	entries.push(entry)
	await chrome.storage.session.set({ [key]: entries })

	const domains = (await chrome.storage.session.get('domains')).domains || []
	if (!domains.includes(domain)) {
		domains.push(domain)
		await chrome.storage.session.set({ domains })
	}
}

async function listSnapshots() {
	const domains = (await chrome.storage.session.get('domains')).domains || []
	const result = {}
	for (const domain of domains) {
		result[domain] = await getIndex(domain)
	}
	return result
}

async function removeSnapshot(domain, id) {
	const key = `index:${domain}`
	const entries = await getIndex(domain)
	const filtered = entries.filter(e => e.id !== id)
	await chrome.storage.session.set({ [key]: filtered })
	if (filtered.length === 0) {
		const domains = (await chrome.storage.session.get('domains')).domains || []
		await chrome.storage.session.set({ domains: domains.filter(d => d !== domain) })
	}
	return { success: true }
}
