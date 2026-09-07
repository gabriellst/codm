namespace TemplateContracts;

@doc("Como o dono respondeu um pedido de aprovação de ferramenta MCP externa. A ausência do valor na linha significa PENDENTE — esse estado não tem membro, porque 'ainda não decidiu' não é uma decisão.")
enum McpApprovalDecision {
  APPROVED: "APPROVED",
  DENIED: "DENIED",
}
