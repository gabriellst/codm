import type { DatabaseDriver } from '../drivers/DatabaseDriver'
import type { IdempotencyGuard } from '../../services/IdempotencyGuard/IdempotencyGuard'

/**
 * O CONTRATO DE ADMISSÃO de uma família de banco.
 *
 * Uma família não fica pronta por PARECER com a outra. Ela fica pronta por passar a MESMA suíte
 * parametrizada que a outra passa. É a diferença entre "escrevi um `PgIdempotencyGuard` que parece
 * com o libsql" e "provei que os dois se comportam igual" — e só a segunda sobrevive ao dia em que
 * alguém troca a família de um deployment.
 *
 * A suíte nunca importa um schema. Tudo que ela precisa do banco chega por estas fábricas, e é isso
 * que a torna reutilizável entre dialetos cujas tabelas são objetos Drizzle sem relação nenhuma
 * (`pg-core` × `sqlite-core`).
 *
 * ── por que este arquivo é separado do de outbox ─────────────────────────────────────────────────
 * No repo irmão o `FamilyHarness` mora dentro de `outbox-conformance.ts`. Aqui a conformidade de
 * idempotência aterrissou primeiro, e pendurar o tipo num arquivo que ainda não existe seria
 * inventar dependência por simetria. `OutboxHarness` estende este quando chegar.
 */
export interface IdempotencyHarness<Driver extends DatabaseDriver = DatabaseDriver> {
	/** Rótulo para os títulos de `describe()` e as mensagens de falha — `'pg'`, `'libsql'`. */
	readonly family: string

	makeDriver(): Promise<Driver>
	makeGuard(driver: Driver): IdempotencyGuard
}
