import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

// A marca legada do sistema de origem é montada POR PARTES: este arquivo não a soletra, para que
// nem o detector carregue o nome que ele caça (grafias colada / kebab / SNAKE derivam daqui).
const LEGACY_PARTS = ['bk', 'dash']
const LEGACY_KEBAB = LEGACY_PARTS.join('-')
const LEGACY_SNAKE = LEGACY_PARTS.join('_').toUpperCase()

/**
 * Product-residue guard — the W6 close-out rail of the de-template reorg.
 *
 * The base template is GENERIC: no e-commerce platform names, no Store-tenancy identifiers, no
 * legacy product branding may appear in live code, in the skills that teach it, or in the exemplars
 * that demonstrate it. Product-specific vocabulary re-enters ONLY via a product fork (which retires
 * this rail's patterns deliberately).
 *
 * Patterns (all case-insensitive, source-text scan — molde `console-discipline.test.ts`):
 *   - E-commerce platform names purged in W3/W5: kiwify, nuvemshop, cartpanda, yampi.
 *   - Store-tenancy identifiers purged with the owner-model collapse: useTenancyStore,
 *     TenancyScope, SINGLE_STORE, MULTI_STORE, storeVisualizations / store_visualizations.
 *   - Legacy origin branding (the @template rebrand, W4; assembled from LEGACY_PARTS). NOTE: matched as a token —
 *     provenance references to the EXTERNAL sibling repos live only in exempt lines/dirs.
 *
 * SCOPE: packages/ + scripts/ + .claude/skills/ + examples/ — TS/TSX/Go/JSON/YAML/CSS/MD.
 * Skills and exemplars joined the scan with the docs sweep that sanitized them: skills teach with
 * live (or neutral-exemplar) identifiers, and examples/ carry purged vocabulary renamed to neutral
 * identifiers — so residue must not resurface in either. EXEMPT (by design, not by laziness):
 *   - scripts/skill-evals/    — synthetic eval fixtures simulate product code.
 *   - .plans/ + .specs/       — decision history names what was removed (outside the scan roots).
 *   - nested `.claude/` dirs under scan roots (e.g. packages/api/typescript/.claude/) — harness /
 *     runner config whose pointers into .plans/ history carry legacy names in FILE PATHS. The
 *     repo-top `.claude/skills` is scanned explicitly as its own root, so this segment exemption
 *     never hides a skill.
 *   - PROVENANCE LINES in examples/ — the `CONTEXT-ORIGIN` header every exemplar file carries, and
 *     the quoted `git show` source bullets of a WANT.md provenance block, may name origin repos
 *     (the origin backend repo etc.). Line-scoped and examples/-only — exemplar BODY text is never exempt.
 *   - node_modules + local build artifacts of other repos.
 */

const REPO_ROOT = join(import.meta.dir, '..', '..', '..', '..', '..')

const PATTERNS: { name: string; re: RegExp }[] = [
	{ name: 'kiwify', re: /kiwify/i },
	{ name: 'nuvemshop', re: /nuvemshop/i },
	{ name: 'cartpanda', re: /cartpanda/i },
	{ name: 'yampi', re: /yampi/i },
	{ name: 'useTenancyStore', re: /useTenancyStore/ },
	{ name: 'TenancyScope', re: /\bTenancyScope\b/ },
	{ name: 'SINGLE_STORE/MULTI_STORE', re: /\b(SINGLE|MULTI)_STORE\b/ },
	{ name: 'storeVisualizations', re: /storeVisualizations|store_visualizations/ },
	// `[-_]?` cobre as TRÊS grafias que a marca legada assume: colada (identificador), kebab (nomes
	// de repo/branch) e SNAKE (que é como ela sobrevive em CONSTANTES — foi assim que uma constante
	// `<MARCA>_NAMESPACE` ficou citada por dois comentários muito depois de o identificador virar
	// `ID_NAMESPACE`). O detector nasceu cego justamente à grafia em que a marca mais dura: a que
	// fica em maiúscula.
	{ name: 'legacy-brand', re: new RegExp(LEGACY_PARTS.join('[-_]?'), 'i') },
]

const SCAN_ROOTS = ['packages', 'scripts', '.claude/skills', 'examples']
const EXTENSIONS = ['.ts', '.tsx', '.go', '.json', '.yaml', '.yml', '.css', '.md']
// `.output`/`.astro`/`dist` under app packages are LOCAL BUILD ARTIFACTS (gitignored) — exempt.
// `packages/client/dist` + `packages/contracts/generated` are COMMITTED generated output — scanned.
// `.claude` as a NESTED segment exempts harness/runner config under packages (see doc comment);
// the `.claude/skills` scan root starts inside it, so skills themselves stay fully scanned.
// `tmp` and `target` are WRITTEN BY TESTS while this scan may be walking them from another nx
// process, and a file that vanishes between `readdirSync` and `readFileSync` makes this rail die
// with ENOENT instead of reporting anything — which is how it took down an unrelated PR (CI,
// 2026-08-27). `tmp/` is where `schema-drift.test.ts` puts its falsifier probe; `target/` is the
// cargo tree `emit-wire-rs.compile.test.ts` rewrites. Both are gitignored build/scratch space —
// machine-written, never authored — so nothing is lost by not reading them.
const EXEMPT_DIR_SEGMENTS = new Set(['node_modules', 'skill-evals', 'recordings', 'tmp', 'target', '.git', '.output', '.astro', '.claude'])
// The candidate queue lives with the eval machinery (scripts/skill-evals/candidates — already
// exempt as machinery); examples/ holds ONLY approved teaching content and is scanned whole.
const EXEMPT_PATH_RES = [/packages\/app\/[^/]+\/dist\//]
// This rail names its own patterns — the one file allowed to spell them out.
const SELF = 'packages/api/typescript/tests/architecture/product-residue.test.ts'

// Provenance lines in examples/ may name origin repos (the origin backend repo etc.): the CONTEXT-ORIGIN
// header every exemplar file carries, and the quoted `git show` source bullet of a WANT.md
// provenance block. Line-scoped, examples/-only — the same shapes anywhere else stay violations.
const WANT_PROVENANCE_BULLET_RE = /^>\s*-\s*`[^`]+`\s*$/
function isProvenanceLine(rel: string, lineText: string): boolean {
	if (!rel.startsWith('examples/')) return false
	if (lineText.includes('CONTEXT-ORIGIN')) return true
	return rel.endsWith('WANT.md') && WANT_PROVENANCE_BULLET_RE.test(lineText)
}

interface Violation {
	file: string
	line: number
	pattern: string
	text: string
}

function listFiles(dir: string, out: string[] = []): string[] {
	// Scan roots are declared aspirationally (examples/, app targets) — a product repo may have
	// removed some; a missing root is an empty scan, not a crash.
	if (!existsSync(dir)) return out
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name)
		if (entry.isDirectory()) {
			if (EXEMPT_DIR_SEGMENTS.has(entry.name)) continue
			listFiles(full, out)
		} else if (EXTENSIONS.some(ext => entry.name.endsWith(ext))) {
			out.push(full)
		}
	}
	return out
}

function scan(root: string): Violation[] {
	const violations: Violation[] = []
	for (const scanRoot of SCAN_ROOTS) {
		for (const file of listFiles(join(root, scanRoot))) {
			const rel = relative(root, file).split('\\').join('/')
			if (rel === SELF || EXEMPT_PATH_RES.some(re => re.test(rel))) continue
			const lines = readFileSync(file, 'utf8').split('\n')
			lines.forEach((lineText, idx) => {
				if (isProvenanceLine(rel, lineText)) return
				for (const { name, re } of PATTERNS) {
					if (re.test(lineText)) violations.push({ file: rel, line: idx + 1, pattern: name, text: lineText.trim().slice(0, 120) })
				}
			})
		}
	}
	return violations
}

describe('product-residue (base template stays generic — purged product vocabulary never returns)', () => {
	test('no purged platform / Store-tenancy / legacy-brand token in live packages+scripts+skills+examples', () => {
		const violations = scan(REPO_ROOT)
		const report = violations.map(v => `  ${v.file}:${v.line}  [${v.pattern}]  →  ${v.text}`).join('\n')
		expect(
			violations.length,
			`Purged product vocabulary resurfaced — the base template (incl. its skills and exemplars) is ` +
				`generic. Rename to a live or neutral identifier (see the sanitized exemplars in examples/), ` +
				`move it to scripts/skill-evals/ (fixture), or take it to a product fork:\n${report}`,
		).toBe(0)
	})

	// Negative fixture — proves the scan catches an offender in every root and honors the line-scoped
	// provenance exemption (temp dir, not the real tree).
	test('fixture: offenders in packages/, .claude/skills/ and examples/ bodies are flagged; provenance lines in examples/, nested .claude config, scratch and build output are not', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'product-residue-fixture-'))
		const write = (p: string, c: string) => {
			mkdirSync(p.slice(0, p.lastIndexOf('/')), { recursive: true })
			writeFileSync(p, c)
		}
		try {
			// packages/ + scripts/ — platform token and tenancy identifier flagged; a generic word is not.
			write(join(tmpRoot, 'packages', 'x', 'a.ts'), `const url = 'https://api.kiwify.com/webhook'\n`)
			write(join(tmpRoot, 'packages', 'x', 'b.ts'), `import { useTenancyStore } from '@/stores'\n`)
			write(join(tmpRoot, 'packages', 'x', 'c.ts'), `const store = createStore() // a Zustand store — fine\n`)
			write(join(tmpRoot, 'scripts', 'd.ts'), `// ok file\n`)
			// .claude/skills — a skill doc teaching with a purged identifier is flagged (.md now scanned).
			write(join(tmpRoot, '.claude', 'skills', 'store', 'SKILL.md'), `seed the mode via TenancyScope\n`)
			// Nested .claude under packages — harness/runner config, exempt as a dir segment.
			write(join(tmpRoot, 'packages', 'api', '.claude', 'runner.local.md'), `--prompt-file .plans/${LEGACY_KEBAB}-x.md\n`)
			// examples/ — CONTEXT-ORIGIN headers and WANT.md provenance bullets may name origin repos;
			// exemplar BODY text may not.
			write(
				join(tmpRoot, 'examples', 'pair', 'GOT', 'x.ts'),
				`// CONTEXT-ORIGIN: ${LEGACY_KEBAB}-backend@main (2026-06-12) — exemplar\nexport const ok = 1\n`,
			)
			write(
				join(tmpRoot, 'examples', 'pair', 'WANT.md'),
				`> **Provenance:**\n> - \`${LEGACY_KEBAB}-backend:.plans/some-plan.md\`\n\nbody text naming MULTI_STORE is residue\n`,
			)
			// The provenance shapes do NOT bleed outside examples/ — the same header in packages/ is flagged.
			write(join(tmpRoot, 'packages', 'x', 'e.ts'), `// CONTEXT-ORIGIN: ${LEGACY_KEBAB}-backend@main\n`)
			// SNAKE_CASE é a grafia em que a marca sobrevive dentro de CONSTANTES, e era exatamente a
			// que o detector não via. Esta linha é a fixture negativa da F3/T7: reverta o `[-_]?` do
			// padrão `legacy-brand` e SÓ este arquivo sai da lista — o alargamento é o que a segura.
			write(join(tmpRoot, 'packages', 'x', 'f.ts'), `export const ${LEGACY_SNAKE}_NAMESPACE = 'x'\n`)
			// Scratch and build output are not authored text, and both are rewritten by other suites
			// while this one walks — see EXEMPT_DIR_SEGMENTS. Neither is read.
			write(join(tmpRoot, 'packages', 'contracts', 'tmp', 'probe', 'nudged.ts'), `// kiwify\n`)
			write(join(tmpRoot, 'packages', 'contracts', 'generated', 'rust', 'target', 'debug', 'x.json'), `{"crate":"kiwify"}\n`)

			const hits = scan(tmpRoot)

			expect(hits.map(v => `${v.file} [${v.pattern}]`).sort()).toEqual([
				'.claude/skills/store/SKILL.md [TenancyScope]',
				'examples/pair/WANT.md [SINGLE_STORE/MULTI_STORE]',
				'packages/x/a.ts [kiwify]',
				'packages/x/b.ts [useTenancyStore]',
				'packages/x/e.ts [legacy-brand]',
				'packages/x/f.ts [legacy-brand]',
			])
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})
})
