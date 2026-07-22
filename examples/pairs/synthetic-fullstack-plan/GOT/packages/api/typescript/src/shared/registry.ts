import {
	type InstanceRegistry,
	PGliteDriver,
	NodePgDriver,
	DrizzleDatabaseDriver,
	DrizzleClient,
	UnitOfWorkFactory,
	DomainEventRepository,
	DrizzleDomainEventRepository,
	InternalMediator,
	ExternalMediator,
	EventEmitter2Mediator,
	MockExternalMediator,
	OutboxDispatcher,
	DrizzleOutboxDispatcher,
	MockOutboxDispatcher,
	LoggingService,
	MockLoggingService,
	MailSender,
	ConsoleMailSender,
	Config,
} from '@codedm/core-typescript'
import * as schema from '@codedm/contracts/db'
import { migrationsDir } from '@codedm/contracts/db/migrations'
import { Client } from '@codedm/client-typescript'
import type { RequestConfig, ResponseConfig } from '@codedm/client-typescript/http'

/**
 * Test request stub for the SDK `Client`. The generated operations call
 * `client(config)` and expect a `{ data, status, statusText }` envelope;
 * for hermetic mock/integration tests we short-circuit with an empty 204
 * so cross-service calls never touch the network. Real mode uses the
 * default ky transport via the configured base URLs.
 */
const stubRequest = async <TData>(_config: RequestConfig): Promise<ResponseConfig<TData>> => ({
	data: undefined as TData,
	status: 204,
	statusText: 'No Content',
})

function mockSdkClient(): Client {
	const fetchStub = stubRequest as unknown as typeof fetch
	return Client.create({
		go: { baseUrl: 'http://stub.local', fetch: fetchStub },
		typescript: { baseUrl: 'http://stub.local', fetch: fetchStub },
	})
}

function realSdkClient(): Client {
	return Client.create({
		go: { baseUrl: Config.env.GO_WORKER_BASE_URL },
		typescript: { baseUrl: Config.env.API_URL },
	})
}

// `Client` has a private constructor (built via `Client.create`), so the class
// object isn't directly assignable to RegistryToken's `abstract new (...)`.
// The runtime reference is still the DI key use cases resolve by type, so cast
// it to a usable token shape — same object, satisfies the registry typing.
const ClientToken = Client as unknown as abstract new (...args: any[]) => Client

import { INSTANCE_REGISTRY as authRegistry } from '@auth/registry'
import { INSTANCE_REGISTRY as identityRegistry } from '@identity/registry'
import { INSTANCE_REGISTRY as tenancyRegistry } from '@tenancy/registry'
import { INSTANCE_REGISTRY as billingRegistry } from '@billing/registry'
import { INSTANCE_REGISTRY as integrationRegistry } from '../integration/registry'
import { INSTANCE_REGISTRY as salesRegistry } from '@sales/registry'
import { INSTANCE_REGISTRY as trackingRegistry } from '../tracking/registry'
import { INSTANCE_REGISTRY as analyticsRegistry } from '../analytics/registry'
import { INSTANCE_REGISTRY as financeRegistry } from '../finance/registry'
import { INSTANCE_REGISTRY as catalogRegistry } from '../catalog/registry'
import { INSTANCE_REGISTRY as marketingRegistry } from '../marketing/registry'
import { INSTANCE_REGISTRY as notificationsRegistry } from '@notifications/registry'
import { INSTANCE_REGISTRY as uiRegistry } from '@ui/registry'
import { INSTANCE_REGISTRY as procurementRegistry } from '../procurement/registry'

const CORE_ENTRIES_MOCK: InstanceRegistry['mock'] = [
	{ token: DrizzleDatabaseDriver, useFactory: () => new PGliteDriver({ schema, migrationsDir }) },
	{ token: DrizzleClient, useFactory: c => (c.resolve(DrizzleDatabaseDriver as any) as any).db },
	{ token: UnitOfWorkFactory, useFactory: c => (c.resolve(DrizzleDatabaseDriver as any) as any).unitOfWorkFactory },
	{ token: InternalMediator, instance: EventEmitter2Mediator },
	{ token: ExternalMediator, instance: MockExternalMediator },
	{ token: OutboxDispatcher, instance: MockOutboxDispatcher },
	{ token: LoggingService, instance: MockLoggingService },
	{ token: MailSender, instance: ConsoleMailSender },
	{ token: ClientToken, useFactory: () => mockSdkClient() },
]

const CORE_ENTRIES_INTEGRATION: InstanceRegistry['integration'] = [
	{ token: DrizzleDatabaseDriver, useFactory: () => new PGliteDriver({ schema, migrationsDir }) },
	{ token: DrizzleClient, useFactory: c => (c.resolve(DrizzleDatabaseDriver as any) as any).db },
	{ token: UnitOfWorkFactory, useFactory: c => (c.resolve(DrizzleDatabaseDriver as any) as any).unitOfWorkFactory },
	{ token: DomainEventRepository, instance: DrizzleDomainEventRepository },
	{ token: InternalMediator, instance: EventEmitter2Mediator },
	{ token: ExternalMediator, instance: EventEmitter2Mediator },
	{ token: OutboxDispatcher, instance: DrizzleOutboxDispatcher },
	{ token: LoggingService, instance: MockLoggingService },
	{ token: MailSender, instance: ConsoleMailSender },
	{ token: ClientToken, useFactory: () => mockSdkClient() },
]

const CORE_ENTRIES_REAL: InstanceRegistry['real'] = [
	{ token: DrizzleDatabaseDriver, useFactory: () => new NodePgDriver({ connectionString: Config.env.DATABASE_URL, schema }) },
	{ token: DrizzleClient, useFactory: c => (c.resolve(DrizzleDatabaseDriver as any) as any).db },
	{ token: UnitOfWorkFactory, useFactory: c => (c.resolve(DrizzleDatabaseDriver as any) as any).unitOfWorkFactory },
	{ token: DomainEventRepository, instance: DrizzleDomainEventRepository },
	{ token: InternalMediator, instance: EventEmitter2Mediator },
	{ token: ExternalMediator, instance: EventEmitter2Mediator },
	{ token: OutboxDispatcher, instance: DrizzleOutboxDispatcher },
	{ token: LoggingService, instance: MockLoggingService },
	{ token: MailSender, instance: ConsoleMailSender },
	{ token: ClientToken, useFactory: () => realSdkClient() },
]

export const ALL_REGISTRIES: InstanceRegistry = {
	mock: [
		...CORE_ENTRIES_MOCK,
		...authRegistry.mock,
		...identityRegistry.mock,
		...tenancyRegistry.mock,
		...billingRegistry.mock,
		...integrationRegistry.mock,
		...salesRegistry.mock,
		...trackingRegistry.mock,
		...analyticsRegistry.mock,
		...financeRegistry.mock,
		...catalogRegistry.mock,
		...marketingRegistry.mock,
		...notificationsRegistry.mock,
		...uiRegistry.mock,
		...procurementRegistry.mock,
	],
	integration: [
		...CORE_ENTRIES_INTEGRATION,
		...authRegistry.integration,
		...identityRegistry.integration,
		...tenancyRegistry.integration,
		...billingRegistry.integration,
		...integrationRegistry.integration,
		...salesRegistry.integration,
		...trackingRegistry.integration,
		...analyticsRegistry.integration,
		...financeRegistry.integration,
		...catalogRegistry.integration,
		...marketingRegistry.integration,
		...notificationsRegistry.integration,
		...uiRegistry.integration,
		...procurementRegistry.integration,
	],
	real: [
		...CORE_ENTRIES_REAL,
		...authRegistry.real,
		...identityRegistry.real,
		...tenancyRegistry.real,
		...billingRegistry.real,
		...integrationRegistry.real,
		...salesRegistry.real,
		...trackingRegistry.real,
		...analyticsRegistry.real,
		...financeRegistry.real,
		...catalogRegistry.real,
		...marketingRegistry.real,
		...notificationsRegistry.real,
		...uiRegistry.real,
		...procurementRegistry.real,
	],
}
