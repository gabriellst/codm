#!/usr/bin/env bun
/**
 * merge-regenerate.ts — the `regenerate` git merge driver for COMMITTED GENERATOR OUTPUT.
 *
 * THE PROBLEM, MEASURED. `packages/client/dist/**` and `packages/contracts/generated/**` are
 * generator output that is nonetheless committed (the SDK has to exist before the app compiles,
 * and the wire bindings before either backend does). Audit S7 counted **53 commits of churn**
 * across those two roots. Every merge that touches them produces conflicts in files no human
 * wrote, and every one of those conflicts is resolved the same way: throw both sides away and
 * run the generator.
 *
 * WHAT THIS DRIVER DOES, AND WHAT IT DELIBERATELY DOES NOT. It takes `ours` and exits 0 — that
 * is the whole mechanism. It does NOT run `bun sdk` mid-merge, and the restraint is the design:
 * a merge driver runs inside git's index-manipulation window, where spawning a multi-minute
 * codegen that itself reads the tree being merged is how you get a half-written `dist/` with a
 * clean exit code.
 *
 * SO WHAT MAKES THE CONTENT CORRECT? `bun check:generated`, which REGENERATES and COMPARES, and
 * which is already a step of the battery (docs/CORRECTNESS.md). The authority over generated
 * bytes is the generator, invoked by a gate that can afford to take its time — never a conflict
 * resolution. This driver exists only so the merge does not STOP on bytes that are about to be
 * overwritten anyway. If the taken side is stale, `check:generated` says so by name.
 *
 * Wiring (both halves are required — `.gitattributes` alone does nothing):
 *   .gitattributes            declares which paths use the driver — committed, rides the train
 *   git config merge.regenerate.driver   declares what the driver IS — per clone, see below
 *
 * Git calls it as: <driver> %O %A %B %P
 *   %O ancestor  %A ours (the file git will keep)  %B theirs  %P the real pathname
 */

import { copyFileSync, existsSync } from 'node:fs'

/** The two roots whose bytes are a generator's, not an author's. Mirrored by `.gitattributes`. */
export const GENERATED_ROOTS = ['packages/client/dist', 'packages/contracts/generated'] as const

/** `git config` line a clone needs once so `.gitattributes` has something to point at. */
export const DRIVER_CONFIG_COMMAND = 'git config merge.regenerate.driver "bun scripts/sync/merge-regenerate.ts %O %A %B %P"' as const

export interface MergeInputs {
	ancestor: string
	ours: string
	theirs: string
	pathname: string
}

/**
 * Resolve one conflicted generated file: keep `ours`, report, succeed.
 * Returns the exit code git should see (0 = resolved).
 */
export function resolveGenerated(inputs: MergeInputs, log: (line: string) => void = console.log): number {
	if (!existsSync(inputs.ours)) {
		// `ours` is the file git keeps; without it there is nothing to resolve INTO, and failing
		// loudly beats writing a file git did not ask for.
		log(`merge=regenerate: ${inputs.pathname} — no 'ours' version at ${inputs.ours}; leaving the conflict for git`)
		return 1
	}
	log(
		`merge=regenerate: ${inputs.pathname} — generated output, kept 'ours' unmerged. ` +
			`The generator is the authority here: run 'bun check:generated' (it regenerates and compares) before pushing.`,
	)
	return 0
}

function main(argv: string[]): number {
	const [ancestor, ours, theirs, pathname] = argv
	if (ancestor === undefined || ours === undefined || theirs === undefined) {
		console.error(
			`merge-regenerate: expected git's driver arguments '%O %A %B %P' (got ${argv.length}). Wire it with:\n  ${DRIVER_CONFIG_COMMAND}`,
		)
		return 2
	}
	return resolveGenerated({ ancestor, ours, theirs, pathname: pathname ?? ours })
}

// `ours` is already the file at %A, so keeping it needs no write — but an explicit no-op copy
// keeps the intent readable if a future variant ever takes a different side.
export function keepOurs(ours: string, destination: string): void {
	if (ours !== destination) copyFileSync(ours, destination)
}

if (import.meta.main) process.exit(main(process.argv.slice(2)))
