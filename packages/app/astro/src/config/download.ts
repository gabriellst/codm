/**
 * Downloads da landing — a tabela DECLARADA por plataforma. Única fonte: Nav, Hero, card de preço e
 * Footer leem daqui; nada mais na landing conhece uma URL de instalador.
 *
 * As URLs são aliases FIXOS do canal stable no R2 (`stable/<nome-fixo>`): o workflow
 * `release-stable` regrava cada alias apontando para a versão recém-cortada, então a landing nunca
 * precisa saber a versão. Os nomes são os MESMOS que os workflows publicam (`codm-<arch>.<ext>`) —
 * `download.test.ts` trava a lista; mudar um lado sem o outro quebra o botão em silêncio (404 no
 * clique, build verde).
 *
 * A página é estática (`output: 'static'`), então a escolha do sistema é progressive enhancement:
 * o servidor renderiza o CTA com `DEFAULT_DOWNLOAD` (macOS, o alvo original) e
 * `components/DownloadDetect.astro` troca href/rótulo/ícone no cliente a partir de
 * `detectDownloadOs`. A detecção é uma função PURA sobre strings (UA + `userAgentData.platform`),
 * testada sem browser. Copy segue agnóstica de plataforma ("computador"); os nomes macOS / Windows /
 * Linux aparecem só aqui, no passo do download.
 */
export const R2_PUBLIC_BASE = 'https://pub-ae0c8cac60c94920b35464575c09e67d.r2.dev'

export type DownloadOs = 'macos' | 'windows' | 'linux'
/** Subconjunto de `IconName` (components/Icon.astro). Linux usa o glifo genérico de download —
 *  um Tux fiel não cabe no vocabulário de 24px traçado à mão do Icon.astro. */
export type DownloadIcon = 'apple' | 'windows' | 'download'

export interface DownloadEntry {
	/** Estável — vira `data-download-key` no HTML e chave de teste. */
	key: 'darwin-aarch64-dmg' | 'windows-x86_64-setup' | 'linux-x86_64-appimage' | 'linux-x86_64-deb'
	os: DownloadOs
	/** Nome próprio do sistema — não traduz. Preenche `{platform}` nos rótulos do content. */
	label: string
	/** Qualificador neutro de idioma (arquitetura · formato), mostrado na lista "outras plataformas". */
	detail: string
	icon: DownloadIcon
	url: string
}

const stable = (asset: string) => `${R2_PUBLIC_BASE}/stable/${asset}`

/**
 * A soma SHA-256 de cada instalador do canal estável, publicada pelo job de release a partir dos
 * MESMOS arquivos que ele sobe (nunca recalculada depois).
 *
 * Existe por causa do Windows: aquele instalador não tem assinatura Authenticode, então o navegador
 * o chama de suspeito e o sistema repete o aviso ao executar. Enquanto não houver certificado, o
 * checksum é a única coisa que oferecemos a quem prefere conferir o arquivo a confiar na palavra de
 * um site — e o alias tem nome fixo, como os instaladores, para que o link não envelheça a cada
 * versão.
 */
export const CHECKSUMS_URL = stable('SHA256SUMS.txt')

const MACOS: DownloadEntry = {
	key: 'darwin-aarch64-dmg',
	os: 'macos',
	label: 'macOS',
	detail: 'Apple Silicon · .dmg',
	icon: 'apple',
	url: stable('codm-aarch64.dmg'),
}
const WINDOWS: DownloadEntry = {
	key: 'windows-x86_64-setup',
	os: 'windows',
	label: 'Windows',
	detail: 'x64 · .exe',
	icon: 'windows',
	url: stable('codm-windows-x86_64-setup.exe'),
}
const LINUX_APPIMAGE: DownloadEntry = {
	key: 'linux-x86_64-appimage',
	os: 'linux',
	label: 'Linux',
	detail: 'x64 · .AppImage',
	icon: 'download',
	url: stable('codm-linux-x86_64.AppImage'),
}
const LINUX_DEB: DownloadEntry = {
	key: 'linux-x86_64-deb',
	os: 'linux',
	label: 'Linux',
	detail: 'x64 · .deb',
	icon: 'download',
	url: stable('codm-linux-x86_64.deb'),
}

/** Ordem = ordem da lista "outras plataformas". */
export const DOWNLOADS: readonly DownloadEntry[] = [MACOS, WINDOWS, LINUX_APPIMAGE, LINUX_DEB]

/** O que o HTML estático mostra antes (ou na ausência) de JS. */
export const DEFAULT_DOWNLOAD: DownloadEntry = MACOS

/** CTA principal por sistema — DECLARADO, não derivado por busca: Linux prefere o AppImage, o
 *  formato que o updater atualiza; o .deb fica na lista para quem quer o pacote. */
export const PRIMARY_DOWNLOAD: Record<DownloadOs, DownloadEntry> = {
	macos: MACOS,
	windows: WINDOWS,
	linux: LINUX_APPIMAGE,
}

/** Glifos que um CTA carrega no HTML (todos; só o do entry ativo fica visível) — DERIVADO da
 *  tabela: um ícone novo numa entry entra aqui sozinho, sem segunda lista para esquecer. */
export const DOWNLOAD_ICONS: readonly DownloadIcon[] = [...new Set(DOWNLOADS.map(d => d.icon))]

type Verdict = DownloadOs | 'none'

/** Regras em ordem de precedência sobre UMA string (hint ou UA). Mobile vem primeiro porque a UA
 *  do Android contém "Linux" e a do iPhone contém "Mac OS X" — um celular não baixa instalador. */
const OS_RULES: readonly { pattern: RegExp; verdict: Verdict }[] = [
	{ pattern: /android|iphone|ipad|ipod/i, verdict: 'none' },
	{ pattern: /windows/i, verdict: 'windows' },
	{ pattern: /mac os x|macintosh|macos/i, verdict: 'macos' },
	{ pattern: /linux|x11/i, verdict: 'linux' },
]

function classify(s: string): Verdict | undefined {
	for (const rule of OS_RULES) if (rule.pattern.test(s)) return rule.verdict
	return undefined
}

/**
 * `platformHint` = `navigator.userAgentData.platform` (Chromium: "Windows" / "macOS" / "Linux" /
 * "Android") — mais confiável que a UA congelada; a UA é o fallback (Safari, Firefox). Um hint que
 * nenhuma regra reconhece cai na UA. `undefined` = não reconhecido ou mobile → o chamador mantém
 * `DEFAULT_DOWNLOAD`.
 */
export function detectDownloadOs(userAgent: string, platformHint?: string): DownloadOs | undefined {
	const verdict = (platformHint ? classify(platformHint) : undefined) ?? classify(userAgent)
	return verdict === 'none' ? undefined : verdict
}

/** Preenche o `{platform}` do rótulo do content ("Download para {platform}") com o nome próprio. */
export function downloadLabel(template: string, entry: DownloadEntry): string {
	return template.replace('{platform}', entry.label)
}
