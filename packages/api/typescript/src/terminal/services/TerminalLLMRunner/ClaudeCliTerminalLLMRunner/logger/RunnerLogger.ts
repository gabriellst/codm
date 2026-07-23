import { LOG_TIER_RANK, type LogTier, type ColorEnv, type Color, colorize, supportsColor, parseTier, GLYPH } from './format'

type Severity = 'info' | 'success' | 'warn' | 'error' | 'trace'

interface LineOpts {
	tier: LogTier
	severity: Severity
	glyph?: string
	label: string
	message?: string
}

export interface SectionHandle {
	field(label: string, value: string): void
	success(label: string, value?: string): void
	warn(label: string, value?: string): void
	close(): void
}

interface ConstructorOpts {
	tier?: LogTier
	envTier?: string | undefined
	sink?: (line: string) => void
	badge?: string
	colorEnv?: ColorEnv
	clock?: () => Date
}

const SEVERITY_COLOR: Record<Severity, Color> = {
	info: 'cyan',
	success: 'green',
	warn: 'yellow',
	error: 'red',
	trace: 'gray',
}

export class RunnerLogger {
	readonly tier: LogTier
	private readonly sink: (line: string) => void
	private readonly badge: string | undefined
	private readonly color: boolean
	private readonly clock: () => Date

	constructor(opts: ConstructorOpts = {}) {
		let resolvedTier: LogTier
		let envWarning: string | null = null
		if (opts.tier !== undefined) {
			resolvedTier = opts.tier
		} else if (opts.envTier !== undefined) {
			const parsed = parseTier(opts.envTier)
			resolvedTier = parsed.tier
			envWarning = parsed.warning
		} else {
			resolvedTier = 'info'
		}
		this.tier = resolvedTier
		this.sink = opts.sink ?? ((line: string) => process.stdout.write(`${line}\n`))
		this.badge = opts.badge
		const colorEnv: ColorEnv = opts.colorEnv ?? {
			isTTY: Boolean((process.stdout as { isTTY?: boolean }).isTTY),
			noColor: Boolean(process.env.NO_COLOR),
		}
		this.color = supportsColor(colorEnv)
		this.clock = opts.clock ?? (() => new Date())

		if (envWarning) {
			this.sink(this.formatError(envWarning, {}))
		}
	}

	scope(badge: string): RunnerLogger {
		return new RunnerLogger({
			tier: this.tier,
			sink: this.sink,
			badge,
			colorEnv: { isTTY: this.color, noColor: !this.color && false },
			clock: this.clock,
		})
	}

	section(title: string): SectionHandle {
		const start = this.clock()
		const header = this.formatSectionHeader(title)
		this.sink(header)
		const self = this
		return {
			field(label, value) {
				self.sink(self.formatSectionLine(GLYPH.diamond, label, value, 'info'))
			},
			success(label, value) {
				self.sink(self.formatSectionLine(GLYPH.success, label, value, 'success'))
			},
			warn(label, value) {
				self.sink(self.formatSectionLine(GLYPH.warn, label, value, 'warn'))
			},
			close() {
				const elapsedMs = self.clock().getTime() - start.getTime()
				self.sink(self.formatSectionFooter(elapsedMs))
			},
		}
	}

	line(opts: LineOpts): void {
		if (LOG_TIER_RANK[opts.tier] > LOG_TIER_RANK[this.tier]) return
		this.sink(this.formatLine(opts))
	}

	error(message: string, fields: Record<string, unknown> = {}): void {
		this.sink(this.formatError(message, fields))
	}

	private formatLine(opts: LineOpts): string {
		const ts = this.formatTimestamp(this.clock())
		const badgeSegment = this.badge ? `  ${this.badge}` : ''
		const glyph = opts.glyph ?? GLYPH.bullet
		const labelColor = SEVERITY_COLOR[opts.severity]
		const label = colorize(opts.label, labelColor, this.color)
		const message = opts.message ? `  ${opts.message}` : ''
		return `${ts}  claude-cli${badgeSegment}  ${glyph} ${label}${message}`
	}

	private formatSectionHeader(title: string): string {
		const badgeSegment = this.badge ? ` · ${this.badge}` : ''
		const titleText = colorize(title, 'cyan', this.color)
		return `┌─ claude-cli${badgeSegment} · ${titleText} ${'─'.repeat(40)}`
	}

	private formatSectionLine(glyph: string, label: string, value: string | undefined, severity: Severity): string {
		const labelColor = SEVERITY_COLOR[severity]
		const padded = colorize(label.padEnd(10), labelColor, this.color)
		const valueText = value ? `  ${value}` : ''
		return `│ ${glyph} ${padded}${valueText}`
	}

	private formatSectionFooter(elapsedMs: number): string {
		const dur = elapsedMs >= 1000 ? `${(elapsedMs / 1000).toFixed(1)}s` : `${elapsedMs}ms`
		return `└─ ${colorize(dur, 'dim', this.color)}`
	}

	private formatError(message: string, fields: Record<string, unknown>): string {
		const ts = this.formatTimestamp(this.clock())
		const badgeSegment = this.badge ? `  ${this.badge}` : ''
		const text = colorize(message, 'red', this.color)
		const fieldText = Object.keys(fields).length > 0 ? `  ${JSON.stringify(fields)}` : ''
		return `${ts}  claude-cli${badgeSegment}  ${GLYPH.error} ${text}${fieldText}`
	}

	private formatTimestamp(d: Date): string {
		const hh = String(d.getUTCHours()).padStart(2, '0')
		const mm = String(d.getUTCMinutes()).padStart(2, '0')
		const ss = String(d.getUTCSeconds()).padStart(2, '0')
		return `${hh}:${mm}:${ss}`
	}
}
