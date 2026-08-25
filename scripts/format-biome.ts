import { spawnSync } from 'node:child_process'

function gitFiles(args: string[]): string[] {
	const result = spawnSync('git', args, { encoding: 'utf8' })
	if (result.status !== 0) {
		process.stderr.write(result.stderr)
		process.exit(result.status ?? 1)
	}
	return result.stdout
		.split('\n')
		.map(file => file.trim())
		.filter(Boolean)
}

const changed = gitFiles(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD', '--'])
const untracked = gitFiles(['ls-files', '--others', '--exclude-standard'])
const files = [...new Set([...changed, ...untracked])]

if (files.length === 0) {
	console.log('No changed files to format.')
	process.exit(0)
}

const result = spawnSync('bun', ['x', 'biome', 'format', '--write', '--no-errors-on-unmatched', ...files], {
	stdio: 'inherit',
})

process.exit(result.status ?? 1)
