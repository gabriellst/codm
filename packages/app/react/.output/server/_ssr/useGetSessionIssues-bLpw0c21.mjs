import { f as fetch } from "../_http-B7Tvv7R3.mjs";
import { a as useQuery, q as queryOptions } from "../_libs/tanstack__react-query.mjs";
function getGetSessionIssuesUrl(threadId) {
  const res = { method: "GET", url: `/v1/threads/${threadId}/issues` };
  return res;
}
async function getSessionIssues(threadId, config = {}) {
  const { client: request = fetch, ...requestConfig } = config;
  const res = await request({ method: "GET", url: getGetSessionIssuesUrl(threadId).url.toString(), ...requestConfig });
  return res.data;
}
const getSessionIssuesQueryKey = (threadId) => [{ url: "/v1/threads/:threadId/issues", params: { threadId } }];
function getSessionIssuesQueryOptions(threadId, config = {}) {
  const queryKey = getSessionIssuesQueryKey(threadId);
  return queryOptions({
    enabled: !!threadId,
    queryKey,
    queryFn: async ({ signal }) => {
      return getSessionIssues(threadId, { ...config, signal: config.signal ?? signal });
    }
  });
}
function useGetSessionIssues(threadId, options = {}) {
  const { query: queryConfig = {}, client: config = {} } = options ?? {};
  const { client: queryClient, ...resolvedOptions } = queryConfig;
  const queryKey = resolvedOptions?.queryKey ?? getSessionIssuesQueryKey(threadId);
  const query = useQuery({
    ...getSessionIssuesQueryOptions(threadId, config),
    ...resolvedOptions,
    queryKey
  }, queryClient);
  query.queryKey = queryKey;
  return query;
}
export {
  getSessionIssuesQueryKey as g,
  useGetSessionIssues as u
};
