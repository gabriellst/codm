// Deterministic faker helpers for mocked BFF controllers. A fixed seed makes
// every server boot produce the same fixtures, so SDK output and frontend
// snapshots stay stable. Swap a usecase's body for a real query and delete the
// faker calls — nothing else changes.
import { faker } from '@faker-js/faker'

faker.seed(1)

export { faker }

export const mockId = (): string => faker.string.uuid()

export const mockSeries = <T>(n: number, fn: (index: number) => T): T[] => Array.from({ length: n }, (_, i) => fn(i))

/** Recent ISO-8601 timestamp. */
export const mockIsoDate = (): string => faker.date.recent({ days: 30 }).toISOString()

export const pick = <T>(values: readonly T[]): T => faker.helpers.arrayElement(values)
