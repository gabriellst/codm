import { describe, expect, it } from 'bun:test'
import { classify } from '../registry/classifier'

describe('classifier', () => {
	it('classifies a backend entity', () => {
		const r = classify('packages/api/typescript/src/appointment/entities/Appointment.ts')
		expect(r?.kind).toBe('entity')
		expect(r?.context).toBe('appointment')
	})

	it('classifies a value object', () => {
		const r = classify('packages/api/typescript/src/patient/objects/CPF.ts')
		expect(r?.kind).toBe('value-object')
		expect(r?.context).toBe('patient')
	})

	it('classifies a use case', () => {
		const r = classify('packages/api/typescript/src/appointment/usecases/CreateAppointment.ts')
		expect(r?.kind).toBe('usecase')
		expect(r?.context).toBe('appointment')
	})

	it('classifies a domain event', () => {
		const r = classify('packages/api/typescript/src/appointment/events/AppointmentCreatedEvent.ts')
		expect(r?.kind).toBe('event')
		expect(r?.context).toBe('appointment')
	})

	it('classifies an integration event in shared/events', () => {
		const r = classify('packages/api/typescript/src/shared/events/AppointmentCreatedEvent.ts')
		expect(r?.kind).toBe('integration-event')
	})

	it('classifies a handler', () => {
		const r = classify('packages/api/typescript/src/agent/handlers/ChatPingDetectedHandler.ts')
		expect(r?.kind).toBe('handler')
		expect(r?.context).toBe('agent')
	})

	it('classifies a controller', () => {
		const r = classify('packages/api/typescript/src/appointment/controllers/CreateAppointment.ts')
		expect(r?.kind).toBe('controller')
		expect(r?.context).toBe('appointment')
	})

	it('classifies a UI controller as controller (not query)', () => {
		const r = classify('packages/api/typescript/src/ui/controllers/patients/ListPatients.ts')
		expect(r?.kind).toBe('controller')
		expect(r?.context).toBe('ui')
	})

	it('classifies a UI usecase as ui-query', () => {
		const r = classify('packages/api/typescript/src/ui/usecases/patients/ListPatients.ts')
		expect(r?.kind).toBe('ui-query')
		expect(r?.context).toBe('ui')
	})

	it('classifies a flat repo interface', () => {
		const r = classify('packages/api/typescript/src/agent/repositories/ChatRepository.ts')
		expect(r?.kind).toBe('repository-interface')
	})

	it('classifies a flat drizzle repo impl', () => {
		const r = classify('packages/api/typescript/src/agent/repositories/DrizzleChatRepository.ts')
		expect(r?.kind).toBe('repository-impl')
	})

	it('classifies a nested repo interface', () => {
		const r = classify('packages/api/typescript/src/appointment/repositories/AppointmentRepository/AppointmentRepository.ts')
		expect(r?.kind).toBe('repository-interface')
	})

	it('classifies a nested drizzle repo impl', () => {
		const r = classify('packages/api/typescript/src/appointment/repositories/AppointmentRepository/DrizzleAppointmentRepository.ts')
		expect(r?.kind).toBe('repository-impl')
	})

	it('classifies a service interface', () => {
		const r = classify('packages/api/typescript/src/agent/services/LlmRunner/LlmRunner.ts')
		expect(r?.kind).toBe('service-interface')
	})

	it('classifies a frontend route', () => {
		const r = classify('packages/app/react/src/routes/(app)/patients/index.tsx')
		expect(r?.kind).toBe('frontend-route')
	})

	it('classifies a frontend section by directory suffix', () => {
		const r = classify('packages/app/react/src/routes/(app)/patients/-components/PatientListSection/index.tsx')
		expect(r?.kind).toBe('frontend-section')
	})

	it('classifies a frontend component', () => {
		const r = classify('packages/app/react/src/routes/(app)/patients/-components/PatientCard/index.tsx')
		expect(r?.kind).toBe('frontend-component')
	})

	it('classifies a UI primitive', () => {
		const r = classify('packages/app/ui/src/components/skeleton.tsx')
		expect(r?.kind).toBe('frontend-ui-primitive')
	})

	it('classifies a Zustand store', () => {
		const r = classify('packages/app/react/src/stores/useDialogStore.ts')
		expect(r?.kind).toBe('frontend-store')
	})

	it('classifies the lib/consts label-map file', () => {
		const r = classify('packages/app/react/src/lib/consts.ts')
		expect(r?.kind).toBe('frontend-label-map')
	})

	it('classifies the errors handler file', () => {
		const r = classify('packages/app/react/src/lib/errors.ts')
		expect(r?.kind).toBe('frontend-error-handler')
	})

	it('skips test files', () => {
		const r = classify('packages/api/typescript/src/appointment/usecases/CreateAppointment.test.ts')
		expect(r).toBeNull()
	})

	it('classifies a DI registry', () => {
		const r = classify('packages/api/typescript/src/appointment/registry.ts')
		expect(r?.kind).toBe('di-registry')
	})

	it('classifies a Drizzle schema file as db-table host', () => {
		// Drizzle schema moved to packages/contracts/src/db/sqlite in the polyglot rebuild.
		// Classifier no longer owns Drizzle classification — the dedicated extractor does.
		const r = classify('packages/contracts/src/db/sqlite/video.ts')
		// Contracts workspace is not handled by the TS-side classifier today
		// (db-table emission happens in the drizzle extractor instead). Verify
		// the classifier defers cleanly.
		expect(r).toBeNull()
	})
})
