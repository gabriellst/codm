import { describe, expect, it } from 'bun:test'
import { hookFilePath, hookName, httpFilePath, operationIdToCamel, tagOf, typeFilePath, zodFilePath } from '../adapters/openapi/naming'

describe('openapi naming', () => {
	it('drops the visibility tag and keeps the bounded context (untagged ops fall back to _default)', () => {
		expect(tagOf({ tags: ['appointment', 'external'] })).toBe('appointment')
		expect(tagOf({ tags: ['agent', 'internal'] })).toBe('agent')
		expect(tagOf({ tags: ['internal'] })).toBe('_default')
		expect(tagOf({})).toBe('_default')
	})

	it('lower-cases the first char of an operationId', () => {
		expect(operationIdToCamel('CreateAppointment')).toBe('createAppointment')
		expect(operationIdToCamel('Docs')).toBe('docs')
	})

	it('builds a hook name with the use prefix and PascalCase head', () => {
		expect(hookName('CreateAppointment')).toBe('useCreateAppointment')
		expect(hookName('listPatients')).toBe('useListPatients')
	})

	it('builds the flat kubb-output paths (no per-tag folders)', () => {
		expect(httpFilePath('appointment', 'CreateAppointment')).toBe('client/createAppointment.ts')
		expect(hookFilePath('appointment', 'CreateAppointment')).toBe('hooks/useCreateAppointment.ts')
		expect(zodFilePath('appointment', 'CreateAppointment')).toBe('zod/createAppointmentSchema.ts')
		expect(typeFilePath('CreateAppointment')).toBe('types/CreateAppointment.ts')
	})
})
