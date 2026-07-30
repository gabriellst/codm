import fetch from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { CreateOwnerMutationRequest, CreateOwnerMutationResponse } from "../../../types/CreateOwner.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Create a new owner (tenant); the creator becomes the responsible user
 * {@link /v1/owners}
 */
export async function createOwnerHandler({ data }: { data: CreateOwnerMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<CreateOwnerMutationResponse, ResponseErrorConfig<Error>, CreateOwnerMutationRequest>({ method : "POST", url : `/v1/owners`, data : requestData })
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