/*global global, module*/

;(function(run) {
  var env = typeof module !== "undefined" && module.require ? module.require("../env") : lively['lively.lang_env'];
  var Global = typeof window !== "undefined" ? window : global;
  if (env.isCommonJS && !Global.UnwindException) module.require('./exception');

  run(Global, env.lively.ast.acorn, env.escodegen, env.lively, env.lively.lang, env.lively.ast);

  if (env.isCommonJS) module.exports = env.lively.ast.StackReification;
})(function(Global, acorn, escodegen, lively, lang, ast) {
    var exports = (lively.ast.StackReification || (lively.ast.StackReification = {}));

    lang.obj.extend(exports, {

        debugReplacements: {
            // Function: {},
            Array: Object.getOwnPropertyNames(lang.arrNative).
                reduce(function(obj, fnName) {
                    obj[fnName] = { dbg: lang.arrNative[fnName] };
                    return obj;
                }, {})
            // String: {},
            // JSON: {}
        },

        debugOption: lang.Path('lively.Config.enableDebuggerStatements'),

        enableDebugSupport: function(astRegistry) {
            // FIXME currently only takes care of Array
            try {
                if (!this.hasOwnProperty('configOption')) {
                    this.configOption = this.debugOption.get(Global);
                    this.debugOption.set(Global, true, true);
                }
                var replacements = lively.ast.StackReification.debugReplacements;
                for (var method in replacements.Array) {
                    if (!replacements.Array.hasOwnProperty(method)) continue;
                    var spec = replacements.Array[method],
                        dbgVersion = spec.dbg.stackCaptureMode(null, astRegistry);
                    if (!spec.original) spec.original = Array.prototype[method];
                    Array.prototype[method] = dbgVersion;
                }
            } catch(e) {
                this.disableDebugSupport();
                throw e;
            }
        },

        disableDebugSupport: function() {

            if (this.hasOwnProperty('configOption')) {
                this.debugOption.set(Global, this.configOption, true);
                delete this.configOption;
            }
            var replacements = lively.ast.StackReification.debugReplacements;
            for (var method in replacements.Array) {
                var spec = replacements.Array[method],
                    original = spec.original || Array.prototype[method];
                Array.prototype[method] = original;
            }
        },

        run: function(func, astRegistry, args, optMapping) {
            // FIXME: __getClosure - needed for UnwindExceptions also used here - uses
            //        lively.ast.Rewriting.getCurrentASTRegistry()
            astRegistry = astRegistry || lively.ast.Rewriting.getCurrentASTRegistry();
            lively.ast.StackReification.enableDebugSupport(astRegistry);
            if (!func.livelyDebuggingEnabled)
                func = func.stackCaptureMode(optMapping, astRegistry);
            try {
                return { isContinuation: false, returnValue: func.apply(null, args || []) };
            } catch (e) {
                // e will not be an UnwindException in rewritten system (gets unwrapped)
                e = e.isUnwindException ? e : e.unwindException;
                if (e.error instanceof Error)
                    throw e.error;
                else
                    return lively.ast.Continuation.fromUnwindException(e);
            } finally {
                lively.ast.StackReification.disableDebugSupport(astRegistry);
            }
        }

    });

    var FunctionExtensions = {

        asRewrittenClosure: function(varMapping, astRegistry) {
            var closure = new lively.ast.RewrittenClosure(this, varMapping);
            closure.rewrite(astRegistry);
            return closure;
        },

        stackCaptureMode: function(varMapping, astRegistry) {
            var closure = this.asRewrittenClosure(varMapping, astRegistry),
                rewrittenFunc = closure.getRewrittenFunc();
            if (!rewrittenFunc) throw new Error('Cannot rewrite ' + this);
            return rewrittenFunc;
        },

        stackCaptureSource: function(varMapping, astRegistry) {
            return this.asRewrittenClosure(astRegistry).getRewrittenSource();
        }

    };
    lang.obj.extend(lang.fun, FunctionExtensions);
    Object.getOwnPropertyNames(FunctionExtensions).forEach(function(prop) {
        Function.prototype[prop] = FunctionExtensions[prop];
    });

    lang['class'].create(lang.Closure, 'lively.ast.RewrittenClosure',
    'initializing', {

        initialize: function($super, func, varMapping, source) {
            $super(func, varMapping, source);
            this.ast = null;
        }

    },
    'accessing', {

        getRewrittenFunc: function() {
            var func = this.recreateFuncFromSource(this.getRewrittenSource());
            func.livelyDebuggingEnabled = true;
            return func;
        },

        getRewrittenSource: function() {
            return this.ast && escodegen.generate(this.ast);
        },

        getOriginalFunc: function() {
            return this.addClosureInformation(this.getFunc());
        }

    },
    'rewriting', {

        rewrite: function(astRegistry) {
            var src = this.getFuncSource(),
                ast = lively.ast.parseFunction(src),
                namespace = '[runtime]';
            // FIXME: URL not available here
            // if (this.originalFunc && this.originalFunc.sourceModule)
            //     namespace = new URL(this.originalFunc.sourceModule.findUri()).relativePathFrom(URL.root);
            return this.ast = lively.ast.Rewriting.rewriteFunction(ast, astRegistry, namespace);
        }

    });

    lang['class'].create('lively.ast.Continuation',
    'settings', {

        isContinuation: true

    },
    'initializing', {

        initialize: function(frame) {
            this.currentFrame = frame; // the frame in which the the unwind was triggered
        },

        copy: function() {
            return new this.constructor(this.currentFrame.copy());
        }

    },
    'accessing', {

        frames: function() {
            var frame = this.currentFrame, result = [];
            do { result.push(frame); } while (frame = frame.getParentFrame());
            return result;
        }

    },
    'resuming', {

        resume: function() {
            // FIXME: outer context usually does not have original AST
            // attaching the program node would possibly be right (otherwise the pc's context is missing)
            if (!this.currentFrame.getOriginalAst())
                throw new Error('Cannot resume because frame has no AST!');
            if (!this.currentFrame.pc)
                throw new Error('Cannot resume because frame has no pc!');

            var interpreter = new lively.ast.AcornInterpreter.Interpreter();

            // go through all frames on the stack. beginning with the top most,
            // resume each of them
            var result = this.frames().reduce(function(result, frame, i) {
                if (result.error) {
                    result.error.shiftFrame(frame);
                    return result;
                }

                // disconnect frames to ensure correct reconnection later
                frame.parentFrame = null;

                if (result.hasOwnProperty('val'))
                    frame.alreadyComputed[frame.pc.astIndex] = result.val;

                try {
                    return { val: interpreter.runFromPC(frame, result.val) };
                } catch (ex) {
                    if (!ex.isUnwindException)
                        throw ex;
                    return { error: ex };
                }
            }, {});

            if (result.error)
                return lively.ast.Continuation.fromUnwindException(result.error);
            else
                return result.val;
        }

    });

    lang.obj.extend(lively.ast.Continuation, {

        fromUnwindException: function(e) {
            if (!e.isUnwindException) console.error("No unwind exception?");
            e.recreateFrames();
            var frame = lively.ast.AcornInterpreter.Interpreter.stripInterpreterFrames(e.top),
                continuation = new this(frame);
            continuation.error = e.error;
            return continuation;
        }

    });

});
