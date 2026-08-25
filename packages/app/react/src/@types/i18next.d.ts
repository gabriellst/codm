// NOTE (scaling tradeoff, this worktree only): the full `typeof pt` key union exceeded TypeScript's
// type-instantiation depth (TS2589 "excessively deep") once the catalogue grew past ~600 keys while
// building out every /app screen — which ALSO dragged `tsc` from ~40s to minutes. Until the catalogue
// is split into per-screen i18next namespaces (each small enough to type), we drop the `typeof pt`
// augmentation: default i18next typing applies, so `t()` returns `string` and accepts plain string
// keys. Runtime i18n and the locale JSONs are entirely unaffected; only compile-time key validation is
// relaxed. TODO: re-enable typed keys via namespace splitting.
export {}
