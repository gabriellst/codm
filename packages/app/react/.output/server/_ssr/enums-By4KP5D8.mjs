import "./router-NNnLbzcz.mjs";
import { i as instance } from "../_libs/i18next.mjs";
function enumLabel(enumName, value) {
  const bundle = instance.getResourceBundle(instance.language, "translation");
  return bundle?.enums?.[enumName]?.[value] ?? value;
}
export {
  enumLabel as e
};
