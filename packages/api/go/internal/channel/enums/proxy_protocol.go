package enums

type ProxyProtocol string

// Values: HTTP HTTPS SOCKS4 SOCKS5
const (
	ProxyProtocolHTTP   ProxyProtocol = "HTTP"
	ProxyProtocolHTTPS  ProxyProtocol = "HTTPS"
	ProxyProtocolSOCKS4 ProxyProtocol = "SOCKS4"
	ProxyProtocolSOCKS5 ProxyProtocol = "SOCKS5"
)
