import { describe, expect, it } from 'bun:test'
import {
	hookFilePath,
	hookName,
	httpFilePath,
	operationIdToCamel,
	tagOf,
	tagToFolder,
	typeFilePath,
	zodFilePath,
} from '../adapters/openapi/naming'

describe('openapi naming', () => {
	it('drops the visibility tag and keeps the bounded context', () => {
		expect(tagOf({ tags: ['appointment', 'external'] })).toBe('appointment')
		expect(tagOf({ tags: ['agent', 'internal'] })).toBe('agent')
		expect(tagOf({ tags: ['internal'] })).toBeNull()
		expect(tagOf({})).toBeNull()
	})

	it('capitalizes a tag for folder grouping', () => {
		expect(tagToFolder('appointment')).toBe('Appointment')
		expect(tagToFolder('ui')).toBe('Ui')
	})

	it('lower-cases the first char of an operationId', () => {
		expect(operationIdToCamel('CreateAppointment')).toBe('createAppointment')
		expect(operationIdToCamel('Docs')).toBe('docs')
	})

	it('builds a hook name with the use prefix and PascalCase head', () => {
		expect(hookName('CreateAppointment')).toBe('useCreateAppointment')
		expect(hookName('listPatients')).toBe('useListPatients')
	})

	it('builds the kubb-output paths', () => {
		expect(httpFilePath('appointment', 'CreateAppointment')).toBe('http/Appointment/createAppointment.ts')
		expect(hookFilePath('appointment', 'CreateAppointment')).toBe('hooks/Appointment/useCreateAppointment.ts')
		expect(zodFilePath('appointment', 'CreateAppointment')).toBe('zod/Appointment/createAppointmentSchema.ts')
		expect(typeFilePath('CreateAppointment')).toBe('types/CreateAppointment.ts')
	})
})
