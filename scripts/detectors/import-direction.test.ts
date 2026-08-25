import { describe, expect, test } from 'bun:test'
import { checkFile } from './import-direction'

const ruleIds = (r: ReturnType<typeof checkFile>) => r.findings.map(f => f.ruleId)

describe('R1 controller-no-repositories-no-drizzleclient', () => {
	const path = 'packages/api/typescript/src/sales/controllers/CreateOrder.ts'

	test('fires on repository path import', () => {
		const r = checkFile(path, `import { OrderRepository } from '../repositories/OrderRepository'\n`)
		expect(ruleIds(r)).toEqual(['R1'])
		expect(r.findings[0]?.line).toBe(1)
		expect(r.findings[0]?.severity).toBe('error')
		expect(r.findings[0]?.source).toBe('import-direction#R1')
	})

	test('fires on DrizzleClient symbol import from core', () => {
		const r = checkFile(path, `import { DrizzleClient } from '@codm/core-typescript'\n`)
		expect(ruleIds(r)).toEqual(['R1'])
	})

	test('fires on Repository symbol in a multi-line import (joined statement)', () => {
		const content = `import {\n\tDrizzleClient,\n} from '@codm/core-typescript'\n`
		const r = checkFile(path, content)
		expect(ruleIds(r)).toEqual(['R1'])
		expect(r.findings[0]?.line).toBe(1)
	})

	test('clean: controller importing its use case', () => {
		const r = checkFile(path, `import { CreateOrder } from '../usecases/CreateOrder'\n`)
		expect(r.findings).toEqual([])
	})

	test('colocated test excluded by glob', () => {
		const r = checkFile(
			'packages/api/typescript/src/integration/controllers/IntegrationOAuthCallback.test.ts',
			`import { StoreIntegrationRepository } from '../repositories/StoreIntegrationRepository'\n`,
		)
		expect(r.findings).toEqual([])
		expect(r.suppressed).toEqual([])
	})
})

describe('R2 react-sdk-only-no-raw-http', () => {
	const path = 'packages/app/react/src/routes/(app)/orders/-components/OrderListSection/index.tsx'

	test('fires on raw fetch call-site (not an import line)', () => {
		const r = checkFile(path, `export async function load(url: URL) {\n\tconst res = await fetch(url.toString())\n\treturn res.json()\n}\n`)
		expect(ruleIds(r)).toEqual(['R2'])
		expect(r.findings[0]?.line).toBe(2)
	})

	test('fires on axios import', () => {
		const r = checkFile(path, `import axios from 'axios'\n`)
		expect(ruleIds(r)).toEqual(['R2'])
	})

	test('fires on window.fetch', () => {
		const r = checkFile(path, `const res = await window.fetch('/x')\n`)
		expect(ruleIds(r)).toEqual(['R2'])
	})

	test('clean: refetch/prefetch/member .fetch/string literal do not match', () => {
		const content = [
			`const { refetch } = useListOrders()`,
			`await refetch()`,
			`queryClient.prefetchQuery(opts)`,
			`api.fetch(x)`,
			`if (error.message.includes('fetch')) return`,
		].join('\n')
		expect(checkFile(path, content).findings).toEqual([])
	})

	test('exception: storybook mock infra prefix is suppressed', () => {
		const r = checkFile('packages/app/react/src/storybook/mock.ts', `const res = await fetch('/api/x')\n`)
		expect(r.findings).toEqual([])
		expect(r.suppressed.map(f => f.ruleId)).toEqual(['R2'])
	})

	test('stories files excluded by glob', () => {
		const r = checkFile(
			'packages/app/react/src/routes/(app)/orders/-components/OrderListSection/OrderListSection.stories.tsx',
			`const res = await fetch('/api/x')\n`,
		)
		expect(r.findings).toEqual([])
		expect(r.suppressed).toEqual([])
	})

	test('exception: the loopback-auth client resolving fetch at call time is suppressed', () => {
		const r = checkFile('packages/app/react/src/lib/auth.ts', `customFetchImpl: (input, init) => globalThis.fetch(input, init),\n`)
		expect(r.findings).toEqual([])
		expect(r.suppressed.map(f => f.ruleId)).toEqual(['R2'])
	})
})

describe('R3 no-cross-context-entity-imports', () => {
	const path = 'packages/api/typescript/src/quota/usecases/RequestDowngrade.ts'

	test('fires on alias cross-context entity import', () => {
		const r = checkFile(path, `import { Owner } from '@owner/entities/Owner'\n`)
		expect(ruleIds(r)).toEqual(['R3'])
	})

	test('fires on relative cross-context entity import', () => {
		const r = checkFile(path, `import { Owner } from '../../owner/entities/Owner'\n`)
		expect(ruleIds(r)).toEqual(['R3'])
	})

	test('clean: same-context entity imports (alias and relative)', () => {
		const content = `import { Campaign } from '@marketing/entities/Campaign'\nimport { AdAccount } from '../entities/AdAccount'\n`
		expect(checkFile(path, content).findings).toEqual([])
	})

	test('clean: cross-context repository import is sanctioned', () => {
		const r = checkFile(
			'packages/api/typescript/src/identity/usecases/UpdateProfile.ts',
			`import { UserRepository } from '@auth/repositories/UserRepository'\n`,
		)
		expect(r.findings).toEqual([])
	})

	test('ui (BFF) gets no exemption as importer', () => {
		const r = checkFile('packages/api/typescript/src/ui/usecases/GetUserInfo.ts', `import { Owner } from '@owner/entities/Owner'\n`)
		expect(ruleIds(r)).toEqual(['R3'])
	})

	test('colocated tests excluded by glob (given-state pattern)', () => {
		const r = checkFile(
			'packages/api/typescript/src/ui/usecases/GetUserInfo.test.ts',
			`import { Store } from '@tenancy/entities/Store'\nimport { StoreMembership } from '@tenancy/entities/StoreMembership'\n`,
		)
		expect(r.findings).toEqual([])
	})
})

describe('R4 usecase-no-direct-mediator-publish-outbox-only', () => {
	const path = 'packages/api/typescript/src/billing/usecases/SomeOtherUseCase.ts'

	test('fires on ExternalMediator import and on the publish call-site', () => {
		const content = [
			`import { BaseError, ExternalMediator, z } from '@codm/core-typescript'`,
			`export class SomeOtherUseCase {`,
			`\tasync execute() {`,
			`\t\tawait this.externalMediator.publish(event)`,
			`\t}`,
			`}`,
		].join('\n')
		const r = checkFile(path, content)
		expect(ruleIds(r)).toEqual(['R4', 'R4'])
		expect(r.findings.map(f => f.line)).toEqual([1, 4])
	})

	test('clean: handler publishing (outside usecases glob)', () => {
		const r = checkFile(
			'packages/api/typescript/src/billing/handlers/internal.ts',
			`import { ExternalMediator } from '@codm/core-typescript'\nawait this.externalMediator.publish(event)\n`,
		)
		expect(r.findings).toEqual([])
	})

	test('clean: use case raising domain events (no mediator)', () => {
		const r = checkFile(path, `import { BaseError, z } from '@codm/core-typescript'\nentity.raiseEvent(event)\n`)
		expect(r.findings).toEqual([])
	})
})

describe('R5 react-no-backend-package-imports', () => {
	const path = 'packages/app/react/src/lib/whatever.ts'

	test('fires on @codm/api-typescript import', () => {
		const r = checkFile(path, `import { something } from '@codm/api-typescript'\n`)
		expect(ruleIds(r)).toEqual(['R5'])
	})

	test('fires on @codm/core-typescript subpath import', () => {
		const r = checkFile(path, `import { z } from '@codm/core-typescript/zod'\n`)
		expect(ruleIds(r)).toEqual(['R5'])
	})

	test('fires on relative escape into packages/api', () => {
		const r = checkFile(path, `import { thing } from '../../../../api/typescript/src/shared/objects/Money'\n`)
		expect(ruleIds(r)).toEqual(['R5'])
	})

	test('fires even in stories/tests (no glob exclusions)', () => {
		const r = checkFile('packages/app/react/src/lib/whatever.stories.tsx', `import { x } from '@codm/core-typescript'\n`)
		expect(ruleIds(r)).toEqual(['R5'])
	})

	test('clean: SDK import is the sanctioned wire surface', () => {
		const r = checkFile(path, `import type { Money } from '@codm/client-typescript/typescript'\n`)
		expect(r.findings).toEqual([])
	})

	test('exception: a *.services.test.tsx cross-service suite importing /testing is suppressed', () => {
		const r = checkFile(
			'packages/app/react/src/routes/(app)/orders/-components/OrderListSection/index.services.test.tsx',
			`import { givenConnectedGatewayChannel } from '@codm/api-typescript/testing'\n`,
		)
		expect(r.findings).toEqual([])
		expect(r.suppressed.map(f => f.ruleId)).toEqual(['R5'])
	})

	test('a mis-scoped plain .test.tsx importing /testing still fires (the suffix IS the enforcement)', () => {
		const r = checkFile(
			'packages/app/react/src/routes/(app)/orders/-components/OrderListSection/index.test.tsx',
			`import { givenConnectedGatewayChannel } from '@codm/api-typescript/testing'\n`,
		)
		expect(ruleIds(r)).toEqual(['R5'])
	})
})

describe('R6 middleware-no-drizzleclient-injection', () => {
	const path = 'packages/api/typescript/src/tenancy/middlewares/RequireStoreMember.ts'

	test('fires on DrizzleClient import from core', () => {
		const r = checkFile(path, `import { DrizzleClient } from '@codm/core-typescript'\n`)
		expect(ruleIds(r)).toEqual(['R6'])
	})

	test('clean: repository injection in middleware is fine', () => {
		const r = checkFile(path, `import { StoreMembershipRepository } from '../repositories/StoreMembershipRepository'\n`)
		expect(r.findings).toEqual([])
	})
})

describe('glob + extraction mechanics', () => {
	test('files outside every fromGlob produce nothing', () => {
		const r = checkFile('packages/api/go/internal/sync/worker.go', `import "fetch"\n`)
		expect(r.findings).toEqual([])
		expect(r.suppressed).toEqual([])
	})

	test('one finding per line even when the joined statement and physical line both match', () => {
		const r = checkFile('packages/api/typescript/src/billing/usecases/X.ts', `import { ExternalMediator } from '@codm/core-typescript'\n`)
		expect(r.findings.length).toBe(1)
	})

	test('commented-out imports do not match (line-anchored import filter)', () => {
		const r = checkFile(
			'packages/api/typescript/src/sales/controllers/CreateOrder.ts',
			`// import { OrderRepository } from '../repositories/OrderRepository'\n`,
		)
		expect(r.findings).toEqual([])
	})
})
