// Zero default middlewares (D-5): the operator credential (X-Operator-Key) is the sole auth on
// ApplyQuotaOverride; a session gate would let an owner self-grant via body.ownerId.
export default {}
