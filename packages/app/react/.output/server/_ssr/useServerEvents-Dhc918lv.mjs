import { r as reactExports } from "../_libs/react.mjs";
import { C as Config, f as tryCatch } from "./router-NNnLbzcz.mjs";
import { f as fetchEventSource } from "../_libs/microsoft__fetch-event-source.mjs";
const listenEventsQueryKey = () => [{ url: "/v1/ui/events" }];
function useServerEventSource() {
  reactExports.useEffect(() => {
    const controller = new AbortController();
    fetchEventSource(`${Config.baseUrl}${listenEventsQueryKey()[0].url}`, {
      credentials: "include",
      signal: controller.signal,
      onmessage(msg) {
        if (!msg.data) return;
        const result = tryCatch(() => JSON.parse(msg.data));
        if (!result.success) {
          console.error("[SSE] Failed to parse server event:", result.error, "Raw data:", msg.data);
          return;
        }
        document.dispatchEvent(new CustomEvent(result.data.name, { detail: result.data }));
      },
      onerror(err) {
        console.error("[SSE] Connection error:", err);
      }
    });
    return () => controller.abort();
  }, []);
}
function useServerEvents(name, callback) {
  const callbackRef = reactExports.useRef(callback);
  callbackRef.current = callback;
  reactExports.useEffect(() => {
    const names = Array.isArray(name) ? name : [name];
    const listener = (e) => {
      callbackRef.current(e.detail);
    };
    for (const n of names) document.addEventListener(n, listener);
    return () => {
      for (const n of names) document.removeEventListener(n, listener);
    };
  }, [Array.isArray(name) ? name.join("|") : name]);
}
export {
  useServerEvents as a,
  useServerEventSource as u
};
