import { describe, it, expect } from 'bun:test'
import { RunnerLogger } from './RunnerLogger'

function captureLogger(opts: { tier?: 'quiet' | 'info' | 'verbose' | 'trace' } = {}) {
	const lines: string[] = []
	const logger = new RunnerLogger({
		tier: opts.tier,
		sink: (line: string) => {
			lines.push(line)
		},
		colorEnv: { isTTY: false, noColor: false },
		clock: () => new Date('2026-05-20T16:32:10Z'),
	})
	return { logger, lines }
}

describe('RunnerLogger', () => {
	describe('scope', () => {
		it('binds a session badge to all subsequent lines', () => {
			const { logger, lines } = captureLogger()
			const scoped = logger.scope('#a1b2')
			scoped.line({ tier: 'info', severity: 'info', label: 'turn', message: 'hi' })
			expect(lines[0]).toContain('#a1b2')
		})
	})

	describe('section (atomic, boxed)', () => {
		it('opens with a header, accepts fields, closes with duration footer', () => {
			const { logger, lines } = captureLogger()
			const section = logger.scope('#a1b2').section('spawn')
			section.field('bin', '~/.local/bin/claude')
			section.success('ready', '1.5s')
			section.close()
			expect(lines.join('\n')).toContain('claude-cli')
			expect(lines.join('\n')).toContain('#a1b2')
			expect(lines.join('\n')).toContain('spawn')
			expect(lines.join('\n')).toContain('bin')
			expect(lines.join('\n')).toContain('~/.local/bin/claude')
			expect(lines.join('\n')).toContain('ready')
			expect(lines.some(l => l.startsWith('└'))).toBe(true)
		})
	})

	describe('line (long-lived, streamed)', () => {
		it('renders HH:MM:SS timestamp + claude-cli + badge + glyph + label + message', () => {
			const { logger, lines } = captureLogger()
			logger.scope('#a1b2').line({
				tier: 'info',
				severity: 'info',
				glyph: '▶',
				label: 'turn',
				message: 'build me a hello world (28ch)',
			})
			expect(lines[0]).toContain('16:32:10')
			expect(lines[0]).toContain('claude-cli')
			expect(lines[0]).toContain('#a1b2')
			expect(lines[0]).toContain('▶')
			expect(lines[0]).toContain('turn')
			expect(lines[0]).toContain('build me a hello world (28ch)')
		})
	})

	describe('tier filtering', () => {
		it('drops lines above the configured tier', () => {
			const { logger, lines } = captureLogger({ tier: 'info' })
			logger.line({ tier: 'verbose', severity: 'info', label: 'jsonl', message: 'x' })
			logger.line({ tier: 'trace', severity: 'info', label: 'pty-data', message: 'y' })
			expect(lines).toHaveLength(0)
		})

		it('emits lines at or below the configured tier', () => {
			const { logger, lines } = captureLogger({ tier: 'verbose' })
			logger.line({ tier: 'info', severity: 'info', label: 'turn', message: 'a' })
			logger.line({ tier: 'verbose', severity: 'info', label: 'jsonl', message: 'b' })
			logger.line({ tier: 'trace', severity: 'info', label: 'pty-data', message: 'c' })
			expect(lines).toHaveLength(2)
		})

		it('error() is always emitted regardless of tier', () => {
			const { logger, lines } = captureLogger({ tier: 'quiet' })
			logger.error('boot failed', { exitCode: 1 })
			expect(lines).toHaveLength(1)
			expect(lines[0]).toContain('boot failed')
			expect(lines[0]).toContain('exitCode')
		})
	})

	describe('color drop', () => {
		it('emits plain ASCII when colorEnv.isTTY is false', () => {
			const { logger, lines } = captureLogger()
			logger.line({ tier: 'info', severity: 'error', label: 'crash', message: 'x' })
			expect(lines[0]).not.toContain('\x1b[')
		})
	})

	describe('tier exposure', () => {
		it('exposes the resolved tier publicly', () => {
			const { logger } = captureLogger({ tier: 'verbose' })
			expect(logger.tier).toBe('verbose')
		})
	})

	describe('invalid tier warning', () => {
		it('prints a deprecation warning when constructed with an invalid env tier', () => {
			const lines: string[] = []
			new RunnerLogger({
				envTier: 'debug',
				sink: line => {
					lines.push(line)
				},
				colorEnv: { isTTY: false, noColor: false },
				clock: () => new Date('2026-05-20T16:32:10Z'),
			})
			expect(lines.some(l => l.includes('debug') && l.includes('info'))).toBe(true)
		})
	})
})
