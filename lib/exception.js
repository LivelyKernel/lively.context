/*global global, module*/

;(function(run) {
  var env = typeof module !== "undefined" && module.require ? module.require("../env") : Global;
  run(env.Global, env.lively, env.lively.lang, env.lively.ast);

  if (env.isCommonJS) module.exports = env.Global.UnwindException;
})(function(Global, lively, lang, ast) {

    Global.UnwindException = function UnwindException(error) {
        this.error = error;
        error.unwindException = this;
        this.frameInfo = [];
    };

    lang['class'].addMethods(Global.UnwindException, {

        isUnwindException: true,

        toString: function() {
          return '[UNWIND] ' + this.error.toString();
        },

        storeFrameInfo: function(/*...*/) {
            this.frameInfo.push(arguments);
        },

        recreateFrames: function() {
            this.frameInfo.forEach(function(frameInfo) {
                this.createAndShiftFrame.apply(this, lang.arr.from(frameInfo));
            }, this);
            this.frameInfo = [];
            return this;
        },

        createAndShiftFrame: function(thiz, args, frameState, lastNodeAstIndex, namespaceForOrigAst, pointerToOriginalAst) {
            var topScope = lively.ast.AcornInterpreter.Scope.recreateFromFrameState(frameState),
                alreadyComputed = frameState[0],
                func = new lively.ast.AcornInterpreter.Function(__getClosure(namespaceForOrigAst, pointerToOriginalAst), topScope),
                frame = lively.ast.AcornInterpreter.Frame.create(func /*, varMapping */),
                pc;
            frame.setThis(thiz);
            if (frame.func.node && frame.func.node.type != 'Program')
                frame.setArguments(args);
            frame.setAlreadyComputed(alreadyComputed);
            if (!this.top) {
                pc = this.error && lively.ast.acorn.walk.findNodeByAstIndex(frame.getOriginalAst(),
                    this.error.astIndex ? this.error.astIndex : lastNodeAstIndex);
            } else {
                if (frame.isAlreadyComputed(lastNodeAstIndex)) lastNodeAstIndex++;
                pc = lively.ast.acorn.walk.findNodeByAstIndex(frame.getOriginalAst(), lastNodeAstIndex);
            }
            frame.setPC(pc);
            frame.setScope(topScope);

            return this.shiftFrame(frame, true);
        },

        shiftFrame: function(frame, isRecreating) {
            if (!isRecreating)
                this.recreateFrames();
            if (!frame.isResuming()) console.log('Frame without PC found!', frame);
            if (!this.top) {
                this.top = this.last = frame;
            } else {
                this.last.setParentFrame(frame);
                this.last = frame;
            }
            return frame;
        },

        unshiftFrame: function() {
            this.recreateFrames();
            if (!this.top) return;

            var frame = this.top,
                prevFrame;
            while (frame.getParentFrame()) {
                prevFrame = frame;
                frame = frame.getParentFrame();
            }
            if (prevFrame) { // more then one frame
                prevFrame.setParentFrame(undefined);
                this.last = prevFrame;
            } else {
                this.top = this.last = undefined;
            }
            return frame;
        }

    });

});
