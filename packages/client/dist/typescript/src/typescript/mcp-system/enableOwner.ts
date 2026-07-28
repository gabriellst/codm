import fetch from "@codedm/client-typescript/typescript/mcp-system/_http";
import type { EnableOwnerMutationResponse } from "../types/EnableOwner.ts";
import type { ResponseErrorConfig } from "@codedm/client-typescript/typescript/mcp-system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Re-enable a previously disabled owner (C20 EnableOwner; OWNER only)
 * {@link /v1/owners/enable}
 */
export async function enableOwnerHandler(): Promise<Promise<CallToolResult>> {




  const res = await fetch<EnableOwnerMutationResponse, ResponseErrorConfig<Error>, unknown>({ method : "POST", url : `/v1/owners/enable` })
  return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(res.data)
                }
              ],
              structuredContent: { data: res.data }
             }
}