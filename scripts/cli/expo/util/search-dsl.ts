// Mobile reuses the same `--search=<spec>` micro-DSL as the web stack — the
// Zod chain it emits is platform-agnostic. Re-export so the mobile route
// artifact has a colocated import.

export * from '../../frontend/util/search-dsl'
