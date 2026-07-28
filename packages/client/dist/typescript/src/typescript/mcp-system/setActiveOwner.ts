import fetch from "@codedm/client-typescript/typescript/mcp-system/_http";
import type { SetActiveOwnerMutationResponse, SetActiveOwnerPathParams } from "../types/SetActiveOwner.ts";
import type { ResponseErrorConfig } from "@codedm/client-typescript/typescript/mcp-system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Switch the authenticated session to the given owner (SPEC-07 SetActiveOwner)
 * {@link /v1/owners/:ownerId/activate}
 */
export async function setActiveOwnerHandler({ ownerId }: { ownerId: SetActiveOwnerPathParams["ownerId"] }): Promise<Promise<CallToolResult>> {




  const res = await fetch<SetActiveOwnerMutationResponse, ResponseErrorConfig<Error>, unknown>({ method : "POST", url : `/v1/owners/${ownerId}/activate` })
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