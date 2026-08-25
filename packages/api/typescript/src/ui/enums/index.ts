// ui context enum barrel — spread into `openapi.registerEnums` by shared/index.ts so
// controller-facing enums of this context emit as named `$ref` components.
//
// Currently empty: the SSE surface is fully declarative (ListenEvents composes the contract's
// generated event schemas wholesale), so the old `BrowserIntegrationEventName` passthrough-arm
// enum no longer exists.
export {}
