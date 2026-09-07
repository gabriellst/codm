namespace TemplateContracts;

@doc("Por que uma entrada de configuração MCP não pôde virar um servidor registrado. Existe porque REJEIÇÃO É CIDADÃ DE PRIMEIRA CLASSE: um import que descarta o que não entende produz o pior resultado possível — o dono vê 2 de 3 servidores e conclui que o terceiro nunca existiu. Toda entrada recusada chega à tela com um destes motivos, ao lado das aceitas. UNSUPPORTED_TRANSPORT é o `type: 'sse'` que existe no mundo e não no nosso contrato (McpTransport é STDIO|HTTP); INVALID_KEY é o nome que não cabe em ^[a-z][a-z0-9-]{0,31}$ (`my_server` e `MyServer` são comuns por aí) — o nome original vai junto, porque renomear em silêncio é inaceitável; MISSING_COMMAND e MISSING_URL são a entrada incoerente com o próprio transporte declarado; ALREADY_REGISTERED é a chave que o dono já tem, recusada em vez de duplicada em silêncio; MALFORMED é o documento que nem JSON é — uma rejeição, nunca uma exceção que derruba a tela.")
enum McpImportRejection {
  UNSUPPORTED_TRANSPORT: "UNSUPPORTED_TRANSPORT",
  INVALID_KEY: "INVALID_KEY",
  MISSING_COMMAND: "MISSING_COMMAND",
  MISSING_URL: "MISSING_URL",
  ALREADY_REGISTERED: "ALREADY_REGISTERED",
  MALFORMED: "MALFORMED",
}
