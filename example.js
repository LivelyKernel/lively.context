var editors = ['scope', 'debugger', 'usage-browser', 'usage-nodejs', 'usage-interpret', 'usage-rewrite'];
editors = editors.reduce(function(editors, env) {
  var editor = ace.edit('editor-' + env);
  if (env == 'usage-browser')
    editor.getSession().setMode('ace/mode/html');
  else
    editor.getSession().setMode('ace/mode/javascript');
  editor.renderer.setShowPrintMargin(false);
  editors[env] = editor;
  return editors;
}, {});

// configure scope environment
editors['scope'].setHighlightActiveLine(false);
editors['scope'].setReadOnly(true);
editors['scope'].on('guttermousedown', function(e) {
  var target = e.domEvent.target;
  if (target.className.indexOf('ace_gutter-cell') == -1) return;
  if (!e.editor.isFocused()) return;
  if (e.clientX > 25 + target.getBoundingClientRect().left) return;

  var row = e.getDocumentPosition().row,
      hasBreakpoint = !!e.editor.session.getBreakpoints()[row];
  e.editor.session.clearBreakpoints();
  if (!hasBreakpoint) {
    var src = e.editor.getValue()
        ast = lively.ast.parse(src, { sourceType: 'script', locations: true }),
        node = findStatementAtLine(ast, row + 1);
    if (node) {
      row = node.loc.start.line - 1;
      e.editor.session.setBreakpoint(row);
    }
  }
  e.stop();
});
example_square('scope');

// configure debugger environment
editors['debugger'].on('changeMode', function(e) {
  this.session.$worker.call('changeOptions', [{ debug: true }]);
}.bind(editors['debugger']));
editors['debugger'].getSession().on('change', function(e) {
  reset('debugger');
});
example_error('debugger');

// configure usage environments
Object.getOwnPropertyNames(editors).forEach(function(env) {
  if (env.indexOf('usage-') == -1)
    return;
  editors[env].setReadOnly(true);
  editors[env].setReadOnly(true);
  editors[env].renderer.setShowGutter(false);
});

function reset(env) {
  resetVariables(env);
  removeException(env);
  removeCustomMarkers(env);
  addVariable(env, null, 'not run yet');
}

function setExampleCode(env, src) {
  editors[env].setValue(src, 1);
  editors[env].session.clearBreakpoints();
  resetVariables(env);
  addVariable(env, null, 'not run yet');
}
function example_sumLoop(env) {
  setExampleCode(env,
    'var array = [0, 1, 2, 3, 4, 5],\n' +
    '    sum = 0;\n' +
    '\n' +
    'for (var i = 0; i < array.length; i++)\n' +
    '  sum += array[i];'
  );
}

function example_sumReduce(env) {
  setExampleCode(env,
    'var array = [0, 1, 2, 3, 4, 5];\n' +
    'var sum = array.reduce(function(acc,  n) {\n' +
    '  return acc + n;\n' +
    '});'
  );
}

function example_fibonacci(env) {
  setExampleCode(env,
    'function fibo(n) {\n' +
    '  if (n <= 1)\n' +
    '    return n;\n' +
    '  return fibo(n - 1) + fibo(n - 2);\n' +
    '}\n' +
    '\n' +
    'var fib6 = fibo(6);'
  );
}

function example_square(env) {
  setExampleCode(env,
    'var a = 1;\n' +
    'var b = 2;\n' +
    '\n'+
    'function square(a) {\n' +
    '  var sq = a * a;\n' +
    '  return sq;\n' +
    '}\n' +
    '\n' +
    'var s = square(b);'
  );
}

function example_error(env) {
  setExampleCode(env,
    'var x = 1;\n' +
    'for (var i = 0; i < 5; i++) {\n' +
    '  y += 1; // y is not defined => Error here\n' +
    '  if (i == 3)\n' +
    '    debugger;\n' +
    '  x += i;\n' +
    '}'
  );
}

function findStatementAtLine(ast, line) {
  var maxLines = ast.loc.end.line,
      res;

  do {
    res = lively.ast.acorn.walk.findNodeAt(ast, null, null, function(type, node) {
      return node.loc.start.line === line;
    });
    line += 1;
  } while ((res == undefined) && (line <= maxLines));

  return res && lively.ast.acorn.walk.findStatementOfNode(ast, res.node);
}

function step(env, stopAtRow) {
  var editor = editors[env];
  if (!editor) return;

  resetVariables(env);

  var src = editor.getValue(),
      ast = lively.ast.parse(src, { sourceType: 'script', locations: true }),
      breakPoint = editor.session.getBreakpoints().indexOf('ace_breakpoint'),
      scope = { mapping: {} },
      interpreter = new lively.ast.AcornInterpreter.Interpreter();

  if (breakPoint > -1) {
    var node = findStatementAtLine(ast, breakPoint + 1);
    if (node) {
      node.isBreakpoint = true;

      // patch function
      interpreter.shouldHaltAtNextStatement = function(node) {
        return !!node.isBreakpoint;
      };
    }
  }

  var program = new lively.ast.AcornInterpreter.Function(ast),
      frame = lively.ast.AcornInterpreter.Frame.create(program, scope.mapping);
  program.lexicalScope = frame.getScope();
  
  try {
    interpreter.runWithFrameAndResult(ast, frame, undefined);
  } catch (e) {
    if (e.isUnwindException) // an UnwindException is thrown for the breakpoints (or errors)
      scope = e.top.getScope();
  }

  displayScope(env, scope);
}

function run(env) {
  var editor = editors[env];
  if (!editor) return;

  resetVariables(env);
  removeException(env);

  var srcPrefix = '(function() {',
      srcPostfix = ' });',
      src = srcPrefix + editor.getValue() + srcPostfix,
      func = eval(src),
      runtime, scope, ex, frame;
  
  try {
    runtime = lively.ast.StackReification.run(func);
    scope = runtime.currentFrame.getScope();
    if (runtime.isContinuation)
      frame = runtime.currentFrame;
  } catch(e) {
    if (e.unwindException) { // might have been an UnwindException originally
      ex = e.unwindException;
      ex.recreateFrames();
      frame = ex.top;
      scope = ex.top.getScope();
    }
  }
  if (scope) {
    displayScope(env, scope);
    if (frame)
      setException(env, frame, srcPrefix.length, ex);
  } else {
    setVariable(env, null, 'no exception triggered');
  }
}

function setException(env, frame, offset, err) {
  if (isNaN(offset)) offset = 0;

  var ex = document.getElementById('exception-' + env);
  if (!ex) return;
  ex.style.setProperty('display', 'block');
  if (err)
    ex.innerHTML = '<strong>' + err.error.name + ':</strong> ' + err.error.message;
  else
    ex.innerHTML = '<strong>Stopped execution:</strong> Debugger statement';

  var aceRange = ace.require('ace/range').Range,
      editor = editors[env],
      node;
  do {
    node = frame.getPC();
    var start = editor.session.doc.indexToPosition(node.start - offset - 1),
        end = editor.session.doc.indexToPosition(node.end - offset - 1);
    ex.innerHTML += '<br>&nbsp;&nbsp;&nbsp;&nbsp;at: ' + node.type + ' @ line ' + (start.row + 1) + ', column ' + start.column;
    var marker = editor.session.addMarker(new aceRange(start.row, start.column, end.row, end.column), 'programCounter', 'text', false);
    frame = frame.parentFrame;
  } while (frame);
}

function removeException(env) {
  var ex = document.getElementById('exception-' + env);
  if (ex)
    ex.style.setProperty('display', 'none');
}

function removeCustomMarkers(env) {
  var editor = editors[env],
      markers = editor.session.getMarkers();
  Object.getOwnPropertyNames(markers).forEach(function(markerId) {
    if (markers[markerId].clazz == 'programCounter')
      editor.session.removeMarker(markerId);
  });
}

function getVarList(env) {
  var list = document.getElementById('vars-' + env);
  if (!list) return null;
  list = list.getElementsByClassName('varList')[0];
  return list;
}

function resetVariables(env) {
  var varList = getVarList(env);
  if (!varList) return;
  Array.from(varList.children).forEach(function(child) {
    child.remove();
  });
}

function displayScope(env, scope) {
  do {
    var mapping = scope.mapping;
    Object.getOwnPropertyNames(mapping).forEach(function(varName) {
      setVariable(env, varName, mapping[varName]);
    });
    scope = scope.parentScope;
  } while (scope != null && scope.mapping != window);
}

function setVariable(env, varName, varValue) {
  var varList = getVarList(env);
  if (!varList) return;

  var allVars = Array.from(varList.getElementsByTagName('dt')).map(function(elem) {
    return elem.textContent;
  });

  if (allVars.indexOf(varName) == -1)
    addVariable(env, varName, varValue);
}

function addVariable(env, varName, varValue) {
  var varList = getVarList(env);
  if (!varList) return;

  var elem;
  if (varName != null) {
    elem = document.createElement('dt');
    elem.textContent = varName;
    varList.appendChild(elem);
  }
  elem = document.createElement('dd');
  strValue = String(varValue);
  var isFunc = strValue.match(/function\s+(.*)\s*\{/)
  if (isFunc) {
    strValue = isFunc[0] + ' ... }';
  }
  elem.textContent = strValue;
  varList.appendChild(elem);
}