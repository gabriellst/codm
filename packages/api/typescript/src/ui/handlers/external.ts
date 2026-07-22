// External (integration-event) handlers for the ui (BFF) context. The barrel is the registration
// gate — BoundedContext.create subscribes every handler exported here to the ExternalMediator.
//
// ConsumeChannelPairingQr — pulls the gateway's live pairing QR into the in-process cache the
// connect dialog's status poll reads from (see the handler for why the subscription is load-bearing).
export { ConsumeChannelPairingQr } from './ConsumeChannelPairingQr'
