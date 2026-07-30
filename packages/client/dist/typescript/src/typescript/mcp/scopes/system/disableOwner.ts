import fetch from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { DisableOwnerMutationRequest, DisableOwnerMutationResponse } from "../../../types/DisableOwner.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Disable a owner (C19 DisableOwner; OWNER only)
 * {@link /v1/owners/disable}
 */
export async function disableOwnerHandler({ data }: { data?: DisableOwnerMutationRequest } = {}): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<DisableOwnerMutationResponse, ResponseErrorConfig<Error>, DisableOwnerMutationRequest>({ method : "POST", url : `/v1/owners/disable`, data : requestData })
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