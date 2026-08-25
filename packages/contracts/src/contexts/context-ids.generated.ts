// GERADO por `bun contexts:sync` — NÃO EDITE. O gate é `bun contexts:check`.
//
// União LITERAL de propósito: cada `<ctx>/context.ts` se restringe por este tipo, e o agregado é
// montado importando esses mesmos arquivos. Derivar de `keyof typeof CONTEXTS` faria cada
// declaração se restringir por um tipo derivado dela própria — inferência circular.
//
// ZERO imports, e isso é contrato: este arquivo é o topo da pilha (ids → manifesto → composição).
// Mora em contracts porque identidade de contexto é LÍNGUA-NEUTRA: o `namespaces.ts` ao lado tipa
// `owner` contra CONTEXTO ∪ WORKSPACE, e contracts não pode importar de `api/typescript/src`.

/** Identidade de pasta/import — casa com `src/<module>/` exatamente. */
export type ContextId = 'agent' | 'artifact' | 'auth' | 'external' | 'issue' | 'owner' | 'shared' | 'thread' | 'ui' | 'workspace'
