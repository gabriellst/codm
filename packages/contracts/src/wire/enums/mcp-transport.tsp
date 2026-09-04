namespace TemplateContracts;

@doc("Como o daemon fala com um servidor MCP de terceiro. STDIO spawna um processo filho e conversa por stdin/stdout; HTTP abre uma conexão para uma URL. A escolha é do servidor cadastrado, não da máquina.")
enum McpTransport {
  STDIO: "STDIO",
  HTTP: "HTTP",
}
