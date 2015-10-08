var isCommonJS = typeof module !== "undefined" && module.require;
var Global = typeof window !== "undefined" ? window : global;
var lang = typeof lively !== "undefined" ? lively.lang : isCommonJS ? module.require("lively.lang") : {};
var ast = typeof lively !== "undefined" && lively.ast ? lively.ast : (isCommonJS ? module.require("lively.ast") : (function() { throw new Error("Cannot find lively.ast") })());
var escodegen = isCommonJS ? module.require("escodegen") : Global.escodegen;

var lv = Global.lively || {};
lv.ast = ast;
lv.lang = lang;

var env = {
  isCommonJS: isCommonJS,
  Global: Global,
  lively: lv,
  escodegen: escodegen
}

lang.obj.extend(isCommonJS ? module.exports : Global, env);
