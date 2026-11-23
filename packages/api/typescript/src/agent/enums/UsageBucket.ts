/**
 * THE BUCKETS A TURN'S TOKENS ARE BILLED IN (fase 4, item 2 — "Unidade de orçamento"). One per counter the usage fact
 * carries, reasoning output included: `AgentUsageEvent` forbids dropping a measured bucket, and the cost unit is the
 * same promise one layer up. Agent-local: it prices a fact, it never crosses the wire.
 */
export enum UsageBucket {
	INPUT = 'INPUT',
	CACHE_WRITE = 'CACHE_WRITE',
	CACHE_READ = 'CACHE_READ',
	OUTPUT = 'OUTPUT',
	REASONING_OUTPUT = 'REASONING_OUTPUT',
}
