namespace TemplateContracts;

@doc("O que o proxy faz ao encaminhar uma ferramenta deste servidor. AUTO executa direto; ASK recusa a chamada e levanta um stop APPROVAL_NEEDED para o dono decidir. A política efetiva também depende de StopPolicy.approvalNeeded do dono — ver agent/mcp/approvalPolicy.ts.")
enum McpApprovalPolicy {
  AUTO: "AUTO",
  ASK: "ASK",
}
