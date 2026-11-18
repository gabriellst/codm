import { IrreversibleActionKind } from '@codm/contracts-typescript/wire/enums'

/**
 * HOW LONG AN IRREVERSIBLE ACTION WAITS (fase 2, item 3 — janela de arrependimento).
 *
 * Long enough for a person who just saw "vou publicar" in the group to type "não, espera"; short enough
 * that a session doing what it was asked does not feel stuck. The CLI's own inactivity watchdog is three
 * minutes (`CODM_AGENT_INACTIVITY_MS`), so a hold of this size never reads as a hung turn.
 */
export const REGRET_WINDOW_MS = 20_000

/**
 * How long the CLI waits for the daemon's answer before giving up — and then the action GOES AHEAD (a
 * hook that fails is non-blocking; see the spec's decision on failing open). Generous on purpose: the
 * window plus the two mailbox reads must always fit, and only a daemon that stopped answering reaches it.
 */
export const REGRET_HOOK_TIMEOUT_S = 90

/**
 * One recognisable irreversible command. DATA, not a branch (Non-Negotiable 5): what counts as
 * "irreversible" is this table, read by one uniform function.
 *
 *  - `command` — the command itself, matched anywhere in ONE shell segment (after `&&`, `;`, `|`…), so
 *    `cd repo && git push` is caught and `git push --dry-run && npm publish` is judged per command;
 *  - `also` — a second condition the same segment must meet (what makes a push a FORCED push);
 *  - `except` — a flag that makes the command harmless (`--dry-run`): the segment does not count.
 *
 * ORDERED: the first entry that matches names the kind, which is why the forced push precedes the push.
 */
export interface IrreversibleActionPattern {
	readonly kind: IrreversibleActionKind
	readonly command: RegExp
	readonly also?: RegExp
	readonly except?: RegExp
}

/** A command word, not part of a path or a longer word (`my-git`, `./bin/npm-publish-helper`). */
const word = (body: string): RegExp => new RegExp(`(?<![\\w./-])${body}`)

/** `git [-C dir] [-c k=v] [--flag…] push` — global options may sit between `git` and the verb. */
const GIT_PUSH = word('git(?:\\s+-[cC]\\s+\\S+|\\s+--[\\w-]+(?:=\\S+)?)*\\s+push\\b')
const DRY_RUN = /\s(?:--dry-run|-n)(?=\s|$)/

export const IRREVERSIBLE_ACTIONS: readonly IrreversibleActionPattern[] = [
	{
		kind: IrreversibleActionKind.GIT_FORCE_PUSH,
		command: GIT_PUSH,
		also: /\s(?:--force(?:-with-lease|-if-includes)?(?:=\S+)?|-f|\+\S+)(?=\s|$)/,
		except: DRY_RUN,
	},
	{ kind: IrreversibleActionKind.GIT_PUSH, command: GIT_PUSH, except: DRY_RUN },
	{ kind: IrreversibleActionKind.PR_MERGE, command: word('gh\\s+pr\\s+merge\\b') },
	{ kind: IrreversibleActionKind.PR_MERGE, command: word('glab\\s+mr\\s+merge\\b') },
	{ kind: IrreversibleActionKind.RELEASE, command: word('gh\\s+release\\s+create\\b') },
	{
		kind: IrreversibleActionKind.PACKAGE_PUBLISH,
		command: word('(?:npm|pnpm|bun|cargo|poetry|gem|yarn(?:\\s+npm)?)\\s+publish\\b'),
		except: /\s--dry-run(?=\s|$)/,
	},
	{ kind: IrreversibleActionKind.PACKAGE_PUBLISH, command: word('twine\\s+upload\\b') },
	{ kind: IrreversibleActionKind.DEPLOY, command: word('railway\\s+(?:up|deploy|redeploy)\\b') },
	{ kind: IrreversibleActionKind.DEPLOY, command: word('wrangler\\s+(?:deploy|publish|pages\\s+deploy)\\b') },
	{ kind: IrreversibleActionKind.DEPLOY, command: word('(?:vercel|netlify)\\b'), also: /\s--prod(?:uction)?(?=\s|$|=)/ },
	{ kind: IrreversibleActionKind.DEPLOY, command: word('(?:fly|flyctl)\\s+deploy\\b') },
	{ kind: IrreversibleActionKind.DEPLOY, command: word('firebase\\s+deploy\\b') },
]

/** Where one shell command ends and the next begins — the unit a pattern is judged on. */
const SEGMENT_BREAK = /&&|\|\||[;|\n]|\$\(|`/

/**
 * Which irreversible action, if any, this shell command performs — `undefined` for everything else.
 *
 * A RECOGNISER, not a sandbox: it exists so that a session about to publish waits for a message the
 * operator may be typing, not to stop a session determined to publish (a script file, an alias or an
 * obfuscated string pass). A false positive costs a 20-second wait; nothing more.
 */
export function matchIrreversibleAction(command: string): IrreversibleActionKind | undefined {
	for (const segment of command.split(SEGMENT_BREAK)) {
		const hit = IRREVERSIBLE_ACTIONS.find(
			p => p.command.test(segment) && (p.also === undefined || p.also.test(segment)) && !(p.except?.test(segment) ?? false),
		)
		if (hit) return hit.kind
	}
	return undefined
}
