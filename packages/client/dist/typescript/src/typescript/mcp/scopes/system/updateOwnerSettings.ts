import fetch from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { UpdateOwnerSettingsMutationRequest, UpdateOwnerSettingsMutationResponse } from "../../../types/UpdateOwnerSettings.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Update owner profile settings (name / picture / timezone)
 * {@link /v1/owners/settings}
 */
export async function updateOwnerSettingsHandler({ data }: { data?: UpdateOwnerSettingsMutationRequest } = {}): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<UpdateOwnerSettingsMutationResponse, ResponseErrorConfig<Error>, UpdateOwnerSettingsMutationRequest>({ method : "PATCH", url : `/v1/owners/settings`, data : requestData })
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