package enums

type ReceiptType string

// Values: delivered read read-self played
const (
	ReceiptTypeDelivered ReceiptType = "delivered"
	ReceiptTypeRead      ReceiptType = "read"
	ReceiptTypeReadSelf  ReceiptType = "read-self"
	ReceiptTypePlayed    ReceiptType = "played"
)
