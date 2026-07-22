// External (integration-event) handlers for the ui (BFF) context. The barrel is the registration
// gate — BoundedContext.create subscribes every handler exported here to the ExternalMediator.
//
// ConsumeChannelRemotesSynced — load-bearing subscription that opens the gateway's remotes_synced
// stream so the SSE relay can fan the fact to the browser (which invalidates the attach wizard read).
export { ConsumeChannelRemotesSynced } from './ConsumeChannelRemotesSynced'
