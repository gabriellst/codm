import fetch from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { RecordBatchMutationRequest, RecordBatchMutationResponse, RecordBatchPathParams } from "../../../types/RecordBatch.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Record where each item of a batch (a message listing several requests) went — every item exactly once
 * {@link /threads/:threadId/batches/record}
 */
export async function recordBatchHandler({ threadId, data }: { threadId: RecordBatchPathParams["threadId"]; data: RecordBatchMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<RecordBatchMutationResponse, ResponseErrorConfig<Error>, RecordBatchMutationRequest>({ method : "POST", url : `/threads/${threadId}/batches/record`, data : requestData })
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