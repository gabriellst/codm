import fetch from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { ConfigureModelMutationRequest, ConfigureModelMutationResponse, ConfigureModelPathParams } from "../../../types/ConfigureModel.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Choose which model this conversation asks one of its agent CLIs for. DEFAULT means let the CLI pick (C16)
 * {@link /threads/:threadId/model}
 */
export async function configureModelHandler({ threadId, data }: { threadId: ConfigureModelPathParams["threadId"]; data: ConfigureModelMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<ConfigureModelMutationResponse, ResponseErrorConfig<Error>, ConfigureModelMutationRequest>({ method : "PUT", url : `/threads/${threadId}/model`, data : requestData })
  return {
              content: [
                {
                  type: 'text',
                  text: res.data === undefined ? 'OK' : JSON.stringify(res.data)
                }
              ],
              structuredContent: { data: res.data }
             }
}