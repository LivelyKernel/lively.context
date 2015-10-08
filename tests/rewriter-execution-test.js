/*global beforeEach, afterEach, describe, it, expect*/

var env = typeof module !== "undefined" && module.require ? module.require("../env") : Global;
var escodegen = env.escodegen, acorn = env.acorn;
var chai = typeof module !== "undefined" && module.require ? module.require("./chai-bundle.js") : env.chai;
// if (env.isCommonJS) chai.use(module.require('chai-shallow-deep-equal'));
var lang = env.lively.lang || lively.lang, ast = env.lively.ast || lively.ast;
var rewriting = env.isCommonJS ? module.require('../index') : ast.Rewriting;

describe('execution', function() {
  var parser = ast,
      rewrite,
      astRegistry, oldAstRegistry;

  beforeEach(function() {
    rewrite = function(node) {
      return rewriting.rewrite(node, astRegistry, 'RewriteTests');
    };
    oldAstRegistry = rewriting.getCurrentASTRegistry();
    astRegistry = {};
    rewriting.setCurrentASTRegistry(astRegistry);
  });

  afterEach(function() {
    rewriting.setCurrentASTRegistry(oldAstRegistry);
  });

  it('executes rewritten loops correctly', function() {
    function code() {
      var result = 0;
      for (var i = 0; i < 10; i++) result += i;
      return result;
    }
    var src = lang.string.format('(%s)();', code),
        src2 = escodegen.generate(rewrite(parser.parse(src)));
    expect(eval(src)).to.eql(eval(src));
  });

  it('executes rewritten function arguments correctly', function() {
    function code(a) {
      return a;
    }
    var src = lang.string.format('(%s)(1);', code),
        src2 = escodegen.generate(rewrite(parser.parse(src)));
    expect(eval(src)).to.eql(eval(src));
  });

  it('executes rewritten function arguments and matching variables correctly', function() {
    function code(a) {
      var a = 3;
      return a;
    }
    var src = lang.string.format('(%s)(1);', code),
        src2 = escodegen.generate(rewrite(parser.parse(src)));
    expect(eval(src)).to.eql(eval(src));
  });

  it('executes rewritten function arguments and undefined variable declarations correctly', function() {
    function code(a) {
      var a;
      return a;
    }
    var src = lang.string.format('(%s)(1);', code),
        src2 = escodegen.generate(rewrite(parser.parse(src)));
    expect(eval(src)).to.eql(eval(src));
  });

  it('executes rewritten function arguments and late variable definitions correctly', function() {
    function code(a) {
      var b = a;
      var a = 3;
      return b + a;
    }
    var src = lang.string.format('(%s)(1);', code),
        src2 = escodegen.generate(rewrite(parser.parse(src)));
    expect(eval(src)).to.eql(eval(src));
  });

  it('executes throw over function boundaries correctly', function() {
    function code() {
      function thrower() {
        throw new Error('123');
      }
      try {
        thrower();
      } catch (e) {
        return e.message;
      }
      return '321';
    }
    var src = lang.string.format('(%s)();', code),
        src2 = escodegen.generate(rewrite(parser.parse(src)));
    expect(eval(src)).to.eql(eval(src));
  });

  it('executes with-statement scopes correctly', function() {
    function code() {
      var x = 1, y = 2, z, obj = { x: 3 };
      with (obj) {
        z = x + y;
      }
      return z;
    }
    var src = lang.string.format('(%s)();', code),
        ast = parser.parse(src,
          {sourceType: 'script'}  // neccessary to not have strict mode
        ),
        src2 = escodegen.generate(rewrite(ast));
    expect(eval(src)).to.eql(eval(src));
  });

  it('executes nested with-statement scopes correctly', function() {
    function code() {
      var x = 1, y = 2, z, obj1 = { x: 3 }, obj2 = { y: 4 };
      with (obj1) {
        with (obj2) {
          z = x + y;
        }
        z += x + y;
      }
      return z;
    }
    var src = lang.string.format('(%s)();', code),
        ast = parser.parse(src,
          {sourceType: 'script'}  // neccessary to not have strict mode
        ),
        src2 = escodegen.generate(rewrite(ast));
    expect(eval(src)).to.eql(eval(src));
  });

  it('executes closures with with-statements scope correctly', function() {
    function code() {
      var x = 1;
      with ({ x: 2 }) {
        return (function foo() {
          return x;
        })();
      }
    }
    var src = lang.string.format('(%s)();', code),
        ast = parser.parse(src,
          {sourceType: 'script'}  // neccessary to not have strict mode
        ),
        src2 = escodegen.generate(rewrite(ast));
    expect(eval(src)).to.eql(eval(src));
  });

  it('executes with-statements with prototype property access correctly', function() {
    function code() {
      var klass = function() {};
      klass.prototype.x = 2;
      var obj = new klass(), x = 1;
      with (obj) {
        return x;
      }
    }
    var src = lang.string.format('(%s)();', code),
        ast = parser.parse(src,
          {sourceType: 'script'}  // neccessary to not have strict mode
        ),
        src2 = escodegen.generate(rewrite(ast));
    expect(eval(src)).to.eql(eval(src));
  });

  it('executes try and catch with function declaration correctly', function() {
    function code() {
      try {
        throw new Error('foo');
      } catch (e) {
        return (function(arg) { return e.message + arg; })('bar');
      }
    }
    var src = lang.string.format('(%s)();', code),
        src2 = escodegen.generate(rewrite(parser.parse(src)));
    expect(eval(src)).to.eql(eval(src));
  });

});
