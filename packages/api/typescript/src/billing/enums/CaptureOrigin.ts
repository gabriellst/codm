// Where a vaulted payment instrument was born (PaymentInstrument.captureOrigin):
// CHECKOUT_PAYMENT = vaulted while paying an invoice inside a hosted checkout (its CIT
// already happened there); CHECKOUT_SETUP = vaulted without a charge (setup-mode checkout).
// Absent on legacy instruments captured via an embedded-element path. Values are persisted
// inside the payment method's instrument jsonb — do not rename members' values.
export enum CaptureOrigin {
	CHECKOUT_PAYMENT = 'checkout-payment',
	CHECKOUT_SETUP = 'checkout-setup',
}
