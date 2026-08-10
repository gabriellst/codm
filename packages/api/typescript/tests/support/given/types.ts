/**
 * The narrow structural dependency every `given*` helper actually consumes from the test harness:
 * resolve a token from the DI container, and read the owner id the harness seeded. Every given in
 * this directory calls ONLY `testBed.resolve(...)` and reads `testBed.ownerId` — never `.given`,
 * `.spy`, `.mode`, `.reset()`, `.destroy()`, or any other member of the concrete `TestBed` class
 * (`../TestBed.ts`, which carries private fields and is therefore nominally-typed).
 *
 * `resolve`'s parameter is typed as a constructor token (`abstract new (...args: any[]) => T`),
 * mirroring `TestBed.resolve`'s real signature exactly — every call site in this directory calls
 * `testBed.resolve(SomeRepository)` and relies on `T` being INFERRED from that argument
 * (`UserRepository` → `UserRepository`, not `unknown`). A looser `resolve<T>(token: unknown): T`
 * type-checks but breaks inference at every call site (nothing ties `T` to the argument), forcing
 * either an explicit `<T>` at each call or a cast — this is the actual reason the old boundary
 * wrapper in `testing.ts` (removed by this interface-segregation pass) existed for two purposes at
 * once: bridging `TestBed`'s private fields AND preserving `resolve`'s inference. Typing it this
 * way at the source fixes both: no caller needs a cast, and every `testBed.resolve(X)` call keeps
 * its inferred return type.
 *
 * Declaring givens against THIS instead of `TestBed` means no bridge/cast is needed anywhere a
 * caller only has something structurally compatible: `TestBed` instances satisfy `TestBedLike` for
 * free (a concrete class always satisfies a narrower structural interface — that direction costs
 * nothing), and `/testing`'s `asTestBed()` adapter (`../testing.ts`) can hand this out directly.
 *
 * Single source of truth: `tests/support/testing.ts` re-exports this type rather than declaring
 * its own copy, and the committed `testing.d.ts` public contract mirrors it by hand (see that
 * file's docblock for why it can't just `export type { TestBedLike } from './given/types'`).
 */
export interface TestBedLike {
	// biome-ignore lint/suspicious/noExplicitAny: mirrors `TestBed.resolve`'s real constructor-token signature (abstract classes included) so `T` infers from the call site instead of collapsing to `unknown`.
	resolve<T>(token: abstract new (...args: any[]) => T): T
	readonly ownerId: string
}
