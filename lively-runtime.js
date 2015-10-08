lively.require("lively.lang.Runtime", "lively.MochaTests", "lively.ast").toRun(function() {

  lively.lang.Runtime.Registry.addProject({
    name: "lively.context",

    reloadAll: function(project, thenDo) {
      var files = ["env.js",
                  // "index.js",
                   "lib/rewriter.js",
                   "lib/exception.js",
                   "lib/interpreter.js",
                   "lib/stackReification.js",
                   "node_modules/chai-shallow-deep-equal/chai-shallow-deep-equal.js",
                   "tests/rewriter-test.js",
                   "tests/rewriter-execution-test.js",
                   "tests/interpreter-test.js",
                   "tests/continuation-test.js"];
      lively.lang.Runtime.loadFiles(project, files, thenDo);
    },

    resources: {

      "env.js": {
        matches: /env.js$/,
        changeHandler: function(change, project, resource, thenDo) {
          var state = project.state || (project.state = {
            lively: {
              escodegen: escodegen,
              lang: project.state ? project.state.lively.lang : lively.lang,
              ast: project.state ? project.state.lively.ast : lively.ast
            }
          });
          lively.lang.Runtime.evalCode(project, change.newSource, state, change.resourceId, thenDo);
        }
      },

      "interface code": {
        matches: /(lib\/.*|index)\.js$/,
        changeHandler: function(change, project, resource, thenDo) {
          lively.lang.Runtime.evalCode(project, change.newSource, project.state || {}, change.resourceId, thenDo);
        }
      },

      "node_modules": {
        matches: /node_modules\/.*\.js$/,
        changeHandler: function(change, project, resource, thenDo) {
          lively.lang.Runtime.evalCode(project, change.newSource, project.state || {}, change.resourceId, thenDo);
        }
      },

      "tests": {
        matches: /tests\/.*\.js$/,
        changeHandler: function(change, project, resource, thenDo) {
          if (!project.state) {
            var msg = "cannot update runtime for " + change.resourceId + "\n because the runtime state is undefined."
            show(msg); thenDo(new Error(msg)); return;
          }
          lively.lang.Runtime.evalCode(project, change.newSource, project.state, change.resourceId, function(err) {  
            // lively.MochaTests.runAll();
            thenDo(err);
          });
        }
      }
    }
  });

});
