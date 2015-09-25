/*global module, lively*/

var lang = typeof module !== "undefined" && module.require ? module.require("lively.lang") : lively.lang;
var ast = typeof module !== "undefined" && module.require ? module.require("lively.ast") : lively.ast;
var acorn = ast.acorn;
var exports = typeof module !== "undefined" && module.require ? module.exports : (lively.ast.Rewriting = {});