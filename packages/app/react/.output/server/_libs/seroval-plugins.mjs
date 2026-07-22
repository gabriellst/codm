import { a as ai, r as re$1 } from "./seroval.mjs";
var o = {}, P = (e) => new ReadableStream({ start: (r) => {
  e.on({ next: (a) => {
    try {
      r.enqueue(a);
    } catch (t) {
    }
  }, throw: (a) => {
    r.error(a);
  }, return: () => {
    try {
      r.close();
    } catch (a) {
    }
  } });
} }), ee = ai({ tag: "seroval-plugins/web/ReadableStreamFactory", test(e) {
  return e === o;
}, parse: { sync() {
  return o;
}, async async() {
  return await Promise.resolve(o);
}, stream() {
  return o;
} }, serialize() {
  return P.toString();
}, deserialize() {
  return o;
} });
async function N(e, r) {
  try {
    let a = await r.read();
    a.done ? (e.return(a.value), r.releaseLock()) : (e.next(a.value), await N(e, r));
  } catch (a) {
    e.throw(a);
  }
}
function re(e) {
  e.cancel().catch(() => {
  }), e.releaseLock();
}
function w(e) {
  let r = re$1(), a = e.getReader(), t = re.bind(null, a);
  return N(r, a).catch(t), [r, t];
}
var ae = ai({ tag: "seroval/plugins/web/ReadableStream", extends: [ee], test(e) {
  return typeof ReadableStream == "undefined" ? false : e instanceof ReadableStream;
}, parse: { sync(e, r) {
  return { factory: r.parse(o), stream: r.parse(re$1()) };
}, async async(e, r) {
  return { factory: await r.parse(o), stream: await r.parse(w(e)[0]) };
}, stream(e, r) {
  let [a, t] = w(e);
  return r.addCleanup(t), { factory: r.parse(o), stream: r.parse(a) };
} }, serialize(e, r) {
  return "(" + r.serialize(e.factory) + ")(" + r.serialize(e.stream) + ")";
}, deserialize(e, r) {
  let a = r.deserialize(e.stream);
  return P(a);
} }), l = ae;
export {
  l
};
