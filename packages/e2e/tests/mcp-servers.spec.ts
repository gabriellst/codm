import type { Page } from 'playwright'
import { test, expect } from '../utils/test'
import { dialog, field, pickOptionByValue } from '../utils/selectors'
import { t } from '../utils/i18n'
import { givenFreshUser, givenAttachedThread, givenCompletedOnboarding, authenticateCloudSession } from '../utils/given'
import { getSettings, McpTransportEnum, McpApprovalPolicyEnum } from '@codm/client-typescript/typescript'

/**
 * MCP SERVERS — Task T14, the e2e closing `.plans/2026-09-02-mcps-de-terceiros.md`.
 *
 * Three scenarios, one per user story of `.specs/2026-09-02-mcps-de-terceiros-design.md`:
 *   Story 3 — the owner registers a server through the console (fully driven below, real stack).
 *   Story 2 — an ASK tool refuses and asks (HONEST SKIP — see that test's own docblock).
 *   Story 1 — an AUTO tool just runs, no card (HONEST SKIP — same obstacle as Story 2).
 *
 * ### Why two of the three are skipped, not stubbed
 * Both skipped scenarios need to drive a REAL `tools/call` against a THIRD-PARTY MCP tool through
 * the real `/mcp/issue-handling` door and observe the gate's reaction (a Needs-you card, or none).
 * That path is unreachable from this harness today — not "hard to automate", but structurally absent
 * from the wiring `CODM_ENV=e2e` selects. See each skipped test's docblock for the exact files and
 * the precise point the chain breaks. Faking either scenario with a mock stop or a hand-rolled DOM
 * fixture would "pass" while proving nothing about the real gate, which is explicitly the thing this
 * Task must not do — so they are left honestly red-free and explicitly SKIPPED, the same convention
 * `08-stop-resolve.spec.ts` already established for the same category of gap (no seam to RAISE a
 * stop from this harness).
 *
 * ### The "teeth" requirement this file cannot currently satisfy
 * The Task brief requires the SAME selector (a Needs-you card naming the server/tool/arguments) to
 * demonstrably MATCH in the ASK scenario and NOT match in the AUTO scenario, so the absence assertion
 * in the AUTO case has teeth instead of being a selector that never matches anything. Because BOTH
 * scenarios are blocked by the identical root cause, this file cannot supply that paired proof today.
 * That is the central finding of this Task — see the report handed back alongside this file.
 */

/** `^[a-z][a-z0-9-]{0,31}$` (RegisterMcpServer's own `key` pattern) — unique per call, never reused
 *  across runs so a stale row from an earlier suite invocation can never be mistaken for this one's. */
function generateMcpKey(prefix: string): string {
	return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 32)
}

/**
 * Scope to ONE registered server's row by its (unique, generated) key.
 *
 * `McpServerRow` (settings/-components/McpServersSection/index.tsx) carries `aria-label={server.key}`
 * on the row itself (Task T9) — the key is the server's own unique identifier, not catalog copy, so
 * it needs no i18n entry to serve as an accessible name. This is immune to DOM nesting: unlike the
 * previous `.filter().last()` chase (which depended on the row being the innermost `div` containing
 * both the key text and a switch — broken by the first layout change that added a nested wrapper),
 * `getByLabel` finds the element by its accessible name regardless of how deep it sits.
 */
function serverRow(page: Page, key: string) {
	return page.getByLabel(key, { exact: true })
}

/**
 * Story 3 — "Como dono, quero ver e administrar meus servidores no console, para saber o que meus
 * agentes conseguem fazer." Fully real: real daemon, real SQLite row, real browser, real form.
 *
 * Two things asserted together, per the Task brief:
 *   (a) the registered server lands in the list with policy ASK — the default a fresh registration
 *       gets (`McpServer.create`: `data.approvalPolicy ?? McpApprovalPolicy.ASK`) precisely because a
 *       server nobody has an opinion about yet is the one that should ask before it acts;
 *   (b) the transport discriminated union is REAL, not merely the form's initial render — proven by
 *       switching to HTTP (url field appears, command field disappears) and back to STDIO (the
 *       reverse), before ever touching the fields that get submitted.
 */
test('mcp servers — owner registers a STDIO server through settings and it lands on ASK', async ({ page, goto }) => {
	const user = await givenFreshUser({})
	// `givenAttachedThread` ANTES do complete, e nao por gosto: desde a reescrita de draft/commit
	// atomico, `CompleteOnboarding` REVALIDA um rascunho do servidor, e um `completeOnboarding` nu
	// apresenta um rascunho vazio (`ONBOARDING_DRAFT_INCOMPLETE`). Nao existe endpoint de skip —
	// concluir EXIGE um rascunho, e um rascunho sempre materializa canal + workspace + thread. E o
	// que `11-artifact-preview.spec.ts` faz, e a ordem e o pre-requisito, nao uma preferencia.
	const attached = await givenAttachedThread(user.session, { displayName: 'Ada' })
	await givenCompletedOnboarding(user.session, attached)
	// CloudSessionGate wraps every (app) route, checked before OnboardingGate — seed it first.
	await authenticateCloudSession(page)

	const key = generateMcpKey('e2e-register')

	await goto('/settings')
	await page.getByRole('button', { name: t('settings.mcpServers.addServer') }).click()

	const modal = dialog(page)
	await expect(modal.getByText(t('settings.mcpServers.form.registerTitle'))).toBeVisible()

	// STDIO is the form's own default (`McpServerForm`'s `useState(server?.transport ?? STDIO)`) — a
	// command field visible from the first paint is not yet proof the union is wired, only that the
	// default happens to be STDIO. Assert it, then actually flip the discriminant twice.
	await expect(field(modal, t('settings.mcpServers.form.commandLabel')).getByRole('textbox')).toBeVisible()
	await expect(field(modal, t('settings.mcpServers.form.urlLabel'))).toHaveCount(0)

	const transportSelect = modal.getByRole('combobox', { name: t('settings.mcpServers.form.transportLabel') })
	await transportSelect.click()
	await pickOptionByValue(page, McpTransportEnum.HTTP)

	// HTTP member: url appears, command is gone — not merely hidden, ABSENT (a different form mounted).
	await expect(field(modal, t('settings.mcpServers.form.urlLabel')).getByRole('textbox')).toBeVisible()
	await expect(field(modal, t('settings.mcpServers.form.commandLabel'))).toHaveCount(0)

	await transportSelect.click()
	await pickOptionByValue(page, McpTransportEnum.STDIO)

	// Back to STDIO: command reappears, url is gone again — the swap runs both ways.
	await expect(field(modal, t('settings.mcpServers.form.commandLabel')).getByRole('textbox')).toBeVisible()
	await expect(field(modal, t('settings.mcpServers.form.urlLabel'))).toHaveCount(0)

	// Switching transport remounts the variant form (StdioServerForm/HttpServerForm are different
	// component types), which resets local field state — fill in AFTER the transport is settled.
	await field(modal, t('settings.mcpServers.form.keyLabel')).getByRole('textbox').fill(key)
	await field(modal, t('settings.mcpServers.form.commandLabel')).getByRole('textbox').fill('true')

	// The approval-policy selector is deliberately left untouched (placeholder "Padrão (perguntar)") —
	// the point of this assertion is that the OWNER never has to pick a policy for the default to be
	// ASK; the server fills it in.
	await modal.getByRole('button', { name: t('settings.mcpServers.form.register') }).click()
	await expect(modal).toHaveCount(0)

	const row = serverRow(page, key)
	await expect(row).toBeVisible()
	// `enums.McpTransport.*`, não `settings.mcpServers.transport.*`: rótulo de enum de contrato vive no
	// catálogo de enums (component#bp-25) — feature namespace fragmenta o mesmo rótulo por tela.
	await expect(row.getByText(t('enums.McpTransport.STDIO'), { exact: true })).toBeVisible()
	await expect(row.getByText(t('settings.mcpServers.policy.ASK'), { exact: true })).toBeVisible()

	// Cross-checked against the same read model the row is rendered from, not only the DOM.
	const settings = await getSettings({ client: user.session.client })
	const persisted = settings.mcpServers.find(server => server.key === key)
	expect(persisted?.transport).toBe(McpTransportEnum.STDIO)
	expect(persisted?.approvalPolicy).toBe(McpApprovalPolicyEnum.ASK)

	// AC-16 — the console drives the FULL lifecycle of a server, not only its registration: toggle,
	// policy swap, and removal, all against the row created above (no reason to pay for a second boot).

	// 1. Toggle the server off — the switch itself is the reflection; there is no separate
	//    "disabled" copy anywhere in the row (T12's read model has no such field), so the toggle's
	//    own checked state IS what "the row reflects disabled" means here.
	const toggle = row.getByRole('switch', { name: t('settings.mcpServers.enabledToggle') })
	await expect(toggle).toBeChecked()
	await toggle.click()
	await expect(toggle).not.toBeChecked()

	const afterToggle = await getSettings({ client: user.session.client })
	expect(afterToggle.mcpServers.find(server => server.key === key)?.enabled).toBe(false)

	// 2. Swap the server's approval policy from ASK to AUTO.
	await expect(row.getByText(t('settings.mcpServers.policy.ASK'), { exact: true })).toBeVisible()
	await row.getByRole('combobox', { name: t('settings.mcpServers.policyLabel') }).click()
	await pickOptionByValue(page, McpApprovalPolicyEnum.AUTO)
	await expect(row.getByText(t('settings.mcpServers.policy.AUTO'), { exact: true })).toBeVisible()

	const afterPolicySwap = await getSettings({ client: user.session.client })
	expect(afterPolicySwap.mcpServers.find(server => server.key === key)?.approvalPolicy).toBe(McpApprovalPolicyEnum.AUTO)

	// 3. Remove the server — behind the same destructive confirm dialog `useDialogStore.confirm` opens.
	await row.getByRole('button', { name: t('settings.mcpServers.remove') }).click()
	const confirmDialog = dialog(page)
	await expect(confirmDialog.getByText(t('settings.mcpServers.removeConfirmTitle'))).toBeVisible()
	await confirmDialog.getByRole('button', { name: t('settings.mcpServers.removeConfirmAction') }).click()
	await expect(row).toHaveCount(0)

	const afterRemove = await getSettings({ client: user.session.client })
	expect(afterRemove.mcpServers.find(server => server.key === key)).toBeUndefined()
})

/**
 * Story 2 — "Como dono, quero que uma ferramenta que mexe na minha máquina peça minha aprovação antes
 * de rodar, para que uma mensagem mal-intencionada no canal não execute comando local." HONEST SKIP.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT WOULD HAVE TO HAPPEN: register a server on `ASK`, drive a `tools/call` against one of its
 * tools through the real `/mcp/issue-handling` door (via a real, issue-scoped agent run, the way
 * `10-terminal-tool-frame.spec.ts` drives `runIssueTurn` against the REAL generated tools), and
 * observe a Needs-you card carrying the server, the tool and the arguments — then APPROVE it and
 * observe the card resolve.
 *
 * WHY IT CANNOT BE DRIVEN TODAY, precisely:
 *
 * 1. `packages/api/typescript/src/agent/registry.ts` binds `McpUpstreamRegistry` with NO `e2e`
 *    column: `{ token: McpUpstreamRegistry, mock: MockMcpUpstreamRegistry, integration:
 *    MockMcpUpstreamRegistry, real: DefaultMcpUpstreamRegistry }`. `expandBindings`
 *    (`core/src/types/Registry.ts`) defaults a missing `e2e` to the `integration` value — so under
 *    `CODM_ENV=e2e` (what this harness boots) the daemon's `McpUpstreamRegistry` resolves to
 *    `MockMcpUpstreamRegistry`, whose `tools` array starts empty and stays empty: nothing in the
 *    product surface (no `/_test/*` door, no exported hook) lets an e2e spec seed it. This is true
 *    REGARDLESS of what gets registered through the real `RegisterMcpServer` endpoint — the registry
 *    that would actually connect to a spawned/reachable server (`DefaultMcpUpstreamRegistry`) is
 *    never the one selected under `e2e`, so the "no real third-party MCP server on the runner"
 *    constraint the Task gives is moot: even a first-party fixture server this spec could spawn
 *    itself would never be dialed, because the daemon never tries.
 *
 * 2. `packages/api/typescript/src/agent/mcp/upstream.ts`'s `withUpstream` returns the inner
 *    (generated-only) transport UNWRAPPED whenever `binding.tools.length === 0` — which is always
 *    true here per (1). So a `tools/call` naming an upstream tool (`<key>__<tool>`) falls straight
 *    through to the generated server, which does not know the name and answers a JSON-RPC error. It
 *    never reaches `McpDoorController.callUpstream` — the method that actually decides between
 *    executing and raising `APPROVAL_NEEDED` (`agent/mcp/door.ts`, `agent/mcp/approvalPolicy.ts`).
 *
 * 3. Even setting (1)/(2) aside, there is no SCRIPTED way to make a real agent run originate such a
 *    call. `E2eMcpDriver.declare()` (`agent/mcp/E2eMcpDriver.ts`) only interprets
 *    `AgentScenarioDeclaration` — a closed union of exactly `FORK_ISSUE`, `RECORD_ARTIFACT`,
 *    `COMPLETE_ISSUE` (`agent/services/AgentScenario/AgentScenario.ts`) — none of which call an
 *    upstream tool, and `AGENT_SCENARIO_IDS` (the set `TestSelectAgentScenarioController` may select)
 *    is closed to `['default', 'demo-pt', 'demo-en']`. There is no fourth declaration kind and no
 *    custom/ad-hoc scenario a test can hand the daemon.
 *
 * WHAT WOULD UN-SKIP THIS (product-code change, out of this Task's exclusive scope): either (a) give
 * `McpUpstreamRegistry` its own `e2e` DI column bound to a seedable double reachable through a
 * `/_test/*` door (same shape as `TestSelectAgentScenarioController`), or (b) add a
 * `CALL_UPSTREAM_TOOL` member to `AgentScenarioDeclaration` that `E2eMcpDriver` can interpret against
 * a real, reachable-under-e2e upstream. Either closes the gap for BOTH this test and Story 1's below.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
test('mcp servers — an ASK tool refuses and raises a Needs-you card, then APPROVE resolves it', async () => {
	// biome-ignore lint/suspicious/noSkippedTests: intentional HONEST SKIP, see docstring above — the harness has no seam to drive a real tools/call against an upstream MCP server under CODM_ENV=e2e.
	test.skip(
		true,
		'No hermetic path to originate an upstream tools/call: McpUpstreamRegistry has no e2e DI column (falls back to the empty MockMcpUpstreamRegistry), withUpstream short-circuits on an empty tool list before the gate is ever reached, and E2eMcpDriver/AgentScenario have no declaration kind for calling an upstream tool.',
	)
})

/**
 * Story 1 — "Como dono, quero cadastrar um MCP de navegador e pedir pelo WhatsApp [...] para que o
 * agente resolva sozinho o que hoje eu faço à mão." (the AUTO half: no card, the call just runs).
 * HONEST SKIP — same root obstacle as the ASK scenario above, documented there in full.
 *
 * This is also the scenario that was supposed to give the absence assertion its TEETH: the brief asks
 * for the SAME Needs-you-card selector to demonstrably match in the ASK test above and NOT match here,
 * so that "no card appeared" is a measurement rather than a selector nobody ever exercised. Since the
 * ASK scenario cannot produce a card either (see its docstring), this file cannot supply that paired
 * proof today — an absence test written here alone, with no sibling positive case, would be exactly
 * the untrustworthy shape the Task brief warns against, so it is left skipped rather than written as
 * one that would trivially "pass" for having nothing to find.
 */
test('mcp servers — an AUTO tool just runs, no Needs-you card appears', async () => {
	// biome-ignore lint/suspicious/noSkippedTests: intentional HONEST SKIP, see docstring above — same obstacle as the ASK scenario, and without that one's card this test has no positive case to prove its own selector has teeth.
	test.skip(
		true,
		'Same obstacle as the ASK scenario (see its docstring): no seam to originate a real upstream tools/call under CODM_ENV=e2e. Additionally, without that scenario producing a card, this absence assertion would have no paired positive case to prove the selector has teeth.',
	)
})

/**
 * Story 4 — "Como dono, quero trazer os servidores que já configurei noutro cliente, sem redigitar."
 *
 * O que este teste prova, e por que cada metade é obrigatória:
 *
 *   (a) O CAMINHO FELIZ: um documento colado vira servidor registrado, com a chave e o transporte
 *       corretos, verificados TAMBÉM contra o read model — não só contra o DOM.
 *
 *   (b) A REJEIÇÃO FICA VISÍVEL NO MESMO GESTO. Esta é a metade que não pode faltar. Um import que
 *       descarta em silêncio o que não entende faz o dono ver 2 de 3 servidores e concluir que o
 *       terceiro nunca existiu — e nenhum teste do caminho feliz jamais pegaria isso, porque o
 *       caminho feliz é exatamente onde o descarte silencioso PARECE sucesso. O documento colado
 *       aqui carrega um `sse` de propósito.
 *
 *   (c) O SEGREDO CHEGA VAZIO, e o aviso disso aparece antes de confirmar.
 */
test('mcp servers — owner imports a pasted config, and what could not come is visible', async ({ page, goto }) => {
	const user = await givenFreshUser({})
	const attached = await givenAttachedThread(user.session, { displayName: 'Ada' })
	await givenCompletedOnboarding(user.session, attached)
	await authenticateCloudSession(page)

	const key = generateMcpKey('e2e-import')
	// Três entradas, três destinos DIFERENTES — e é a diferença que o teste mede:
	//   `key`      → candidato importável, com um segredo (nome sem valor)
	//   `legado`   → rejeitado: `sse` existe no mundo e não no nosso contrato
	//   `Bad_Name` → rejeitado: fora de ^[a-z][a-z0-9-]{0,31}$
	const pasted = JSON.stringify({
		mcpServers: {
			[key]: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-everything'], env: { API_TOKEN: 'nao-pode-vazar' } },
			legado: { type: 'sse', url: 'https://exemplo.dev/sse' },
			Bad_Name: { command: 'node' },
		},
	})

	await goto('/settings')
	await page.getByRole('button', { name: t('settings.mcpServers.import.title') }).click()

	const modal = dialog(page)
	await modal.getByRole('textbox', { name: t('settings.mcpServers.import.pasteLabel') }).fill(pasted)
	await modal.getByRole('button', { name: t('settings.mcpServers.import.scan') }).click()

	// (b) As duas rejeições estão na tela, com nome e motivo — antes de qualquer import acontecer.
	await expect(modal.getByText('legado', { exact: true })).toBeVisible()
	await expect(modal.getByText(t('enums.McpImportRejection.UNSUPPORTED_TRANSPORT'), { exact: true })).toBeVisible()
	await expect(modal.getByText('Bad_Name', { exact: true })).toBeVisible()
	await expect(modal.getByText(t('enums.McpImportRejection.INVALID_KEY'), { exact: true })).toBeVisible()

	// (c) O aviso de segredo em branco aparece assim que um candidato com segredo é escolhido.
	await modal.getByRole('checkbox').first().check()
	await expect(modal.getByText(t('settings.mcpServers.import.secretsWillBeBlank'))).toBeVisible()

	// O `t()` do e2e NÃO interpola (ele resolve a chave no bundle e devolve a string crua), então o
	// rótulo chega como "Importar {{count}}". Casar pelo prefixo estável é o que sobra — e é melhor
	// que chumbar "Importar 1" aqui, que quebraria no dia em que o plural mudar de forma.
	const confirmPrefix = t('settings.mcpServers.import.confirm').split('{{')[0]?.trim() ?? ''
	await modal.getByRole('button', { name: new RegExp(confirmPrefix) }).click()
	await expect(modal).toHaveCount(0)

	// (a) A linha existe no console...
	await expect(serverRow(page, key)).toBeVisible()

	// ...e no READ MODEL, que é a fonte de verdade que a linha renderiza. O nome do segredo sobreviveu;
	// o valor NÃO — `envKeys` carrega chaves, e o import nunca aceitou valores.
	const settings = await getSettings({ client: user.session.client })
	const imported = settings.mcpServers.find(server => server.key === key)
	expect(imported?.transport).toBe(McpTransportEnum.STDIO)
	expect(imported?.approvalPolicy).toBe(McpApprovalPolicyEnum.ASK)
	expect(imported?.envKeys).toEqual(['API_TOKEN'])
	// A CONTRAPROVA: o valor colado não pode aparecer em lugar nenhum do read model.
	expect(JSON.stringify(settings)).not.toContain('nao-pode-vazar')

	// E o que foi recusado NÃO virou servidor — a rejeição é recusa, não adiamento.
	expect(settings.mcpServers.map(server => server.key)).not.toContain('legado')
	expect(settings.mcpServers.map(server => server.key)).not.toContain('Bad_Name')
})
