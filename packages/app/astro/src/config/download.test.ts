import { describe, expect, it } from 'bun:test'
import { DEFAULT_DOWNLOAD, DOWNLOADS, PRIMARY_DOWNLOAD, R2_PUBLIC_BASE, detectDownloadOs, downloadLabel } from './download'

const UA = {
	winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
	macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
	linuxFirefox: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:129.0) Gecko/20100101 Firefox/129.0',
	android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
	iphone:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
}

describe('config/download — a tabela declarada (única fonte dos CTAs)', () => {
	it('os aliases são EXATAMENTE os que release-stable regrava no R2 — o contrato com os workflows', () => {
		// O falsificador: renomear um asset num lado só. O build fica verde e o botão 404a no clique.
		expect(DOWNLOADS.map(d => d.url)).toEqual([
			`${R2_PUBLIC_BASE}/stable/codm-aarch64.dmg`,
			`${R2_PUBLIC_BASE}/stable/codm-windows-x86_64-setup.exe`,
			`${R2_PUBLIC_BASE}/stable/codm-linux-x86_64.AppImage`,
			`${R2_PUBLIC_BASE}/stable/codm-linux-x86_64.deb`,
		])
	})

	it('chaves únicas, cada uma com os/label/icon coerentes', () => {
		expect(new Set(DOWNLOADS.map(d => d.key)).size).toBe(DOWNLOADS.length)
		expect(DOWNLOADS.map(d => [d.os, d.label, d.icon])).toEqual([
			['macos', 'macOS', 'apple'],
			['windows', 'Windows', 'windows'],
			['linux', 'Linux', 'download'],
			['linux', 'Linux', 'download'],
		])
	})

	it('o servidor renderiza macOS; o CTA principal do Linux é o AppImage (o formato que o updater atualiza)', () => {
		expect(DEFAULT_DOWNLOAD.key).toBe('darwin-aarch64-dmg')
		expect(PRIMARY_DOWNLOAD.macos.key).toBe('darwin-aarch64-dmg')
		expect(PRIMARY_DOWNLOAD.windows.key).toBe('windows-x86_64-setup')
		expect(PRIMARY_DOWNLOAD.linux.key).toBe('linux-x86_64-appimage')
	})
})

describe('detectDownloadOs — pura sobre UA + userAgentData.platform', () => {
	it('reconhece desktop Windows / macOS / Linux pela UA', () => {
		expect(detectDownloadOs(UA.winChrome)).toBe('windows')
		expect(detectDownloadOs(UA.macSafari)).toBe('macos')
		expect(detectDownloadOs(UA.linuxFirefox)).toBe('linux')
	})

	it('celular não recebe instalador — Android contém "Linux" e iPhone contém "Mac OS X"; ambos ficam no default', () => {
		expect(detectDownloadOs(UA.android)).toBeUndefined()
		expect(detectDownloadOs(UA.iphone)).toBeUndefined()
	})

	it('o hint de userAgentData.platform vence a UA (Chromium congela a UA; o hint é a verdade)', () => {
		expect(detectDownloadOs(UA.linuxFirefox, 'Windows')).toBe('windows')
		expect(detectDownloadOs(UA.winChrome, 'macOS')).toBe('macos')
		expect(detectDownloadOs(UA.winChrome, 'Android')).toBeUndefined()
		// hint desconhecido cai na UA, não no default
		expect(detectDownloadOs(UA.linuxFirefox, 'Unknown')).toBe('linux')
	})

	it('UA vazia ou irreconhecível → undefined (o chamador mantém DEFAULT_DOWNLOAD)', () => {
		expect(detectDownloadOs('')).toBeUndefined()
		expect(detectDownloadOs('curl/8.4.0')).toBeUndefined()
	})
})

describe('downloadLabel — preenche o {platform} do content com o nome próprio', () => {
	it('substitui o placeholder', () => {
		expect(downloadLabel('Download para {platform}', PRIMARY_DOWNLOAD.windows)).toBe('Download para Windows')
		expect(downloadLabel('Download for {platform}', PRIMARY_DOWNLOAD.linux)).toBe('Download for Linux')
	})

	it('rótulo sem placeholder (Nav: "Baixar") volta intacto', () => {
		expect(downloadLabel('Baixar', PRIMARY_DOWNLOAD.macos)).toBe('Baixar')
	})
})
