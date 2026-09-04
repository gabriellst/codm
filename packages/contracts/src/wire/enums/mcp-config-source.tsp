namespace TemplateContracts;

@doc("De onde uma configuração de MCP foi lida para import. Fechado de propósito, e declarado em vez de inferido: nenhum código decide 'é o Claude Desktop' olhando o formato de um caminho — o caminho por plataforma é propriedade DESTA fonte, resolvida por lookup. PASTE é o dono colando JSON na tela (sem disco, funciona com qualquer origem); WORKSPACE_FILE é o .mcp.json do workspace anexado; CLAUDE_CODE é ~/.claude.json, cuja configuração vive sob projects['<caminho absoluto>'].mcpServers e NÃO no topo (medido em 04/09/2026); CLAUDE_DESKTOP é o claude_desktop_config.json do app.")
enum McpConfigSource {
  PASTE: "PASTE",
  WORKSPACE_FILE: "WORKSPACE_FILE",
  CLAUDE_CODE: "CLAUDE_CODE",
  CLAUDE_DESKTOP: "CLAUDE_DESKTOP",
}
