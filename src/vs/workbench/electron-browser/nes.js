// The Module object: Our interface to the outside world. We import
// and export values on it, and do the work to get that through
// closure compiler if necessary. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(Module) { ..generated code.. }
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to do an eval in order to handle the closure compiler
// case, where this code here is minified but Module was defined
// elsewhere (e.g. case 4 above). We also need to check if Module
// already exists (e.g. case 3 above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module;
if (!Module) Module = (typeof Module !== 'undefined' ? Module : null) || {};

// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = {};
for (var key in Module) {
  if (Module.hasOwnProperty(key)) {
    moduleOverrides[key] = Module[key];
  }
}

// The environment setup code below is customized to use Module.
// *** Environment setup code ***
var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;

// Three configurations we can be running in:
// 1) We could be the application main() thread running in the main JS UI thread. (ENVIRONMENT_IS_WORKER == false and ENVIRONMENT_IS_PTHREAD == false)
// 2) We could be the application main() thread proxied to worker. (with Emscripten -s PROXY_TO_WORKER=1) (ENVIRONMENT_IS_WORKER == true, ENVIRONMENT_IS_PTHREAD == false)
// 3) We could be an application pthread running in a worker. (ENVIRONMENT_IS_WORKER == true and ENVIRONMENT_IS_PTHREAD == true)

if (Module['ENVIRONMENT']) {
  if (Module['ENVIRONMENT'] === 'WEB') {
    ENVIRONMENT_IS_WEB = true;
  } else if (Module['ENVIRONMENT'] === 'WORKER') {
    ENVIRONMENT_IS_WORKER = true;
  } else if (Module['ENVIRONMENT'] === 'NODE') {
    ENVIRONMENT_IS_NODE = true;
  } else if (Module['ENVIRONMENT'] === 'SHELL') {
    ENVIRONMENT_IS_SHELL = true;
  } else {
    throw new Error('The provided Module[\'ENVIRONMENT\'] value is not valid. It must be one of: WEB|WORKER|NODE|SHELL.');
  }
} else {
  ENVIRONMENT_IS_WEB = typeof window === 'object';
  ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
  ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function' && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
  ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
}


if (ENVIRONMENT_IS_NODE) {
  // Expose functionality in the same simple way that the shells work
  // Note that we pollute the global namespace here, otherwise we break in node
  if (!Module['print']) Module['print'] = console.log;
  if (!Module['printErr']) Module['printErr'] = console.warn;

  var nodeFS;
  var nodePath;

  Module['read'] = function read(filename, binary) {
    if (!nodeFS) nodeFS = require('fs');
    if (!nodePath) nodePath = require('path');

    filename = nodePath['normalize'](filename);
    var ret = nodeFS['readFileSync'](filename);
    // The path is absolute if the normalized version is the same as the resolved.
    if (!ret && filename != nodePath['resolve'](filename)) {
      filename = path.join(__dirname, '..', 'src', filename);
      ret = nodeFS['readFileSync'](filename);
    }
    if (ret && !binary) ret = ret.toString();
    return ret;
  };

  Module['readBinary'] = function readBinary(filename) {
    var ret = Module['read'](filename, true);
    if (!ret.buffer) {
      ret = new Uint8Array(ret);
    }
    assert(ret.buffer);
    return ret;
  };

  Module['load'] = function load(f) {
    globalEval(read(f));
  };

  if (!Module['thisProgram']) {
    if (process['argv'].length > 1) {
      Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
    } else {
      Module['thisProgram'] = 'unknown-program';
    }
  }

  Module['arguments'] = process['argv'].slice(2);

  if (typeof module !== 'undefined') {
    module['exports'] = Module;
  }

  process['on']('uncaughtException', function(ex) {
    // suppress ExitStatus exceptions from showing an error
    if (!(ex instanceof ExitStatus)) {
      throw ex;
    }
  });

  Module['inspect'] = function () { return '[Emscripten Module object]'; };
}
else if (ENVIRONMENT_IS_SHELL) {
  if (!Module['print']) Module['print'] = print;
  if (typeof printErr != 'undefined') Module['printErr'] = printErr; // not present in v8 or older sm

  if (typeof read != 'undefined') {
    Module['read'] = read;
  } else {
    Module['read'] = function read() { throw 'no read() available (jsc?)' };
  }

  Module['readBinary'] = function readBinary(f) {
    if (typeof readbuffer === 'function') {
      return new Uint8Array(readbuffer(f));
    }
    var data = read(f, 'binary');
    assert(typeof data === 'object');
    return data;
  };

  if (typeof scriptArgs != 'undefined') {
    Module['arguments'] = scriptArgs;
  } else if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

}
else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  Module['read'] = function read(url) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);
    xhr.send(null);
    return xhr.responseText;
  };

  Module['readAsync'] = function readAsync(url, onload, onerror) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function xhr_onload() {
      if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
        onload(xhr.response);
      } else {
        onerror();
      }
    };
    xhr.onerror = onerror;
    xhr.send(null);
  };

  if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof console !== 'undefined') {
    if (!Module['print']) Module['print'] = function print(x) {
      console.log(x);
    };
    if (!Module['printErr']) Module['printErr'] = function printErr(x) {
      console.warn(x);
    };
  } else {
    // Probably a worker, and without console.log. We can do very little here...
    var TRY_USE_DUMP = false;
    if (!Module['print']) Module['print'] = (TRY_USE_DUMP && (typeof(dump) !== "undefined") ? (function(x) {
      dump(x);
    }) : (function(x) {
      // self.postMessage(x); // enable this if you want stdout to be sent as messages
    }));
  }

  if (ENVIRONMENT_IS_WORKER) {
    Module['load'] = importScripts;
  }

  if (typeof Module['setWindowTitle'] === 'undefined') {
    Module['setWindowTitle'] = function(title) { document.title = title };
  }
}
else {
  // Unreachable because SHELL is dependant on the others
  throw 'Unknown runtime environment. Where are we?';
}

function globalEval(x) {
  eval.call(null, x);
}
if (!Module['load'] && Module['read']) {
  Module['load'] = function load(f) {
    globalEval(Module['read'](f));
  };
}
if (!Module['print']) {
  Module['print'] = function(){};
}
if (!Module['printErr']) {
  Module['printErr'] = Module['print'];
}
if (!Module['arguments']) {
  Module['arguments'] = [];
}
if (!Module['thisProgram']) {
  Module['thisProgram'] = './this.program';
}

// *** Environment setup code ***

// Closure helpers
Module.print = Module['print'];
Module.printErr = Module['printErr'];

// Callbacks
Module['preRun'] = [];
Module['postRun'] = [];

// Merge back in the overrides
for (var key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module[key] = moduleOverrides[key];
  }
}
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = undefined;



// {{PREAMBLE_ADDITIONS}}

// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html

//========================================
// Runtime code shared with compiler
//========================================

var Runtime = {
  setTempRet0: function (value) {
    tempRet0 = value;
  },
  getTempRet0: function () {
    return tempRet0;
  },
  stackSave: function () {
    return STACKTOP;
  },
  stackRestore: function (stackTop) {
    STACKTOP = stackTop;
  },
  getNativeTypeSize: function (type) {
    switch (type) {
      case 'i1': case 'i8': return 1;
      case 'i16': return 2;
      case 'i32': return 4;
      case 'i64': return 8;
      case 'float': return 4;
      case 'double': return 8;
      default: {
        if (type[type.length-1] === '*') {
          return Runtime.QUANTUM_SIZE; // A pointer
        } else if (type[0] === 'i') {
          var bits = parseInt(type.substr(1));
          assert(bits % 8 === 0);
          return bits/8;
        } else {
          return 0;
        }
      }
    }
  },
  getNativeFieldSize: function (type) {
    return Math.max(Runtime.getNativeTypeSize(type), Runtime.QUANTUM_SIZE);
  },
  STACK_ALIGN: 16,
  prepVararg: function (ptr, type) {
    if (type === 'double' || type === 'i64') {
      // move so the load is aligned
      if (ptr & 7) {
        assert((ptr & 7) === 4);
        ptr += 4;
      }
    } else {
      assert((ptr & 3) === 0);
    }
    return ptr;
  },
  getAlignSize: function (type, size, vararg) {
    // we align i64s and doubles on 64-bit boundaries, unlike x86
    if (!vararg && (type == 'i64' || type == 'double')) return 8;
    if (!type) return Math.min(size, 8); // align structures internally to 64 bits
    return Math.min(size || (type ? Runtime.getNativeFieldSize(type) : 0), Runtime.QUANTUM_SIZE);
  },
  dynCall: function (sig, ptr, args) {
    if (args && args.length) {
      assert(args.length == sig.length-1);
      if (!args.splice) args = Array.prototype.slice.call(args);
      args.splice(0, 0, ptr);
      assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
      return Module['dynCall_' + sig].apply(null, args);
    } else {
      assert(sig.length == 1);
      assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
      return Module['dynCall_' + sig].call(null, ptr);
    }
  },
  functionPointers: [],
  addFunction: function (func) {
    for (var i = 0; i < Runtime.functionPointers.length; i++) {
      if (!Runtime.functionPointers[i]) {
        Runtime.functionPointers[i] = func;
        return 2*(1 + i);
      }
    }
    throw 'Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.';
  },
  removeFunction: function (index) {
    Runtime.functionPointers[(index-2)/2] = null;
  },
  warnOnce: function (text) {
    if (!Runtime.warnOnce.shown) Runtime.warnOnce.shown = {};
    if (!Runtime.warnOnce.shown[text]) {
      Runtime.warnOnce.shown[text] = 1;
      Module.printErr(text);
    }
  },
  funcWrappers: {},
  getFuncWrapper: function (func, sig) {
    assert(sig);
    if (!Runtime.funcWrappers[sig]) {
      Runtime.funcWrappers[sig] = {};
    }
    var sigCache = Runtime.funcWrappers[sig];
    if (!sigCache[func]) {
      sigCache[func] = function dynCall_wrapper() {
        return Runtime.dynCall(sig, func, arguments);
      };
    }
    return sigCache[func];
  },
  getCompilerSetting: function (name) {
    throw 'You must build with -s RETAIN_COMPILER_SETTINGS=1 for Runtime.getCompilerSetting or emscripten_get_compiler_setting to work';
  },
  stackAlloc: function (size) { var ret = STACKTOP;STACKTOP = (STACKTOP + size)|0;STACKTOP = (((STACKTOP)+15)&-16);(assert((((STACKTOP|0) < (STACK_MAX|0))|0))|0); return ret; },
  staticAlloc: function (size) { var ret = STATICTOP;STATICTOP = (STATICTOP + (assert(!staticSealed),size))|0;STATICTOP = (((STATICTOP)+15)&-16); return ret; },
  dynamicAlloc: function (size) { var ret = DYNAMICTOP;DYNAMICTOP = (DYNAMICTOP + (assert(DYNAMICTOP > 0),size))|0;DYNAMICTOP = (((DYNAMICTOP)+15)&-16); if (DYNAMICTOP >= TOTAL_MEMORY) { var success = enlargeMemory(); if (!success) { DYNAMICTOP = ret;  return 0; } }; return ret; },
  alignMemory: function (size,quantum) { var ret = size = Math.ceil((size)/(quantum ? quantum : 16))*(quantum ? quantum : 16); return ret; },
  makeBigInt: function (low,high,unsigned) { var ret = (unsigned ? ((+((low>>>0)))+((+((high>>>0)))*4294967296.0)) : ((+((low>>>0)))+((+((high|0)))*4294967296.0))); return ret; },
  GLOBAL_BASE: 8,
  QUANTUM_SIZE: 4,
  __dummy__: 0
}



Module["Runtime"] = Runtime;



//========================================
// Runtime essentials
//========================================

var ABORT = false; // whether we are quitting the application. no code should run after this. set in exit() and abort()
var EXITSTATUS = 0;

function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed: ' + text);
  }
}

var globalScope = this;

// Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
function getCFunc(ident) {
  var func = Module['_' + ident]; // closure exported function
  if (!func) {
    try { func = eval('_' + ident); } catch(e) {}
  }
  assert(func, 'Cannot call unknown function ' + ident + ' (perhaps LLVM optimizations or closure removed it?)');
  return func;
}

var cwrap, ccall;
(function(){
  var JSfuncs = {
    // Helpers for cwrap -- it can't refer to Runtime directly because it might
    // be renamed by closure, instead it calls JSfuncs['stackSave'].body to find
    // out what the minified function name is.
    'stackSave': function() {
      Runtime.stackSave()
    },
    'stackRestore': function() {
      Runtime.stackRestore()
    },
    // type conversion from js to c
    'arrayToC' : function(arr) {
      var ret = Runtime.stackAlloc(arr.length);
      writeArrayToMemory(arr, ret);
      return ret;
    },
    'stringToC' : function(str) {
      var ret = 0;
      if (str !== null && str !== undefined && str !== 0) { // null string
        // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
        ret = Runtime.stackAlloc((str.length << 2) + 1);
        writeStringToMemory(str, ret);
      }
      return ret;
    }
  };
  // For fast lookup of conversion functions
  var toC = {'string' : JSfuncs['stringToC'], 'array' : JSfuncs['arrayToC']};

  // C calling interface.
  ccall = function ccallFunc(ident, returnType, argTypes, args, opts) {
    var func = getCFunc(ident);
    var cArgs = [];
    var stack = 0;
    assert(returnType !== 'array', 'Return type should not be "array".');
    if (args) {
      for (var i = 0; i < args.length; i++) {
        var converter = toC[argTypes[i]];
        if (converter) {
          if (stack === 0) stack = Runtime.stackSave();
          cArgs[i] = converter(args[i]);
        } else {
          cArgs[i] = args[i];
        }
      }
    }
    var ret = func.apply(null, cArgs);
    if ((!opts || !opts.async) && typeof EmterpreterAsync === 'object') {
      assert(!EmterpreterAsync.state, 'cannot start async op with normal JS calling ccall');
    }
    if (opts && opts.async) assert(!returnType, 'async ccalls cannot return values');
    if (returnType === 'string') ret = Pointer_stringify(ret);
    if (stack !== 0) {
      if (opts && opts.async) {
        EmterpreterAsync.asyncFinalizers.push(function() {
          Runtime.stackRestore(stack);
        });
        return;
      }
      Runtime.stackRestore(stack);
    }
    return ret;
  }

  var sourceRegex = /^function\s*[a-zA-Z$_0-9]*\s*\(([^)]*)\)\s*{\s*([^*]*?)[\s;]*(?:return\s*(.*?)[;\s]*)?}$/;
  function parseJSFunc(jsfunc) {
    // Match the body and the return value of a javascript function source
    var parsed = jsfunc.toString().match(sourceRegex).slice(1);
    return {arguments : parsed[0], body : parsed[1], returnValue: parsed[2]}
  }

  // sources of useful functions. we create this lazily as it can trigger a source decompression on this entire file
  var JSsource = null;
  function ensureJSsource() {
    if (!JSsource) {
      JSsource = {};
      for (var fun in JSfuncs) {
        if (JSfuncs.hasOwnProperty(fun)) {
          // Elements of toCsource are arrays of three items:
          // the code, and the return value
          JSsource[fun] = parseJSFunc(JSfuncs[fun]);
        }
      }
    }
  }

  cwrap = function cwrap(ident, returnType, argTypes) {
    argTypes = argTypes || [];
    var cfunc = getCFunc(ident);
    // When the function takes numbers and returns a number, we can just return
    // the original function
    var numericArgs = argTypes.every(function(type){ return type === 'number'});
    var numericRet = (returnType !== 'string');
    if ( numericRet && numericArgs) {
      return cfunc;
    }
    // Creation of the arguments list (["$1","$2",...,"$nargs"])
    var argNames = argTypes.map(function(x,i){return '$'+i});
    var funcstr = "(function(" + argNames.join(',') + ") {";
    var nargs = argTypes.length;
    if (!numericArgs) {
      // Generate the code needed to convert the arguments from javascript
      // values to pointers
      ensureJSsource();
      funcstr += 'var stack = ' + JSsource['stackSave'].body + ';';
      for (var i = 0; i < nargs; i++) {
        var arg = argNames[i], type = argTypes[i];
        if (type === 'number') continue;
        var convertCode = JSsource[type + 'ToC']; // [code, return]
        funcstr += 'var ' + convertCode.arguments + ' = ' + arg + ';';
        funcstr += convertCode.body + ';';
        funcstr += arg + '=(' + convertCode.returnValue + ');';
      }
    }

    // When the code is compressed, the name of cfunc is not literally 'cfunc' anymore
    var cfuncname = parseJSFunc(function(){return cfunc}).returnValue;
    // Call the function
    funcstr += 'var ret = ' + cfuncname + '(' + argNames.join(',') + ');';
    if (!numericRet) { // Return type can only by 'string' or 'number'
      // Convert the result to a string
      var strgfy = parseJSFunc(function(){return Pointer_stringify}).returnValue;
      funcstr += 'ret = ' + strgfy + '(ret);';
    }
    funcstr += "if (typeof EmterpreterAsync === 'object') { assert(!EmterpreterAsync.state, 'cannot start async op with normal JS calling cwrap') }";
    if (!numericArgs) {
      // If we had a stack, restore it
      ensureJSsource();
      funcstr += JSsource['stackRestore'].body.replace('()', '(stack)') + ';';
    }
    funcstr += 'return ret})';
    return eval(funcstr);
  };
})();
Module["ccall"] = ccall;
Module["cwrap"] = cwrap;

function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': HEAP8[((ptr)>>0)]=value; break;
      case 'i8': HEAP8[((ptr)>>0)]=value; break;
      case 'i16': HEAP16[((ptr)>>1)]=value; break;
      case 'i32': HEAP32[((ptr)>>2)]=value; break;
      case 'i64': (tempI64 = [value>>>0,(tempDouble=value,(+(Math_abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math_min((+(Math_floor((tempDouble)/4294967296.0))), 4294967295.0))|0)>>>0 : (~~((+(Math_ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)],HEAP32[((ptr)>>2)]=tempI64[0],HEAP32[(((ptr)+(4))>>2)]=tempI64[1]); break;
      case 'float': HEAPF32[((ptr)>>2)]=value; break;
      case 'double': HEAPF64[((ptr)>>3)]=value; break;
      default: abort('invalid type for setValue: ' + type);
    }
}
Module["setValue"] = setValue;


function getValue(ptr, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': return HEAP8[((ptr)>>0)];
      case 'i8': return HEAP8[((ptr)>>0)];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP32[((ptr)>>2)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      default: abort('invalid type for setValue: ' + type);
    }
  return null;
}
Module["getValue"] = getValue;

var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call
var ALLOC_STATIC = 2; // Cannot be freed
var ALLOC_DYNAMIC = 3; // Cannot be freed except through sbrk
var ALLOC_NONE = 4; // Do not allocate
Module["ALLOC_NORMAL"] = ALLOC_NORMAL;
Module["ALLOC_STACK"] = ALLOC_STACK;
Module["ALLOC_STATIC"] = ALLOC_STATIC;
Module["ALLOC_DYNAMIC"] = ALLOC_DYNAMIC;
Module["ALLOC_NONE"] = ALLOC_NONE;

// allocate(): This is for internal use. You can use it yourself as well, but the interface
//             is a little tricky (see docs right below). The reason is that it is optimized
//             for multiple syntaxes to save space in generated code. So you should
//             normally not use allocate(), and instead allocate memory using _malloc(),
//             initialize it with setValue(), and so forth.
// @slab: An array of data, or a number. If a number, then the size of the block to allocate,
//        in *bytes* (note that this is sometimes confusing: the next parameter does not
//        affect this!)
// @types: Either an array of types, one for each byte (or 0 if no type at that position),
//         or a single type which is used for the entire block. This only matters if there
//         is initial data - if @slab is a number, then this does not matter at all and is
//         ignored.
// @allocator: How to allocate memory, see ALLOC_*
function allocate(slab, types, allocator, ptr) {
  var zeroinit, size;
  if (typeof slab === 'number') {
    zeroinit = true;
    size = slab;
  } else {
    zeroinit = false;
    size = slab.length;
  }

  var singleType = typeof types === 'string' ? types : null;

  var ret;
  if (allocator == ALLOC_NONE) {
    ret = ptr;
  } else {
    ret = [typeof _malloc === 'function' ? _malloc : Runtime.staticAlloc, Runtime.stackAlloc, Runtime.staticAlloc, Runtime.dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length));
  }

  if (zeroinit) {
    var ptr = ret, stop;
    assert((ret & 3) == 0);
    stop = ret + (size & ~3);
    for (; ptr < stop; ptr += 4) {
      HEAP32[((ptr)>>2)]=0;
    }
    stop = ret + size;
    while (ptr < stop) {
      HEAP8[((ptr++)>>0)]=0;
    }
    return ret;
  }

  if (singleType === 'i8') {
    if (slab.subarray || slab.slice) {
      HEAPU8.set(slab, ret);
    } else {
      HEAPU8.set(new Uint8Array(slab), ret);
    }
    return ret;
  }

  var i = 0, type, typeSize, previousType;
  while (i < size) {
    var curr = slab[i];

    if (typeof curr === 'function') {
      curr = Runtime.getFunctionIndex(curr);
    }

    type = singleType || types[i];
    if (type === 0) {
      i++;
      continue;
    }
    assert(type, 'Must know what type to store in allocate!');

    if (type == 'i64') type = 'i32'; // special case: we have one i32 here, and one i32 later

    setValue(ret+i, curr, type);

    // no need to look up size unless type changes, so cache it
    if (previousType !== type) {
      typeSize = Runtime.getNativeTypeSize(type);
      previousType = type;
    }
    i += typeSize;
  }

  return ret;
}
Module["allocate"] = allocate;

// Allocate memory during any stage of startup - static memory early on, dynamic memory later, malloc when ready
function getMemory(size) {
  if (!staticSealed) return Runtime.staticAlloc(size);
  if ((typeof _sbrk !== 'undefined' && !_sbrk.called) || !runtimeInitialized) return Runtime.dynamicAlloc(size);
  return _malloc(size);
}
Module["getMemory"] = getMemory;

function Pointer_stringify(ptr, /* optional */ length) {
  if (length === 0 || !ptr) return '';
  // TODO: use TextDecoder
  // Find the length, and check for UTF while doing so
  var hasUtf = 0;
  var t;
  var i = 0;
  while (1) {
    assert(ptr + i < TOTAL_MEMORY);
    t = HEAPU8[(((ptr)+(i))>>0)];
    hasUtf |= t;
    if (t == 0 && !length) break;
    i++;
    if (length && i == length) break;
  }
  if (!length) length = i;

  var ret = '';

  if (hasUtf < 128) {
    var MAX_CHUNK = 1024; // split up into chunks, because .apply on a huge string can overflow the stack
    var curr;
    while (length > 0) {
      curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
      ret = ret ? ret + curr : curr;
      ptr += MAX_CHUNK;
      length -= MAX_CHUNK;
    }
    return ret;
  }
  return Module['UTF8ToString'](ptr);
}
Module["Pointer_stringify"] = Pointer_stringify;

// Given a pointer 'ptr' to a null-terminated ASCII-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function AsciiToString(ptr) {
  var str = '';
  while (1) {
    var ch = HEAP8[((ptr++)>>0)];
    if (!ch) return str;
    str += String.fromCharCode(ch);
  }
}
Module["AsciiToString"] = AsciiToString;

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in ASCII form. The copy will require at most str.length+1 bytes of space in the HEAP.

function stringToAscii(str, outPtr) {
  return writeAsciiToMemory(str, outPtr, false);
}
Module["stringToAscii"] = stringToAscii;

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the given array that contains uint8 values, returns
// a copy of that string as a Javascript String object.

function UTF8ArrayToString(u8Array, idx) {
  var u0, u1, u2, u3, u4, u5;

  var str = '';
  while (1) {
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    u0 = u8Array[idx++];
    if (!u0) return str;
    if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
    u1 = u8Array[idx++] & 63;
    if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
    u2 = u8Array[idx++] & 63;
    if ((u0 & 0xF0) == 0xE0) {
      u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
    } else {
      u3 = u8Array[idx++] & 63;
      if ((u0 & 0xF8) == 0xF0) {
        u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | u3;
      } else {
        u4 = u8Array[idx++] & 63;
        if ((u0 & 0xFC) == 0xF8) {
          u0 = ((u0 & 3) << 24) | (u1 << 18) | (u2 << 12) | (u3 << 6) | u4;
        } else {
          u5 = u8Array[idx++] & 63;
          u0 = ((u0 & 1) << 30) | (u1 << 24) | (u2 << 18) | (u3 << 12) | (u4 << 6) | u5;
        }
      }
    }
    if (u0 < 0x10000) {
      str += String.fromCharCode(u0);
    } else {
      var ch = u0 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    }
  }
}
Module["UTF8ArrayToString"] = UTF8ArrayToString;

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function UTF8ToString(ptr) {
  return UTF8ArrayToString(HEAPU8,ptr);
}
Module["UTF8ToString"] = UTF8ToString;

// Copies the given Javascript String object 'str' to the given byte array at address 'outIdx',
// encoded in UTF8 form and null-terminated. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outU8Array: the array to copy to. Each index in this array is assumed to be one 8-byte element.
//   outIdx: The starting offset in the array to begin the copying.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=1, only the null terminator will be written and nothing else.
//                    maxBytesToWrite=0 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
  if (!(maxBytesToWrite > 0)) // Parameter maxBytesToWrite is not optional. Negative values, 0, null, undefined and false each don't write out any bytes.
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      outU8Array[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      outU8Array[outIdx++] = 0xC0 | (u >> 6);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      outU8Array[outIdx++] = 0xE0 | (u >> 12);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x1FFFFF) {
      if (outIdx + 3 >= endIdx) break;
      outU8Array[outIdx++] = 0xF0 | (u >> 18);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x3FFFFFF) {
      if (outIdx + 4 >= endIdx) break;
      outU8Array[outIdx++] = 0xF8 | (u >> 24);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 5 >= endIdx) break;
      outU8Array[outIdx++] = 0xFC | (u >> 30);
      outU8Array[outIdx++] = 0x80 | ((u >> 24) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  outU8Array[outIdx] = 0;
  return outIdx - startIdx;
}
Module["stringToUTF8Array"] = stringToUTF8Array;

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF8 form. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  return stringToUTF8Array(str, HEAPU8,outPtr, maxBytesToWrite);
}
Module["stringToUTF8"] = stringToUTF8;

// Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF8(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      ++len;
    } else if (u <= 0x7FF) {
      len += 2;
    } else if (u <= 0xFFFF) {
      len += 3;
    } else if (u <= 0x1FFFFF) {
      len += 4;
    } else if (u <= 0x3FFFFFF) {
      len += 5;
    } else {
      len += 6;
    }
  }
  return len;
}
Module["lengthBytesUTF8"] = lengthBytesUTF8;

// Given a pointer 'ptr' to a null-terminated UTF16LE-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function UTF16ToString(ptr) {
  var i = 0;

  var str = '';
  while (1) {
    var codeUnit = HEAP16[(((ptr)+(i*2))>>1)];
    if (codeUnit == 0)
      return str;
    ++i;
    // fromCharCode constructs a character from a UTF-16 code unit, so we can pass the UTF16 string right through.
    str += String.fromCharCode(codeUnit);
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF16 form. The copy will require at most str.length*4+2 bytes of space in the HEAP.
// Use the function lengthBytesUTF16() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=2, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<2 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF16(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF16(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 2) return 0;
  maxBytesToWrite -= 2; // Null terminator.
  var startPtr = outPtr;
  var numCharsToWrite = (maxBytesToWrite < str.length*2) ? (maxBytesToWrite / 2) : str.length;
  for (var i = 0; i < numCharsToWrite; ++i) {
    // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    HEAP16[((outPtr)>>1)]=codeUnit;
    outPtr += 2;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP16[((outPtr)>>1)]=0;
  return outPtr - startPtr;
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF16(str) {
  return str.length*2;
}


function UTF32ToString(ptr) {
  var i = 0;

  var str = '';
  while (1) {
    var utf32 = HEAP32[(((ptr)+(i*4))>>2)];
    if (utf32 == 0)
      return str;
    ++i;
    // Gotcha: fromCharCode constructs a character from a UTF-16 encoded code (pair), not from a Unicode code point! So encode the code point to UTF-16 for constructing.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    if (utf32 >= 0x10000) {
      var ch = utf32 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    } else {
      str += String.fromCharCode(utf32);
    }
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF32 form. The copy will require at most str.length*4+4 bytes of space in the HEAP.
// Use the function lengthBytesUTF32() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=4, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<4 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF32(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF32(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 4) return 0;
  var startPtr = outPtr;
  var endPtr = startPtr + maxBytesToWrite - 4;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) {
      var trailSurrogate = str.charCodeAt(++i);
      codeUnit = 0x10000 + ((codeUnit & 0x3FF) << 10) | (trailSurrogate & 0x3FF);
    }
    HEAP32[((outPtr)>>2)]=codeUnit;
    outPtr += 4;
    if (outPtr + 4 > endPtr) break;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP32[((outPtr)>>2)]=0;
  return outPtr - startPtr;
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF32(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) ++i; // possibly a lead surrogate, so skip over the tail surrogate.
    len += 4;
  }

  return len;
}


function demangle(func) {
  var hasLibcxxabi = !!Module['___cxa_demangle'];
  if (hasLibcxxabi) {
    try {
      var buf = _malloc(func.length);
      writeStringToMemory(func.substr(1), buf);
      var status = _malloc(4);
      var ret = Module['___cxa_demangle'](buf, 0, 0, status);
      if (getValue(status, 'i32') === 0 && ret) {
        return Pointer_stringify(ret);
      }
      // otherwise, libcxxabi failed, we can try ours which may return a partial result
    } catch(e) {
      // failure when using libcxxabi, we can try ours which may return a partial result
      return func;
    } finally {
      if (buf) _free(buf);
      if (status) _free(status);
      if (ret) _free(ret);
    }
  }
  Runtime.warnOnce('warning: build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling');
  return func;
}

function demangleAll(text) {
  return text.replace(/__Z[\w\d_]+/g, function(x) { var y = demangle(x); return x === y ? x : (x + ' [' + y + ']') });
}

function jsStackTrace() {
  var err = new Error();
  if (!err.stack) {
    // IE10+ special cases: It does have callstack info, but it is only populated if an Error object is thrown,
    // so try that as a special-case.
    try {
      throw new Error(0);
    } catch(e) {
      err = e;
    }
    if (!err.stack) {
      return '(no stack trace available)';
    }
  }
  return err.stack.toString();
}

function stackTrace() {
  return demangleAll(jsStackTrace());
}
Module["stackTrace"] = stackTrace;

// Memory management

var PAGE_SIZE = 4096;

function alignMemoryPage(x) {
  if (x % 4096 > 0) {
    x += (4096 - (x % 4096));
  }
  return x;
}

var HEAP;
var buffer;
var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;

function updateGlobalBuffer(buf) {
  Module['buffer'] = buffer = buf;
}

function updateGlobalBufferViews() {
  Module['HEAP8'] = HEAP8 = new Int8Array(buffer);
  Module['HEAP16'] = HEAP16 = new Int16Array(buffer);
  Module['HEAP32'] = HEAP32 = new Int32Array(buffer);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
}

var STATIC_BASE = 0, STATICTOP = 0, staticSealed = false; // static area
var STACK_BASE = 0, STACKTOP = 0, STACK_MAX = 0; // stack area
var DYNAMIC_BASE = 0, DYNAMICTOP = 0; // dynamic area handled by sbrk


function abortOnCannotGrowMemory() {
  abort('Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value ' + TOTAL_MEMORY + ', (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which adjusts the size at runtime but prevents some optimizations, (3) set Module.TOTAL_MEMORY to a higher value before the program runs, or if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ');
}

function enlargeMemory() {
  abortOnCannotGrowMemory();
}


var TOTAL_STACK = Module['TOTAL_STACK'] || 5242880;
var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;

var totalMemory = 64*1024;
while (totalMemory < TOTAL_MEMORY || totalMemory < 2*TOTAL_STACK) {
  if (totalMemory < 16*1024*1024) {
    totalMemory *= 2;
  } else {
    totalMemory += 16*1024*1024
  }
}
if (totalMemory !== TOTAL_MEMORY) {
  Module.printErr('increasing TOTAL_MEMORY to ' + totalMemory + ' to be compliant with the asm.js spec (and given that TOTAL_STACK=' + TOTAL_STACK + ')');
  TOTAL_MEMORY = totalMemory;
}

// Initialize the runtime's memory
// check for full engine support (use string 'subarray' to avoid closure compiler confusion)
assert(typeof Int32Array !== 'undefined' && typeof Float64Array !== 'undefined' && !!(new Int32Array(1)['subarray']) && !!(new Int32Array(1)['set']),
       'JS engine does not provide full typed array support');



// Use a provided buffer, if there is one, or else allocate a new one
if (Module['buffer']) {
  buffer = Module['buffer'];
  assert(buffer.byteLength === TOTAL_MEMORY, 'provided buffer should be ' + TOTAL_MEMORY + ' bytes, but it is ' + buffer.byteLength);
} else {
  buffer = new ArrayBuffer(TOTAL_MEMORY);
}
updateGlobalBufferViews();


// Endianness check (note: assumes compiler arch was little-endian)
HEAP32[0] = 255;
if (HEAPU8[0] !== 255 || HEAPU8[3] !== 0) throw 'Typed arrays 2 must be run on a little-endian system';

Module['HEAP'] = HEAP;
Module['buffer'] = buffer;
Module['HEAP8'] = HEAP8;
Module['HEAP16'] = HEAP16;
Module['HEAP32'] = HEAP32;
Module['HEAPU8'] = HEAPU8;
Module['HEAPU16'] = HEAPU16;
Module['HEAPU32'] = HEAPU32;
Module['HEAPF32'] = HEAPF32;
Module['HEAPF64'] = HEAPF64;

function callRuntimeCallbacks(callbacks) {
  while(callbacks.length > 0) {
    var callback = callbacks.shift();
    if (typeof callback == 'function') {
      callback();
      continue;
    }
    var func = callback.func;
    if (typeof func === 'number') {
      if (callback.arg === undefined) {
        Runtime.dynCall('v', func);
      } else {
        Runtime.dynCall('vi', func, [callback.arg]);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}

var __ATPRERUN__  = []; // functions called before the runtime is initialized
var __ATINIT__    = []; // functions called during startup
var __ATMAIN__    = []; // functions called when main() is to be run
var __ATEXIT__    = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the runtime has exited

var runtimeInitialized = false;
var runtimeExited = false;


function preRun() {
  // compatibility - merge in anything from Module['preRun'] at this time
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}

function ensureInitRuntime() {
  if (runtimeInitialized) return;
  runtimeInitialized = true;
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
  callRuntimeCallbacks(__ATEXIT__);
  runtimeExited = true;
}

function postRun() {
  // compatibility - merge in anything from Module['postRun'] at this time
  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}
Module["addOnPreRun"] = addOnPreRun;

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}
Module["addOnInit"] = addOnInit;

function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}
Module["addOnPreMain"] = addOnPreMain;

function addOnExit(cb) {
  __ATEXIT__.unshift(cb);
}
Module["addOnExit"] = addOnExit;

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}
Module["addOnPostRun"] = addOnPostRun;

// Tools


function intArrayFromString(stringy, dontAddNull, length /* optional */) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}
Module["intArrayFromString"] = intArrayFromString;

function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 0xFF) {
      assert(false, 'Character code ' + chr + ' (' + String.fromCharCode(chr) + ')  at offset ' + i + ' not in 0x00-0xFF.');
      chr &= 0xFF;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}
Module["intArrayToString"] = intArrayToString;

function writeStringToMemory(string, buffer, dontAddNull) {
  var array = intArrayFromString(string, dontAddNull);
  var i = 0;
  while (i < array.length) {
    var chr = array[i];
    HEAP8[(((buffer)+(i))>>0)]=chr;
    i = i + 1;
  }
}
Module["writeStringToMemory"] = writeStringToMemory;

function writeArrayToMemory(array, buffer) {
  for (var i = 0; i < array.length; i++) {
    HEAP8[((buffer++)>>0)]=array[i];
  }
}
Module["writeArrayToMemory"] = writeArrayToMemory;

function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    assert(str.charCodeAt(i) === str.charCodeAt(i)&0xff);
    HEAP8[((buffer++)>>0)]=str.charCodeAt(i);
  }
  // Null-terminate the pointer to the HEAP.
  if (!dontAddNull) HEAP8[((buffer)>>0)]=0;
}
Module["writeAsciiToMemory"] = writeAsciiToMemory;

function unSign(value, bits, ignore) {
  if (value >= 0) {
    return value;
  }
  return bits <= 32 ? 2*Math.abs(1 << (bits-1)) + value // Need some trickery, since if bits == 32, we are right at the limit of the bits JS uses in bitshifts
                    : Math.pow(2, bits)         + value;
}
function reSign(value, bits, ignore) {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits-1)) // abs is needed if bits == 32
                        : Math.pow(2, bits-1);
  if (value >= half && (bits <= 32 || value > half)) { // for huge values, we can hit the precision limit and always get true here. so don't do that
                                                       // but, in general there is no perfect solution here. With 64-bit ints, we get rounding and errors
                                                       // TODO: In i64 mode 1, resign the two parts separately and safely
    value = -2*half + value; // Cannot bitshift half, as it may be at the limit of the bits JS uses in bitshifts
  }
  return value;
}


// check for imul support, and also for correctness ( https://bugs.webkit.org/show_bug.cgi?id=126345 )
if (!Math['imul'] || Math['imul'](0xffffffff, 5) !== -5) Math['imul'] = function imul(a, b) {
  var ah  = a >>> 16;
  var al = a & 0xffff;
  var bh  = b >>> 16;
  var bl = b & 0xffff;
  return (al*bl + ((ah*bl + al*bh) << 16))|0;
};
Math.imul = Math['imul'];


if (!Math['clz32']) Math['clz32'] = function(x) {
  x = x >>> 0;
  for (var i = 0; i < 32; i++) {
    if (x & (1 << (31 - i))) return i;
  }
  return 32;
};
Math.clz32 = Math['clz32']

var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_min = Math.min;
var Math_clz32 = Math.clz32;

// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// PRE_RUN_ADDITIONS (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled
var runDependencyTracking = {};

function getUniqueRunDependency(id) {
  var orig = id;
  while (1) {
    if (!runDependencyTracking[id]) return id;
    id = orig + Math.random();
  }
  return id;
}

function addRunDependency(id) {
  runDependencies++;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval !== 'undefined') {
      // Check for missing dependencies every few seconds
      runDependencyWatcher = setInterval(function() {
        if (ABORT) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
          return;
        }
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            Module.printErr('still waiting on run dependencies:');
          }
          Module.printErr('dependency: ' + dep);
        }
        if (shown) {
          Module.printErr('(end of list)');
        }
      }, 10000);
    }
  } else {
    Module.printErr('warning: run dependency added without ID');
  }
}
Module["addRunDependency"] = addRunDependency;

function removeRunDependency(id) {
  runDependencies--;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    Module.printErr('warning: run dependency removed without ID');
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}
Module["removeRunDependency"] = removeRunDependency;

Module["preloadedImages"] = {}; // maps url to image data
Module["preloadedAudios"] = {}; // maps url to audio data



var memoryInitializer = null;



var /* show errors on likely calls to FS when it was not included */ FS = {
  error: function() {
    abort('Filesystem support (FS) was not included. The problem is that you are using files from JS, but files were not used from C/C++, so filesystem support was not auto-included. You can force-include filesystem support with  -s FORCE_FILESYSTEM=1');
  },
  init: function() { FS.error() },
  createDataFile: function() { FS.error() },
  createPreloadedFile: function() { FS.error() },
  createLazyFile: function() { FS.error() },
  open: function() { FS.error() },
  mkdev: function() { FS.error() },
  registerDevice: function() { FS.error() },
  analyzePath: function() { FS.error() },
  loadFilesFromDB: function() { FS.error() },

  ErrnoError: function ErrnoError() { FS.error() },
};
Module['FS_createDataFile'] = FS.createDataFile;
Module['FS_createPreloadedFile'] = FS.createPreloadedFile;

// === Body ===

var ASM_CONSTS = [function($0, $1) { { Module.printErr('bad name in getProcAddress: ' + [Pointer_stringify($0), Pointer_stringify($1)]); } }];

function _emscripten_asm_const_iii(code, a0, a1) {
 return ASM_CONSTS[code](a0, a1);
}



STATIC_BASE = 8;

STATICTOP = STATIC_BASE + 4656;
  /* global initializers */  __ATINIT__.push();


/* memory initializer */ allocate([5,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,3,0,0,0,48,14,0,0,0,4,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,10,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,69,88,84,0,65,82,66,0,79,69,83,0,65,78,71,76,69,0,103,108,67,114,101,97,116,101,80,114,111,103,114,97,109,79,98,106,101,99,116,0,103,108,67,114,101,97,116,101,80,114,111,103,114,97,109,0,103,108,85,115,101,80,114,111,103,114,97,109,79,98,106,101,99,116,0,103,108,85,115,101,80,114,111,103,114,97,109,0,103,108,67,114,101,97,116,101,83,104,97,100,101,114,79,98,106,101,99,116,0,103,108,67,114,101,97,116,101,83,104,97,100,101,114,0,103,108,65,116,116,97,99,104,79,98,106,101,99,116,0,103,108,65,116,116,97,99,104,83,104,97,100,101,114,0,103,108,68,101,116,97,99,104,79,98,106,101,99,116,0,103,108,68,101,116,97,99,104,83,104,97,100,101,114,0,103,108,80,105,120,101,108,83,116,111,114,101,105,0,103,108,71,101,116,83,116,114,105,110,103,0,103,108,71,101,116,73,110,116,101,103,101,114,118,0,103,108,71,101,116,70,108,111,97,116,118,0,103,108,71,101,116,66,111,111,108,101,97,110,118,0,103,108,71,101,110,84,101,120,116,117,114,101,115,0,103,108,68,101,108,101,116,101,84,101,120,116,117,114,101,115,0,103,108,67,111,109,112,114,101,115,115,101,100,84,101,120,73,109,97,103,101,50,68,0,103,108,67,111,109,112,114,101,115,115,101,100,84,101,120,83,117,98,73,109,97,103,101,50,68,0,103,108,84,101,120,73,109,97,103,101,50,68,0,103,108,84,101,120,83,117,98,73,109,97,103,101,50,68,0,103,108,82,101,97,100,80,105,120,101,108,115,0,103,108,66,105,110,100,84,101,120,116,117,114,101,0,103,108,71,101,116,84,101,120,80,97,114,97,109,101,116,101,114,102,118,0,103,108,71,101,116,84,101,120,80,97,114,97,109,101,116,101,114,105,118,0,103,108,84,101,120,80,97,114,97,109,101,116,101,114,102,118,0,103,108,84,101,120,80,97,114,97,109,101,116,101,114,105,118,0,103,108,73,115,84,101,120,116,117,114,101,0,103,108,71,101,110,66,117,102,102,101,114,115,0,103,108,68,101,108,101,116,101,66,117,102,102,101,114,115,0,103,108,71,101,116,66,117,102,102,101,114,80,97,114,97,109,101,116,101,114,105,118,0,103,108,66,117,102,102,101,114,68,97,116,97,0,103,108,66,117,102,102,101,114,83,117,98,68,97,116,97,0,103,108,73,115,66,117,102,102,101,114,0,103,108,71,101,110,82,101,110,100,101,114,98,117,102,102,101,114,115,0,103,108,68,101,108,101,116,101,82,101,110,100,101,114,98,117,102,102,101,114,115,0,103,108,66,105,110,100,82,101,110,100,101,114,98,117,102,102,101,114,0,103,108,71,101,116,82,101,110,100,101,114,98,117,102,102,101,114,80,97,114,97,109,101,116,101,114,105,118,0,103,108,73,115,82,101,110,100,101,114,98,117,102,102,101,114,0,103,108,71,101,116,85,110,105,102,111,114,109,102,118,0,103,108,71,101,116,85,110,105,102,111,114,109,105,118,0,103,108,71,101,116,85,110,105,102,111,114,109,76,111,99,97,116,105,111,110,0,103,108,71,101,116,86,101,114,116,101,120,65,116,116,114,105,98,102,118,0,103,108,71,101,116,86,101,114,116,101,120,65,116,116,114,105,98,105,118,0,103,108,71,101,116,86,101,114,116,101,120,65,116,116,114,105,98,80,111,105,110,116,101,114,118,0,103,108,71,101,116,65,99,116,105,118,101,85,110,105,102,111,114,109,0,103,108,85,110,105,102,111,114,109,49,102,0,103,108,85,110,105,102,111,114,109,50,102,0,103,108,85,110,105,102,111,114,109,51,102,0,103,108,85,110,105,102,111,114,109,52,102,0,103,108,85,110,105,102,111,114,109,49,105,0,103,108,85,110,105,102,111,114,109,50,105,0,103,108,85,110,105,102,111,114,109,51,105,0,103,108,85,110,105,102,111,114,109,52,105,0,103,108,85,110,105,102,111,114,109,49,105,118,0,103,108,85,110,105,102,111,114,109,50,105,118,0,103,108,85,110,105,102,111,114,109,51,105,118,0,103,108,85,110,105,102,111,114,109,52,105,118,0,103,108,85,110,105,102,111,114,109,49,102,118,0,103,108,85,110,105,102,111,114,109,50,102,118,0,103,108,85,110,105,102,111,114,109,51,102,118,0,103,108,85,110,105,102,111,114,109,52,102,118,0,103,108,85,110,105,102,111,114,109,77,97,116,114,105,120,50,102,118,0,103,108,85,110,105,102,111,114,109,77,97,116,114,105,120,51,102,118,0,103,108,85,110,105,102,111,114,109,77,97,116,114,105,120,52,102,118,0,103,108,66,105,110,100,66,117,102,102,101,114,0,103,108,86,101,114,116,101,120,65,116,116,114,105,98,49,102,118,0,103,108,86,101,114,116,101,120,65,116,116,114,105,98,50,102,118,0,103,108,86,101,114,116,101,120,65,116,116,114,105,98,51,102,118,0,103,108,86,101,114,116,101,120,65,116,116,114,105,98,52,102,118,0,103,108,71,101,116,65,116,116,114,105,98,76,111,99,97,116,105,111,110,0,103,108,71,101,116,65,99,116,105,118,101,65,116,116,114,105,98,0,103,108,68,101,108,101,116,101,83,104,97,100,101,114,0,103,108,71,101,116,65,116,116,97,99,104,101,100,83,104,97,100,101,114,115,0,103,108,83,104,97,100,101,114,83,111,117,114,99,101,0,103,108,71,101,116,83,104,97,100,101,114,83,111,117,114,99,101,0,103,108,67,111,109,112,105,108,101,83,104,97,100,101,114,0,103,108,71,101,116,83,104,97,100,101,114,73,110,102,111,76,111,103,0,103,108,71,101,116,83,104,97,100,101,114,105,118,0,103,108,71,101,116,80,114,111,103,114,97,109,105,118,0,103,108,73,115,83,104,97,100,101,114,0,103,108,68,101,108,101,116,101,80,114,111,103,114,97,109,0,103,108,71,101,116,83,104,97,100,101,114,80,114,101,99,105,115,105,111,110,70,111,114,109,97,116,0,103,108,76,105,110,107,80,114,111,103,114,97,109,0,103,108,71,101,116,80,114,111,103,114,97,109,73,110,102,111,76,111,103,0,103,108,86,97,108,105,100,97,116,101,80,114,111,103,114,97,109,0,103,108,73,115,80,114,111,103,114,97,109,0,103,108,66,105,110,100,65,116,116,114,105,98,76,111,99,97,116,105,111,110,0,103,108,66,105,110,100,70,114,97,109,101,98,117,102,102,101,114,0,103,108,71,101,110,70,114,97,109,101,98,117,102,102,101,114,115,0,103,108,68,101,108,101,116,101,70,114,97,109,101,98,117,102,102,101,114,115,0,103,108,70,114,97,109,101,98,117,102,102,101,114,82,101,110,100,101,114,98,117,102,102,101,114,0,103,108,70,114,97,109,101,98,117,102,102,101,114,84,101,120,116,117,114,101,50,68,0,103,108,71,101,116,70,114,97,109,101,98,117,102,102,101,114,65,116,116,97,99,104,109,101,110,116,80,97,114,97,109,101,116,101,114,105,118,0,103,108,73,115,70,114,97,109,101,98,117,102,102,101,114,0,103,108,68,101,108,101,116,101,79,98,106,101,99,116,0,103,108,71,101,116,79,98,106,101,99,116,80,97,114,97,109,101,116,101,114,105,118,0,103,108,71,101,116,73,110,102,111,76,111,103,0,103,108,66,105,110,100,80,114,111,103,114,97,109,0,103,108,71,101,116,80,111,105,110,116,101,114,118,0,103,108,68,114,97,119,82,97,110,103,101,69,108,101,109,101,110,116,115,0,103,108,69,110,97,98,108,101,67,108,105,101,110,116,83,116,97,116,101,0,103,108,86,101,114,116,101,120,80,111,105,110,116,101,114,0,103,108,84,101,120,67,111,111,114,100,80,111,105,110,116,101,114,0,103,108,78,111,114,109,97,108,80,111,105,110,116,101,114,0,103,108,67,111,108,111,114,80,111,105,110,116,101,114,0,103,108,67,108,105,101,110,116,65,99,116,105,118,101,84,101,120,116,117,114,101,0,103,108,71,101,110,86,101,114,116,101,120,65,114,114,97,121,115,0,103,108,68,101,108,101,116,101,86,101,114,116,101,120,65,114,114,97,121,115,0,103,108,66,105,110,100,86,101,114,116,101,120,65,114,114,97,121,0,103,108,77,97,116,114,105,120,77,111,100,101,0,103,108,76,111,97,100,73,100,101,110,116,105,116,121,0,103,108,76,111,97,100,77,97,116,114,105,120,102,0,103,108,70,114,117,115,116,117,109,0,103,108,82,111,116,97,116,101,102,0,103,108,86,101,114,116,101,120,65,116,116,114,105,98,80,111,105,110,116,101,114,0,103,108,69,110,97,98,108,101,86,101,114,116,101,120,65,116,116,114,105,98,65,114,114,97,121,0,103,108,68,105,115,97,98,108,101,86,101,114,116,101,120,65,116,116,114,105,98,65,114,114,97,121,0,103,108,68,114,97,119,65,114,114,97,121,115,0,103,108,68,114,97,119,69,108,101,109,101,110,116,115,0,103,108,83,104,97,100,101,114,66,105,110,97,114,121,0,103,108,82,101,108,101,97,115,101,83,104,97,100,101,114,67,111,109,112,105,108,101,114,0,103,108,71,101,116,69,114,114,111,114,0,103,108,86,101,114,116,101,120,65,116,116,114,105,98,68,105,118,105,115,111,114,0,103,108,68,114,97,119,65,114,114,97,121,115,73,110,115,116,97,110,99,101,100,0,103,108,68,114,97,119,69,108,101,109,101,110,116,115,73,110,115,116,97,110,99,101,100,0,103,108,70,105,110,105,115,104,0,103,108,70,108,117,115,104,0,103,108,67,108,101,97,114,68,101,112,116,104,0,103,108,67,108,101,97,114,68,101,112,116,104,102,0,103,108,68,101,112,116,104,70,117,110,99,0,103,108,69,110,97,98,108,101,0,103,108,68,105,115,97,98,108,101,0,103,108,70,114,111,110,116,70,97,99,101,0,103,108,67,117,108,108,70,97,99,101,0,103,108,67,108,101,97,114,0,103,108,76,105,110,101,87,105,100,116,104,0,103,108,67,108,101,97,114,83,116,101,110,99,105,108,0,103,108,68,101,112,116,104,77,97,115,107,0,103,108,83,116,101,110,99,105,108,77,97,115,107,0,103,108,67,104,101,99,107,70,114,97,109,101,98,117,102,102,101,114,83,116,97,116,117,115,0,103,108,71,101,110,101,114,97,116,101,77,105,112,109,97,112,0,103,108,65,99,116,105,118,101,84,101,120,116,117,114,101,0,103,108,66,108,101,110,100,69,113,117,97,116,105,111,110,0,103,108,73,115,69,110,97,98,108,101,100,0,103,108,66,108,101,110,100,70,117,110,99,0,103,108,66,108,101,110,100,69,113,117,97,116,105,111,110,83,101,112,97,114,97,116,101,0,103,108,68,101,112,116,104,82,97,110,103,101,0,103,108,68,101,112,116,104,82,97,110,103,101,102,0,103,108,83,116,101,110,99,105,108,77,97,115,107,83,101,112,97,114,97,116,101,0,103,108,72,105,110,116,0,103,108,80,111,108,121,103,111,110,79,102,102,115,101,116,0,103,108,86,101,114,116,101,120,65,116,116,114,105,98,49,102,0,103,108,83,97,109,112,108,101,67,111,118,101,114,97,103,101,0,103,108,84,101,120,80,97,114,97,109,101,116,101,114,105,0,103,108,84,101,120,80,97,114,97,109,101,116,101,114,102,0,103,108,86,101,114,116,101,120,65,116,116,114,105,98,50,102,0,103,108,83,116,101,110,99,105,108,70,117,110,99,0,103,108,83,116,101,110,99,105,108,79,112,0,103,108,86,105,101,119,112,111,114,116,0,103,108,67,108,101,97,114,67,111,108,111,114,0,103,108,83,99,105,115,115,111,114,0,103,108,86,101,114,116,101,120,65,116,116,114,105,98,51,102,0,103,108,67,111,108,111,114,77,97,115,107,0,103,108,82,101,110,100,101,114,98,117,102,102,101,114,83,116,111,114,97,103,101,0,103,108,66,108,101,110,100,70,117,110,99,83,101,112,97,114,97,116,101,0,103,108,66,108,101,110,100,67,111,108,111,114,0,103,108,83,116,101,110,99,105,108,70,117,110,99,83,101,112,97,114,97,116,101,0,103,108,83,116,101,110,99,105,108,79,112,83,101,112,97,114,97,116,101,0,103,108,86,101,114,116,101,120,65,116,116,114,105,98,52,102,0,103,108,67,111,112,121,84,101,120,73,109,97,103,101,50,68,0,103,108,67,111,112,121,84,101,120,83,117,98,73,109,97,103,101,50,68,0,103,108,68,114,97,119,66,117,102,102,101,114,115,0,123,32,77,111,100,117,108,101,46,112,114,105,110,116,69,114,114,40,39,98,97,100,32,110,97,109,101,32,105,110,32,103,101,116,80,114,111,99,65,100,100,114,101,115,115,58,32,39,32,43,32,91,80,111,105,110,116,101,114,95,115,116,114,105,110,103,105,102,121,40,36,48,41,44,32,80,111,105,110,116,101,114,95,115,116,114,105,110,103,105,102,121,40,36,49,41,93,41,59,32,125,0], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE);





/* no memory initializer */
var tempDoublePtr = STATICTOP; STATICTOP += 16;

assert(tempDoublePtr % 8 == 0);

function copyTempFloat(ptr) { // functions, because inlining this code increases code size too much

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

}

function copyTempDouble(ptr) {

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

  HEAP8[tempDoublePtr+4] = HEAP8[ptr+4];

  HEAP8[tempDoublePtr+5] = HEAP8[ptr+5];

  HEAP8[tempDoublePtr+6] = HEAP8[ptr+6];

  HEAP8[tempDoublePtr+7] = HEAP8[ptr+7];

}

// {{PRE_LIBRARY}}



  var GL={counter:1,lastError:0,buffers:[],mappedBuffers:{},programs:[],framebuffers:[],renderbuffers:[],textures:[],uniforms:[],shaders:[],vaos:[],contexts:[],currentContext:null,byteSizeByTypeRoot:5120,byteSizeByType:[1,1,2,2,4,4,4,2,3,4,8],programInfos:{},stringCache:{},packAlignment:4,unpackAlignment:4,init:function () {
        GL.miniTempBuffer = new Float32Array(GL.MINI_TEMP_BUFFER_SIZE);
        for (var i = 0; i < GL.MINI_TEMP_BUFFER_SIZE; i++) {
          GL.miniTempBufferViews[i] = GL.miniTempBuffer.subarray(0, i+1);
        }
      },recordError:function recordError(errorCode) {
        if (!GL.lastError) {
          GL.lastError = errorCode;
        }
      },getNewId:function (table) {
        var ret = GL.counter++;
        for (var i = table.length; i < ret; i++) {
          table[i] = null;
        }
        return ret;
      },MINI_TEMP_BUFFER_SIZE:16,miniTempBuffer:null,miniTempBufferViews:[0],getSource:function (shader, count, string, length) {
        var source = '';
        for (var i = 0; i < count; ++i) {
          var frag;
          if (length) {
            var len = HEAP32[(((length)+(i*4))>>2)];
            if (len < 0) {
              frag = Pointer_stringify(HEAP32[(((string)+(i*4))>>2)]);
            } else {
              frag = Pointer_stringify(HEAP32[(((string)+(i*4))>>2)], len);
            }
          } else {
            frag = Pointer_stringify(HEAP32[(((string)+(i*4))>>2)]);
          }
          source += frag;
        }
        return source;
      },createContext:function (canvas, webGLContextAttributes) {
        if (typeof webGLContextAttributes.majorVersion === 'undefined' && typeof webGLContextAttributes.minorVersion === 'undefined') {
          webGLContextAttributes.majorVersion = 1;
          webGLContextAttributes.minorVersion = 0;
        }
        var ctx;
        var errorInfo = '?';
        function onContextCreationError(event) {
          errorInfo = event.statusMessage || errorInfo;
        }
        try {
          canvas.addEventListener('webglcontextcreationerror', onContextCreationError, false);
          try {
            if (webGLContextAttributes.majorVersion == 1 && webGLContextAttributes.minorVersion == 0) {
              ctx = canvas.getContext("webgl", webGLContextAttributes) || canvas.getContext("experimental-webgl", webGLContextAttributes);
            } else if (webGLContextAttributes.majorVersion == 2 && webGLContextAttributes.minorVersion == 0) {
              ctx = canvas.getContext("webgl2", webGLContextAttributes) || canvas.getContext("experimental-webgl2", webGLContextAttributes);
            } else {
              throw 'Unsupported WebGL context version ' + majorVersion + '.' + minorVersion + '!'
            }
          } finally {
            canvas.removeEventListener('webglcontextcreationerror', onContextCreationError, false);
          }
          if (!ctx) throw ':(';
        } catch (e) {
          Module.print('Could not create canvas: ' + [errorInfo, e, JSON.stringify(webGLContextAttributes)]);
          return 0;
        }
        // possible GL_DEBUG entry point: ctx = wrapDebugGL(ctx);

        if (!ctx) return 0;
        return GL.registerContext(ctx, webGLContextAttributes);
      },registerContext:function (ctx, webGLContextAttributes) {
        var handle = GL.getNewId(GL.contexts);
        var context = {
          handle: handle,
          version: webGLContextAttributes.majorVersion,
          GLctx: ctx
        };
        // Store the created context object so that we can access the context given a canvas without having to pass the parameters again.
        if (ctx.canvas) ctx.canvas.GLctxObject = context;
        GL.contexts[handle] = context;
        if (typeof webGLContextAttributes['enableExtensionsByDefault'] === 'undefined' || webGLContextAttributes.enableExtensionsByDefault) {
          GL.initExtensions(context);
        }
        return handle;
      },makeContextCurrent:function (contextHandle) {
        var context = GL.contexts[contextHandle];
        if (!context) return false;
        GLctx = Module.ctx = context.GLctx; // Active WebGL context object.
        GL.currentContext = context; // Active Emscripten GL layer context object.
        return true;
      },getContext:function (contextHandle) {
        return GL.contexts[contextHandle];
      },deleteContext:function (contextHandle) {
        if (GL.currentContext === GL.contexts[contextHandle]) GL.currentContext = null;
        if (typeof JSEvents === 'object') JSEvents.removeAllHandlersOnTarget(GL.contexts[contextHandle].GLctx.canvas); // Release all JS event handlers on the DOM element that the GL context is associated with since the context is now deleted.
        if (GL.contexts[contextHandle] && GL.contexts[contextHandle].GLctx.canvas) GL.contexts[contextHandle].GLctx.canvas.GLctxObject = undefined; // Make sure the canvas object no longer refers to the context object so there are no GC surprises.
        GL.contexts[contextHandle] = null;
      },initExtensions:function (context) {
        // If this function is called without a specific context object, init the extensions of the currently active context.
        if (!context) context = GL.currentContext;

        if (context.initExtensionsDone) return;
        context.initExtensionsDone = true;

        var GLctx = context.GLctx;

        context.maxVertexAttribs = GLctx.getParameter(GLctx.MAX_VERTEX_ATTRIBS);

        // Detect the presence of a few extensions manually, this GL interop layer itself will need to know if they exist.

        if (context.version < 2) {
          // Extension available from Firefox 26 and Google Chrome 30
          var instancedArraysExt = GLctx.getExtension('ANGLE_instanced_arrays');
          if (instancedArraysExt) {
            GLctx['vertexAttribDivisor'] = function(index, divisor) { instancedArraysExt['vertexAttribDivisorANGLE'](index, divisor); };
            GLctx['drawArraysInstanced'] = function(mode, first, count, primcount) { instancedArraysExt['drawArraysInstancedANGLE'](mode, first, count, primcount); };
            GLctx['drawElementsInstanced'] = function(mode, count, type, indices, primcount) { instancedArraysExt['drawElementsInstancedANGLE'](mode, count, type, indices, primcount); };
          }

          // Extension available from Firefox 25 and WebKit
          var vaoExt = GLctx.getExtension('OES_vertex_array_object');
          if (vaoExt) {
            GLctx['createVertexArray'] = function() { return vaoExt['createVertexArrayOES'](); };
            GLctx['deleteVertexArray'] = function(vao) { vaoExt['deleteVertexArrayOES'](vao); };
            GLctx['bindVertexArray'] = function(vao) { vaoExt['bindVertexArrayOES'](vao); };
            GLctx['isVertexArray'] = function(vao) { return vaoExt['isVertexArrayOES'](vao); };
          }

          var drawBuffersExt = GLctx.getExtension('WEBGL_draw_buffers');
          if (drawBuffersExt) {
            GLctx['drawBuffers'] = function(n, bufs) { drawBuffersExt['drawBuffersWEBGL'](n, bufs); };
          }
        }

        // These are the 'safe' feature-enabling extensions that don't add any performance impact related to e.g. debugging, and
        // should be enabled by default so that client GLES2/GL code will not need to go through extra hoops to get its stuff working.
        // As new extensions are ratified at http://www.khronos.org/registry/webgl/extensions/ , feel free to add your new extensions
        // here, as long as they don't produce a performance impact for users that might not be using those extensions.
        // E.g. debugging-related extensions should probably be off by default.
        var automaticallyEnabledExtensions = [ "OES_texture_float", "OES_texture_half_float", "OES_standard_derivatives",
                                               "OES_vertex_array_object", "WEBGL_compressed_texture_s3tc", "WEBGL_depth_texture",
                                               "OES_element_index_uint", "EXT_texture_filter_anisotropic", "ANGLE_instanced_arrays",
                                               "OES_texture_float_linear", "OES_texture_half_float_linear", "WEBGL_compressed_texture_atc",
                                               "WEBGL_compressed_texture_pvrtc", "EXT_color_buffer_half_float", "WEBGL_color_buffer_float",
                                               "EXT_frag_depth", "EXT_sRGB", "WEBGL_draw_buffers", "WEBGL_shared_resources",
                                               "EXT_shader_texture_lod" ];

        function shouldEnableAutomatically(extension) {
          var ret = false;
          automaticallyEnabledExtensions.forEach(function(include) {
            if (ext.indexOf(include) != -1) {
              ret = true;
            }
          });
          return ret;
        }

        var exts = GLctx.getSupportedExtensions();
        if (exts && exts.length > 0) {
          GLctx.getSupportedExtensions().forEach(function(ext) {
            if (automaticallyEnabledExtensions.indexOf(ext) != -1) {
              GLctx.getExtension(ext); // Calling .getExtension enables that extension permanently, no need to store the return value to be enabled.
            }
          });
        }
      },populateUniformTable:function (program) {
        var p = GL.programs[program];
        GL.programInfos[program] = {
          uniforms: {},
          maxUniformLength: 0, // This is eagerly computed below, since we already enumerate all uniforms anyway.
          maxAttributeLength: -1 // This is lazily computed and cached, computed when/if first asked, "-1" meaning not computed yet.
        };

        var ptable = GL.programInfos[program];
        var utable = ptable.uniforms;
        // A program's uniform table maps the string name of an uniform to an integer location of that uniform.
        // The global GL.uniforms map maps integer locations to WebGLUniformLocations.
        var numUniforms = GLctx.getProgramParameter(p, GLctx.ACTIVE_UNIFORMS);
        for (var i = 0; i < numUniforms; ++i) {
          var u = GLctx.getActiveUniform(p, i);

          var name = u.name;
          ptable.maxUniformLength = Math.max(ptable.maxUniformLength, name.length+1);

          // Strip off any trailing array specifier we might have got, e.g. "[0]".
          if (name.indexOf(']', name.length-1) !== -1) {
            var ls = name.lastIndexOf('[');
            name = name.slice(0, ls);
          }

          // Optimize memory usage slightly: If we have an array of uniforms, e.g. 'vec3 colors[3];', then
          // only store the string 'colors' in utable, and 'colors[0]', 'colors[1]' and 'colors[2]' will be parsed as 'colors'+i.
          // Note that for the GL.uniforms table, we still need to fetch the all WebGLUniformLocations for all the indices.
          var loc = GLctx.getUniformLocation(p, name);
          var id = GL.getNewId(GL.uniforms);
          utable[name] = [u.size, id];
          GL.uniforms[id] = loc;

          for (var j = 1; j < u.size; ++j) {
            var n = name + '['+j+']';
            loc = GLctx.getUniformLocation(p, n);
            id = GL.getNewId(GL.uniforms);

            GL.uniforms[id] = loc;
          }
        }
      }};function _emscripten_glIsRenderbuffer(renderbuffer) {
      var rb = GL.renderbuffers[renderbuffer];
      if (!rb) return 0;
      return GLctx.isRenderbuffer(rb);
    }

  function _emscripten_glGetActiveAttrib(program, index, bufSize, length, size, type, name) {
      program = GL.programs[program];
      var info = GLctx.getActiveAttrib(program, index);
      if (!info) return; // If an error occurs, nothing will be written to length, size and type and name.

      var infoname = info.name.slice(0, Math.max(0, bufSize - 1));
      if (bufSize > 0 && name) {
        writeStringToMemory(infoname, name);
        if (length) HEAP32[((length)>>2)]=infoname.length;
      } else {
        if (length) HEAP32[((length)>>2)]=0;
      }

      if (size) HEAP32[((size)>>2)]=info.size;
      if (type) HEAP32[((type)>>2)]=info.type;
    }

  function _emscripten_glVertexAttrib3fv(index, v) {
      v = HEAPF32.subarray((v)>>2,(v+12)>>2);
      GLctx.vertexAttrib3fv(index, v);
    }

  function _emscripten_glLineWidth(x0) { GLctx.lineWidth(x0) }

  function _emscripten_glGetString(name_) {
      if (GL.stringCache[name_]) return GL.stringCache[name_];
      var ret;
      switch(name_) {
        case 0x1F00 /* GL_VENDOR */:
        case 0x1F01 /* GL_RENDERER */:
        case 0x1F02 /* GL_VERSION */:
          ret = allocate(intArrayFromString(GLctx.getParameter(name_)), 'i8', ALLOC_NORMAL);
          break;
        case 0x1F03 /* GL_EXTENSIONS */:
          var exts = GLctx.getSupportedExtensions();
          var gl_exts = [];
          for (var i in exts) {
            gl_exts.push(exts[i]);
            gl_exts.push("GL_" + exts[i]);
          }
          ret = allocate(intArrayFromString(gl_exts.join(' ')), 'i8', ALLOC_NORMAL);
          break;
        case 0x8B8C /* GL_SHADING_LANGUAGE_VERSION */:
          var glslVersion = GLctx.getParameter(GLctx.SHADING_LANGUAGE_VERSION);
          // Map WebGL GL_SHADING_LANGUAGE_VERSION string format to GLES format.
          if (glslVersion.indexOf('WebGL GLSL ES 1.0') != -1) glslVersion = 'OpenGL ES GLSL ES 1.00 (WebGL)';
          ret = allocate(intArrayFromString(glslVersion), 'i8', ALLOC_NORMAL);
          break;
        default:
          GL.recordError(0x0500/*GL_INVALID_ENUM*/);
          return 0;
      }
      GL.stringCache[name_] = ret;
      return ret;
    }

  function _emscripten_glGetAttribLocation(program, name) {
      program = GL.programs[program];
      name = Pointer_stringify(name);
      return GLctx.getAttribLocation(program, name);
    }

  function _emscripten_glRotatef() {
  Module['printErr']('missing function: emscripten_glRotatef'); abort(-1);
  }

  function _emscripten_glStencilFunc(x0, x1, x2) { GLctx.stencilFunc(x0, x1, x2) }


  function emscriptenWebGLGet(name_, p, type) {
      // Guard against user passing a null pointer.
      // Note that GLES2 spec does not say anything about how passing a null pointer should be treated.
      // Testing on desktop core GL 3, the application crashes on glGetIntegerv to a null pointer, but
      // better to report an error instead of doing anything random.
      if (!p) {
        GL.recordError(0x0501 /* GL_INVALID_VALUE */);
        return;
      }
      var ret = undefined;
      switch(name_) { // Handle a few trivial GLES values
        case 0x8DFA: // GL_SHADER_COMPILER
          ret = 1;
          break;
        case 0x8DF8: // GL_SHADER_BINARY_FORMATS
          if (type !== 'Integer' && type !== 'Integer64') {
            GL.recordError(0x0500); // GL_INVALID_ENUM
          }
          return; // Do not write anything to the out pointer, since no binary formats are supported.
        case 0x8DF9: // GL_NUM_SHADER_BINARY_FORMATS
          ret = 0;
          break;
        case 0x86A2: // GL_NUM_COMPRESSED_TEXTURE_FORMATS
          // WebGL doesn't have GL_NUM_COMPRESSED_TEXTURE_FORMATS (it's obsolete since GL_COMPRESSED_TEXTURE_FORMATS returns a JS array that can be queried for length),
          // so implement it ourselves to allow C++ GLES2 code get the length.
          var formats = GLctx.getParameter(0x86A3 /*GL_COMPRESSED_TEXTURE_FORMATS*/);
          ret = formats.length;
          break;
        case 0x8B9A: // GL_IMPLEMENTATION_COLOR_READ_TYPE
          ret = 0x1401; // GL_UNSIGNED_BYTE
          break;
        case 0x8B9B: // GL_IMPLEMENTATION_COLOR_READ_FORMAT
          ret = 0x1908; // GL_RGBA
          break;
      }

      if (ret === undefined) {
        var result = GLctx.getParameter(name_);
        switch (typeof(result)) {
          case "number":
            ret = result;
            break;
          case "boolean":
            ret = result ? 1 : 0;
            break;
          case "string":
            GL.recordError(0x0500); // GL_INVALID_ENUM
            return;
          case "object":
            if (result === null) {
              // null is a valid result for some (e.g., which buffer is bound - perhaps nothing is bound), but otherwise
              // can mean an invalid name_, which we need to report as an error
              switch(name_) {
                case 0x8894: // ARRAY_BUFFER_BINDING
                case 0x8B8D: // CURRENT_PROGRAM
                case 0x8895: // ELEMENT_ARRAY_BUFFER_BINDING
                case 0x8CA6: // FRAMEBUFFER_BINDING
                case 0x8CA7: // RENDERBUFFER_BINDING
                case 0x8069: // TEXTURE_BINDING_2D
                case 0x8514: { // TEXTURE_BINDING_CUBE_MAP
                  ret = 0;
                  break;
                }
                default: {
                  GL.recordError(0x0500); // GL_INVALID_ENUM
                  return;
                }
              }
            } else if (result instanceof Float32Array ||
                       result instanceof Uint32Array ||
                       result instanceof Int32Array ||
                       result instanceof Array) {
              for (var i = 0; i < result.length; ++i) {
                switch (type) {
                  case 'Integer': HEAP32[(((p)+(i*4))>>2)]=result[i];   break;
                  case 'Float':   HEAPF32[(((p)+(i*4))>>2)]=result[i]; break;
                  case 'Boolean': HEAP8[(((p)+(i))>>0)]=result[i] ? 1 : 0;    break;
                  default: throw 'internal glGet error, bad type: ' + type;
                }
              }
              return;
            } else if (result instanceof WebGLBuffer ||
                       result instanceof WebGLProgram ||
                       result instanceof WebGLFramebuffer ||
                       result instanceof WebGLRenderbuffer ||
                       result instanceof WebGLTexture) {
              ret = result.name | 0;
            } else {
              GL.recordError(0x0500); // GL_INVALID_ENUM
              return;
            }
            break;
          default:
            GL.recordError(0x0500); // GL_INVALID_ENUM
            return;
        }
      }

      switch (type) {
        case 'Integer64': (tempI64 = [ret>>>0,(tempDouble=ret,(+(Math_abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math_min((+(Math_floor((tempDouble)/4294967296.0))), 4294967295.0))|0)>>>0 : (~~((+(Math_ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)],HEAP32[((p)>>2)]=tempI64[0],HEAP32[(((p)+(4))>>2)]=tempI64[1]);    break;
        case 'Integer': HEAP32[((p)>>2)]=ret;    break;
        case 'Float':   HEAPF32[((p)>>2)]=ret;  break;
        case 'Boolean': HEAP8[((p)>>0)]=ret ? 1 : 0; break;
        default: throw 'internal glGet error, bad type: ' + type;
      }
    }function _emscripten_glGetIntegerv(name_, p) {
      emscriptenWebGLGet(name_, p, 'Integer');
    }

  function _emscripten_glGetFramebufferAttachmentParameteriv(target, attachment, pname, params) {
      var result = GLctx.getFramebufferAttachmentParameter(target, attachment, pname);
      HEAP32[((params)>>2)]=result;
    }

  function _emscripten_glVertexPointer(){ throw 'Legacy GL function (glVertexPointer) called. If you want legacy GL emulation, you need to compile with -s LEGACY_GL_EMULATION=1 to enable legacy GL emulation.'; }

  function _emscripten_glUniform3iv(location, count, value) {
      location = GL.uniforms[location];
      count *= 3;
      value = HEAP32.subarray((value)>>2,(value+count*4)>>2);
      GLctx.uniform3iv(location, value);
    }

  function _emscripten_glShaderSource(shader, count, string, length) {
      var source = GL.getSource(shader, count, string, length);
      GLctx.shaderSource(GL.shaders[shader], source);
    }

  function _emscripten_glIsFramebuffer(framebuffer) {
      var fb = GL.framebuffers[framebuffer];
      if (!fb) return 0;
      return GLctx.isFramebuffer(fb);
    }

  function _emscripten_glClientActiveTexture() {
  Module['printErr']('missing function: emscripten_glClientActiveTexture'); abort(-1);
  }

  function _emscripten_glReleaseShaderCompiler() {
      // NOP (as allowed by GLES 2.0 spec)
    }

  function _emscripten_glGetShaderInfoLog(shader, maxLength, length, infoLog) {
      var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
      if (log === null) log = '(unknown error)';
      log = log.substr(0, maxLength - 1);
      if (maxLength > 0 && infoLog) {
        writeStringToMemory(log, infoLog);
        if (length) HEAP32[((length)>>2)]=log.length;
      } else {
        if (length) HEAP32[((length)>>2)]=0;
      }
    }

  function _emscripten_glIsTexture(texture) {
      var texture = GL.textures[texture];
      if (!texture) return 0;
      return GLctx.isTexture(texture);
    }

  function _emscripten_glTexParameterf(x0, x1, x2) { GLctx.texParameterf(x0, x1, x2) }

  function _emscripten_glGetRenderbufferParameteriv(target, pname, params) {
      if (!params) {
        // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
        // if params == null, issue a GL error to notify user about it.
        GL.recordError(0x0501 /* GL_INVALID_VALUE */);
        return;
      }
      HEAP32[((params)>>2)]=GLctx.getRenderbufferParameter(target, pname);
    }

  function _emscripten_glStencilOpSeparate(x0, x1, x2, x3) { GLctx.stencilOpSeparate(x0, x1, x2, x3) }

  function _emscripten_glTexParameteri(x0, x1, x2) { GLctx.texParameteri(x0, x1, x2) }



  function emscriptenWebGLComputeImageSize(width, height, sizePerPixel, alignment) {
      function roundedToNextMultipleOf(x, y) {
        return Math.floor((x + y - 1) / y) * y
      }
      var plainRowSize = width * sizePerPixel;
      var alignedRowSize = roundedToNextMultipleOf(plainRowSize, alignment);
      return (height <= 0) ? 0 :
               ((height - 1) * alignedRowSize + plainRowSize);
    }function emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, internalFormat) {
      var sizePerPixel;
      var numChannels;
      switch(format) {
        case 0x1906 /* GL_ALPHA */:
        case 0x1909 /* GL_LUMINANCE */:
        case 0x1902 /* GL_DEPTH_COMPONENT */:
        case 0x1903 /* GL_RED */:
          numChannels = 1;
          break;
        case 0x190A /* GL_LUMINANCE_ALPHA */:
        case 0x8227 /* GL_RG */:
          numChannels = 2;
          break;
        case 0x1907 /* GL_RGB */:
        case 0x8C40 /* GL_SRGB_EXT */:
          numChannels = 3;
          break;
        case 0x1908 /* GL_RGBA */:
        case 0x8C42 /* GL_SRGB_ALPHA_EXT */:
          numChannels = 4;
          break;
        default:
          GL.recordError(0x0500); // GL_INVALID_ENUM
          return {
            pixels: null,
            internalFormat: 0x0
          };
      }
      switch (type) {
        case 0x1401 /* GL_UNSIGNED_BYTE */:
          sizePerPixel = numChannels*1;
          break;
        case 0x1403 /* GL_UNSIGNED_SHORT */:
        case 0x8D61 /* GL_HALF_FLOAT_OES */:
          sizePerPixel = numChannels*2;
          break;
        case 0x1405 /* GL_UNSIGNED_INT */:
        case 0x1406 /* GL_FLOAT */:
          sizePerPixel = numChannels*4;
          break;
        case 0x84FA /* UNSIGNED_INT_24_8_WEBGL/UNSIGNED_INT_24_8 */:
          sizePerPixel = 4;
          break;
        case 0x8363 /* GL_UNSIGNED_SHORT_5_6_5 */:
        case 0x8033 /* GL_UNSIGNED_SHORT_4_4_4_4 */:
        case 0x8034 /* GL_UNSIGNED_SHORT_5_5_5_1 */:
          sizePerPixel = 2;
          break;
        default:
          GL.recordError(0x0500); // GL_INVALID_ENUM
          return {
            pixels: null,
            internalFormat: 0x0
          };
      }
      var bytes = emscriptenWebGLComputeImageSize(width, height, sizePerPixel, GL.unpackAlignment);
      if (type == 0x1401 /* GL_UNSIGNED_BYTE */) {
        pixels = HEAPU8.subarray((pixels),(pixels+bytes));
      } else if (type == 0x1406 /* GL_FLOAT */) {
        pixels = HEAPF32.subarray((pixels)>>2,(pixels+bytes)>>2);
      } else if (type == 0x1405 /* GL_UNSIGNED_INT */ || type == 0x84FA /* UNSIGNED_INT_24_8_WEBGL */) {
        pixels = HEAPU32.subarray((pixels)>>2,(pixels+bytes)>>2);
      } else {
        pixels = HEAPU16.subarray((pixels)>>1,(pixels+bytes)>>1);
      }
      return {
        pixels: pixels,
        internalFormat: internalFormat
      };
    }function _emscripten_glReadPixels(x, y, width, height, format, type, pixels) {
      var data = emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, format);
      if (!data.pixels) {
        GL.recordError(0x0500/*GL_INVALID_ENUM*/);
        return;
      }
      GLctx.readPixels(x, y, width, height, format, type, data.pixels);
    }

  function _emscripten_glCompressedTexSubImage2D(target, level, xoffset, yoffset, width, height, format, imageSize, data) {
      var heapView;
      if (data) {
        heapView = HEAPU8.subarray((data),(data+imageSize));
      } else {
        heapView = null;
      }
      GLctx['compressedTexSubImage2D'](target, level, xoffset, yoffset, width, height, format, heapView);
    }

  function _emscripten_glGetError() {
      // First return any GL error generated by the emscripten library_gl.js interop layer.
      if (GL.lastError) {
        var error = GL.lastError;
        GL.lastError = 0/*GL_NO_ERROR*/;
        return error;
      } else { // If there were none, return the GL error from the browser GL context.
        return GLctx.getError();
      }
    }

  function _emscripten_glUniform4f(location, v0, v1, v2, v3) {
      location = GL.uniforms[location];
      GLctx.uniform4f(location, v0, v1, v2, v3);
    }

  function _emscripten_glFramebufferTexture2D(target, attachment, textarget, texture, level) {
      GLctx.framebufferTexture2D(target, attachment, textarget,
                                      GL.textures[texture], level);
    }

  function _emscripten_glFrustum() {
  Module['printErr']('missing function: emscripten_glFrustum'); abort(-1);
  }

  function _emscripten_glHint(x0, x1) { GLctx.hint(x0, x1) }

  function _pthread_cleanup_push(routine, arg) {
      __ATEXIT__.push(function() { Runtime.dynCall('vi', routine, [arg]) })
      _pthread_cleanup_push.level = __ATEXIT__.length;
    }

  function _emscripten_glGetTexParameterfv(target, pname, params) {
      if (!params) {
        // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
        // if p == null, issue a GL error to notify user about it.
        GL.recordError(0x0501 /* GL_INVALID_VALUE */);
        return;
      }
      HEAPF32[((params)>>2)]=GLctx.getTexParameter(target, pname);
    }

  function _emscripten_glUniform4i(location, v0, v1, v2, v3) {
      location = GL.uniforms[location];
      GLctx.uniform4i(location, v0, v1, v2, v3);
    }

  function _emscripten_glIsEnabled(x0) { return GLctx.isEnabled(x0) }

  function _emscripten_glBindRenderbuffer(target, renderbuffer) {
      GLctx.bindRenderbuffer(target, renderbuffer ? GL.renderbuffers[renderbuffer] : null);
    }

  function _emscripten_glViewport(x0, x1, x2, x3) { GLctx.viewport(x0, x1, x2, x3) }


  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
    }
  Module["_memcpy"] = _memcpy;

  function _emscripten_glCopyTexImage2D(x0, x1, x2, x3, x4, x5, x6, x7) { GLctx.copyTexImage2D(x0, x1, x2, x3, x4, x5, x6, x7) }

  function _emscripten_glTexParameterfv(target, pname, params) {
      var param = HEAPF32[((params)>>2)];
      GLctx.texParameterf(target, pname, param);
    }

  function _emscripten_glClearDepthf(x0) { GLctx.clearDepth(x0) }

  function _emscripten_glVertexAttrib4f(x0, x1, x2, x3, x4) { GLctx.vertexAttrib4f(x0, x1, x2, x3, x4) }

  function _emscripten_glLinkProgram(program) {
      GLctx.linkProgram(GL.programs[program]);
      GL.programInfos[program] = null; // uniforms no longer keep the same names after linking
      GL.populateUniformTable(program);
    }

  function _emscripten_glUniform3f(location, v0, v1, v2) {
      location = GL.uniforms[location];
      GLctx.uniform3f(location, v0, v1, v2);
    }

  function _emscripten_glGetObjectParameterivARB() {
  Module['printErr']('missing function: emscripten_glGetObjectParameterivARB'); abort(-1);
  }

  function _emscripten_glClear(x0) { GLctx.clear(x0) }

  function _emscripten_glUniform3i(location, v0, v1, v2) {
      location = GL.uniforms[location];
      GLctx.uniform3i(location, v0, v1, v2);
    }

  function _emscripten_glStencilOp(x0, x1, x2) { GLctx.stencilOp(x0, x1, x2) }

  function _emscripten_glBindAttribLocation(program, index, name) {
      name = Pointer_stringify(name);
      GLctx.bindAttribLocation(GL.programs[program], index, name);
    }

  function _emscripten_glBindBuffer(target, buffer) {
      var bufferObj = buffer ? GL.buffers[buffer] : null;


      GLctx.bindBuffer(target, bufferObj);
    }

  function _emscripten_glEnableVertexAttribArray(index) {
      GLctx.enableVertexAttribArray(index);
    }


  Module["_memset"] = _memset;


  function emscriptenWebGLGetUniform(program, location, params, type) {
      if (!params) {
        // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
        // if params == null, issue a GL error to notify user about it.
        GL.recordError(0x0501 /* GL_INVALID_VALUE */);
        return;
      }
      var data = GLctx.getUniform(GL.programs[program], GL.uniforms[location]);
      if (typeof data == 'number' || typeof data == 'boolean') {
        switch (type) {
          case 'Integer': HEAP32[((params)>>2)]=data; break;
          case 'Float': HEAPF32[((params)>>2)]=data; break;
          default: throw 'internal emscriptenWebGLGetUniform() error, bad type: ' + type;
        }
      } else {
        for (var i = 0; i < data.length; i++) {
          switch (type) {
            case 'Integer': HEAP32[(((params)+(i))>>2)]=data[i]; break;
            case 'Float': HEAPF32[(((params)+(i))>>2)]=data[i]; break;
            default: throw 'internal emscriptenWebGLGetUniform() error, bad type: ' + type;
          }
        }
      }
    }function _emscripten_glGetUniformfv(program, location, params) {
      emscriptenWebGLGetUniform(program, location, params, 'Float');
    }

  function _emscripten_glUniform1i(location, v0) {
      location = GL.uniforms[location];
      GLctx.uniform1i(location, v0);
    }

  function _emscripten_glGetProgramiv(program, pname, p) {
      if (!p) {
        // GLES2 specification does not specify how to behave if p is a null pointer. Since calling this function does not make sense
        // if p == null, issue a GL error to notify user about it.
        GL.recordError(0x0501 /* GL_INVALID_VALUE */);
        return;
      }
      if (pname == 0x8B84) { // GL_INFO_LOG_LENGTH
        var log = GLctx.getProgramInfoLog(GL.programs[program]);
        if (log === null) log = '(unknown error)';
        HEAP32[((p)>>2)]=log.length + 1;
      } else if (pname == 0x8B87 /* GL_ACTIVE_UNIFORM_MAX_LENGTH */) {
        var ptable = GL.programInfos[program];
        if (ptable) {
          HEAP32[((p)>>2)]=ptable.maxUniformLength;
          return;
        } else if (program < GL.counter) {
          GL.recordError(0x0502 /* GL_INVALID_OPERATION */);
        } else {
          GL.recordError(0x0501 /* GL_INVALID_VALUE */);
        }
      } else if (pname == 0x8B8A /* GL_ACTIVE_ATTRIBUTE_MAX_LENGTH */) {
        var ptable = GL.programInfos[program];
        if (ptable) {
          if (ptable.maxAttributeLength == -1) {
            var program = GL.programs[program];
            var numAttribs = GLctx.getProgramParameter(program, GLctx.ACTIVE_ATTRIBUTES);
            ptable.maxAttributeLength = 0; // Spec says if there are no active attribs, 0 must be returned.
            for(var i = 0; i < numAttribs; ++i) {
              var activeAttrib = GLctx.getActiveAttrib(program, i);
              ptable.maxAttributeLength = Math.max(ptable.maxAttributeLength, activeAttrib.name.length+1);
            }
          }
          HEAP32[((p)>>2)]=ptable.maxAttributeLength;
          return;
        } else if (program < GL.counter) {
          GL.recordError(0x0502 /* GL_INVALID_OPERATION */);
        } else {
          GL.recordError(0x0501 /* GL_INVALID_VALUE */);
        }
      } else {
        HEAP32[((p)>>2)]=GLctx.getProgramParameter(GL.programs[program], pname);
      }
    }

  function _emscripten_glGetBufferParameteriv(target, value, data) {
      if (!data) {
        // GLES2 specification does not specify how to behave if data is a null pointer. Since calling this function does not make sense
        // if data == null, issue a GL error to notify user about it.
        GL.recordError(0x0501 /* GL_INVALID_VALUE */);
        return;
      }
      HEAP32[((data)>>2)]=GLctx.getBufferParameter(target, value);
    }

  function _emscripten_glDrawRangeElements() {
  Module['printErr']('missing function: emscripten_glDrawRangeElements'); abort(-1);
  }

  function _emscripten_glGetAttachedShaders(program, maxCount, count, shaders) {
      var result = GLctx.getAttachedShaders(GL.programs[program]);
      var len = result.length;
      if (len > maxCount) {
        len = maxCount;
      }
      HEAP32[((count)>>2)]=len;
      for (var i = 0; i < len; ++i) {
        var id = GL.shaders.indexOf(result[i]);
        assert(id !== -1, 'shader not bound to local id');
        HEAP32[(((shaders)+(i*4))>>2)]=id;
      }
    }

  function _emscripten_glGenRenderbuffers(n, renderbuffers) {
      for (var i = 0; i < n; i++) {
        var renderbuffer = GLctx.createRenderbuffer();
        if (!renderbuffer) {
          GL.recordError(0x0502 /* GL_INVALID_OPERATION */);
          while(i < n) HEAP32[(((renderbuffers)+(i++*4))>>2)]=0;
          return;
        }
        var id = GL.getNewId(GL.renderbuffers);
        renderbuffer.name = id;
        GL.renderbuffers[id] = renderbuffer;
        HEAP32[(((renderbuffers)+(i*4))>>2)]=id;
      }
    }

  function _emscripten_glBlendFuncSeparate(x0, x1, x2, x3) { GLctx.blendFuncSeparate(x0, x1, x2, x3) }

  function _emscripten_glFrontFace(x0) { GLctx.frontFace(x0) }

  function _emscripten_glGetVertexAttribPointerv(index, pname, pointer) {
      if (!pointer) {
        // GLES2 specification does not specify how to behave if pointer is a null pointer. Since calling this function does not make sense
        // if pointer == null, issue a GL error to notify user about it.
        GL.recordError(0x0501 /* GL_INVALID_VALUE */);
        return;
      }
      HEAP32[((pointer)>>2)]=GLctx.getVertexAttribOffset(index, pname);
    }

  function _emscripten_glVertexAttrib3f(x0, x1, x2, x3) { GLctx.vertexAttrib3f(x0, x1, x2, x3) }

  function _emscripten_glUniform1iv(location, count, value) {
      location = GL.uniforms[location];
      value = HEAP32.subarray((value)>>2,(value+count*4)>>2);
      GLctx.uniform1iv(location, value);
    }

  function _emscripten_glTexCoordPointer() {
  Module['printErr']('missing function: emscripten_glTexCoordPointer'); abort(-1);
  }

  function _emscripten_glEnable(x0) { GLctx.enable(x0) }

  function _emscripten_glGetInfoLogARB() {
  Module['printErr']('missing function: emscripten_glGetInfoLogARB'); abort(-1);
  }

  function _emscripten_glNormalPointer() {
  Module['printErr']('missing function: emscripten_glNormalPointer'); abort(-1);
  }

  function _emscripten_glRenderbufferStorage(x0, x1, x2, x3) { GLctx.renderbufferStorage(x0, x1, x2, x3) }


  function emscriptenWebGLGetVertexAttrib(index, pname, params, type) {
      if (!params) {
        // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
        // if params == null, issue a GL error to notify user about it.
        GL.recordError(0x0501 /* GL_INVALID_VALUE */);
        return;
      }
      var data = GLctx.getVertexAttrib(index, pname);
      if (typeof data == 'number' || typeof data == 'boolean') {
        switch (type) {
          case 'Integer': HEAP32[((params)>>2)]=data; break;
          case 'Float': HEAPF32[((params)>>2)]=data; break;
          case 'FloatToInteger': HEAP32[((params)>>2)]=Math.fround(data); break;
          default: throw 'internal emscriptenWebGLGetVertexAttrib() error, bad type: ' + type;
        }
      } else {
        for (var i = 0; i < data.length; i++) {
          switch (type) {
            case 'Integer': HEAP32[(((params)+(i))>>2)]=data[i]; break;
            case 'Float': HEAPF32[(((params)+(i))>>2)]=data[i]; break;
            case 'FloatToInteger': HEAP32[(((params)+(i))>>2)]=Math.fround(data[i]); break;
            default: throw 'internal emscriptenWebGLGetVertexAttrib() error, bad type: ' + type;
          }
        }
      }
    }function _emscripten_glGetVertexAttribfv(index, pname, params) {
      // N.B. This function may only be called if the vertex attribute was specified using the function glVertexAttrib*f(),
      // otherwise the results are undefined. (GLES3 spec 6.1.12)
      emscriptenWebGLGetVertexAttrib(index, pname, params, 'Float');
    }

  function _emscripten_glCopyTexSubImage2D(x0, x1, x2, x3, x4, x5, x6, x7) { GLctx.copyTexSubImage2D(x0, x1, x2, x3, x4, x5, x6, x7) }

  function _emscripten_glDepthRange(x0, x1) { GLctx.depthRange(x0, x1) }

  function _emscripten_glTexParameteriv(target, pname, params) {
      var param = HEAP32[((params)>>2)];
      GLctx.texParameteri(target, pname, param);
    }

  function _emscripten_glDeleteShader(id) {
      if (!id) return;
      var shader = GL.shaders[id];
      if (!shader) { // glDeleteShader actually signals an error when deleting a nonexisting object, unlike some other GL delete functions.
        GL.recordError(0x0501 /* GL_INVALID_VALUE */);
        return;
      }
      GLctx.deleteShader(shader);
      GL.shaders[id] = null;
    }

  function _emscripten_glDrawArraysInstanced(mode, first, count, primcount) {
      GLctx['drawArraysInstanced'](mode, first, count, primcount);
    }

  function _emscripten_glDeleteBuffers(n, buffers) {
      for (var i = 0; i < n; i++) {
        var id = HEAP32[(((buffers)+(i*4))>>2)];
        var buffer = GL.buffers[id];

        // From spec: "glDeleteBuffers silently ignores 0's and names that do not
        // correspond to existing buffer objects."
        if (!buffer) continue;

        GLctx.deleteBuffer(buffer);
        buffer.name = 0;
        GL.buffers[id] = null;

        if (id == GL.currArrayBuffer) GL.currArrayBuffer = 0;
        if (id == GL.currElementArrayBuffer) GL.currElementArrayBuffer = 0;
      }
    }

  function _emscripten_glIsProgram(program) {
      var program = GL.programs[program];
      if (!program) return 0;
      return GLctx.isProgram(program);
    }

  function _emscripten_glBlendFunc(x0, x1) { GLctx.blendFunc(x0, x1) }

  function _emscripten_glUniformMatrix2fv(location, count, transpose, value) {
      location = GL.uniforms[location];
      var view;
      if (count === 1) {
        // avoid allocation for the common case of uploading one uniform matrix
        view = GL.miniTempBufferViews[3];
        for (var i = 0; i < 4; i++) {
          view[i] = HEAPF32[(((value)+(i*4))>>2)];
        }
      } else {
        view = HEAPF32.subarray((value)>>2,(value+count*16)>>2);
      }
      GLctx.uniformMatrix2fv(location, transpose, view);
    }

  function _emscripten_glBlendColor(x0, x1, x2, x3) { GLctx.blendColor(x0, x1, x2, x3) }

  function _emscripten_glGetShaderiv(shader, pname, p) {
      if (!p) {
        // GLES2 specification does not specify how to behave if p is a null pointer. Since calling this function does not make sense
        // if p == null, issue a GL error to notify user about it.
        GL.recordError(0x0501 /* GL_INVALID_VALUE */);
        return;
      }
      if (pname == 0x8B84) { // GL_INFO_LOG_LENGTH
        var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
        if (log === null) log = '(unknown error)';
        HEAP32[((p)>>2)]=log.length + 1;
      } else {
        HEAP32[((p)>>2)]=GLctx.getShaderParameter(GL.shaders[shader], pname);
      }
    }

  function _emscripten_glUniformMatrix3fv(location, count, transpose, value) {
      location = GL.uniforms[location];
      var view;
      if (count === 1) {
        // avoid allocation for the common case of uploading one uniform matrix
        view = GL.miniTempBufferViews[8];
        for (var i = 0; i < 9; i++) {
          view[i] = HEAPF32[(((value)+(i*4))>>2)];
        }
      } else {
        view = HEAPF32.subarray((value)>>2,(value+count*36)>>2);
      }
      GLctx.uniformMatrix3fv(location, transpose, view);
    }

  function _emscripten_glVertexAttrib2f(x0, x1, x2) { GLctx.vertexAttrib2f(x0, x1, x2) }

  function _emscripten_glUniform4fv(location, count, value) {
      location = GL.uniforms[location];
      var view;
      if (count === 1) {
        // avoid allocation for the common case of uploading one uniform
        view = GL.miniTempBufferViews[3];
        view[0] = HEAPF32[((value)>>2)];
        view[1] = HEAPF32[(((value)+(4))>>2)];
        view[2] = HEAPF32[(((value)+(8))>>2)];
        view[3] = HEAPF32[(((value)+(12))>>2)];
      } else {
        view = HEAPF32.subarray((value)>>2,(value+count*16)>>2);
      }
      GLctx.uniform4fv(location, view);
    }

  function _emscripten_glGetVertexAttribiv(index, pname, params) {
      // N.B. This function may only be called if the vertex attribute was specified using the function glVertexAttrib*f(),
      // otherwise the results are undefined. (GLES3 spec 6.1.12)
      emscriptenWebGLGetVertexAttrib(index, pname, params, 'FloatToInteger');
    }

  function _emscripten_glUniformMatrix4fv(location, count, transpose, value) {
      location = GL.uniforms[location];
      var view;
      if (count === 1) {
        // avoid allocation for the common case of uploading one uniform matrix
        view = GL.miniTempBufferViews[15];
        for (var i = 0; i < 16; i++) {
          view[i] = HEAPF32[(((value)+(i*4))>>2)];
        }
      } else {
        view = HEAPF32.subarray((value)>>2,(value+count*64)>>2);
      }
      GLctx.uniformMatrix4fv(location, transpose, view);
    }

  function _emscripten_glGenFramebuffers(n, ids) {
      for (var i = 0; i < n; ++i) {
        var framebuffer = GLctx.createFramebuffer();
        if (!framebuffer) {
          GL.recordError(0x0502 /* GL_INVALID_OPERATION */);
          while(i < n) HEAP32[(((ids)+(i++*4))>>2)]=0;
          return;
        }
        var id = GL.getNewId(GL.framebuffers);
        framebuffer.name = id;
        GL.framebuffers[id] = framebuffer;
        HEAP32[(((ids)+(i*4))>>2)]=id;
      }
    }

  function _emscripten_glEnableClientState() {
  Module['printErr']('missing function: emscripten_glEnableClientState'); abort(-1);
  }

  function _emscripten_glGetPointerv() {
  Module['printErr']('missing function: emscripten_glGetPointerv'); abort(-1);
  }

  function _emscripten_glBlendEquationSeparate(x0, x1) { GLctx.blendEquationSeparate(x0, x1) }


  var SYSCALLS={varargs:0,get:function (varargs) {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[(((SYSCALLS.varargs)-(4))>>2)];
        return ret;
      },getStr:function () {
        var ret = Pointer_stringify(SYSCALLS.get());
        return ret;
      },get64:function () {
        var low = SYSCALLS.get(), high = SYSCALLS.get();
        if (low >= 0) assert(high === 0);
        else assert(high === -1);
        return low;
      },getZero:function () {
        assert(SYSCALLS.get() === 0);
      }};function ___syscall146(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // writev
      // hack to support printf in NO_FILESYSTEM
      var stream = SYSCALLS.get(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      var ret = 0;
      if (!___syscall146.buffer) {
        ___syscall146.buffers = [null, [], []]; // 1 => stdout, 2 => stderr
        ___syscall146.printChar = function(stream, curr) {
          var buffer = ___syscall146.buffers[stream];
          assert(buffer);
          if (curr === 0 || curr === 10) {
            (stream === 1 ? Module['print'] : Module['printErr'])(UTF8ArrayToString(buffer, 0));
            buffer.length = 0;
          } else {
            buffer.push(curr);
          }
        };
      }
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAP32[(((iov)+(i*8))>>2)];
        var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
        for (var j = 0; j < len; j++) {
          ___syscall146.printChar(stream, HEAPU8[ptr+j]);
        }
        ret += len;
      }
      return ret;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function _emscripten_glBindTexture(target, texture) {
      GLctx.bindTexture(target, texture ? GL.textures[texture] : null);
    }

  function _emscripten_glShaderBinary() {
      GL.recordError(0x0500/*GL_INVALID_ENUM*/);
    }

  function _emscripten_glStencilMask(x0) { GLctx.stencilMask(x0) }

  function _emscripten_glStencilFuncSeparate(x0, x1, x2, x3) { GLctx.stencilFuncSeparate(x0, x1, x2, x3) }

  function _emscripten_glGenTextures(n, textures) {
      for (var i = 0; i < n; i++) {
        var texture = GLctx.createTexture();
        if (!texture) {
          GL.recordError(0x0502 /* GL_INVALID_OPERATION */); // GLES + EGL specs don't specify what should happen here, so best to issue an error and create IDs with 0.
          while(i < n) HEAP32[(((textures)+(i++*4))>>2)]=0;
          return;
        }
        var id = GL.getNewId(GL.textures);
        texture.name = id;
        GL.textures[id] = texture;
        HEAP32[(((textures)+(i*4))>>2)]=id;
      }
    }

  function _emscripten_glVertexAttrib2fv(index, v) {
      v = HEAPF32.subarray((v)>>2,(v+8)>>2);
      GLctx.vertexAttrib2fv(index, v);
    }

  function _emscripten_glGetActiveUniform(program, index, bufSize, length, size, type, name) {
      program = GL.programs[program];
      var info = GLctx.getActiveUniform(program, index);
      if (!info) return; // If an error occurs, nothing will be written to length, size, type and name.

      var infoname = info.name.slice(0, Math.max(0, bufSize - 1));
      if (bufSize > 0 && name) {
        writeStringToMemory(infoname, name);
        if (length) HEAP32[((length)>>2)]=infoname.length;
      } else {
        if (length) HEAP32[((length)>>2)]=0;
      }

      if (size) HEAP32[((size)>>2)]=info.size;
      if (type) HEAP32[((type)>>2)]=info.type;
    }

  function _emscripten_glDeleteObjectARB() {
  Module['printErr']('missing function: emscripten_glDeleteObjectARB'); abort(-1);
  }

  function _emscripten_glUniform1f(location, v0) {
      location = GL.uniforms[location];
      GLctx.uniform1f(location, v0);
    }

  function _emscripten_glDisableVertexAttribArray(index) {
      GLctx.disableVertexAttribArray(index);
    }

  function _emscripten_glVertexAttribPointer(index, size, type, normalized, stride, ptr) {
      GLctx.vertexAttribPointer(index, size, type, normalized, stride, ptr);
    }

  function _emscripten_glVertexAttrib1f(x0, x1) { GLctx.vertexAttrib1f(x0, x1) }

  function _emscripten_glFinish() { GLctx.finish() }

  function _emscripten_glDepthFunc(x0) { GLctx.depthFunc(x0) }

  function _emscripten_glDrawArrays(mode, first, count) {

      GLctx.drawArrays(mode, first, count);

    }

  function _emscripten_glGenBuffers(n, buffers) {
      for (var i = 0; i < n; i++) {
        var buffer = GLctx.createBuffer();
        if (!buffer) {
          GL.recordError(0x0502 /* GL_INVALID_OPERATION */);
          while(i < n) HEAP32[(((buffers)+(i++*4))>>2)]=0;
          return;
        }
        var id = GL.getNewId(GL.buffers);
        buffer.name = id;
        GL.buffers[id] = buffer;
        HEAP32[(((buffers)+(i*4))>>2)]=id;
      }
    }

  function _emscripten_glClearDepth(x0) { GLctx.clearDepth(x0) }

  function _emscripten_glUniform4iv(location, count, value) {
      location = GL.uniforms[location];
      count *= 4;
      value = HEAP32.subarray((value)>>2,(value+count*4)>>2);
      GLctx.uniform4iv(location, value);
    }

  function _emscripten_glLoadIdentity(){ throw 'Legacy GL function (glLoadIdentity) called. If you want legacy GL emulation, you need to compile with -s LEGACY_GL_EMULATION=1 to enable legacy GL emulation.'; }

  function _emscripten_glUniform3fv(location, count, value) {
      location = GL.uniforms[location];
      var view;
      if (count === 1) {
        // avoid allocation for the common case of uploading one uniform
        view = GL.miniTempBufferViews[2];
        view[0] = HEAPF32[((value)>>2)];
        view[1] = HEAPF32[(((value)+(4))>>2)];
        view[2] = HEAPF32[(((value)+(8))>>2)];
      } else {
        view = HEAPF32.subarray((value)>>2,(value+count*12)>>2);
      }
      GLctx.uniform3fv(location, view);
    }

  function _emscripten_glGetUniformLocation(program, name) {
      name = Pointer_stringify(name);

      var arrayOffset = 0;
      // If user passed an array accessor "[index]", parse the array index off the accessor.
      if (name.indexOf(']', name.length-1) !== -1) {
        var ls = name.lastIndexOf('[');
        var arrayIndex = name.slice(ls+1, -1);
        if (arrayIndex.length > 0) {
          arrayOffset = parseInt(arrayIndex);
          if (arrayOffset < 0) {
            return -1;
          }
        }
        name = name.slice(0, ls);
      }

      var ptable = GL.programInfos[program];
      if (!ptable) {
        return -1;
      }
      var utable = ptable.uniforms;
      var uniformInfo = utable[name]; // returns pair [ dimension_of_uniform_array, uniform_location ]
      if (uniformInfo && arrayOffset < uniformInfo[0]) { // Check if user asked for an out-of-bounds element, i.e. for 'vec4 colors[3];' user could ask for 'colors[10]' which should return -1.
        return uniformInfo[1]+arrayOffset;
      } else {
        return -1;
      }
    }

  function _emscripten_glAttachShader(program, shader) {
      GLctx.attachShader(GL.programs[program],
                              GL.shaders[shader]);
    }

  function _emscripten_glVertexAttrib4fv(index, v) {
      v = HEAPF32.subarray((v)>>2,(v+16)>>2);
      GLctx.vertexAttrib4fv(index, v);
    }

  function ___syscall6(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // close
      var stream = SYSCALLS.getStreamFromFD();
      FS.close(stream);
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function _emscripten_glScissor(x0, x1, x2, x3) { GLctx.scissor(x0, x1, x2, x3) }

  function _emscripten_glColorPointer() {
  Module['printErr']('missing function: emscripten_glColorPointer'); abort(-1);
  }

  function _emscripten_glValidateProgram(program) {
      GLctx.validateProgram(GL.programs[program]);
    }

  function _pthread_cleanup_pop() {
      assert(_pthread_cleanup_push.level == __ATEXIT__.length, 'cannot pop if something else added meanwhile!');
      __ATEXIT__.pop();
      _pthread_cleanup_push.level = __ATEXIT__.length;
    }

  function _emscripten_glDrawBuffers(n, bufs) {
      var bufArray = [];
      for (var i = 0; i < n; i++)
        bufArray.push(HEAP32[(((bufs)+(i*4))>>2)]);

      // Work around Firefox WebGL 2 bug, see https://github.com/kripken/emscripten/issues/3890.
      if (n == 0) {
        // If a FBO is bound, glDrawBuffers(0, *) means glDrawBuffers(1, GL_NONE).
        // If an FBO is not bound, glDrawBuffers(0, *) is an error.
        if (GLctx.getParameter(GLctx['DRAW_FRAMEBUFFER_BINDING']) != 0) bufArray.push(GLctx['NONE']);
        else {
          GL.recordError(0x0502 /* GL_INVALID_OPERATION */);
          return;
        }
      }

      GLctx['drawBuffers'](bufArray);
    }

  function _emscripten_glClearStencil(x0) { GLctx.clearStencil(x0) }

  function _emscripten_glBindFramebuffer(target, framebuffer) {
      GLctx.bindFramebuffer(target, framebuffer ? GL.framebuffers[framebuffer] : null);
    }

  function _emscripten_glDetachShader(program, shader) {
      GLctx.detachShader(GL.programs[program],
                              GL.shaders[shader]);
    }

  function _emscripten_glBlendEquation(x0) { GLctx.blendEquation(x0) }

  function _emscripten_glBufferSubData(target, offset, size, data) {
      GLctx.bufferSubData(target, offset, HEAPU8.subarray(data, data+size));
    }

  function _emscripten_glBufferData(target, size, data, usage) {
      switch (usage) { // fix usages, WebGL only has *_DRAW
        case 0x88E1: // GL_STREAM_READ
        case 0x88E2: // GL_STREAM_COPY
          usage = 0x88E0; // GL_STREAM_DRAW
          break;
        case 0x88E5: // GL_STATIC_READ
        case 0x88E6: // GL_STATIC_COPY
          usage = 0x88E4; // GL_STATIC_DRAW
          break;
        case 0x88E9: // GL_DYNAMIC_READ
        case 0x88EA: // GL_DYNAMIC_COPY
          usage = 0x88E8; // GL_DYNAMIC_DRAW
          break;
      }
      if (!data) {
        GLctx.bufferData(target, size, usage);
      } else {
        GLctx.bufferData(target, HEAPU8.subarray(data, data+size), usage);
      }
    }

  function _sbrk(bytes) {
      // Implement a Linux-like 'memory area' for our 'process'.
      // Changes the size of the memory area by |bytes|; returns the
      // address of the previous top ('break') of the memory area
      // We control the "dynamic" memory - DYNAMIC_BASE to DYNAMICTOP
      var self = _sbrk;
      if (!self.called) {
        DYNAMICTOP = alignMemoryPage(DYNAMICTOP); // make sure we start out aligned
        self.called = true;
        assert(Runtime.dynamicAlloc);
        self.alloc = Runtime.dynamicAlloc;
        Runtime.dynamicAlloc = function() { abort('cannot dynamically allocate, sbrk now has control') };
      }
      var ret = DYNAMICTOP;
      if (bytes != 0) {
        var success = self.alloc(bytes);
        if (!success) return -1 >>> 0; // sbrk failure code
      }
      return ret;  // Previous break location.
    }

  function _emscripten_glGetTexParameteriv(target, pname, params) {
      if (!params) {
        // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
        // if p == null, issue a GL error to notify user about it.
        GL.recordError(0x0501 /* GL_INVALID_VALUE */);
        return;
      }
      HEAP32[((params)>>2)]=GLctx.getTexParameter(target, pname);
    }

  function _emscripten_glGetShaderSource(shader, bufSize, length, source) {
      var result = GLctx.getShaderSource(GL.shaders[shader]);
      if (!result) return; // If an error occurs, nothing will be written to length or source.
      result = result.slice(0, Math.max(0, bufSize - 1));
      if (bufSize > 0 && source) {
        writeStringToMemory(result, source);
        if (length) HEAP32[((length)>>2)]=result.length;
      } else {
        if (length) HEAP32[((length)>>2)]=0;
      }
    }

  function _emscripten_glGenerateMipmap(x0) { GLctx.generateMipmap(x0) }

  function _emscripten_glSampleCoverage(x0, x1) { GLctx.sampleCoverage(x0, x1) }

  function _emscripten_glCullFace(x0) { GLctx.cullFace(x0) }

  function _emscripten_glGetFloatv(name_, p) {
      emscriptenWebGLGet(name_, p, 'Float');
    }

  function _emscripten_glUseProgram(program) {
      GLctx.useProgram(program ? GL.programs[program] : null);
    }


  function ___setErrNo(value) {
      if (Module['___errno_location']) HEAP32[((Module['___errno_location']())>>2)]=value;
      else Module.printErr('failed to set errno from JS');
      return value;
    }

  var ERRNO_CODES={EPERM:1,ENOENT:2,ESRCH:3,EINTR:4,EIO:5,ENXIO:6,E2BIG:7,ENOEXEC:8,EBADF:9,ECHILD:10,EAGAIN:11,EWOULDBLOCK:11,ENOMEM:12,EACCES:13,EFAULT:14,ENOTBLK:15,EBUSY:16,EEXIST:17,EXDEV:18,ENODEV:19,ENOTDIR:20,EISDIR:21,EINVAL:22,ENFILE:23,EMFILE:24,ENOTTY:25,ETXTBSY:26,EFBIG:27,ENOSPC:28,ESPIPE:29,EROFS:30,EMLINK:31,EPIPE:32,EDOM:33,ERANGE:34,ENOMSG:42,EIDRM:43,ECHRNG:44,EL2NSYNC:45,EL3HLT:46,EL3RST:47,ELNRNG:48,EUNATCH:49,ENOCSI:50,EL2HLT:51,EDEADLK:35,ENOLCK:37,EBADE:52,EBADR:53,EXFULL:54,ENOANO:55,EBADRQC:56,EBADSLT:57,EDEADLOCK:35,EBFONT:59,ENOSTR:60,ENODATA:61,ETIME:62,ENOSR:63,ENONET:64,ENOPKG:65,EREMOTE:66,ENOLINK:67,EADV:68,ESRMNT:69,ECOMM:70,EPROTO:71,EMULTIHOP:72,EDOTDOT:73,EBADMSG:74,ENOTUNIQ:76,EBADFD:77,EREMCHG:78,ELIBACC:79,ELIBBAD:80,ELIBSCN:81,ELIBMAX:82,ELIBEXEC:83,ENOSYS:38,ENOTEMPTY:39,ENAMETOOLONG:36,ELOOP:40,EOPNOTSUPP:95,EPFNOSUPPORT:96,ECONNRESET:104,ENOBUFS:105,EAFNOSUPPORT:97,EPROTOTYPE:91,ENOTSOCK:88,ENOPROTOOPT:92,ESHUTDOWN:108,ECONNREFUSED:111,EADDRINUSE:98,ECONNABORTED:103,ENETUNREACH:101,ENETDOWN:100,ETIMEDOUT:110,EHOSTDOWN:112,EHOSTUNREACH:113,EINPROGRESS:115,EALREADY:114,EDESTADDRREQ:89,EMSGSIZE:90,EPROTONOSUPPORT:93,ESOCKTNOSUPPORT:94,EADDRNOTAVAIL:99,ENETRESET:102,EISCONN:106,ENOTCONN:107,ETOOMANYREFS:109,EUSERS:87,EDQUOT:122,ESTALE:116,ENOTSUP:95,ENOMEDIUM:123,EILSEQ:84,EOVERFLOW:75,ECANCELED:125,ENOTRECOVERABLE:131,EOWNERDEAD:130,ESTRPIPE:86};function _sysconf(name) {
      // long sysconf(int name);
      // http://pubs.opengroup.org/onlinepubs/009695399/functions/sysconf.html
      switch(name) {
        case 30: return PAGE_SIZE;
        case 85: return totalMemory / PAGE_SIZE;
        case 132:
        case 133:
        case 12:
        case 137:
        case 138:
        case 15:
        case 235:
        case 16:
        case 17:
        case 18:
        case 19:
        case 20:
        case 149:
        case 13:
        case 10:
        case 236:
        case 153:
        case 9:
        case 21:
        case 22:
        case 159:
        case 154:
        case 14:
        case 77:
        case 78:
        case 139:
        case 80:
        case 81:
        case 82:
        case 68:
        case 67:
        case 164:
        case 11:
        case 29:
        case 47:
        case 48:
        case 95:
        case 52:
        case 51:
        case 46:
          return 200809;
        case 79:
          return 0;
        case 27:
        case 246:
        case 127:
        case 128:
        case 23:
        case 24:
        case 160:
        case 161:
        case 181:
        case 182:
        case 242:
        case 183:
        case 184:
        case 243:
        case 244:
        case 245:
        case 165:
        case 178:
        case 179:
        case 49:
        case 50:
        case 168:
        case 169:
        case 175:
        case 170:
        case 171:
        case 172:
        case 97:
        case 76:
        case 32:
        case 173:
        case 35:
          return -1;
        case 176:
        case 177:
        case 7:
        case 155:
        case 8:
        case 157:
        case 125:
        case 126:
        case 92:
        case 93:
        case 129:
        case 130:
        case 131:
        case 94:
        case 91:
          return 1;
        case 74:
        case 60:
        case 69:
        case 70:
        case 4:
          return 1024;
        case 31:
        case 42:
        case 72:
          return 32;
        case 87:
        case 26:
        case 33:
          return 2147483647;
        case 34:
        case 1:
          return 47839;
        case 38:
        case 36:
          return 99;
        case 43:
        case 37:
          return 2048;
        case 0: return 2097152;
        case 3: return 65536;
        case 28: return 32768;
        case 44: return 32767;
        case 75: return 16384;
        case 39: return 1000;
        case 89: return 700;
        case 71: return 256;
        case 40: return 255;
        case 2: return 100;
        case 180: return 64;
        case 25: return 20;
        case 5: return 16;
        case 6: return 6;
        case 73: return 4;
        case 84: {
          if (typeof navigator === 'object') return navigator['hardwareConcurrency'] || 1;
          return 1;
        }
      }
      ___setErrNo(ERRNO_CODES.EINVAL);
      return -1;
    }

  function _emscripten_glVertexAttribDivisor(index, divisor) {
      GLctx['vertexAttribDivisor'](index, divisor);
    }

  function _emscripten_glDrawElementsInstanced(mode, count, type, indices, primcount) {
      GLctx['drawElementsInstanced'](mode, count, type, indices, primcount);
    }

  function _emscripten_glDrawElements(mode, count, type, indices) {

      GLctx.drawElements(mode, count, type, indices);

    }

  function _emscripten_glUniform2fv(location, count, value) {
      location = GL.uniforms[location];
      var view;
      if (count === 1) {
        // avoid allocation for the common case of uploading one uniform
        view = GL.miniTempBufferViews[1];
        view[0] = HEAPF32[((value)>>2)];
        view[1] = HEAPF32[(((value)+(4))>>2)];
      } else {
        view = HEAPF32.subarray((value)>>2,(value+count*8)>>2);
      }
      GLctx.uniform2fv(location, view);
    }

  function _emscripten_glMatrixMode(){ throw 'Legacy GL function (glMatrixMode) called. If you want legacy GL emulation, you need to compile with -s LEGACY_GL_EMULATION=1 to enable legacy GL emulation.'; }

  function _abort() {
      Module['abort']();
    }

  function _emscripten_glCreateProgram() {
      var id = GL.getNewId(GL.programs);
      var program = GLctx.createProgram();
      program.name = id;
      GL.programs[id] = program;
      return id;
    }

  function _emscripten_glFramebufferRenderbuffer(target, attachment, renderbuffertarget, renderbuffer) {
      GLctx.framebufferRenderbuffer(target, attachment, renderbuffertarget,
                                         GL.renderbuffers[renderbuffer]);
    }

  function _emscripten_glCompressedTexImage2D(target, level, internalFormat, width, height, border, imageSize, data) {
      var heapView;
      if (data) {
        heapView = HEAPU8.subarray((data),(data+imageSize));
      } else {
        heapView = null;
      }
      GLctx['compressedTexImage2D'](target, level, internalFormat, width, height, border, heapView);
    }

  function _emscripten_glClearColor(x0, x1, x2, x3) { GLctx.clearColor(x0, x1, x2, x3) }

  function _emscripten_glDeleteFramebuffers(n, framebuffers) {
      for (var i = 0; i < n; ++i) {
        var id = HEAP32[(((framebuffers)+(i*4))>>2)];
        var framebuffer = GL.framebuffers[id];
        if (!framebuffer) continue; // GL spec: "glDeleteFramebuffers silently ignores 0s and names that do not correspond to existing framebuffer objects".
        GLctx.deleteFramebuffer(framebuffer);
        framebuffer.name = 0;
        GL.framebuffers[id] = null;
      }
    }

  function _emscripten_glBindVertexArray(vao) {
      GLctx['bindVertexArray'](GL.vaos[vao]);
    }

  function _emscripten_glIsBuffer(buffer) {
      var b = GL.buffers[buffer];
      if (!b) return 0;
      return GLctx.isBuffer(b);
    }

  function _emscripten_glUniform2iv(location, count, value) {
      location = GL.uniforms[location];
      count *= 2;
      value = HEAP32.subarray((value)>>2,(value+count*4)>>2);
      GLctx.uniform2iv(location, value);
    }

  function _emscripten_glVertexAttrib1fv(index, v) {
      v = HEAPF32.subarray((v)>>2,(v+4)>>2);
      GLctx.vertexAttrib1fv(index, v);
    }

  function _emscripten_glTexSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixels) {
      var pixelData;
      if (pixels) {
        pixelData = emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, -1).pixels;
      } else {
        pixelData = null;
      }
      GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixelData);
    }

  function _emscripten_glPolygonOffset(x0, x1) { GLctx.polygonOffset(x0, x1) }

  var _emscripten_asm_const_int=true;

  function _emscripten_glUniform2f(location, v0, v1) {
      location = GL.uniforms[location];
      GLctx.uniform2f(location, v0, v1);
    }

  function ___unlock() {}

  function _emscripten_glLoadMatrixf() {
  Module['printErr']('missing function: emscripten_glLoadMatrixf'); abort(-1);
  }

  function _emscripten_glUniform2i(location, v0, v1) {
      location = GL.uniforms[location];
      GLctx.uniform2i(location, v0, v1);
    }

  function _emscripten_glGetProgramInfoLog(program, maxLength, length, infoLog) {
      var log = GLctx.getProgramInfoLog(GL.programs[program]);
      if (log === null) log = '(unknown error)';

      log = log.substr(0, maxLength - 1);
      if (maxLength > 0 && infoLog) {
        writeStringToMemory(log, infoLog);
        if (length) HEAP32[((length)>>2)]=log.length;
      } else {
        if (length) HEAP32[((length)>>2)]=0;
      }
    }

  function _emscripten_glDeleteRenderbuffers(n, renderbuffers) {
      for (var i = 0; i < n; i++) {
        var id = HEAP32[(((renderbuffers)+(i*4))>>2)];
        var renderbuffer = GL.renderbuffers[id];
        if (!renderbuffer) continue; // GL spec: "glDeleteRenderbuffers silently ignores 0s and names that do not correspond to existing renderbuffer objects".
        GLctx.deleteRenderbuffer(renderbuffer);
        renderbuffer.name = 0;
        GL.renderbuffers[id] = null;
      }
    }

  function _emscripten_glTexImage2D(target, level, internalFormat, width, height, border, format, type, pixels) {
      var pixelData;
      if (pixels) {
        var data = emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, internalFormat);
        pixelData = data.pixels;
        internalFormat = data.internalFormat;
      } else {
        pixelData = null;
      }
      GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, pixelData);
    }

  function _emscripten_glGetUniformiv(program, location, params) {
      emscriptenWebGLGetUniform(program, location, params, 'Integer');
    }

  function _emscripten_glActiveTexture(x0) { GLctx.activeTexture(x0) }

  function _emscripten_glDepthMask(x0) { GLctx.depthMask(x0) }

  function _emscripten_glDepthRangef(x0, x1) { GLctx.depthRange(x0, x1) }

  function ___syscall54(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // ioctl
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function _emscripten_glFlush() { GLctx.flush() }

  function _emscripten_glDeleteProgram(id) {
      if (!id) return;
      var program = GL.programs[id];
      if (!program) { // glDeleteProgram actually signals an error when deleting a nonexisting object, unlike some other GL delete functions.
        GL.recordError(0x0501 /* GL_INVALID_VALUE */);
        return;
      }
      GLctx.deleteProgram(program);
      program.name = 0;
      GL.programs[id] = null;
      GL.programInfos[id] = null;
    }

  function _emscripten_glStencilMaskSeparate(x0, x1) { GLctx.stencilMaskSeparate(x0, x1) }

  function _emscripten_glCreateShader(shaderType) {
      var id = GL.getNewId(GL.shaders);
      GL.shaders[id] = GLctx.createShader(shaderType);
      return id;
    }

  function ___syscall140(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // llseek
      var stream = SYSCALLS.getStreamFromFD(), offset_high = SYSCALLS.get(), offset_low = SYSCALLS.get(), result = SYSCALLS.get(), whence = SYSCALLS.get();
      var offset = offset_low;
      assert(offset_high === 0);
      FS.llseek(stream, offset, whence);
      HEAP32[((result)>>2)]=stream.position;
      if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null; // reset readdir state
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function _emscripten_glIsShader(shader) {
      var s = GL.shaders[shader];
      if (!s) return 0;
      return GLctx.isShader(s);
    }

  function _emscripten_glGetShaderPrecisionFormat(shaderType, precisionType, range, precision) {
      var result = GLctx.getShaderPrecisionFormat(shaderType, precisionType);
      HEAP32[((range)>>2)]=result.rangeMin;
      HEAP32[(((range)+(4))>>2)]=result.rangeMax;
      HEAP32[((precision)>>2)]=result.precision;
    }

  function _emscripten_glUniform1fv(location, count, value) {
      location = GL.uniforms[location];
      var view;
      if (count === 1) {
        // avoid allocation for the common case of uploading one uniform
        view = GL.miniTempBufferViews[0];
        view[0] = HEAPF32[((value)>>2)];
      } else {
        view = HEAPF32.subarray((value)>>2,(value+count*4)>>2);
      }
      GLctx.uniform1fv(location, view);
    }

  function _emscripten_glColorMask(x0, x1, x2, x3) { GLctx.colorMask(x0, x1, x2, x3) }

  function _emscripten_glPixelStorei(pname, param) {
      if (pname == 0x0D05 /* GL_PACK_ALIGNMENT */) {
        GL.packAlignment = param;
      } else if (pname == 0x0cf5 /* GL_UNPACK_ALIGNMENT */) {
        GL.unpackAlignment = param;
      }
      GLctx.pixelStorei(pname, param);
    }

  function _emscripten_glDeleteTextures(n, textures) {
      for (var i = 0; i < n; i++) {
        var id = HEAP32[(((textures)+(i*4))>>2)];
        var texture = GL.textures[id];
        if (!texture) continue; // GL spec: "glDeleteTextures silently ignores 0s and names that do not correspond to existing textures".
        GLctx.deleteTexture(texture);
        texture.name = 0;
        GL.textures[id] = null;
      }
    }

  function ___lock() {}

  function _emscripten_glBindProgramARB() {
  Module['printErr']('missing function: emscripten_glBindProgramARB'); abort(-1);
  }

  function _emscripten_glDeleteVertexArrays(n, vaos) {
      for(var i = 0; i < n; i++) {
        var id = HEAP32[(((vaos)+(i*4))>>2)];
        GLctx['deleteVertexArray'](GL.vaos[id]);
        GL.vaos[id] = null;
      }
    }

  function _emscripten_glGenVertexArrays(n, arrays) {

      for(var i = 0; i < n; i++) {
        var vao = GLctx['createVertexArray']();
        if (!vao) {
          GL.recordError(0x0502 /* GL_INVALID_OPERATION */);
          while(i < n) HEAP32[(((arrays)+(i++*4))>>2)]=0;
          return;
        }
        var id = GL.getNewId(GL.vaos);
        vao.name = id;
        GL.vaos[id] = vao;
        HEAP32[(((arrays)+(i*4))>>2)]=id;
      }
    }

  function _time(ptr) {
      var ret = (Date.now()/1000)|0;
      if (ptr) {
        HEAP32[((ptr)>>2)]=ret;
      }
      return ret;
    }

  function _emscripten_glCheckFramebufferStatus(x0) { return GLctx.checkFramebufferStatus(x0) }

  function _pthread_self() {
      //FIXME: assumes only a single thread
      return 0;
    }

  function _emscripten_glGetBooleanv(name_, p) {
      emscriptenWebGLGet(name_, p, 'Boolean');
    }

  function _emscripten_glDisable(x0) { GLctx.disable(x0) }

  function _emscripten_glCompileShader(shader) {
      GLctx.compileShader(GL.shaders[shader]);
    }
var GLctx; GL.init();
/* flush anything remaining in the buffer during shutdown */ __ATEXIT__.push(function() { var fflush = Module["_fflush"]; if (fflush) fflush(0); var printChar = ___syscall146.printChar; if (!printChar) return; var buffers = ___syscall146.buffers; if (buffers[1].length) printChar(1, 10); if (buffers[2].length) printChar(2, 10); });;
STACK_BASE = STACKTOP = Runtime.alignMemory(STATICTOP);

staticSealed = true; // seal the static portion of memory

STACK_MAX = STACK_BASE + TOTAL_STACK;

DYNAMIC_BASE = DYNAMICTOP = Runtime.alignMemory(STACK_MAX);

assert(DYNAMIC_BASE < TOTAL_MEMORY, "TOTAL_MEMORY not big enough for stack");



function nullFunc_viiiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vd(x) { Module["printErr"]("Invalid function pointer called with signature 'vd'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vid(x) { Module["printErr"]("Invalid function pointer called with signature 'vid'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vi(x) { Module["printErr"]("Invalid function pointer called with signature 'vi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vii(x) { Module["printErr"]("Invalid function pointer called with signature 'vii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_ii(x) { Module["printErr"]("Invalid function pointer called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viddd(x) { Module["printErr"]("Invalid function pointer called with signature 'viddd'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vidd(x) { Module["printErr"]("Invalid function pointer called with signature 'vidd'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iiii(x) { Module["printErr"]("Invalid function pointer called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiiiiiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiiiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiiiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viii(x) { Module["printErr"]("Invalid function pointer called with signature 'viii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vidddd(x) { Module["printErr"]("Invalid function pointer called with signature 'vidddd'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vdi(x) { Module["printErr"]("Invalid function pointer called with signature 'vdi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiiiiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiiiiiiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiiiiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iii(x) { Module["printErr"]("Invalid function pointer called with signature 'iii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_i(x) { Module["printErr"]("Invalid function pointer called with signature 'i'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vdddddd(x) { Module["printErr"]("Invalid function pointer called with signature 'vdddddd'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vdddd(x) { Module["printErr"]("Invalid function pointer called with signature 'vdddd'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vdd(x) { Module["printErr"]("Invalid function pointer called with signature 'vdd'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_v(x) { Module["printErr"]("Invalid function pointer called with signature 'v'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viid(x) { Module["printErr"]("Invalid function pointer called with signature 'viid'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function invoke_viiiii(index,a1,a2,a3,a4,a5) {
  try {
    Module["dynCall_viiiii"](index,a1,a2,a3,a4,a5);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_vd(index,a1) {
  try {
    Module["dynCall_vd"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_vid(index,a1,a2) {
  try {
    Module["dynCall_vid"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_vi(index,a1) {
  try {
    Module["dynCall_vi"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_vii(index,a1,a2) {
  try {
    Module["dynCall_vii"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_ii(index,a1) {
  try {
    return Module["dynCall_ii"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_viddd(index,a1,a2,a3,a4) {
  try {
    Module["dynCall_viddd"](index,a1,a2,a3,a4);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_vidd(index,a1,a2,a3) {
  try {
    Module["dynCall_vidd"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_iiii(index,a1,a2,a3) {
  try {
    return Module["dynCall_iiii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_viiiiiiii(index,a1,a2,a3,a4,a5,a6,a7,a8) {
  try {
    Module["dynCall_viiiiiiii"](index,a1,a2,a3,a4,a5,a6,a7,a8);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_viiiiii(index,a1,a2,a3,a4,a5,a6) {
  try {
    Module["dynCall_viiiiii"](index,a1,a2,a3,a4,a5,a6);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_viii(index,a1,a2,a3) {
  try {
    Module["dynCall_viii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_vidddd(index,a1,a2,a3,a4,a5) {
  try {
    Module["dynCall_vidddd"](index,a1,a2,a3,a4,a5);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_vdi(index,a1,a2) {
  try {
    Module["dynCall_vdi"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_viiiiiii(index,a1,a2,a3,a4,a5,a6,a7) {
  try {
    Module["dynCall_viiiiiii"](index,a1,a2,a3,a4,a5,a6,a7);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_viiiiiiiii(index,a1,a2,a3,a4,a5,a6,a7,a8,a9) {
  try {
    Module["dynCall_viiiiiiiii"](index,a1,a2,a3,a4,a5,a6,a7,a8,a9);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_iii(index,a1,a2) {
  try {
    return Module["dynCall_iii"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_i(index) {
  try {
    return Module["dynCall_i"](index);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_vdddddd(index,a1,a2,a3,a4,a5,a6) {
  try {
    Module["dynCall_vdddddd"](index,a1,a2,a3,a4,a5,a6);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_vdddd(index,a1,a2,a3,a4) {
  try {
    Module["dynCall_vdddd"](index,a1,a2,a3,a4);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_vdd(index,a1,a2) {
  try {
    Module["dynCall_vdd"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_v(index) {
  try {
    Module["dynCall_v"](index);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_viid(index,a1,a2,a3) {
  try {
    Module["dynCall_viid"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_viiii(index,a1,a2,a3,a4) {
  try {
    Module["dynCall_viiii"](index,a1,a2,a3,a4);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

Module.asmGlobalArg = { "Math": Math, "Int8Array": Int8Array, "Int16Array": Int16Array, "Int32Array": Int32Array, "Uint8Array": Uint8Array, "Uint16Array": Uint16Array, "Uint32Array": Uint32Array, "Float32Array": Float32Array, "Float64Array": Float64Array, "NaN": NaN, "Infinity": Infinity };

Module.asmLibraryArg = { "abort": abort, "assert": assert, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_vd": nullFunc_vd, "nullFunc_vid": nullFunc_vid, "nullFunc_vi": nullFunc_vi, "nullFunc_vii": nullFunc_vii, "nullFunc_ii": nullFunc_ii, "nullFunc_viddd": nullFunc_viddd, "nullFunc_vidd": nullFunc_vidd, "nullFunc_iiii": nullFunc_iiii, "nullFunc_viiiiiiii": nullFunc_viiiiiiii, "nullFunc_viiiiii": nullFunc_viiiiii, "nullFunc_viii": nullFunc_viii, "nullFunc_vidddd": nullFunc_vidddd, "nullFunc_vdi": nullFunc_vdi, "nullFunc_viiiiiii": nullFunc_viiiiiii, "nullFunc_viiiiiiiii": nullFunc_viiiiiiiii, "nullFunc_iii": nullFunc_iii, "nullFunc_i": nullFunc_i, "nullFunc_vdddddd": nullFunc_vdddddd, "nullFunc_vdddd": nullFunc_vdddd, "nullFunc_vdd": nullFunc_vdd, "nullFunc_v": nullFunc_v, "nullFunc_viid": nullFunc_viid, "nullFunc_viiii": nullFunc_viiii, "invoke_viiiii": invoke_viiiii, "invoke_vd": invoke_vd, "invoke_vid": invoke_vid, "invoke_vi": invoke_vi, "invoke_vii": invoke_vii, "invoke_ii": invoke_ii, "invoke_viddd": invoke_viddd, "invoke_vidd": invoke_vidd, "invoke_iiii": invoke_iiii, "invoke_viiiiiiii": invoke_viiiiiiii, "invoke_viiiiii": invoke_viiiiii, "invoke_viii": invoke_viii, "invoke_vidddd": invoke_vidddd, "invoke_vdi": invoke_vdi, "invoke_viiiiiii": invoke_viiiiiii, "invoke_viiiiiiiii": invoke_viiiiiiiii, "invoke_iii": invoke_iii, "invoke_i": invoke_i, "invoke_vdddddd": invoke_vdddddd, "invoke_vdddd": invoke_vdddd, "invoke_vdd": invoke_vdd, "invoke_v": invoke_v, "invoke_viid": invoke_viid, "invoke_viiii": invoke_viiii, "_emscripten_glGetTexParameterfv": _emscripten_glGetTexParameterfv, "_emscripten_glGenRenderbuffers": _emscripten_glGenRenderbuffers, "_emscripten_glShaderSource": _emscripten_glShaderSource, "_emscripten_glReleaseShaderCompiler": _emscripten_glReleaseShaderCompiler, "_emscripten_glBlendFuncSeparate": _emscripten_glBlendFuncSeparate, "_emscripten_glGetShaderPrecisionFormat": _emscripten_glGetShaderPrecisionFormat, "_emscripten_glGetIntegerv": _emscripten_glGetIntegerv, "_emscripten_glCullFace": _emscripten_glCullFace, "_emscripten_glStencilMaskSeparate": _emscripten_glStencilMaskSeparate, "_emscripten_glViewport": _emscripten_glViewport, "_emscripten_glFrontFace": _emscripten_glFrontFace, "_emscripten_glDrawArrays": _emscripten_glDrawArrays, "_emscripten_glUniform3fv": _emscripten_glUniform3fv, "_emscripten_glPolygonOffset": _emscripten_glPolygonOffset, "_emscripten_glUseProgram": _emscripten_glUseProgram, "_emscripten_glBlendColor": _emscripten_glBlendColor, "_emscripten_glDepthFunc": _emscripten_glDepthFunc, "_sbrk": _sbrk, "_emscripten_glDisableVertexAttribArray": _emscripten_glDisableVertexAttribArray, "_emscripten_glUniform3iv": _emscripten_glUniform3iv, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_sysconf": _sysconf, "_emscripten_glVertexPointer": _emscripten_glVertexPointer, "_emscripten_glUniform1f": _emscripten_glUniform1f, "emscriptenWebGLComputeImageSize": emscriptenWebGLComputeImageSize, "_emscripten_glGetBooleanv": _emscripten_glGetBooleanv, "_emscripten_glGetShaderSource": _emscripten_glGetShaderSource, "_emscripten_glUniform1i": _emscripten_glUniform1i, "_emscripten_glGenBuffers": _emscripten_glGenBuffers, "_emscripten_glDeleteObjectARB": _emscripten_glDeleteObjectARB, "_emscripten_glTexImage2D": _emscripten_glTexImage2D, "_emscripten_glVertexAttribPointer": _emscripten_glVertexAttribPointer, "_emscripten_glIsProgram": _emscripten_glIsProgram, "_emscripten_glBlendEquationSeparate": _emscripten_glBlendEquationSeparate, "_emscripten_glGetString": _emscripten_glGetString, "_emscripten_glIsFramebuffer": _emscripten_glIsFramebuffer, "_emscripten_glIsEnabled": _emscripten_glIsEnabled, "_emscripten_glScissor": _emscripten_glScissor, "_emscripten_glVertexAttrib4fv": _emscripten_glVertexAttrib4fv, "_emscripten_glTexParameteriv": _emscripten_glTexParameteriv, "_pthread_cleanup_push": _pthread_cleanup_push, "_emscripten_glBindProgramARB": _emscripten_glBindProgramARB, "_emscripten_glStencilOpSeparate": _emscripten_glStencilOpSeparate, "___syscall140": ___syscall140, "_emscripten_glIsBuffer": _emscripten_glIsBuffer, "___syscall146": ___syscall146, "_emscripten_glGetActiveAttrib": _emscripten_glGetActiveAttrib, "_emscripten_glAttachShader": _emscripten_glAttachShader, "_emscripten_glCompressedTexSubImage2D": _emscripten_glCompressedTexSubImage2D, "_emscripten_glUniform2f": _emscripten_glUniform2f, "_emscripten_glTexParameterfv": _emscripten_glTexParameterfv, "_emscripten_glUniformMatrix2fv": _emscripten_glUniformMatrix2fv, "_emscripten_glTexParameterf": _emscripten_glTexParameterf, "_emscripten_glGetAttachedShaders": _emscripten_glGetAttachedShaders, "_emscripten_glGenTextures": _emscripten_glGenTextures, "_emscripten_glTexParameteri": _emscripten_glTexParameteri, "_emscripten_glClear": _emscripten_glClear, "_emscripten_glBindVertexArray": _emscripten_glBindVertexArray, "_emscripten_glValidateProgram": _emscripten_glValidateProgram, "_emscripten_glVertexAttrib2fv": _emscripten_glVertexAttrib2fv, "_emscripten_glUniform3f": _emscripten_glUniform3f, "_emscripten_glUniform4iv": _emscripten_glUniform4iv, "_emscripten_glGetTexParameteriv": _emscripten_glGetTexParameteriv, "___setErrNo": ___setErrNo, "_emscripten_glBindAttribLocation": _emscripten_glBindAttribLocation, "_emscripten_glClientActiveTexture": _emscripten_glClientActiveTexture, "_emscripten_glVertexAttrib2f": _emscripten_glVertexAttrib2f, "_emscripten_glFlush": _emscripten_glFlush, "_emscripten_glUniform4i": _emscripten_glUniform4i, "_emscripten_glCheckFramebufferStatus": _emscripten_glCheckFramebufferStatus, "_emscripten_glGetError": _emscripten_glGetError, "_emscripten_glClearDepthf": _emscripten_glClearDepthf, "_emscripten_glBufferData": _emscripten_glBufferData, "_emscripten_glUniform3i": _emscripten_glUniform3i, "_emscripten_glDeleteShader": _emscripten_glDeleteShader, "_emscripten_glReadPixels": _emscripten_glReadPixels, "_emscripten_glMatrixMode": _emscripten_glMatrixMode, "_emscripten_glClearStencil": _emscripten_glClearStencil, "_emscripten_glGetUniformLocation": _emscripten_glGetUniformLocation, "emscriptenWebGLGet": emscriptenWebGLGet, "_emscripten_glEnableVertexAttribArray": _emscripten_glEnableVertexAttribArray, "_emscripten_glGetAttribLocation": _emscripten_glGetAttribLocation, "_emscripten_glNormalPointer": _emscripten_glNormalPointer, "_emscripten_glBindTexture": _emscripten_glBindTexture, "_emscripten_glTexCoordPointer": _emscripten_glTexCoordPointer, "_emscripten_glEnable": _emscripten_glEnable, "_emscripten_glClearDepth": _emscripten_glClearDepth, "___lock": ___lock, "emscriptenWebGLGetTexPixelData": emscriptenWebGLGetTexPixelData, "___syscall6": ___syscall6, "_emscripten_glStencilFuncSeparate": _emscripten_glStencilFuncSeparate, "_emscripten_glVertexAttrib3f": _emscripten_glVertexAttrib3f, "_time": _time, "_emscripten_glVertexAttrib1f": _emscripten_glVertexAttrib1f, "_emscripten_glGetFramebufferAttachmentParameteriv": _emscripten_glGetFramebufferAttachmentParameteriv, "_emscripten_glBindFramebuffer": _emscripten_glBindFramebuffer, "_emscripten_glEnableClientState": _emscripten_glEnableClientState, "_pthread_cleanup_pop": _pthread_cleanup_pop, "_emscripten_glDeleteBuffers": _emscripten_glDeleteBuffers, "_emscripten_glGetPointerv": _emscripten_glGetPointerv, "_emscripten_glUniform4f": _emscripten_glUniform4f, "_emscripten_glShaderBinary": _emscripten_glShaderBinary, "_emscripten_glDrawElements": _emscripten_glDrawElements, "_emscripten_glBlendFunc": _emscripten_glBlendFunc, "_emscripten_glGetShaderInfoLog": _emscripten_glGetShaderInfoLog, "_emscripten_glStencilMask": _emscripten_glStencilMask, "_emscripten_glUniform1iv": _emscripten_glUniform1iv, "_emscripten_glGetVertexAttribPointerv": _emscripten_glGetVertexAttribPointerv, "_emscripten_glUniform2i": _emscripten_glUniform2i, "emscriptenWebGLGetUniform": emscriptenWebGLGetUniform, "_emscripten_glDeleteVertexArrays": _emscripten_glDeleteVertexArrays, "_emscripten_glGetActiveUniform": _emscripten_glGetActiveUniform, "emscriptenWebGLGetVertexAttrib": emscriptenWebGLGetVertexAttrib, "_emscripten_glUniform2iv": _emscripten_glUniform2iv, "_emscripten_glDisable": _emscripten_glDisable, "_emscripten_glGetBufferParameteriv": _emscripten_glGetBufferParameteriv, "_emscripten_glDeleteProgram": _emscripten_glDeleteProgram, "_emscripten_glDeleteRenderbuffers": _emscripten_glDeleteRenderbuffers, "_emscripten_glDrawElementsInstanced": _emscripten_glDrawElementsInstanced, "_emscripten_glVertexAttrib4f": _emscripten_glVertexAttrib4f, "_emscripten_glGetVertexAttribiv": _emscripten_glGetVertexAttribiv, "_emscripten_glTexSubImage2D": _emscripten_glTexSubImage2D, "_emscripten_glGetProgramiv": _emscripten_glGetProgramiv, "_emscripten_glPixelStorei": _emscripten_glPixelStorei, "_emscripten_glUniformMatrix3fv": _emscripten_glUniformMatrix3fv, "_emscripten_glDepthRange": _emscripten_glDepthRange, "_emscripten_glGetObjectParameterivARB": _emscripten_glGetObjectParameterivARB, "_emscripten_glFinish": _emscripten_glFinish, "_emscripten_glRenderbufferStorage": _emscripten_glRenderbufferStorage, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_glDepthMask": _emscripten_glDepthMask, "_emscripten_glDrawBuffers": _emscripten_glDrawBuffers, "_emscripten_glLineWidth": _emscripten_glLineWidth, "_emscripten_glCopyTexImage2D": _emscripten_glCopyTexImage2D, "_emscripten_glFramebufferTexture2D": _emscripten_glFramebufferTexture2D, "_emscripten_glFramebufferRenderbuffer": _emscripten_glFramebufferRenderbuffer, "_emscripten_glStencilFunc": _emscripten_glStencilFunc, "_abort": _abort, "_emscripten_glGetUniformiv": _emscripten_glGetUniformiv, "_emscripten_glRotatef": _emscripten_glRotatef, "_emscripten_glGetShaderiv": _emscripten_glGetShaderiv, "_emscripten_glGenFramebuffers": _emscripten_glGenFramebuffers, "_emscripten_glUniformMatrix4fv": _emscripten_glUniformMatrix4fv, "_emscripten_glLoadIdentity": _emscripten_glLoadIdentity, "_emscripten_glUniform1fv": _emscripten_glUniform1fv, "_emscripten_glIsRenderbuffer": _emscripten_glIsRenderbuffer, "_emscripten_glLoadMatrixf": _emscripten_glLoadMatrixf, "_emscripten_glDrawArraysInstanced": _emscripten_glDrawArraysInstanced, "_emscripten_glCreateShader": _emscripten_glCreateShader, "_emscripten_glCopyTexSubImage2D": _emscripten_glCopyTexSubImage2D, "_emscripten_glDeleteTextures": _emscripten_glDeleteTextures, "_emscripten_glBindRenderbuffer": _emscripten_glBindRenderbuffer, "_emscripten_glBufferSubData": _emscripten_glBufferSubData, "_emscripten_glVertexAttribDivisor": _emscripten_glVertexAttribDivisor, "_emscripten_glGetUniformfv": _emscripten_glGetUniformfv, "_emscripten_glGetVertexAttribfv": _emscripten_glGetVertexAttribfv, "_emscripten_glGetRenderbufferParameteriv": _emscripten_glGetRenderbufferParameteriv, "_emscripten_glDeleteFramebuffers": _emscripten_glDeleteFramebuffers, "_emscripten_glVertexAttrib3fv": _emscripten_glVertexAttrib3fv, "_emscripten_glGetInfoLogARB": _emscripten_glGetInfoLogARB, "_emscripten_glCompileShader": _emscripten_glCompileShader, "_emscripten_glSampleCoverage": _emscripten_glSampleCoverage, "_emscripten_glFrustum": _emscripten_glFrustum, "_emscripten_glDepthRangef": _emscripten_glDepthRangef, "_emscripten_glStencilOp": _emscripten_glStencilOp, "_emscripten_glGenerateMipmap": _emscripten_glGenerateMipmap, "_emscripten_glColorMask": _emscripten_glColorMask, "_emscripten_glLinkProgram": _emscripten_glLinkProgram, "_emscripten_glBlendEquation": _emscripten_glBlendEquation, "_emscripten_glIsTexture": _emscripten_glIsTexture, "_pthread_self": _pthread_self, "_emscripten_glVertexAttrib1fv": _emscripten_glVertexAttrib1fv, "_emscripten_glHint": _emscripten_glHint, "_emscripten_glActiveTexture": _emscripten_glActiveTexture, "_emscripten_glDrawRangeElements": _emscripten_glDrawRangeElements, "___syscall54": ___syscall54, "___unlock": ___unlock, "_emscripten_glColorPointer": _emscripten_glColorPointer, "_emscripten_glGetProgramInfoLog": _emscripten_glGetProgramInfoLog, "_emscripten_glIsShader": _emscripten_glIsShader, "_emscripten_glUniform4fv": _emscripten_glUniform4fv, "_emscripten_glCompressedTexImage2D": _emscripten_glCompressedTexImage2D, "_emscripten_glClearColor": _emscripten_glClearColor, "_emscripten_glCreateProgram": _emscripten_glCreateProgram, "_emscripten_glGenVertexArrays": _emscripten_glGenVertexArrays, "_emscripten_glUniform2fv": _emscripten_glUniform2fv, "_emscripten_glBindBuffer": _emscripten_glBindBuffer, "_emscripten_glGetFloatv": _emscripten_glGetFloatv, "_emscripten_glDetachShader": _emscripten_glDetachShader, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT };
// EMSCRIPTEN_START_ASM
var asm = (function(global, env, buffer) {
  'almost asm';


  var HEAP8 = new global.Int8Array(buffer);
  var HEAP16 = new global.Int16Array(buffer);
  var HEAP32 = new global.Int32Array(buffer);
  var HEAPU8 = new global.Uint8Array(buffer);
  var HEAPU16 = new global.Uint16Array(buffer);
  var HEAPU32 = new global.Uint32Array(buffer);
  var HEAPF32 = new global.Float32Array(buffer);
  var HEAPF64 = new global.Float64Array(buffer);


  var STACKTOP=env.STACKTOP|0;
  var STACK_MAX=env.STACK_MAX|0;
  var tempDoublePtr=env.tempDoublePtr|0;
  var ABORT=env.ABORT|0;

  var __THREW__ = 0;
  var threwValue = 0;
  var setjmpId = 0;
  var undef = 0;
  var nan = global.NaN, inf = global.Infinity;
  var tempInt = 0, tempBigInt = 0, tempBigIntP = 0, tempBigIntS = 0, tempBigIntR = 0.0, tempBigIntI = 0, tempBigIntD = 0, tempValue = 0, tempDouble = 0.0;

  var tempRet0 = 0;
  var tempRet1 = 0;
  var tempRet2 = 0;
  var tempRet3 = 0;
  var tempRet4 = 0;
  var tempRet5 = 0;
  var tempRet6 = 0;
  var tempRet7 = 0;
  var tempRet8 = 0;
  var tempRet9 = 0;
  var Math_floor=global.Math.floor;
  var Math_abs=global.Math.abs;
  var Math_sqrt=global.Math.sqrt;
  var Math_pow=global.Math.pow;
  var Math_cos=global.Math.cos;
  var Math_sin=global.Math.sin;
  var Math_tan=global.Math.tan;
  var Math_acos=global.Math.acos;
  var Math_asin=global.Math.asin;
  var Math_atan=global.Math.atan;
  var Math_atan2=global.Math.atan2;
  var Math_exp=global.Math.exp;
  var Math_log=global.Math.log;
  var Math_ceil=global.Math.ceil;
  var Math_imul=global.Math.imul;
  var Math_min=global.Math.min;
  var Math_clz32=global.Math.clz32;
  var abort=env.abort;
  var assert=env.assert;
  var nullFunc_viiiii=env.nullFunc_viiiii;
  var nullFunc_vd=env.nullFunc_vd;
  var nullFunc_vid=env.nullFunc_vid;
  var nullFunc_vi=env.nullFunc_vi;
  var nullFunc_vii=env.nullFunc_vii;
  var nullFunc_ii=env.nullFunc_ii;
  var nullFunc_viddd=env.nullFunc_viddd;
  var nullFunc_vidd=env.nullFunc_vidd;
  var nullFunc_iiii=env.nullFunc_iiii;
  var nullFunc_viiiiiiii=env.nullFunc_viiiiiiii;
  var nullFunc_viiiiii=env.nullFunc_viiiiii;
  var nullFunc_viii=env.nullFunc_viii;
  var nullFunc_vidddd=env.nullFunc_vidddd;
  var nullFunc_vdi=env.nullFunc_vdi;
  var nullFunc_viiiiiii=env.nullFunc_viiiiiii;
  var nullFunc_viiiiiiiii=env.nullFunc_viiiiiiiii;
  var nullFunc_iii=env.nullFunc_iii;
  var nullFunc_i=env.nullFunc_i;
  var nullFunc_vdddddd=env.nullFunc_vdddddd;
  var nullFunc_vdddd=env.nullFunc_vdddd;
  var nullFunc_vdd=env.nullFunc_vdd;
  var nullFunc_v=env.nullFunc_v;
  var nullFunc_viid=env.nullFunc_viid;
  var nullFunc_viiii=env.nullFunc_viiii;
  var invoke_viiiii=env.invoke_viiiii;
  var invoke_vd=env.invoke_vd;
  var invoke_vid=env.invoke_vid;
  var invoke_vi=env.invoke_vi;
  var invoke_vii=env.invoke_vii;
  var invoke_ii=env.invoke_ii;
  var invoke_viddd=env.invoke_viddd;
  var invoke_vidd=env.invoke_vidd;
  var invoke_iiii=env.invoke_iiii;
  var invoke_viiiiiiii=env.invoke_viiiiiiii;
  var invoke_viiiiii=env.invoke_viiiiii;
  var invoke_viii=env.invoke_viii;
  var invoke_vidddd=env.invoke_vidddd;
  var invoke_vdi=env.invoke_vdi;
  var invoke_viiiiiii=env.invoke_viiiiiii;
  var invoke_viiiiiiiii=env.invoke_viiiiiiiii;
  var invoke_iii=env.invoke_iii;
  var invoke_i=env.invoke_i;
  var invoke_vdddddd=env.invoke_vdddddd;
  var invoke_vdddd=env.invoke_vdddd;
  var invoke_vdd=env.invoke_vdd;
  var invoke_v=env.invoke_v;
  var invoke_viid=env.invoke_viid;
  var invoke_viiii=env.invoke_viiii;
  var _emscripten_glGetTexParameterfv=env._emscripten_glGetTexParameterfv;
  var _emscripten_glGenRenderbuffers=env._emscripten_glGenRenderbuffers;
  var _emscripten_glShaderSource=env._emscripten_glShaderSource;
  var _emscripten_glReleaseShaderCompiler=env._emscripten_glReleaseShaderCompiler;
  var _emscripten_glBlendFuncSeparate=env._emscripten_glBlendFuncSeparate;
  var _emscripten_glGetShaderPrecisionFormat=env._emscripten_glGetShaderPrecisionFormat;
  var _emscripten_glGetIntegerv=env._emscripten_glGetIntegerv;
  var _emscripten_glCullFace=env._emscripten_glCullFace;
  var _emscripten_glStencilMaskSeparate=env._emscripten_glStencilMaskSeparate;
  var _emscripten_glViewport=env._emscripten_glViewport;
  var _emscripten_glFrontFace=env._emscripten_glFrontFace;
  var _emscripten_glDrawArrays=env._emscripten_glDrawArrays;
  var _emscripten_glUniform3fv=env._emscripten_glUniform3fv;
  var _emscripten_glPolygonOffset=env._emscripten_glPolygonOffset;
  var _emscripten_glUseProgram=env._emscripten_glUseProgram;
  var _emscripten_glBlendColor=env._emscripten_glBlendColor;
  var _emscripten_glDepthFunc=env._emscripten_glDepthFunc;
  var _sbrk=env._sbrk;
  var _emscripten_glDisableVertexAttribArray=env._emscripten_glDisableVertexAttribArray;
  var _emscripten_glUniform3iv=env._emscripten_glUniform3iv;
  var _emscripten_memcpy_big=env._emscripten_memcpy_big;
  var _sysconf=env._sysconf;
  var _emscripten_glVertexPointer=env._emscripten_glVertexPointer;
  var _emscripten_glUniform1f=env._emscripten_glUniform1f;
  var emscriptenWebGLComputeImageSize=env.emscriptenWebGLComputeImageSize;
  var _emscripten_glGetBooleanv=env._emscripten_glGetBooleanv;
  var _emscripten_glGetShaderSource=env._emscripten_glGetShaderSource;
  var _emscripten_glUniform1i=env._emscripten_glUniform1i;
  var _emscripten_glGenBuffers=env._emscripten_glGenBuffers;
  var _emscripten_glDeleteObjectARB=env._emscripten_glDeleteObjectARB;
  var _emscripten_glTexImage2D=env._emscripten_glTexImage2D;
  var _emscripten_glVertexAttribPointer=env._emscripten_glVertexAttribPointer;
  var _emscripten_glIsProgram=env._emscripten_glIsProgram;
  var _emscripten_glBlendEquationSeparate=env._emscripten_glBlendEquationSeparate;
  var _emscripten_glGetString=env._emscripten_glGetString;
  var _emscripten_glIsFramebuffer=env._emscripten_glIsFramebuffer;
  var _emscripten_glIsEnabled=env._emscripten_glIsEnabled;
  var _emscripten_glScissor=env._emscripten_glScissor;
  var _emscripten_glVertexAttrib4fv=env._emscripten_glVertexAttrib4fv;
  var _emscripten_glTexParameteriv=env._emscripten_glTexParameteriv;
  var _pthread_cleanup_push=env._pthread_cleanup_push;
  var _emscripten_glBindProgramARB=env._emscripten_glBindProgramARB;
  var _emscripten_glStencilOpSeparate=env._emscripten_glStencilOpSeparate;
  var ___syscall140=env.___syscall140;
  var _emscripten_glIsBuffer=env._emscripten_glIsBuffer;
  var ___syscall146=env.___syscall146;
  var _emscripten_glGetActiveAttrib=env._emscripten_glGetActiveAttrib;
  var _emscripten_glAttachShader=env._emscripten_glAttachShader;
  var _emscripten_glCompressedTexSubImage2D=env._emscripten_glCompressedTexSubImage2D;
  var _emscripten_glUniform2f=env._emscripten_glUniform2f;
  var _emscripten_glTexParameterfv=env._emscripten_glTexParameterfv;
  var _emscripten_glUniformMatrix2fv=env._emscripten_glUniformMatrix2fv;
  var _emscripten_glTexParameterf=env._emscripten_glTexParameterf;
  var _emscripten_glGetAttachedShaders=env._emscripten_glGetAttachedShaders;
  var _emscripten_glGenTextures=env._emscripten_glGenTextures;
  var _emscripten_glTexParameteri=env._emscripten_glTexParameteri;
  var _emscripten_glClear=env._emscripten_glClear;
  var _emscripten_glBindVertexArray=env._emscripten_glBindVertexArray;
  var _emscripten_glValidateProgram=env._emscripten_glValidateProgram;
  var _emscripten_glVertexAttrib2fv=env._emscripten_glVertexAttrib2fv;
  var _emscripten_glUniform3f=env._emscripten_glUniform3f;
  var _emscripten_glUniform4iv=env._emscripten_glUniform4iv;
  var _emscripten_glGetTexParameteriv=env._emscripten_glGetTexParameteriv;
  var ___setErrNo=env.___setErrNo;
  var _emscripten_glBindAttribLocation=env._emscripten_glBindAttribLocation;
  var _emscripten_glClientActiveTexture=env._emscripten_glClientActiveTexture;
  var _emscripten_glVertexAttrib2f=env._emscripten_glVertexAttrib2f;
  var _emscripten_glFlush=env._emscripten_glFlush;
  var _emscripten_glUniform4i=env._emscripten_glUniform4i;
  var _emscripten_glCheckFramebufferStatus=env._emscripten_glCheckFramebufferStatus;
  var _emscripten_glGetError=env._emscripten_glGetError;
  var _emscripten_glClearDepthf=env._emscripten_glClearDepthf;
  var _emscripten_glBufferData=env._emscripten_glBufferData;
  var _emscripten_glUniform3i=env._emscripten_glUniform3i;
  var _emscripten_glDeleteShader=env._emscripten_glDeleteShader;
  var _emscripten_glReadPixels=env._emscripten_glReadPixels;
  var _emscripten_glMatrixMode=env._emscripten_glMatrixMode;
  var _emscripten_glClearStencil=env._emscripten_glClearStencil;
  var _emscripten_glGetUniformLocation=env._emscripten_glGetUniformLocation;
  var emscriptenWebGLGet=env.emscriptenWebGLGet;
  var _emscripten_glEnableVertexAttribArray=env._emscripten_glEnableVertexAttribArray;
  var _emscripten_glGetAttribLocation=env._emscripten_glGetAttribLocation;
  var _emscripten_glNormalPointer=env._emscripten_glNormalPointer;
  var _emscripten_glBindTexture=env._emscripten_glBindTexture;
  var _emscripten_glTexCoordPointer=env._emscripten_glTexCoordPointer;
  var _emscripten_glEnable=env._emscripten_glEnable;
  var _emscripten_glClearDepth=env._emscripten_glClearDepth;
  var ___lock=env.___lock;
  var emscriptenWebGLGetTexPixelData=env.emscriptenWebGLGetTexPixelData;
  var ___syscall6=env.___syscall6;
  var _emscripten_glStencilFuncSeparate=env._emscripten_glStencilFuncSeparate;
  var _emscripten_glVertexAttrib3f=env._emscripten_glVertexAttrib3f;
  var _time=env._time;
  var _emscripten_glVertexAttrib1f=env._emscripten_glVertexAttrib1f;
  var _emscripten_glGetFramebufferAttachmentParameteriv=env._emscripten_glGetFramebufferAttachmentParameteriv;
  var _emscripten_glBindFramebuffer=env._emscripten_glBindFramebuffer;
  var _emscripten_glEnableClientState=env._emscripten_glEnableClientState;
  var _pthread_cleanup_pop=env._pthread_cleanup_pop;
  var _emscripten_glDeleteBuffers=env._emscripten_glDeleteBuffers;
  var _emscripten_glGetPointerv=env._emscripten_glGetPointerv;
  var _emscripten_glUniform4f=env._emscripten_glUniform4f;
  var _emscripten_glShaderBinary=env._emscripten_glShaderBinary;
  var _emscripten_glDrawElements=env._emscripten_glDrawElements;
  var _emscripten_glBlendFunc=env._emscripten_glBlendFunc;
  var _emscripten_glGetShaderInfoLog=env._emscripten_glGetShaderInfoLog;
  var _emscripten_glStencilMask=env._emscripten_glStencilMask;
  var _emscripten_glUniform1iv=env._emscripten_glUniform1iv;
  var _emscripten_glGetVertexAttribPointerv=env._emscripten_glGetVertexAttribPointerv;
  var _emscripten_glUniform2i=env._emscripten_glUniform2i;
  var emscriptenWebGLGetUniform=env.emscriptenWebGLGetUniform;
  var _emscripten_glDeleteVertexArrays=env._emscripten_glDeleteVertexArrays;
  var _emscripten_glGetActiveUniform=env._emscripten_glGetActiveUniform;
  var emscriptenWebGLGetVertexAttrib=env.emscriptenWebGLGetVertexAttrib;
  var _emscripten_glUniform2iv=env._emscripten_glUniform2iv;
  var _emscripten_glDisable=env._emscripten_glDisable;
  var _emscripten_glGetBufferParameteriv=env._emscripten_glGetBufferParameteriv;
  var _emscripten_glDeleteProgram=env._emscripten_glDeleteProgram;
  var _emscripten_glDeleteRenderbuffers=env._emscripten_glDeleteRenderbuffers;
  var _emscripten_glDrawElementsInstanced=env._emscripten_glDrawElementsInstanced;
  var _emscripten_glVertexAttrib4f=env._emscripten_glVertexAttrib4f;
  var _emscripten_glGetVertexAttribiv=env._emscripten_glGetVertexAttribiv;
  var _emscripten_glTexSubImage2D=env._emscripten_glTexSubImage2D;
  var _emscripten_glGetProgramiv=env._emscripten_glGetProgramiv;
  var _emscripten_glPixelStorei=env._emscripten_glPixelStorei;
  var _emscripten_glUniformMatrix3fv=env._emscripten_glUniformMatrix3fv;
  var _emscripten_glDepthRange=env._emscripten_glDepthRange;
  var _emscripten_glGetObjectParameterivARB=env._emscripten_glGetObjectParameterivARB;
  var _emscripten_glFinish=env._emscripten_glFinish;
  var _emscripten_glRenderbufferStorage=env._emscripten_glRenderbufferStorage;
  var _emscripten_asm_const_iii=env._emscripten_asm_const_iii;
  var _emscripten_glDepthMask=env._emscripten_glDepthMask;
  var _emscripten_glDrawBuffers=env._emscripten_glDrawBuffers;
  var _emscripten_glLineWidth=env._emscripten_glLineWidth;
  var _emscripten_glCopyTexImage2D=env._emscripten_glCopyTexImage2D;
  var _emscripten_glFramebufferTexture2D=env._emscripten_glFramebufferTexture2D;
  var _emscripten_glFramebufferRenderbuffer=env._emscripten_glFramebufferRenderbuffer;
  var _emscripten_glStencilFunc=env._emscripten_glStencilFunc;
  var _abort=env._abort;
  var _emscripten_glGetUniformiv=env._emscripten_glGetUniformiv;
  var _emscripten_glRotatef=env._emscripten_glRotatef;
  var _emscripten_glGetShaderiv=env._emscripten_glGetShaderiv;
  var _emscripten_glGenFramebuffers=env._emscripten_glGenFramebuffers;
  var _emscripten_glUniformMatrix4fv=env._emscripten_glUniformMatrix4fv;
  var _emscripten_glLoadIdentity=env._emscripten_glLoadIdentity;
  var _emscripten_glUniform1fv=env._emscripten_glUniform1fv;
  var _emscripten_glIsRenderbuffer=env._emscripten_glIsRenderbuffer;
  var _emscripten_glLoadMatrixf=env._emscripten_glLoadMatrixf;
  var _emscripten_glDrawArraysInstanced=env._emscripten_glDrawArraysInstanced;
  var _emscripten_glCreateShader=env._emscripten_glCreateShader;
  var _emscripten_glCopyTexSubImage2D=env._emscripten_glCopyTexSubImage2D;
  var _emscripten_glDeleteTextures=env._emscripten_glDeleteTextures;
  var _emscripten_glBindRenderbuffer=env._emscripten_glBindRenderbuffer;
  var _emscripten_glBufferSubData=env._emscripten_glBufferSubData;
  var _emscripten_glVertexAttribDivisor=env._emscripten_glVertexAttribDivisor;
  var _emscripten_glGetUniformfv=env._emscripten_glGetUniformfv;
  var _emscripten_glGetVertexAttribfv=env._emscripten_glGetVertexAttribfv;
  var _emscripten_glGetRenderbufferParameteriv=env._emscripten_glGetRenderbufferParameteriv;
  var _emscripten_glDeleteFramebuffers=env._emscripten_glDeleteFramebuffers;
  var _emscripten_glVertexAttrib3fv=env._emscripten_glVertexAttrib3fv;
  var _emscripten_glGetInfoLogARB=env._emscripten_glGetInfoLogARB;
  var _emscripten_glCompileShader=env._emscripten_glCompileShader;
  var _emscripten_glSampleCoverage=env._emscripten_glSampleCoverage;
  var _emscripten_glFrustum=env._emscripten_glFrustum;
  var _emscripten_glDepthRangef=env._emscripten_glDepthRangef;
  var _emscripten_glStencilOp=env._emscripten_glStencilOp;
  var _emscripten_glGenerateMipmap=env._emscripten_glGenerateMipmap;
  var _emscripten_glColorMask=env._emscripten_glColorMask;
  var _emscripten_glLinkProgram=env._emscripten_glLinkProgram;
  var _emscripten_glBlendEquation=env._emscripten_glBlendEquation;
  var _emscripten_glIsTexture=env._emscripten_glIsTexture;
  var _pthread_self=env._pthread_self;
  var _emscripten_glVertexAttrib1fv=env._emscripten_glVertexAttrib1fv;
  var _emscripten_glHint=env._emscripten_glHint;
  var _emscripten_glActiveTexture=env._emscripten_glActiveTexture;
  var _emscripten_glDrawRangeElements=env._emscripten_glDrawRangeElements;
  var ___syscall54=env.___syscall54;
  var ___unlock=env.___unlock;
  var _emscripten_glColorPointer=env._emscripten_glColorPointer;
  var _emscripten_glGetProgramInfoLog=env._emscripten_glGetProgramInfoLog;
  var _emscripten_glIsShader=env._emscripten_glIsShader;
  var _emscripten_glUniform4fv=env._emscripten_glUniform4fv;
  var _emscripten_glCompressedTexImage2D=env._emscripten_glCompressedTexImage2D;
  var _emscripten_glClearColor=env._emscripten_glClearColor;
  var _emscripten_glCreateProgram=env._emscripten_glCreateProgram;
  var _emscripten_glGenVertexArrays=env._emscripten_glGenVertexArrays;
  var _emscripten_glUniform2fv=env._emscripten_glUniform2fv;
  var _emscripten_glBindBuffer=env._emscripten_glBindBuffer;
  var _emscripten_glGetFloatv=env._emscripten_glGetFloatv;
  var _emscripten_glDetachShader=env._emscripten_glDetachShader;
  var tempFloat = 0.0;

// EMSCRIPTEN_START_FUNCS

function stackAlloc(size) {
  size = size|0;
  var ret = 0;
  ret = STACKTOP;
  STACKTOP = (STACKTOP + size)|0;
  STACKTOP = (STACKTOP + 15)&-16;
if ((STACKTOP|0) >= (STACK_MAX|0)) abort();

  return ret|0;
}
function stackSave() {
  return STACKTOP|0;
}
function stackRestore(top) {
  top = top|0;
  STACKTOP = top;
}
function establishStackSpace(stackBase, stackMax) {
  stackBase = stackBase|0;
  stackMax = stackMax|0;
  STACKTOP = stackBase;
  STACK_MAX = stackMax;
}

function setThrew(threw, value) {
  threw = threw|0;
  value = value|0;
  if ((__THREW__|0) == 0) {
    __THREW__ = threw;
    threwValue = value;
  }
}
function copyTempFloat(ptr) {
  ptr = ptr|0;
  HEAP8[tempDoublePtr>>0] = HEAP8[ptr>>0];
  HEAP8[tempDoublePtr+1>>0] = HEAP8[ptr+1>>0];
  HEAP8[tempDoublePtr+2>>0] = HEAP8[ptr+2>>0];
  HEAP8[tempDoublePtr+3>>0] = HEAP8[ptr+3>>0];
}
function copyTempDouble(ptr) {
  ptr = ptr|0;
  HEAP8[tempDoublePtr>>0] = HEAP8[ptr>>0];
  HEAP8[tempDoublePtr+1>>0] = HEAP8[ptr+1>>0];
  HEAP8[tempDoublePtr+2>>0] = HEAP8[ptr+2>>0];
  HEAP8[tempDoublePtr+3>>0] = HEAP8[ptr+3>>0];
  HEAP8[tempDoublePtr+4>>0] = HEAP8[ptr+4>>0];
  HEAP8[tempDoublePtr+5>>0] = HEAP8[ptr+5>>0];
  HEAP8[tempDoublePtr+6>>0] = HEAP8[ptr+6>>0];
  HEAP8[tempDoublePtr+7>>0] = HEAP8[ptr+7>>0];
}

function setTempRet0(value) {
  value = value|0;
  tempRet0 = value;
}
function getTempRet0() {
  return tempRet0|0;
}

function _emscripten_GetProcAddress($name_) {
 $name_ = $name_|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0;
 var $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0;
 var $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0;
 var $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0;
 var $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0;
 var $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0;
 var $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0;
 var $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0;
 var $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0;
 var $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0;
 var $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0;
 var $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0;
 var $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0;
 var $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0;
 var $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0;
 var $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0, $418 = 0, $419 = 0, $42 = 0, $420 = 0, $421 = 0;
 var $422 = 0, $423 = 0, $424 = 0, $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0, $437 = 0, $438 = 0, $439 = 0, $44 = 0;
 var $440 = 0, $441 = 0, $442 = 0, $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0, $455 = 0, $456 = 0, $457 = 0, $458 = 0;
 var $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0, $473 = 0, $474 = 0, $475 = 0, $476 = 0;
 var $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0, $490 = 0, $491 = 0, $492 = 0, $493 = 0, $494 = 0;
 var $495 = 0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0;
 var $512 = 0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0;
 var $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0, $544 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0;
 var $549 = 0, $55 = 0, $550 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0;
 var $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0;
 var $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $end = 0, $name = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $1 = $name_;
 $2 = $1;
 $3 = (_strlen($2)|0);
 $4 = (($3) + 1)|0;
 $5 = (_malloc($4)|0);
 $name = $5;
 $6 = $name;
 $7 = $1;
 (_strcpy($6,$7)|0);
 $8 = $name;
 $9 = (_strstr($8,124)|0);
 $end = $9;
 $10 = $end;
 $11 = ($10|0)!=(0|0);
 if ($11) {
  $12 = $end;
  HEAP8[$12>>0] = 0;
 }
 $13 = $name;
 $14 = (_strstr($13,128)|0);
 $end = $14;
 $15 = $end;
 $16 = ($15|0)!=(0|0);
 if ($16) {
  $17 = $end;
  HEAP8[$17>>0] = 0;
 }
 $18 = $name;
 $19 = (_strstr($18,132)|0);
 $end = $19;
 $20 = $end;
 $21 = ($20|0)!=(0|0);
 if ($21) {
  $22 = $end;
  HEAP8[$22>>0] = 0;
 }
 $23 = $name;
 $24 = (_strstr($23,136)|0);
 $end = $24;
 $25 = $end;
 $26 = ($25|0)!=(0|0);
 if ($26) {
  $27 = $end;
  HEAP8[$27>>0] = 0;
 }
 $28 = $name;
 $29 = (_strcmp($28,142)|0);
 $30 = ($29|0)!=(0);
 do {
  if ($30) {
   $31 = $name;
   $32 = (_strcmp($31,180)|0);
   $33 = ($32|0)!=(0);
   if (!($33)) {
    $name = 199;
    break;
   }
   $34 = $name;
   $35 = (_strcmp($34,212)|0);
   $36 = ($35|0)!=(0);
   if (!($36)) {
    $name = 233;
    break;
   }
   $37 = $name;
   $38 = (_strcmp($37,248)|0);
   $39 = ($38|0)!=(0);
   if (!($39)) {
    $name = 263;
    break;
   }
   $40 = $name;
   $41 = (_strcmp($40,278)|0);
   $42 = ($41|0)!=(0);
   if (!($42)) {
    $name = 293;
   }
  } else {
   $name = 164;
  }
 } while(0);
 $43 = $name;
 $44 = (_strcmp($43,308)|0);
 $45 = ($44|0)!=(0);
 do {
  if ($45) {
   $46 = $name;
   $47 = (_strcmp($46,322)|0);
   $48 = ($47|0)!=(0);
   if (!($48)) {
    $0 = 5;
    break;
   }
   $49 = $name;
   $50 = (_strcmp($49,334)|0);
   $51 = ($50|0)!=(0);
   if (!($51)) {
    $0 = 6;
    break;
   }
   $52 = $name;
   $53 = (_strcmp($52,348)|0);
   $54 = ($53|0)!=(0);
   if (!($54)) {
    $0 = 7;
    break;
   }
   $55 = $name;
   $56 = (_strcmp($55,360)|0);
   $57 = ($56|0)!=(0);
   if (!($57)) {
    $0 = 8;
    break;
   }
   $58 = $name;
   $59 = (_strcmp($58,374)|0);
   $60 = ($59|0)!=(0);
   if (!($60)) {
    $0 = 9;
    break;
   }
   $61 = $name;
   $62 = (_strcmp($61,388)|0);
   $63 = ($62|0)!=(0);
   if (!($63)) {
    $0 = 10;
    break;
   }
   $64 = $name;
   $65 = (_strcmp($64,405)|0);
   $66 = ($65|0)!=(0);
   if (!($66)) {
    $0 = 11;
    break;
   }
   $67 = $name;
   $68 = (_strcmp($67,428)|0);
   $69 = ($68|0)!=(0);
   if (!($69)) {
    $0 = 12;
    break;
   }
   $70 = $name;
   $71 = (_strcmp($70,454)|0);
   $72 = ($71|0)!=(0);
   if (!($72)) {
    $0 = 13;
    break;
   }
   $73 = $name;
   $74 = (_strcmp($73,467)|0);
   $75 = ($74|0)!=(0);
   if (!($75)) {
    $0 = 14;
    break;
   }
   $76 = $name;
   $77 = (_strcmp($76,483)|0);
   $78 = ($77|0)!=(0);
   if (!($78)) {
    $0 = 15;
    break;
   }
   $79 = $name;
   $80 = (_strcmp($79,496)|0);
   $81 = ($80|0)!=(0);
   if (!($81)) {
    $0 = 16;
    break;
   }
   $82 = $name;
   $83 = (_strcmp($82,510)|0);
   $84 = ($83|0)!=(0);
   if (!($84)) {
    $0 = 17;
    break;
   }
   $85 = $name;
   $86 = (_strcmp($85,530)|0);
   $87 = ($86|0)!=(0);
   if (!($87)) {
    $0 = 18;
    break;
   }
   $88 = $name;
   $89 = (_strcmp($88,550)|0);
   $90 = ($89|0)!=(0);
   if (!($90)) {
    $0 = 19;
    break;
   }
   $91 = $name;
   $92 = (_strcmp($91,567)|0);
   $93 = ($92|0)!=(0);
   if (!($93)) {
    $0 = 20;
    break;
   }
   $94 = $name;
   $95 = (_strcmp($94,584)|0);
   $96 = ($95|0)!=(0);
   if (!($96)) {
    $0 = 21;
    break;
   }
   $97 = $name;
   $98 = (_strcmp($97,596)|0);
   $99 = ($98|0)!=(0);
   if (!($99)) {
    $0 = 22;
    break;
   }
   $100 = $name;
   $101 = (_strcmp($100,609)|0);
   $102 = ($101|0)!=(0);
   if (!($102)) {
    $0 = 23;
    break;
   }
   $103 = $name;
   $104 = (_strcmp($103,625)|0);
   $105 = ($104|0)!=(0);
   if (!($105)) {
    $0 = 24;
    break;
   }
   $106 = $name;
   $107 = (_strcmp($106,648)|0);
   $108 = ($107|0)!=(0);
   if (!($108)) {
    $0 = 25;
    break;
   }
   $109 = $name;
   $110 = (_strcmp($109,661)|0);
   $111 = ($110|0)!=(0);
   if (!($111)) {
    $0 = 26;
    break;
   }
   $112 = $name;
   $113 = (_strcmp($112,677)|0);
   $114 = ($113|0)!=(0);
   if (!($114)) {
    $0 = 27;
    break;
   }
   $115 = $name;
   $116 = (_strcmp($115,688)|0);
   $117 = ($116|0)!=(0);
   if (!($117)) {
    $0 = 28;
    break;
   }
   $118 = $name;
   $119 = (_strcmp($118,707)|0);
   $120 = ($119|0)!=(0);
   if (!($120)) {
    $0 = 29;
    break;
   }
   $121 = $name;
   $122 = (_strcmp($121,729)|0);
   $123 = ($122|0)!=(0);
   if (!($123)) {
    $0 = 30;
    break;
   }
   $124 = $name;
   $125 = (_strcmp($124,748)|0);
   $126 = ($125|0)!=(0);
   if (!($126)) {
    $0 = 31;
    break;
   }
   $127 = $name;
   $128 = (_strcmp($127,777)|0);
   $129 = ($128|0)!=(0);
   if (!($129)) {
    $0 = 32;
    break;
   }
   $130 = $name;
   $131 = (_strcmp($130,794)|0);
   $132 = ($131|0)!=(0);
   if (!($132)) {
    $0 = 33;
    break;
   }
   $133 = $name;
   $134 = (_strcmp($133,809)|0);
   $135 = ($134|0)!=(0);
   if (!($135)) {
    $0 = 34;
    break;
   }
   $136 = $name;
   $137 = (_strcmp($136,824)|0);
   $138 = ($137|0)!=(0);
   if (!($138)) {
    $0 = 35;
    break;
   }
   $139 = $name;
   $140 = (_strcmp($139,845)|0);
   $141 = ($140|0)!=(0);
   if (!($141)) {
    $0 = 36;
    break;
   }
   $142 = $name;
   $143 = (_strcmp($142,865)|0);
   $144 = ($143|0)!=(0);
   if (!($144)) {
    $0 = 37;
    break;
   }
   $145 = $name;
   $146 = (_strcmp($145,885)|0);
   $147 = ($146|0)!=(0);
   if (!($147)) {
    $0 = 38;
    break;
   }
   $148 = $name;
   $149 = (_strcmp($148,911)|0);
   $150 = ($149|0)!=(0);
   if (!($150)) {
    $0 = 39;
    break;
   }
   $151 = $name;
   $152 = (_strcmp($151,930)|0);
   $153 = ($152|0)!=(0);
   if (!($153)) {
    $0 = 40;
    break;
   }
   $154 = $name;
   $155 = (_strcmp($154,942)|0);
   $156 = ($155|0)!=(0);
   if (!($156)) {
    $0 = 41;
    break;
   }
   $157 = $name;
   $158 = (_strcmp($157,954)|0);
   $159 = ($158|0)!=(0);
   if (!($159)) {
    $0 = 42;
    break;
   }
   $160 = $name;
   $161 = (_strcmp($160,966)|0);
   $162 = ($161|0)!=(0);
   if (!($162)) {
    $0 = 43;
    break;
   }
   $163 = $name;
   $164 = (_strcmp($163,978)|0);
   $165 = ($164|0)!=(0);
   if (!($165)) {
    $0 = 44;
    break;
   }
   $166 = $name;
   $167 = (_strcmp($166,990)|0);
   $168 = ($167|0)!=(0);
   if (!($168)) {
    $0 = 45;
    break;
   }
   $169 = $name;
   $170 = (_strcmp($169,1002)|0);
   $171 = ($170|0)!=(0);
   if (!($171)) {
    $0 = 46;
    break;
   }
   $172 = $name;
   $173 = (_strcmp($172,1014)|0);
   $174 = ($173|0)!=(0);
   if (!($174)) {
    $0 = 47;
    break;
   }
   $175 = $name;
   $176 = (_strcmp($175,1026)|0);
   $177 = ($176|0)!=(0);
   if (!($177)) {
    $0 = 48;
    break;
   }
   $178 = $name;
   $179 = (_strcmp($178,1039)|0);
   $180 = ($179|0)!=(0);
   if (!($180)) {
    $0 = 49;
    break;
   }
   $181 = $name;
   $182 = (_strcmp($181,1052)|0);
   $183 = ($182|0)!=(0);
   if (!($183)) {
    $0 = 50;
    break;
   }
   $184 = $name;
   $185 = (_strcmp($184,1065)|0);
   $186 = ($185|0)!=(0);
   if (!($186)) {
    $0 = 51;
    break;
   }
   $187 = $name;
   $188 = (_strcmp($187,1078)|0);
   $189 = ($188|0)!=(0);
   if (!($189)) {
    $0 = 52;
    break;
   }
   $190 = $name;
   $191 = (_strcmp($190,1091)|0);
   $192 = ($191|0)!=(0);
   if (!($192)) {
    $0 = 53;
    break;
   }
   $193 = $name;
   $194 = (_strcmp($193,1104)|0);
   $195 = ($194|0)!=(0);
   if (!($195)) {
    $0 = 54;
    break;
   }
   $196 = $name;
   $197 = (_strcmp($196,1117)|0);
   $198 = ($197|0)!=(0);
   if (!($198)) {
    $0 = 55;
    break;
   }
   $199 = $name;
   $200 = (_strcmp($199,1130)|0);
   $201 = ($200|0)!=(0);
   if (!($201)) {
    $0 = 56;
    break;
   }
   $202 = $name;
   $203 = (_strcmp($202,1149)|0);
   $204 = ($203|0)!=(0);
   if (!($204)) {
    $0 = 57;
    break;
   }
   $205 = $name;
   $206 = (_strcmp($205,1168)|0);
   $207 = ($206|0)!=(0);
   if (!($207)) {
    $0 = 58;
    break;
   }
   $208 = $name;
   $209 = (_strcmp($208,1187)|0);
   $210 = ($209|0)!=(0);
   if (!($210)) {
    $0 = 59;
    break;
   }
   $211 = $name;
   $212 = (_strcmp($211,1200)|0);
   $213 = ($212|0)!=(0);
   if (!($213)) {
    $0 = 60;
    break;
   }
   $214 = $name;
   $215 = (_strcmp($214,1218)|0);
   $216 = ($215|0)!=(0);
   if (!($216)) {
    $0 = 61;
    break;
   }
   $217 = $name;
   $218 = (_strcmp($217,1236)|0);
   $219 = ($218|0)!=(0);
   if (!($219)) {
    $0 = 62;
    break;
   }
   $220 = $name;
   $221 = (_strcmp($220,1254)|0);
   $222 = ($221|0)!=(0);
   if (!($222)) {
    $0 = 63;
    break;
   }
   $223 = $name;
   $224 = (_strcmp($223,1272)|0);
   $225 = ($224|0)!=(0);
   if (!($225)) {
    $0 = 64;
    break;
   }
   $226 = $name;
   $227 = (_strcmp($226,1292)|0);
   $228 = ($227|0)!=(0);
   if (!($228)) {
    $0 = 65;
    break;
   }
   $229 = $name;
   $230 = (_strcmp($229,233)|0);
   $231 = ($230|0)!=(0);
   if (!($231)) {
    $0 = 66;
    break;
   }
   $232 = $name;
   $233 = (_strcmp($232,1310)|0);
   $234 = ($233|0)!=(0);
   if (!($234)) {
    $0 = 67;
    break;
   }
   $235 = $name;
   $236 = (_strcmp($235,1325)|0);
   $237 = ($236|0)!=(0);
   if (!($237)) {
    $0 = 68;
    break;
   }
   $238 = $name;
   $239 = (_strcmp($238,1346)|0);
   $240 = ($239|0)!=(0);
   if (!($240)) {
    $0 = 69;
    break;
   }
   $241 = $name;
   $242 = (_strcmp($241,1361)|0);
   $243 = ($242|0)!=(0);
   if (!($243)) {
    $0 = 70;
    break;
   }
   $244 = $name;
   $245 = (_strcmp($244,1379)|0);
   $246 = ($245|0)!=(0);
   if (!($246)) {
    $0 = 71;
    break;
   }
   $247 = $name;
   $248 = (_strcmp($247,1395)|0);
   $249 = ($248|0)!=(0);
   if (!($249)) {
    $0 = 72;
    break;
   }
   $250 = $name;
   $251 = (_strcmp($250,1414)|0);
   $252 = ($251|0)!=(0);
   if (!($252)) {
    $0 = 73;
    break;
   }
   $253 = $name;
   $254 = (_strcmp($253,1428)|0);
   $255 = ($254|0)!=(0);
   if (!($255)) {
    $0 = 74;
    break;
   }
   $256 = $name;
   $257 = (_strcmp($256,1443)|0);
   $258 = ($257|0)!=(0);
   if (!($258)) {
    $0 = 75;
    break;
   }
   $259 = $name;
   $260 = (_strcmp($259,164)|0);
   $261 = ($260|0)!=(0);
   if (!($261)) {
    $0 = 76;
    break;
   }
   $262 = $name;
   $263 = (_strcmp($262,1454)|0);
   $264 = ($263|0)!=(0);
   if (!($264)) {
    $0 = 77;
    break;
   }
   $265 = $name;
   $266 = (_strcmp($265,263)|0);
   $267 = ($266|0)!=(0);
   if (!($267)) {
    $0 = 78;
    break;
   }
   $268 = $name;
   $269 = (_strcmp($268,293)|0);
   $270 = ($269|0)!=(0);
   if (!($270)) {
    $0 = 79;
    break;
   }
   $271 = $name;
   $272 = (_strcmp($271,1470)|0);
   $273 = ($272|0)!=(0);
   if (!($273)) {
    $0 = 80;
    break;
   }
   $274 = $name;
   $275 = (_strcmp($274,1497)|0);
   $276 = ($275|0)!=(0);
   if (!($276)) {
    $0 = 81;
    break;
   }
   $277 = $name;
   $278 = (_strcmp($277,1511)|0);
   $279 = ($278|0)!=(0);
   if (!($279)) {
    $0 = 82;
    break;
   }
   $280 = $name;
   $281 = (_strcmp($280,199)|0);
   $282 = ($281|0)!=(0);
   if (!($282)) {
    $0 = 83;
    break;
   }
   $283 = $name;
   $284 = (_strcmp($283,1531)|0);
   $285 = ($284|0)!=(0);
   if (!($285)) {
    $0 = 84;
    break;
   }
   $286 = $name;
   $287 = (_strcmp($286,1549)|0);
   $288 = ($287|0)!=(0);
   if (!($288)) {
    $0 = 85;
    break;
   }
   $289 = $name;
   $290 = (_strcmp($289,1561)|0);
   $291 = ($290|0)!=(0);
   if (!($291)) {
    $0 = 86;
    break;
   }
   $292 = $name;
   $293 = (_strcmp($292,1582)|0);
   $294 = ($293|0)!=(0);
   if (!($294)) {
    $0 = 87;
    break;
   }
   $295 = $name;
   $296 = (_strcmp($295,1600)|0);
   $297 = ($296|0)!=(0);
   if (!($297)) {
    $0 = 88;
    break;
   }
   $298 = $name;
   $299 = (_strcmp($298,1618)|0);
   $300 = ($299|0)!=(0);
   if (!($300)) {
    $0 = 89;
    break;
   }
   $301 = $name;
   $302 = (_strcmp($301,1639)|0);
   $303 = ($302|0)!=(0);
   if (!($303)) {
    $0 = 90;
    break;
   }
   $304 = $name;
   $305 = (_strcmp($304,1665)|0);
   $306 = ($305|0)!=(0);
   if (!($306)) {
    $0 = 91;
    break;
   }
   $307 = $name;
   $308 = (_strcmp($307,1688)|0);
   $309 = ($308|0)!=(0);
   if (!($309)) {
    $0 = 92;
    break;
   }
   $310 = $name;
   $311 = (_strcmp($310,1726)|0);
   $312 = ($311|0)!=(0);
   if (!($312)) {
    $0 = 93;
    break;
   }
   $313 = $name;
   $314 = (_strcmp($313,1742)|0);
   $315 = ($314|0)!=(0);
   if (!($315)) {
    $0 = 94;
    break;
   }
   $316 = $name;
   $317 = (_strcmp($316,1757)|0);
   $318 = ($317|0)!=(0);
   if (!($318)) {
    $0 = 95;
    break;
   }
   $319 = $name;
   $320 = (_strcmp($319,1780)|0);
   $321 = ($320|0)!=(0);
   if (!($321)) {
    $0 = 96;
    break;
   }
   $322 = $name;
   $323 = (_strcmp($322,1793)|0);
   $324 = ($323|0)!=(0);
   if (!($324)) {
    $0 = 97;
    break;
   }
   $325 = $name;
   $326 = (_strcmp($325,1807)|0);
   $327 = ($326|0)!=(0);
   if (!($327)) {
    $0 = 98;
    break;
   }
   $328 = $name;
   $329 = (_strcmp($328,1821)|0);
   $330 = ($329|0)!=(0);
   if (!($330)) {
    $0 = 99;
    break;
   }
   $331 = $name;
   $332 = (_strcmp($331,1841)|0);
   $333 = ($332|0)!=(0);
   if (!($333)) {
    $0 = 100;
    break;
   }
   $334 = $name;
   $335 = (_strcmp($334,1861)|0);
   $336 = ($335|0)!=(0);
   if (!($336)) {
    $0 = 101;
    break;
   }
   $337 = $name;
   $338 = (_strcmp($337,1877)|0);
   $339 = ($338|0)!=(0);
   if (!($339)) {
    $0 = 102;
    break;
   }
   $340 = $name;
   $341 = (_strcmp($340,1895)|0);
   $342 = ($341|0)!=(0);
   if (!($342)) {
    $0 = 103;
    break;
   }
   $343 = $name;
   $344 = (_strcmp($343,1911)|0);
   $345 = ($344|0)!=(0);
   if (!($345)) {
    $0 = 104;
    break;
   }
   $346 = $name;
   $347 = (_strcmp($346,1926)|0);
   $348 = ($347|0)!=(0);
   if (!($348)) {
    $0 = 105;
    break;
   }
   $349 = $name;
   $350 = (_strcmp($349,1948)|0);
   $351 = ($350|0)!=(0);
   if (!($351)) {
    $0 = 106;
    break;
   }
   $352 = $name;
   $353 = (_strcmp($352,1966)|0);
   $354 = ($353|0)!=(0);
   if (!($354)) {
    $0 = 107;
    break;
   }
   $355 = $name;
   $356 = (_strcmp($355,1987)|0);
   $357 = ($356|0)!=(0);
   if (!($357)) {
    $0 = 108;
    break;
   }
   $358 = $name;
   $359 = (_strcmp($358,2005)|0);
   $360 = ($359|0)!=(0);
   if (!($360)) {
    $0 = 109;
    break;
   }
   $361 = $name;
   $362 = (_strcmp($361,2018)|0);
   $363 = ($362|0)!=(0);
   if (!($363)) {
    $0 = 110;
    break;
   }
   $364 = $name;
   $365 = (_strcmp($364,2033)|0);
   $366 = ($365|0)!=(0);
   if (!($366)) {
    $0 = 111;
    break;
   }
   $367 = $name;
   $368 = (_strcmp($367,2047)|0);
   $369 = ($368|0)!=(0);
   if (!($369)) {
    $0 = 112;
    break;
   }
   $370 = $name;
   $371 = (_strcmp($370,2057)|0);
   $372 = ($371|0)!=(0);
   if (!($372)) {
    $0 = 113;
    break;
   }
   $373 = $name;
   $374 = (_strcmp($373,2067)|0);
   $375 = ($374|0)!=(0);
   if (!($375)) {
    $0 = 114;
    break;
   }
   $376 = $name;
   $377 = (_strcmp($376,2089)|0);
   $378 = ($377|0)!=(0);
   if (!($378)) {
    $0 = 115;
    break;
   }
   $379 = $name;
   $380 = (_strcmp($379,2115)|0);
   $381 = ($380|0)!=(0);
   if (!($381)) {
    $0 = 116;
    break;
   }
   $382 = $name;
   $383 = (_strcmp($382,2142)|0);
   $384 = ($383|0)!=(0);
   if (!($384)) {
    $0 = 117;
    break;
   }
   $385 = $name;
   $386 = (_strcmp($385,2155)|0);
   $387 = ($386|0)!=(0);
   if (!($387)) {
    $0 = 118;
    break;
   }
   $388 = $name;
   $389 = (_strcmp($388,2170)|0);
   $390 = ($389|0)!=(0);
   if (!($390)) {
    $0 = 119;
    break;
   }
   $391 = $name;
   $392 = (_strcmp($391,2185)|0);
   $393 = ($392|0)!=(0);
   if (!($393)) {
    $0 = 120;
    break;
   }
   $394 = $name;
   $395 = (_strcmp($394,2209)|0);
   $396 = ($395|0)!=(0);
   if (!($396)) {
    $0 = 121;
    break;
   }
   $397 = $name;
   $398 = (_strcmp($397,2220)|0);
   $399 = ($398|0)!=(0);
   if (!($399)) {
    $0 = 122;
    break;
   }
   $400 = $name;
   $401 = (_strcmp($400,2242)|0);
   $402 = ($401|0)!=(0);
   if (!($402)) {
    $0 = 123;
    break;
   }
   $403 = $name;
   $404 = (_strcmp($403,2264)|0);
   $405 = ($404|0)!=(0);
   if (!($405)) {
    $0 = 124;
    break;
   }
   $406 = $name;
   $407 = (_strcmp($406,2288)|0);
   $408 = ($407|0)!=(0);
   if (!($408)) {
    $0 = 125;
    break;
   }
   $409 = $name;
   $410 = (_strcmp($409,2297)|0);
   $411 = ($410|0)!=(0);
   if (!($411)) {
    $0 = 126;
    break;
   }
   $412 = $name;
   $413 = (_strcmp($412,2305)|0);
   $414 = ($413|0)!=(0);
   if (!($414)) {
    $0 = 127;
    break;
   }
   $415 = $name;
   $416 = (_strcmp($415,2318)|0);
   $417 = ($416|0)!=(0);
   if (!($417)) {
    $0 = 128;
    break;
   }
   $418 = $name;
   $419 = (_strcmp($418,2332)|0);
   $420 = ($419|0)!=(0);
   if (!($420)) {
    $0 = 129;
    break;
   }
   $421 = $name;
   $422 = (_strcmp($421,2344)|0);
   $423 = ($422|0)!=(0);
   if (!($423)) {
    $0 = 130;
    break;
   }
   $424 = $name;
   $425 = (_strcmp($424,2353)|0);
   $426 = ($425|0)!=(0);
   if (!($426)) {
    $0 = 131;
    break;
   }
   $427 = $name;
   $428 = (_strcmp($427,2363)|0);
   $429 = ($428|0)!=(0);
   if (!($429)) {
    $0 = 132;
    break;
   }
   $430 = $name;
   $431 = (_strcmp($430,2375)|0);
   $432 = ($431|0)!=(0);
   if (!($432)) {
    $0 = 133;
    break;
   }
   $433 = $name;
   $434 = (_strcmp($433,2386)|0);
   $435 = ($434|0)!=(0);
   if (!($435)) {
    $0 = 134;
    break;
   }
   $436 = $name;
   $437 = (_strcmp($436,2394)|0);
   $438 = ($437|0)!=(0);
   if (!($438)) {
    $0 = 135;
    break;
   }
   $439 = $name;
   $440 = (_strcmp($439,2406)|0);
   $441 = ($440|0)!=(0);
   if (!($441)) {
    $0 = 136;
    break;
   }
   $442 = $name;
   $443 = (_strcmp($442,2421)|0);
   $444 = ($443|0)!=(0);
   if (!($444)) {
    $0 = 137;
    break;
   }
   $445 = $name;
   $446 = (_strcmp($445,2433)|0);
   $447 = ($446|0)!=(0);
   if (!($447)) {
    $0 = 138;
    break;
   }
   $448 = $name;
   $449 = (_strcmp($448,2447)|0);
   $450 = ($449|0)!=(0);
   if (!($450)) {
    $0 = 139;
    break;
   }
   $451 = $name;
   $452 = (_strcmp($451,2472)|0);
   $453 = ($452|0)!=(0);
   if (!($453)) {
    $0 = 140;
    break;
   }
   $454 = $name;
   $455 = (_strcmp($454,2489)|0);
   $456 = ($455|0)!=(0);
   if (!($456)) {
    $0 = 141;
    break;
   }
   $457 = $name;
   $458 = (_strcmp($457,2505)|0);
   $459 = ($458|0)!=(0);
   if (!($459)) {
    $0 = 142;
    break;
   }
   $460 = $name;
   $461 = (_strcmp($460,2521)|0);
   $462 = ($461|0)!=(0);
   if (!($462)) {
    $0 = 143;
    break;
   }
   $463 = $name;
   $464 = (_strcmp($463,2533)|0);
   $465 = ($464|0)!=(0);
   if (!($465)) {
    $0 = 144;
    break;
   }
   $466 = $name;
   $467 = (_strcmp($466,2545)|0);
   $468 = ($467|0)!=(0);
   if (!($468)) {
    $0 = 145;
    break;
   }
   $469 = $name;
   $470 = (_strcmp($469,2569)|0);
   $471 = ($470|0)!=(0);
   if (!($471)) {
    $0 = 146;
    break;
   }
   $472 = $name;
   $473 = (_strcmp($472,2582)|0);
   $474 = ($473|0)!=(0);
   if (!($474)) {
    $0 = 147;
    break;
   }
   $475 = $name;
   $476 = (_strcmp($475,2596)|0);
   $477 = ($476|0)!=(0);
   if (!($477)) {
    $0 = 148;
    break;
   }
   $478 = $name;
   $479 = (_strcmp($478,2618)|0);
   $480 = ($479|0)!=(0);
   if (!($480)) {
    $0 = 149;
    break;
   }
   $481 = $name;
   $482 = (_strcmp($481,2625)|0);
   $483 = ($482|0)!=(0);
   if (!($483)) {
    $0 = 150;
    break;
   }
   $484 = $name;
   $485 = (_strcmp($484,2641)|0);
   $486 = ($485|0)!=(0);
   if (!($486)) {
    $0 = 151;
    break;
   }
   $487 = $name;
   $488 = (_strcmp($487,2658)|0);
   $489 = ($488|0)!=(0);
   if (!($489)) {
    $0 = 152;
    break;
   }
   $490 = $name;
   $491 = (_strcmp($490,2675)|0);
   $492 = ($491|0)!=(0);
   if (!($492)) {
    $0 = 153;
    break;
   }
   $493 = $name;
   $494 = (_strcmp($493,2691)|0);
   $495 = ($494|0)!=(0);
   if (!($495)) {
    $0 = 154;
    break;
   }
   $496 = $name;
   $497 = (_strcmp($496,2707)|0);
   $498 = ($497|0)!=(0);
   if (!($498)) {
    $0 = 155;
    break;
   }
   $499 = $name;
   $500 = (_strcmp($499,2724)|0);
   $501 = ($500|0)!=(0);
   if (!($501)) {
    $0 = 156;
    break;
   }
   $502 = $name;
   $503 = (_strcmp($502,2738)|0);
   $504 = ($503|0)!=(0);
   if (!($504)) {
    $0 = 157;
    break;
   }
   $505 = $name;
   $506 = (_strcmp($505,2750)|0);
   $507 = ($506|0)!=(0);
   if (!($507)) {
    $0 = 158;
    break;
   }
   $508 = $name;
   $509 = (_strcmp($508,2761)|0);
   $510 = ($509|0)!=(0);
   if (!($510)) {
    $0 = 159;
    break;
   }
   $511 = $name;
   $512 = (_strcmp($511,2774)|0);
   $513 = ($512|0)!=(0);
   if (!($513)) {
    $0 = 160;
    break;
   }
   $514 = $name;
   $515 = (_strcmp($514,2784)|0);
   $516 = ($515|0)!=(0);
   if (!($516)) {
    $0 = 161;
    break;
   }
   $517 = $name;
   $518 = (_strcmp($517,2801)|0);
   $519 = ($518|0)!=(0);
   if (!($519)) {
    $0 = 162;
    break;
   }
   $520 = $name;
   $521 = (_strcmp($520,2813)|0);
   $522 = ($521|0)!=(0);
   if (!($522)) {
    $0 = 163;
    break;
   }
   $523 = $name;
   $524 = (_strcmp($523,2835)|0);
   $525 = ($524|0)!=(0);
   if (!($525)) {
    $0 = 164;
    break;
   }
   $526 = $name;
   $527 = (_strcmp($526,2855)|0);
   $528 = ($527|0)!=(0);
   if (!($528)) {
    $0 = 165;
    break;
   }
   $529 = $name;
   $530 = (_strcmp($529,2868)|0);
   $531 = ($530|0)!=(0);
   if (!($531)) {
    $0 = 166;
    break;
   }
   $532 = $name;
   $533 = (_strcmp($532,2890)|0);
   $534 = ($533|0)!=(0);
   if (!($534)) {
    $0 = 167;
    break;
   }
   $535 = $name;
   $536 = (_strcmp($535,2910)|0);
   $537 = ($536|0)!=(0);
   if (!($537)) {
    $0 = 168;
    break;
   }
   $538 = $name;
   $539 = (_strcmp($538,2927)|0);
   $540 = ($539|0)!=(0);
   if (!($540)) {
    $0 = 169;
    break;
   }
   $541 = $name;
   $542 = (_strcmp($541,2944)|0);
   $543 = ($542|0)!=(0);
   if (!($543)) {
    $0 = 170;
    break;
   }
   $544 = $name;
   $545 = (_strcmp($544,2964)|0);
   $546 = ($545|0)!=(0);
   if ($546) {
    $547 = $1;
    $548 = $name;
    $549 = _emscripten_asm_const_iii(0, ($547|0), ($548|0))|0;
    $0 = 0;
    break;
   } else {
    $0 = 171;
    break;
   }
  } else {
   $0 = 4;
  }
 } while(0);
 $550 = $0;
 STACKTOP = sp;return ($550|0);
}
function ___stdio_close($f) {
 $f = $f|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $vararg_buffer = sp;
 $0 = ((($f)) + 60|0);
 $1 = HEAP32[$0>>2]|0;
 HEAP32[$vararg_buffer>>2] = $1;
 $2 = (___syscall6(6,($vararg_buffer|0))|0);
 $3 = (___syscall_ret($2)|0);
 STACKTOP = sp;return ($3|0);
}
function ___syscall_ret($r) {
 $r = $r|0;
 var $$0 = 0, $0 = 0, $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($r>>>0)>(4294963200);
 if ($0) {
  $1 = (0 - ($r))|0;
  $2 = (___errno_location()|0);
  HEAP32[$2>>2] = $1;
  $$0 = -1;
 } else {
  $$0 = $r;
 }
 return ($$0|0);
}
function ___errno_location() {
 var $$0 = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[770]|0;
 $1 = ($0|0)==(0|0);
 if ($1) {
  $$0 = 3124;
 } else {
  $2 = (_pthread_self()|0);
  $3 = ((($2)) + 64|0);
  $4 = HEAP32[$3>>2]|0;
  $$0 = $4;
 }
 return ($$0|0);
}
function ___stdout_write($f,$buf,$len) {
 $f = $f|0;
 $buf = $buf|0;
 $len = $len|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $tio = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $vararg_buffer = sp;
 $tio = sp + 12|0;
 $0 = ((($f)) + 36|0);
 HEAP32[$0>>2] = 172;
 $1 = HEAP32[$f>>2]|0;
 $2 = $1 & 64;
 $3 = ($2|0)==(0);
 if ($3) {
  $4 = ((($f)) + 60|0);
  $5 = HEAP32[$4>>2]|0;
  HEAP32[$vararg_buffer>>2] = $5;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = 21505;
  $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
  HEAP32[$vararg_ptr2>>2] = $tio;
  $6 = (___syscall54(54,($vararg_buffer|0))|0);
  $7 = ($6|0)==(0);
  if (!($7)) {
   $8 = ((($f)) + 75|0);
   HEAP8[$8>>0] = -1;
  }
 }
 $9 = (___stdio_write($f,$buf,$len)|0);
 STACKTOP = sp;return ($9|0);
}
function ___stdio_write($f,$buf,$len) {
 $f = $f|0;
 $buf = $buf|0;
 $len = $len|0;
 var $$0 = 0, $$phi$trans$insert = 0, $$pre = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0;
 var $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $cnt$0 = 0, $cnt$1 = 0, $iov$0 = 0, $iov$0$lcssa11 = 0, $iov$1 = 0, $iovcnt$0 = 0, $iovcnt$0$lcssa12 = 0;
 var $iovcnt$1 = 0, $iovs = 0, $rem$0 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr6 = 0, $vararg_ptr7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $iovs = sp + 32|0;
 $0 = ((($f)) + 28|0);
 $1 = HEAP32[$0>>2]|0;
 HEAP32[$iovs>>2] = $1;
 $2 = ((($iovs)) + 4|0);
 $3 = ((($f)) + 20|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = (($4) - ($1))|0;
 HEAP32[$2>>2] = $5;
 $6 = ((($iovs)) + 8|0);
 HEAP32[$6>>2] = $buf;
 $7 = ((($iovs)) + 12|0);
 HEAP32[$7>>2] = $len;
 $8 = (($5) + ($len))|0;
 $9 = ((($f)) + 60|0);
 $10 = ((($f)) + 44|0);
 $iov$0 = $iovs;$iovcnt$0 = 2;$rem$0 = $8;
 while(1) {
  $11 = HEAP32[770]|0;
  $12 = ($11|0)==(0|0);
  if ($12) {
   $16 = HEAP32[$9>>2]|0;
   HEAP32[$vararg_buffer3>>2] = $16;
   $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
   HEAP32[$vararg_ptr6>>2] = $iov$0;
   $vararg_ptr7 = ((($vararg_buffer3)) + 8|0);
   HEAP32[$vararg_ptr7>>2] = $iovcnt$0;
   $17 = (___syscall146(146,($vararg_buffer3|0))|0);
   $18 = (___syscall_ret($17)|0);
   $cnt$0 = $18;
  } else {
   _pthread_cleanup_push((173|0),($f|0));
   $13 = HEAP32[$9>>2]|0;
   HEAP32[$vararg_buffer>>2] = $13;
   $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
   HEAP32[$vararg_ptr1>>2] = $iov$0;
   $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
   HEAP32[$vararg_ptr2>>2] = $iovcnt$0;
   $14 = (___syscall146(146,($vararg_buffer|0))|0);
   $15 = (___syscall_ret($14)|0);
   _pthread_cleanup_pop(0);
   $cnt$0 = $15;
  }
  $19 = ($rem$0|0)==($cnt$0|0);
  if ($19) {
   label = 6;
   break;
  }
  $26 = ($cnt$0|0)<(0);
  if ($26) {
   $iov$0$lcssa11 = $iov$0;$iovcnt$0$lcssa12 = $iovcnt$0;
   label = 8;
   break;
  }
  $34 = (($rem$0) - ($cnt$0))|0;
  $35 = ((($iov$0)) + 4|0);
  $36 = HEAP32[$35>>2]|0;
  $37 = ($cnt$0>>>0)>($36>>>0);
  if ($37) {
   $38 = HEAP32[$10>>2]|0;
   HEAP32[$0>>2] = $38;
   HEAP32[$3>>2] = $38;
   $39 = (($cnt$0) - ($36))|0;
   $40 = ((($iov$0)) + 8|0);
   $41 = (($iovcnt$0) + -1)|0;
   $$phi$trans$insert = ((($iov$0)) + 12|0);
   $$pre = HEAP32[$$phi$trans$insert>>2]|0;
   $49 = $$pre;$cnt$1 = $39;$iov$1 = $40;$iovcnt$1 = $41;
  } else {
   $42 = ($iovcnt$0|0)==(2);
   if ($42) {
    $43 = HEAP32[$0>>2]|0;
    $44 = (($43) + ($cnt$0)|0);
    HEAP32[$0>>2] = $44;
    $49 = $36;$cnt$1 = $cnt$0;$iov$1 = $iov$0;$iovcnt$1 = 2;
   } else {
    $49 = $36;$cnt$1 = $cnt$0;$iov$1 = $iov$0;$iovcnt$1 = $iovcnt$0;
   }
  }
  $45 = HEAP32[$iov$1>>2]|0;
  $46 = (($45) + ($cnt$1)|0);
  HEAP32[$iov$1>>2] = $46;
  $47 = ((($iov$1)) + 4|0);
  $48 = (($49) - ($cnt$1))|0;
  HEAP32[$47>>2] = $48;
  $iov$0 = $iov$1;$iovcnt$0 = $iovcnt$1;$rem$0 = $34;
 }
 if ((label|0) == 6) {
  $20 = HEAP32[$10>>2]|0;
  $21 = ((($f)) + 48|0);
  $22 = HEAP32[$21>>2]|0;
  $23 = (($20) + ($22)|0);
  $24 = ((($f)) + 16|0);
  HEAP32[$24>>2] = $23;
  $25 = $20;
  HEAP32[$0>>2] = $25;
  HEAP32[$3>>2] = $25;
  $$0 = $len;
 }
 else if ((label|0) == 8) {
  $27 = ((($f)) + 16|0);
  HEAP32[$27>>2] = 0;
  HEAP32[$0>>2] = 0;
  HEAP32[$3>>2] = 0;
  $28 = HEAP32[$f>>2]|0;
  $29 = $28 | 32;
  HEAP32[$f>>2] = $29;
  $30 = ($iovcnt$0$lcssa12|0)==(2);
  if ($30) {
   $$0 = 0;
  } else {
   $31 = ((($iov$0$lcssa11)) + 4|0);
   $32 = HEAP32[$31>>2]|0;
   $33 = (($len) - ($32))|0;
   $$0 = $33;
  }
 }
 STACKTOP = sp;return ($$0|0);
}
function _cleanup_141($p) {
 $p = $p|0;
 var $0 = 0, $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($p)) + 68|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)==(0);
 if ($2) {
  ___unlockfile($p);
 }
 return;
}
function ___unlockfile($f) {
 $f = $f|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function ___stdio_seek($f,$off,$whence) {
 $f = $f|0;
 $off = $off|0;
 $whence = $whence|0;
 var $$pre = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $ret = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr3 = 0, $vararg_ptr4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $vararg_buffer = sp;
 $ret = sp + 20|0;
 $0 = ((($f)) + 60|0);
 $1 = HEAP32[$0>>2]|0;
 HEAP32[$vararg_buffer>>2] = $1;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = 0;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = $off;
 $vararg_ptr3 = ((($vararg_buffer)) + 12|0);
 HEAP32[$vararg_ptr3>>2] = $ret;
 $vararg_ptr4 = ((($vararg_buffer)) + 16|0);
 HEAP32[$vararg_ptr4>>2] = $whence;
 $2 = (___syscall140(140,($vararg_buffer|0))|0);
 $3 = (___syscall_ret($2)|0);
 $4 = ($3|0)<(0);
 if ($4) {
  HEAP32[$ret>>2] = -1;
  $5 = -1;
 } else {
  $$pre = HEAP32[$ret>>2]|0;
  $5 = $$pre;
 }
 STACKTOP = sp;return ($5|0);
}
function _memchr($src,$c,$n) {
 $src = $src|0;
 $c = $c|0;
 $n = $n|0;
 var $$0$lcssa = 0, $$0$lcssa30 = 0, $$019 = 0, $$1$lcssa = 0, $$110 = 0, $$110$lcssa = 0, $$24 = 0, $$3 = 0, $$lcssa = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0;
 var $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0;
 var $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond18 = 0, $s$0$lcssa = 0, $s$0$lcssa29 = 0, $s$020 = 0, $s$15 = 0, $s$2 = 0, $w$0$lcssa = 0, $w$011 = 0, $w$011$lcssa = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = $c & 255;
 $1 = $src;
 $2 = $1 & 3;
 $3 = ($2|0)!=(0);
 $4 = ($n|0)!=(0);
 $or$cond18 = $4 & $3;
 L1: do {
  if ($or$cond18) {
   $5 = $c&255;
   $$019 = $n;$s$020 = $src;
   while(1) {
    $6 = HEAP8[$s$020>>0]|0;
    $7 = ($6<<24>>24)==($5<<24>>24);
    if ($7) {
     $$0$lcssa30 = $$019;$s$0$lcssa29 = $s$020;
     label = 6;
     break L1;
    }
    $8 = ((($s$020)) + 1|0);
    $9 = (($$019) + -1)|0;
    $10 = $8;
    $11 = $10 & 3;
    $12 = ($11|0)!=(0);
    $13 = ($9|0)!=(0);
    $or$cond = $13 & $12;
    if ($or$cond) {
     $$019 = $9;$s$020 = $8;
    } else {
     $$0$lcssa = $9;$$lcssa = $13;$s$0$lcssa = $8;
     label = 5;
     break;
    }
   }
  } else {
   $$0$lcssa = $n;$$lcssa = $4;$s$0$lcssa = $src;
   label = 5;
  }
 } while(0);
 if ((label|0) == 5) {
  if ($$lcssa) {
   $$0$lcssa30 = $$0$lcssa;$s$0$lcssa29 = $s$0$lcssa;
   label = 6;
  } else {
   $$3 = 0;$s$2 = $s$0$lcssa;
  }
 }
 L8: do {
  if ((label|0) == 6) {
   $14 = HEAP8[$s$0$lcssa29>>0]|0;
   $15 = $c&255;
   $16 = ($14<<24>>24)==($15<<24>>24);
   if ($16) {
    $$3 = $$0$lcssa30;$s$2 = $s$0$lcssa29;
   } else {
    $17 = Math_imul($0, 16843009)|0;
    $18 = ($$0$lcssa30>>>0)>(3);
    L11: do {
     if ($18) {
      $$110 = $$0$lcssa30;$w$011 = $s$0$lcssa29;
      while(1) {
       $19 = HEAP32[$w$011>>2]|0;
       $20 = $19 ^ $17;
       $21 = (($20) + -16843009)|0;
       $22 = $20 & -2139062144;
       $23 = $22 ^ -2139062144;
       $24 = $23 & $21;
       $25 = ($24|0)==(0);
       if (!($25)) {
        $$110$lcssa = $$110;$w$011$lcssa = $w$011;
        break;
       }
       $26 = ((($w$011)) + 4|0);
       $27 = (($$110) + -4)|0;
       $28 = ($27>>>0)>(3);
       if ($28) {
        $$110 = $27;$w$011 = $26;
       } else {
        $$1$lcssa = $27;$w$0$lcssa = $26;
        label = 11;
        break L11;
       }
      }
      $$24 = $$110$lcssa;$s$15 = $w$011$lcssa;
     } else {
      $$1$lcssa = $$0$lcssa30;$w$0$lcssa = $s$0$lcssa29;
      label = 11;
     }
    } while(0);
    if ((label|0) == 11) {
     $29 = ($$1$lcssa|0)==(0);
     if ($29) {
      $$3 = 0;$s$2 = $w$0$lcssa;
      break;
     } else {
      $$24 = $$1$lcssa;$s$15 = $w$0$lcssa;
     }
    }
    while(1) {
     $30 = HEAP8[$s$15>>0]|0;
     $31 = ($30<<24>>24)==($15<<24>>24);
     if ($31) {
      $$3 = $$24;$s$2 = $s$15;
      break L8;
     }
     $32 = ((($s$15)) + 1|0);
     $33 = (($$24) + -1)|0;
     $34 = ($33|0)==(0);
     if ($34) {
      $$3 = 0;$s$2 = $32;
      break;
     } else {
      $$24 = $33;$s$15 = $32;
     }
    }
   }
  }
 } while(0);
 $35 = ($$3|0)!=(0);
 $36 = $35 ? $s$2 : 0;
 return ($36|0);
}
function _memcmp($vl,$vr,$n) {
 $vl = $vl|0;
 $vr = $vr|0;
 $n = $n|0;
 var $$03 = 0, $$lcssa = 0, $$lcssa19 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $l$04 = 0, $r$05 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($n|0)==(0);
 L1: do {
  if ($0) {
   $11 = 0;
  } else {
   $$03 = $n;$l$04 = $vl;$r$05 = $vr;
   while(1) {
    $1 = HEAP8[$l$04>>0]|0;
    $2 = HEAP8[$r$05>>0]|0;
    $3 = ($1<<24>>24)==($2<<24>>24);
    if (!($3)) {
     $$lcssa = $1;$$lcssa19 = $2;
     break;
    }
    $4 = (($$03) + -1)|0;
    $5 = ((($l$04)) + 1|0);
    $6 = ((($r$05)) + 1|0);
    $7 = ($4|0)==(0);
    if ($7) {
     $11 = 0;
     break L1;
    } else {
     $$03 = $4;$l$04 = $5;$r$05 = $6;
    }
   }
   $8 = $$lcssa&255;
   $9 = $$lcssa19&255;
   $10 = (($8) - ($9))|0;
   $11 = $10;
  }
 } while(0);
 return ($11|0);
}
function ___lockfile($f) {
 $f = $f|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function _strcmp($l,$r) {
 $l = $l|0;
 $r = $r|0;
 var $$014 = 0, $$05 = 0, $$lcssa = 0, $$lcssa2 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond3 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $0 = HEAP8[$l>>0]|0;
 $1 = HEAP8[$r>>0]|0;
 $2 = ($0<<24>>24)!=($1<<24>>24);
 $3 = ($0<<24>>24)==(0);
 $or$cond3 = $3 | $2;
 if ($or$cond3) {
  $$lcssa = $0;$$lcssa2 = $1;
 } else {
  $$014 = $l;$$05 = $r;
  while(1) {
   $4 = ((($$014)) + 1|0);
   $5 = ((($$05)) + 1|0);
   $6 = HEAP8[$4>>0]|0;
   $7 = HEAP8[$5>>0]|0;
   $8 = ($6<<24>>24)!=($7<<24>>24);
   $9 = ($6<<24>>24)==(0);
   $or$cond = $9 | $8;
   if ($or$cond) {
    $$lcssa = $6;$$lcssa2 = $7;
    break;
   } else {
    $$014 = $4;$$05 = $5;
   }
  }
 }
 $10 = $$lcssa&255;
 $11 = $$lcssa2&255;
 $12 = (($10) - ($11))|0;
 return ($12|0);
}
function _strlen($s) {
 $s = $s|0;
 var $$0 = 0, $$01$lcssa = 0, $$014 = 0, $$1$lcssa = 0, $$lcssa20 = 0, $$pn = 0, $$pn15 = 0, $$pre = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0;
 var $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $w$0 = 0, $w$0$lcssa = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = $s;
 $1 = $0 & 3;
 $2 = ($1|0)==(0);
 L1: do {
  if ($2) {
   $$01$lcssa = $s;
   label = 4;
  } else {
   $$014 = $s;$21 = $0;
   while(1) {
    $3 = HEAP8[$$014>>0]|0;
    $4 = ($3<<24>>24)==(0);
    if ($4) {
     $$pn = $21;
     break L1;
    }
    $5 = ((($$014)) + 1|0);
    $6 = $5;
    $7 = $6 & 3;
    $8 = ($7|0)==(0);
    if ($8) {
     $$01$lcssa = $5;
     label = 4;
     break;
    } else {
     $$014 = $5;$21 = $6;
    }
   }
  }
 } while(0);
 if ((label|0) == 4) {
  $w$0 = $$01$lcssa;
  while(1) {
   $9 = HEAP32[$w$0>>2]|0;
   $10 = (($9) + -16843009)|0;
   $11 = $9 & -2139062144;
   $12 = $11 ^ -2139062144;
   $13 = $12 & $10;
   $14 = ($13|0)==(0);
   $15 = ((($w$0)) + 4|0);
   if ($14) {
    $w$0 = $15;
   } else {
    $$lcssa20 = $9;$w$0$lcssa = $w$0;
    break;
   }
  }
  $16 = $$lcssa20&255;
  $17 = ($16<<24>>24)==(0);
  if ($17) {
   $$1$lcssa = $w$0$lcssa;
  } else {
   $$pn15 = $w$0$lcssa;
   while(1) {
    $18 = ((($$pn15)) + 1|0);
    $$pre = HEAP8[$18>>0]|0;
    $19 = ($$pre<<24>>24)==(0);
    if ($19) {
     $$1$lcssa = $18;
     break;
    } else {
     $$pn15 = $18;
    }
   }
  }
  $20 = $$1$lcssa;
  $$pn = $20;
 }
 $$0 = (($$pn) - ($0))|0;
 return ($$0|0);
}
function _strcpy($dest,$src) {
 $dest = $dest|0;
 $src = $src|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 (___stpcpy($dest,$src)|0);
 return ($dest|0);
}
function ___stpcpy($d,$s) {
 $d = $d|0;
 $s = $s|0;
 var $$0$lcssa = 0, $$01$lcssa = 0, $$0115 = 0, $$016 = 0, $$03 = 0, $$1$ph = 0, $$12$ph = 0, $$128 = 0, $$19 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0;
 var $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, $wd$0$lcssa = 0, $wd$010 = 0, $ws$0$lcssa = 0, $ws$011 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = $s;
 $1 = $d;
 $2 = $0 ^ $1;
 $3 = $2 & 3;
 $4 = ($3|0)==(0);
 L1: do {
  if ($4) {
   $5 = $0 & 3;
   $6 = ($5|0)==(0);
   if ($6) {
    $$0$lcssa = $s;$$01$lcssa = $d;
   } else {
    $$0115 = $d;$$016 = $s;
    while(1) {
     $7 = HEAP8[$$016>>0]|0;
     HEAP8[$$0115>>0] = $7;
     $8 = ($7<<24>>24)==(0);
     if ($8) {
      $$03 = $$0115;
      break L1;
     }
     $9 = ((($$016)) + 1|0);
     $10 = ((($$0115)) + 1|0);
     $11 = $9;
     $12 = $11 & 3;
     $13 = ($12|0)==(0);
     if ($13) {
      $$0$lcssa = $9;$$01$lcssa = $10;
      break;
     } else {
      $$0115 = $10;$$016 = $9;
     }
    }
   }
   $14 = HEAP32[$$0$lcssa>>2]|0;
   $15 = (($14) + -16843009)|0;
   $16 = $14 & -2139062144;
   $17 = $16 ^ -2139062144;
   $18 = $17 & $15;
   $19 = ($18|0)==(0);
   if ($19) {
    $22 = $14;$wd$010 = $$01$lcssa;$ws$011 = $$0$lcssa;
    while(1) {
     $20 = ((($ws$011)) + 4|0);
     $21 = ((($wd$010)) + 4|0);
     HEAP32[$wd$010>>2] = $22;
     $23 = HEAP32[$20>>2]|0;
     $24 = (($23) + -16843009)|0;
     $25 = $23 & -2139062144;
     $26 = $25 ^ -2139062144;
     $27 = $26 & $24;
     $28 = ($27|0)==(0);
     if ($28) {
      $22 = $23;$wd$010 = $21;$ws$011 = $20;
     } else {
      $wd$0$lcssa = $21;$ws$0$lcssa = $20;
      break;
     }
    }
   } else {
    $wd$0$lcssa = $$01$lcssa;$ws$0$lcssa = $$0$lcssa;
   }
   $$1$ph = $ws$0$lcssa;$$12$ph = $wd$0$lcssa;
   label = 8;
  } else {
   $$1$ph = $s;$$12$ph = $d;
   label = 8;
  }
 } while(0);
 if ((label|0) == 8) {
  $29 = HEAP8[$$1$ph>>0]|0;
  HEAP8[$$12$ph>>0] = $29;
  $30 = ($29<<24>>24)==(0);
  if ($30) {
   $$03 = $$12$ph;
  } else {
   $$128 = $$12$ph;$$19 = $$1$ph;
   while(1) {
    $31 = ((($$19)) + 1|0);
    $32 = ((($$128)) + 1|0);
    $33 = HEAP8[$31>>0]|0;
    HEAP8[$32>>0] = $33;
    $34 = ($33<<24>>24)==(0);
    if ($34) {
     $$03 = $32;
     break;
    } else {
     $$128 = $32;$$19 = $31;
    }
   }
  }
 }
 return ($$03|0);
}
function _strchr($s,$c) {
 $s = $s|0;
 $c = $c|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (___strchrnul($s,$c)|0);
 $1 = HEAP8[$0>>0]|0;
 $2 = $c&255;
 $3 = ($1<<24>>24)==($2<<24>>24);
 $4 = $3 ? $0 : 0;
 return ($4|0);
}
function ___strchrnul($s,$c) {
 $s = $s|0;
 $c = $c|0;
 var $$0 = 0, $$02$lcssa = 0, $$0211 = 0, $$1 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond5 = 0, $w$0$lcssa = 0, $w$08 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = $c & 255;
 $1 = ($0|0)==(0);
 L1: do {
  if ($1) {
   $6 = (_strlen($s)|0);
   $7 = (($s) + ($6)|0);
   $$0 = $7;
  } else {
   $2 = $s;
   $3 = $2 & 3;
   $4 = ($3|0)==(0);
   if ($4) {
    $$02$lcssa = $s;
   } else {
    $5 = $c&255;
    $$0211 = $s;
    while(1) {
     $8 = HEAP8[$$0211>>0]|0;
     $9 = ($8<<24>>24)==(0);
     $10 = ($8<<24>>24)==($5<<24>>24);
     $or$cond = $9 | $10;
     if ($or$cond) {
      $$0 = $$0211;
      break L1;
     }
     $11 = ((($$0211)) + 1|0);
     $12 = $11;
     $13 = $12 & 3;
     $14 = ($13|0)==(0);
     if ($14) {
      $$02$lcssa = $11;
      break;
     } else {
      $$0211 = $11;
     }
    }
   }
   $15 = Math_imul($0, 16843009)|0;
   $16 = HEAP32[$$02$lcssa>>2]|0;
   $17 = (($16) + -16843009)|0;
   $18 = $16 & -2139062144;
   $19 = $18 ^ -2139062144;
   $20 = $19 & $17;
   $21 = ($20|0)==(0);
   L10: do {
    if ($21) {
     $23 = $16;$w$08 = $$02$lcssa;
     while(1) {
      $22 = $23 ^ $15;
      $24 = (($22) + -16843009)|0;
      $25 = $22 & -2139062144;
      $26 = $25 ^ -2139062144;
      $27 = $26 & $24;
      $28 = ($27|0)==(0);
      if (!($28)) {
       $w$0$lcssa = $w$08;
       break L10;
      }
      $29 = ((($w$08)) + 4|0);
      $30 = HEAP32[$29>>2]|0;
      $31 = (($30) + -16843009)|0;
      $32 = $30 & -2139062144;
      $33 = $32 ^ -2139062144;
      $34 = $33 & $31;
      $35 = ($34|0)==(0);
      if ($35) {
       $23 = $30;$w$08 = $29;
      } else {
       $w$0$lcssa = $29;
       break;
      }
     }
    } else {
     $w$0$lcssa = $$02$lcssa;
    }
   } while(0);
   $36 = $c&255;
   $$1 = $w$0$lcssa;
   while(1) {
    $37 = HEAP8[$$1>>0]|0;
    $38 = ($37<<24>>24)==(0);
    $39 = ($37<<24>>24)==($36<<24>>24);
    $or$cond5 = $38 | $39;
    $40 = ((($$1)) + 1|0);
    if ($or$cond5) {
     $$0 = $$1;
     break;
    } else {
     $$1 = $40;
    }
   }
  }
 } while(0);
 return ($$0|0);
}
function _fflush($f) {
 $f = $f|0;
 var $$0 = 0, $$01 = 0, $$012 = 0, $$014 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $phitmp = 0, $r$0$lcssa = 0, $r$03 = 0, $r$1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($f|0)==(0|0);
 do {
  if ($0) {
   $7 = HEAP32[30]|0;
   $8 = ($7|0)==(0|0);
   if ($8) {
    $27 = 0;
   } else {
    $9 = HEAP32[30]|0;
    $10 = (_fflush($9)|0);
    $27 = $10;
   }
   ___lock(((3108)|0));
   $$012 = HEAP32[(3104)>>2]|0;
   $11 = ($$012|0)==(0|0);
   if ($11) {
    $r$0$lcssa = $27;
   } else {
    $$014 = $$012;$r$03 = $27;
    while(1) {
     $12 = ((($$014)) + 76|0);
     $13 = HEAP32[$12>>2]|0;
     $14 = ($13|0)>(-1);
     if ($14) {
      $15 = (___lockfile($$014)|0);
      $23 = $15;
     } else {
      $23 = 0;
     }
     $16 = ((($$014)) + 20|0);
     $17 = HEAP32[$16>>2]|0;
     $18 = ((($$014)) + 28|0);
     $19 = HEAP32[$18>>2]|0;
     $20 = ($17>>>0)>($19>>>0);
     if ($20) {
      $21 = (___fflush_unlocked($$014)|0);
      $22 = $21 | $r$03;
      $r$1 = $22;
     } else {
      $r$1 = $r$03;
     }
     $24 = ($23|0)==(0);
     if (!($24)) {
      ___unlockfile($$014);
     }
     $25 = ((($$014)) + 56|0);
     $$01 = HEAP32[$25>>2]|0;
     $26 = ($$01|0)==(0|0);
     if ($26) {
      $r$0$lcssa = $r$1;
      break;
     } else {
      $$014 = $$01;$r$03 = $r$1;
     }
    }
   }
   ___unlock(((3108)|0));
   $$0 = $r$0$lcssa;
  } else {
   $1 = ((($f)) + 76|0);
   $2 = HEAP32[$1>>2]|0;
   $3 = ($2|0)>(-1);
   if (!($3)) {
    $4 = (___fflush_unlocked($f)|0);
    $$0 = $4;
    break;
   }
   $5 = (___lockfile($f)|0);
   $phitmp = ($5|0)==(0);
   $6 = (___fflush_unlocked($f)|0);
   if ($phitmp) {
    $$0 = $6;
   } else {
    ___unlockfile($f);
    $$0 = $6;
   }
  }
 } while(0);
 return ($$0|0);
}
function ___fflush_unlocked($f) {
 $f = $f|0;
 var $$0 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($f)) + 20|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = ((($f)) + 28|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = ($1>>>0)>($3>>>0);
 if ($4) {
  $5 = ((($f)) + 36|0);
  $6 = HEAP32[$5>>2]|0;
  (FUNCTION_TABLE_iiii[$6 & 255]($f,0,0)|0);
  $7 = HEAP32[$0>>2]|0;
  $8 = ($7|0)==(0|0);
  if ($8) {
   $$0 = -1;
  } else {
   label = 3;
  }
 } else {
  label = 3;
 }
 if ((label|0) == 3) {
  $9 = ((($f)) + 4|0);
  $10 = HEAP32[$9>>2]|0;
  $11 = ((($f)) + 8|0);
  $12 = HEAP32[$11>>2]|0;
  $13 = ($10>>>0)<($12>>>0);
  if ($13) {
   $14 = ((($f)) + 40|0);
   $15 = HEAP32[$14>>2]|0;
   $16 = $10;
   $17 = $12;
   $18 = (($16) - ($17))|0;
   (FUNCTION_TABLE_iiii[$15 & 255]($f,$18,1)|0);
  }
  $19 = ((($f)) + 16|0);
  HEAP32[$19>>2] = 0;
  HEAP32[$2>>2] = 0;
  HEAP32[$0>>2] = 0;
  HEAP32[$11>>2] = 0;
  HEAP32[$9>>2] = 0;
  $$0 = 0;
 }
 return ($$0|0);
}
function _strstr($h,$n) {
 $h = $h|0;
 $n = $n|0;
 var $$0 = 0, $$0$lcssa$i = 0, $$0$lcssa$i12 = 0, $$0$lcssa$i4 = 0, $$01$i = 0, $$02$i = 0, $$02$i8 = 0, $$03$i = 0, $$3$i = 0, $$lcssa$i = 0, $$lcssa$i11 = 0, $$lcssa291 = 0, $$lcssa294 = 0, $$lcssa297 = 0, $$lcssa311 = 0, $$lcssa314 = 0, $$lcssa317 = 0, $$lcssa332 = 0, $$pr$i = 0, $0 = 0;
 var $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0;
 var $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0;
 var $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0;
 var $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0;
 var $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0;
 var $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0;
 var $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0;
 var $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0;
 var $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $byteset$i = 0;
 var $div$i = 0, $div5$i = 0, $hw$0$in2$i = 0, $hw$03$i = 0, $hw$03$i7 = 0, $ip$0$ph$lcssa$i = 0, $ip$0$ph$lcssa145$i = 0, $ip$0$ph78$i = 0, $ip$1$ip$0$$i = 0, $ip$1$ip$0$i = 0, $ip$1$ph$lcssa$i = 0, $ip$1$ph57$i = 0, $jp$0$ph15$ph72$i = 0, $jp$0$ph1567$i = 0, $jp$0$ph1567$i$lcssa = 0, $jp$0$ph1567$i$lcssa$lcssa = 0, $jp$0$ph79$i = 0, $jp$1$ph11$ph51$i = 0, $jp$1$ph1146$i = 0, $jp$1$ph1146$i$lcssa = 0;
 var $jp$1$ph1146$i$lcssa$lcssa = 0, $jp$1$ph58$i = 0, $k$061$i = 0, $k$141$i = 0, $k$2$i = 0, $k$340$i = 0, $k$340$i$lcssa = 0, $k$4$i = 0, $l$082$i = 0, $l$082$i$lcssa331 = 0, $mem$0$i = 0, $mem0$0$i = 0, $or$cond$i = 0, $or$cond$i2 = 0, $or$cond$i9 = 0, $or$cond6$i = 0, $p$0$ph$ph$lcssa34$i = 0, $p$0$ph$ph$lcssa34146$i = 0, $p$0$ph$ph73$i = 0, $p$1$p$0$i = 0;
 var $p$1$ph$ph$lcssa25$i = 0, $p$1$ph$ph52$i = 0, $p$3$i = 0, $shift$i = 0, $z$0$i = 0, $z$3$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 1056|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $byteset$i = sp + 1024|0;
 $shift$i = sp;
 $0 = HEAP8[$n>>0]|0;
 $1 = ($0<<24>>24)==(0);
 do {
  if ($1) {
   $$0 = $h;
  } else {
   $2 = $0 << 24 >> 24;
   $3 = (_strchr($h,$2)|0);
   $4 = ($3|0)==(0|0);
   if ($4) {
    $$0 = 0;
   } else {
    $5 = ((($n)) + 1|0);
    $6 = HEAP8[$5>>0]|0;
    $7 = ($6<<24>>24)==(0);
    if ($7) {
     $$0 = $3;
    } else {
     $8 = ((($3)) + 1|0);
     $9 = HEAP8[$8>>0]|0;
     $10 = ($9<<24>>24)==(0);
     if ($10) {
      $$0 = 0;
     } else {
      $11 = ((($n)) + 2|0);
      $12 = HEAP8[$11>>0]|0;
      $13 = ($12<<24>>24)==(0);
      if ($13) {
       $14 = $0&255;
       $15 = $14 << 8;
       $16 = $6&255;
       $17 = $16 | $15;
       $18 = HEAP8[$3>>0]|0;
       $19 = $18&255;
       $20 = $19 << 8;
       $21 = $9&255;
       $22 = $20 | $21;
       $$01$i = $8;$233 = $9;$hw$0$in2$i = $22;
       while(1) {
        $23 = $hw$0$in2$i & 65535;
        $24 = ($23|0)==($17|0);
        if ($24) {
         $$0$lcssa$i = $$01$i;$31 = $233;
         break;
        }
        $25 = $23 << 8;
        $26 = ((($$01$i)) + 1|0);
        $27 = HEAP8[$26>>0]|0;
        $28 = $27&255;
        $29 = $28 | $25;
        $30 = ($27<<24>>24)==(0);
        if ($30) {
         $$0$lcssa$i = $26;$31 = 0;
         break;
        } else {
         $$01$i = $26;$233 = $27;$hw$0$in2$i = $29;
        }
       }
       $32 = ($31<<24>>24)!=(0);
       $33 = ((($$0$lcssa$i)) + -1|0);
       $34 = $32 ? $33 : 0;
       $$0 = $34;
       break;
      }
      $35 = ((($3)) + 2|0);
      $36 = HEAP8[$35>>0]|0;
      $37 = ($36<<24>>24)==(0);
      if ($37) {
       $$0 = 0;
      } else {
       $38 = ((($n)) + 3|0);
       $39 = HEAP8[$38>>0]|0;
       $40 = ($39<<24>>24)==(0);
       if ($40) {
        $41 = $0&255;
        $42 = $41 << 24;
        $43 = $6&255;
        $44 = $43 << 16;
        $45 = $44 | $42;
        $46 = $12&255;
        $47 = $46 << 8;
        $48 = $45 | $47;
        $49 = HEAP8[$3>>0]|0;
        $50 = $49&255;
        $51 = $50 << 24;
        $52 = $9&255;
        $53 = $52 << 16;
        $54 = $36&255;
        $55 = $54 << 8;
        $56 = $55 | $53;
        $57 = $56 | $51;
        $58 = ($57|0)==($48|0);
        if ($58) {
         $$0$lcssa$i4 = $35;$$lcssa$i = $36;
        } else {
         $$02$i = $35;$hw$03$i = $57;
         while(1) {
          $59 = ((($$02$i)) + 1|0);
          $60 = HEAP8[$59>>0]|0;
          $61 = $60&255;
          $62 = $61 | $hw$03$i;
          $63 = $62 << 8;
          $64 = ($60<<24>>24)==(0);
          $65 = ($63|0)==($48|0);
          $or$cond$i2 = $64 | $65;
          if ($or$cond$i2) {
           $$0$lcssa$i4 = $59;$$lcssa$i = $60;
           break;
          } else {
           $$02$i = $59;$hw$03$i = $63;
          }
         }
        }
        $66 = ($$lcssa$i<<24>>24)!=(0);
        $67 = ((($$0$lcssa$i4)) + -2|0);
        $68 = $66 ? $67 : 0;
        $$0 = $68;
        break;
       }
       $69 = ((($3)) + 3|0);
       $70 = HEAP8[$69>>0]|0;
       $71 = ($70<<24>>24)==(0);
       if ($71) {
        $$0 = 0;
       } else {
        $72 = ((($n)) + 4|0);
        $73 = HEAP8[$72>>0]|0;
        $74 = ($73<<24>>24)==(0);
        if ($74) {
         $75 = $0&255;
         $76 = $75 << 24;
         $77 = $6&255;
         $78 = $77 << 16;
         $79 = $78 | $76;
         $80 = $12&255;
         $81 = $80 << 8;
         $82 = $79 | $81;
         $83 = $39&255;
         $84 = $82 | $83;
         $85 = HEAP8[$3>>0]|0;
         $86 = $85&255;
         $87 = $86 << 24;
         $88 = $9&255;
         $89 = $88 << 16;
         $90 = $36&255;
         $91 = $90 << 8;
         $92 = $70&255;
         $93 = $91 | $89;
         $94 = $93 | $92;
         $95 = $94 | $87;
         $96 = ($95|0)==($84|0);
         if ($96) {
          $$0$lcssa$i12 = $69;$$lcssa$i11 = $70;
         } else {
          $$02$i8 = $69;$hw$03$i7 = $95;
          while(1) {
           $97 = $hw$03$i7 << 8;
           $98 = ((($$02$i8)) + 1|0);
           $99 = HEAP8[$98>>0]|0;
           $100 = $99&255;
           $101 = $100 | $97;
           $102 = ($99<<24>>24)==(0);
           $103 = ($101|0)==($84|0);
           $or$cond$i9 = $102 | $103;
           if ($or$cond$i9) {
            $$0$lcssa$i12 = $98;$$lcssa$i11 = $99;
            break;
           } else {
            $$02$i8 = $98;$hw$03$i7 = $101;
           }
          }
         }
         $104 = ($$lcssa$i11<<24>>24)!=(0);
         $105 = ((($$0$lcssa$i12)) + -3|0);
         $106 = $104 ? $105 : 0;
         $$0 = $106;
         break;
        }
        ;HEAP32[$byteset$i>>2]=0|0;HEAP32[$byteset$i+4>>2]=0|0;HEAP32[$byteset$i+8>>2]=0|0;HEAP32[$byteset$i+12>>2]=0|0;HEAP32[$byteset$i+16>>2]=0|0;HEAP32[$byteset$i+20>>2]=0|0;HEAP32[$byteset$i+24>>2]=0|0;HEAP32[$byteset$i+28>>2]=0|0;
        $111 = $0;$l$082$i = 0;
        while(1) {
         $107 = (($3) + ($l$082$i)|0);
         $108 = HEAP8[$107>>0]|0;
         $109 = ($108<<24>>24)==(0);
         if ($109) {
          $$3$i = 0;
          break;
         }
         $110 = $111 & 31;
         $112 = $110&255;
         $113 = 1 << $112;
         $div5$i = ($111&255) >>> 5;
         $114 = $div5$i&255;
         $115 = (($byteset$i) + ($114<<2)|0);
         $116 = HEAP32[$115>>2]|0;
         $117 = $116 | $113;
         HEAP32[$115>>2] = $117;
         $118 = (($l$082$i) + 1)|0;
         $119 = $111&255;
         $120 = (($shift$i) + ($119<<2)|0);
         HEAP32[$120>>2] = $118;
         $121 = (($n) + ($118)|0);
         $122 = HEAP8[$121>>0]|0;
         $123 = ($122<<24>>24)==(0);
         if ($123) {
          $$lcssa332 = $118;$l$082$i$lcssa331 = $l$082$i;
          label = 23;
          break;
         } else {
          $111 = $122;$l$082$i = $118;
         }
        }
        L32: do {
         if ((label|0) == 23) {
          $124 = ($$lcssa332>>>0)>(1);
          L34: do {
           if ($124) {
            $234 = 1;$ip$0$ph78$i = -1;$jp$0$ph79$i = 0;
            L35: while(1) {
             $235 = $234;$jp$0$ph15$ph72$i = $jp$0$ph79$i;$p$0$ph$ph73$i = 1;
             while(1) {
              $236 = $235;$jp$0$ph1567$i = $jp$0$ph15$ph72$i;
              L39: while(1) {
               $134 = $236;$k$061$i = 1;
               while(1) {
                $130 = (($k$061$i) + ($ip$0$ph78$i))|0;
                $131 = (($n) + ($130)|0);
                $132 = HEAP8[$131>>0]|0;
                $133 = (($n) + ($134)|0);
                $135 = HEAP8[$133>>0]|0;
                $136 = ($132<<24>>24)==($135<<24>>24);
                if (!($136)) {
                 $$lcssa311 = $134;$$lcssa314 = $132;$$lcssa317 = $135;$jp$0$ph1567$i$lcssa = $jp$0$ph1567$i;
                 break L39;
                }
                $137 = ($k$061$i|0)==($p$0$ph$ph73$i|0);
                $128 = (($k$061$i) + 1)|0;
                if ($137) {
                 break;
                }
                $127 = (($128) + ($jp$0$ph1567$i))|0;
                $129 = ($127>>>0)<($$lcssa332>>>0);
                if ($129) {
                 $134 = $127;$k$061$i = $128;
                } else {
                 $ip$0$ph$lcssa$i = $ip$0$ph78$i;$p$0$ph$ph$lcssa34$i = $p$0$ph$ph73$i;
                 break L35;
                }
               }
               $138 = (($jp$0$ph1567$i) + ($p$0$ph$ph73$i))|0;
               $139 = (($138) + 1)|0;
               $140 = ($139>>>0)<($$lcssa332>>>0);
               if ($140) {
                $236 = $139;$jp$0$ph1567$i = $138;
               } else {
                $ip$0$ph$lcssa$i = $ip$0$ph78$i;$p$0$ph$ph$lcssa34$i = $p$0$ph$ph73$i;
                break L35;
               }
              }
              $141 = ($$lcssa314&255)>($$lcssa317&255);
              $142 = (($$lcssa311) - ($ip$0$ph78$i))|0;
              if (!($141)) {
               $jp$0$ph1567$i$lcssa$lcssa = $jp$0$ph1567$i$lcssa;
               break;
              }
              $125 = (($$lcssa311) + 1)|0;
              $126 = ($125>>>0)<($$lcssa332>>>0);
              if ($126) {
               $235 = $125;$jp$0$ph15$ph72$i = $$lcssa311;$p$0$ph$ph73$i = $142;
              } else {
               $ip$0$ph$lcssa$i = $ip$0$ph78$i;$p$0$ph$ph$lcssa34$i = $142;
               break L35;
              }
             }
             $143 = (($jp$0$ph1567$i$lcssa$lcssa) + 1)|0;
             $144 = (($jp$0$ph1567$i$lcssa$lcssa) + 2)|0;
             $145 = ($144>>>0)<($$lcssa332>>>0);
             if ($145) {
              $234 = $144;$ip$0$ph78$i = $jp$0$ph1567$i$lcssa$lcssa;$jp$0$ph79$i = $143;
             } else {
              $ip$0$ph$lcssa$i = $jp$0$ph1567$i$lcssa$lcssa;$p$0$ph$ph$lcssa34$i = 1;
              break;
             }
            }
            $237 = 1;$ip$1$ph57$i = -1;$jp$1$ph58$i = 0;
            while(1) {
             $239 = $237;$jp$1$ph11$ph51$i = $jp$1$ph58$i;$p$1$ph$ph52$i = 1;
             while(1) {
              $238 = $239;$jp$1$ph1146$i = $jp$1$ph11$ph51$i;
              L54: while(1) {
               $153 = $238;$k$141$i = 1;
               while(1) {
                $149 = (($k$141$i) + ($ip$1$ph57$i))|0;
                $150 = (($n) + ($149)|0);
                $151 = HEAP8[$150>>0]|0;
                $152 = (($n) + ($153)|0);
                $154 = HEAP8[$152>>0]|0;
                $155 = ($151<<24>>24)==($154<<24>>24);
                if (!($155)) {
                 $$lcssa291 = $153;$$lcssa294 = $151;$$lcssa297 = $154;$jp$1$ph1146$i$lcssa = $jp$1$ph1146$i;
                 break L54;
                }
                $156 = ($k$141$i|0)==($p$1$ph$ph52$i|0);
                $147 = (($k$141$i) + 1)|0;
                if ($156) {
                 break;
                }
                $146 = (($147) + ($jp$1$ph1146$i))|0;
                $148 = ($146>>>0)<($$lcssa332>>>0);
                if ($148) {
                 $153 = $146;$k$141$i = $147;
                } else {
                 $ip$0$ph$lcssa145$i = $ip$0$ph$lcssa$i;$ip$1$ph$lcssa$i = $ip$1$ph57$i;$p$0$ph$ph$lcssa34146$i = $p$0$ph$ph$lcssa34$i;$p$1$ph$ph$lcssa25$i = $p$1$ph$ph52$i;
                 break L34;
                }
               }
               $157 = (($jp$1$ph1146$i) + ($p$1$ph$ph52$i))|0;
               $158 = (($157) + 1)|0;
               $159 = ($158>>>0)<($$lcssa332>>>0);
               if ($159) {
                $238 = $158;$jp$1$ph1146$i = $157;
               } else {
                $ip$0$ph$lcssa145$i = $ip$0$ph$lcssa$i;$ip$1$ph$lcssa$i = $ip$1$ph57$i;$p$0$ph$ph$lcssa34146$i = $p$0$ph$ph$lcssa34$i;$p$1$ph$ph$lcssa25$i = $p$1$ph$ph52$i;
                break L34;
               }
              }
              $160 = ($$lcssa294&255)<($$lcssa297&255);
              $161 = (($$lcssa291) - ($ip$1$ph57$i))|0;
              if (!($160)) {
               $jp$1$ph1146$i$lcssa$lcssa = $jp$1$ph1146$i$lcssa;
               break;
              }
              $165 = (($$lcssa291) + 1)|0;
              $166 = ($165>>>0)<($$lcssa332>>>0);
              if ($166) {
               $239 = $165;$jp$1$ph11$ph51$i = $$lcssa291;$p$1$ph$ph52$i = $161;
              } else {
               $ip$0$ph$lcssa145$i = $ip$0$ph$lcssa$i;$ip$1$ph$lcssa$i = $ip$1$ph57$i;$p$0$ph$ph$lcssa34146$i = $p$0$ph$ph$lcssa34$i;$p$1$ph$ph$lcssa25$i = $161;
               break L34;
              }
             }
             $162 = (($jp$1$ph1146$i$lcssa$lcssa) + 1)|0;
             $163 = (($jp$1$ph1146$i$lcssa$lcssa) + 2)|0;
             $164 = ($163>>>0)<($$lcssa332>>>0);
             if ($164) {
              $237 = $163;$ip$1$ph57$i = $jp$1$ph1146$i$lcssa$lcssa;$jp$1$ph58$i = $162;
             } else {
              $ip$0$ph$lcssa145$i = $ip$0$ph$lcssa$i;$ip$1$ph$lcssa$i = $jp$1$ph1146$i$lcssa$lcssa;$p$0$ph$ph$lcssa34146$i = $p$0$ph$ph$lcssa34$i;$p$1$ph$ph$lcssa25$i = 1;
              break;
             }
            }
           } else {
            $ip$0$ph$lcssa145$i = -1;$ip$1$ph$lcssa$i = -1;$p$0$ph$ph$lcssa34146$i = 1;$p$1$ph$ph$lcssa25$i = 1;
           }
          } while(0);
          $167 = (($ip$1$ph$lcssa$i) + 1)|0;
          $168 = (($ip$0$ph$lcssa145$i) + 1)|0;
          $169 = ($167>>>0)>($168>>>0);
          $p$1$p$0$i = $169 ? $p$1$ph$ph$lcssa25$i : $p$0$ph$ph$lcssa34146$i;
          $ip$1$ip$0$i = $169 ? $ip$1$ph$lcssa$i : $ip$0$ph$lcssa145$i;
          $170 = (($n) + ($p$1$p$0$i)|0);
          $171 = (($ip$1$ip$0$i) + 1)|0;
          $172 = (_memcmp($n,$170,$171)|0);
          $173 = ($172|0)==(0);
          if ($173) {
           $178 = (($$lcssa332) - ($p$1$p$0$i))|0;
           $mem0$0$i = $178;$p$3$i = $p$1$p$0$i;
          } else {
           $174 = (($$lcssa332) - ($ip$1$ip$0$i))|0;
           $175 = (($174) + -1)|0;
           $176 = ($ip$1$ip$0$i>>>0)>($175>>>0);
           $ip$1$ip$0$$i = $176 ? $ip$1$ip$0$i : $175;
           $177 = (($ip$1$ip$0$$i) + 1)|0;
           $mem0$0$i = 0;$p$3$i = $177;
          }
          $179 = $$lcssa332 | 63;
          $180 = ($mem0$0$i|0)!=(0);
          $181 = (($$lcssa332) - ($p$3$i))|0;
          $$03$i = $3;$mem$0$i = 0;$z$0$i = $3;
          L69: while(1) {
           $182 = $z$0$i;
           $183 = $$03$i;
           $184 = (($182) - ($183))|0;
           $185 = ($184>>>0)<($$lcssa332>>>0);
           do {
            if ($185) {
             $186 = (_memchr($z$0$i,0,$179)|0);
             $187 = ($186|0)==(0|0);
             if ($187) {
              $191 = (($z$0$i) + ($179)|0);
              $z$3$i = $191;
              break;
             } else {
              $188 = $186;
              $189 = (($188) - ($183))|0;
              $190 = ($189>>>0)<($$lcssa332>>>0);
              if ($190) {
               $$3$i = 0;
               break L32;
              } else {
               $z$3$i = $186;
               break;
              }
             }
            } else {
             $z$3$i = $z$0$i;
            }
           } while(0);
           $192 = (($$03$i) + ($l$082$i$lcssa331)|0);
           $193 = HEAP8[$192>>0]|0;
           $div$i = ($193&255) >>> 5;
           $194 = $div$i&255;
           $195 = (($byteset$i) + ($194<<2)|0);
           $196 = HEAP32[$195>>2]|0;
           $197 = $193 & 31;
           $198 = $197&255;
           $199 = 1 << $198;
           $200 = $199 & $196;
           $201 = ($200|0)==(0);
           if ($201) {
            $210 = (($$03$i) + ($$lcssa332)|0);
            $$03$i = $210;$mem$0$i = 0;$z$0$i = $z$3$i;
            continue;
           }
           $202 = $193&255;
           $203 = (($shift$i) + ($202<<2)|0);
           $204 = HEAP32[$203>>2]|0;
           $205 = (($$lcssa332) - ($204))|0;
           $206 = ($$lcssa332|0)==($204|0);
           if (!($206)) {
            $207 = ($mem$0$i|0)!=(0);
            $or$cond$i = $180 & $207;
            $208 = ($205>>>0)<($p$3$i>>>0);
            $or$cond6$i = $or$cond$i & $208;
            $k$2$i = $or$cond6$i ? $181 : $205;
            $209 = (($$03$i) + ($k$2$i)|0);
            $$03$i = $209;$mem$0$i = 0;$z$0$i = $z$3$i;
            continue;
           }
           $211 = ($171>>>0)>($mem$0$i>>>0);
           $212 = $211 ? $171 : $mem$0$i;
           $213 = (($n) + ($212)|0);
           $214 = HEAP8[$213>>0]|0;
           $215 = ($214<<24>>24)==(0);
           L83: do {
            if ($215) {
             $k$4$i = $171;
            } else {
             $$pr$i = $214;$k$340$i = $212;
             while(1) {
              $216 = (($$03$i) + ($k$340$i)|0);
              $217 = HEAP8[$216>>0]|0;
              $218 = ($$pr$i<<24>>24)==($217<<24>>24);
              if (!($218)) {
               $k$340$i$lcssa = $k$340$i;
               break;
              }
              $219 = (($k$340$i) + 1)|0;
              $220 = (($n) + ($219)|0);
              $221 = HEAP8[$220>>0]|0;
              $222 = ($221<<24>>24)==(0);
              if ($222) {
               $k$4$i = $171;
               break L83;
              } else {
               $$pr$i = $221;$k$340$i = $219;
              }
             }
             $223 = (($k$340$i$lcssa) - ($ip$1$ip$0$i))|0;
             $224 = (($$03$i) + ($223)|0);
             $$03$i = $224;$mem$0$i = 0;$z$0$i = $z$3$i;
             continue L69;
            }
           } while(0);
           while(1) {
            $225 = ($k$4$i>>>0)>($mem$0$i>>>0);
            if (!($225)) {
             $$3$i = $$03$i;
             break L32;
            }
            $226 = (($k$4$i) + -1)|0;
            $227 = (($n) + ($226)|0);
            $228 = HEAP8[$227>>0]|0;
            $229 = (($$03$i) + ($226)|0);
            $230 = HEAP8[$229>>0]|0;
            $231 = ($228<<24>>24)==($230<<24>>24);
            if ($231) {
             $k$4$i = $226;
            } else {
             break;
            }
           }
           $232 = (($$03$i) + ($p$3$i)|0);
           $$03$i = $232;$mem$0$i = $mem0$0$i;$z$0$i = $z$3$i;
          }
         }
        } while(0);
        $$0 = $$3$i;
       }
      }
     }
    }
   }
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function _malloc($bytes) {
 $bytes = $bytes|0;
 var $$0 = 0, $$lcssa = 0, $$lcssa141 = 0, $$lcssa142 = 0, $$lcssa144 = 0, $$lcssa147 = 0, $$lcssa149 = 0, $$lcssa151 = 0, $$lcssa153 = 0, $$lcssa155 = 0, $$lcssa157 = 0, $$not$i = 0, $$pre = 0, $$pre$i = 0, $$pre$i$i = 0, $$pre$i13 = 0, $$pre$i16$i = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i14Z2D = 0, $$pre$phi$i17$iZ2D = 0;
 var $$pre$phi$iZ2D = 0, $$pre$phi10$i$iZ2D = 0, $$pre$phiZ2D = 0, $$pre71 = 0, $$pre9$i$i = 0, $$rsize$0$i = 0, $$rsize$4$i = 0, $$v$0$i = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $1000 = 0, $1001 = 0, $1002 = 0, $1003 = 0, $1004 = 0, $1005 = 0, $1006 = 0, $1007 = 0;
 var $1008 = 0, $1009 = 0, $101 = 0, $1010 = 0, $1011 = 0, $1012 = 0, $1013 = 0, $1014 = 0, $1015 = 0, $1016 = 0, $1017 = 0, $1018 = 0, $1019 = 0, $102 = 0, $1020 = 0, $1021 = 0, $1022 = 0, $1023 = 0, $1024 = 0, $1025 = 0;
 var $1026 = 0, $1027 = 0, $1028 = 0, $1029 = 0, $103 = 0, $1030 = 0, $1031 = 0, $1032 = 0, $1033 = 0, $1034 = 0, $1035 = 0, $1036 = 0, $1037 = 0, $1038 = 0, $1039 = 0, $104 = 0, $1040 = 0, $1041 = 0, $1042 = 0, $1043 = 0;
 var $1044 = 0, $1045 = 0, $1046 = 0, $1047 = 0, $1048 = 0, $1049 = 0, $105 = 0, $1050 = 0, $1051 = 0, $1052 = 0, $1053 = 0, $1054 = 0, $1055 = 0, $1056 = 0, $1057 = 0, $1058 = 0, $1059 = 0, $106 = 0, $1060 = 0, $1061 = 0;
 var $1062 = 0, $1063 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0;
 var $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0;
 var $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0;
 var $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0;
 var $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0;
 var $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0;
 var $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0;
 var $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0;
 var $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0;
 var $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0;
 var $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0;
 var $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0;
 var $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0;
 var $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0;
 var $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0;
 var $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0;
 var $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0;
 var $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0, $418 = 0, $419 = 0, $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0, $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0;
 var $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0, $437 = 0, $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0, $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0;
 var $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0, $455 = 0, $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0;
 var $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0, $473 = 0, $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0;
 var $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0, $490 = 0, $491 = 0, $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0;
 var $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0;
 var $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0;
 var $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0, $544 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0, $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0;
 var $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0, $562 = 0, $563 = 0, $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0, $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0;
 var $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0, $580 = 0, $581 = 0, $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0, $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0;
 var $592 = 0, $593 = 0, $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0, $599 = 0, $6 = 0, $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0, $604 = 0, $605 = 0, $606 = 0, $607 = 0, $608 = 0, $609 = 0;
 var $61 = 0, $610 = 0, $611 = 0, $612 = 0, $613 = 0, $614 = 0, $615 = 0, $616 = 0, $617 = 0, $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0, $622 = 0, $623 = 0, $624 = 0, $625 = 0, $626 = 0, $627 = 0;
 var $628 = 0, $629 = 0, $63 = 0, $630 = 0, $631 = 0, $632 = 0, $633 = 0, $634 = 0, $635 = 0, $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0, $640 = 0, $641 = 0, $642 = 0, $643 = 0, $644 = 0, $645 = 0;
 var $646 = 0, $647 = 0, $648 = 0, $649 = 0, $65 = 0, $650 = 0, $651 = 0, $652 = 0, $653 = 0, $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0, $659 = 0, $66 = 0, $660 = 0, $661 = 0, $662 = 0, $663 = 0;
 var $664 = 0, $665 = 0, $666 = 0, $667 = 0, $668 = 0, $669 = 0, $67 = 0, $670 = 0, $671 = 0, $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0, $677 = 0, $678 = 0, $679 = 0, $68 = 0, $680 = 0, $681 = 0;
 var $682 = 0, $683 = 0, $684 = 0, $685 = 0, $686 = 0, $687 = 0, $688 = 0, $689 = 0, $69 = 0, $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0, $695 = 0, $696 = 0, $697 = 0, $698 = 0, $699 = 0, $7 = 0;
 var $70 = 0, $700 = 0, $701 = 0, $702 = 0, $703 = 0, $704 = 0, $705 = 0, $706 = 0, $707 = 0, $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0, $712 = 0, $713 = 0, $714 = 0, $715 = 0, $716 = 0, $717 = 0;
 var $718 = 0, $719 = 0, $72 = 0, $720 = 0, $721 = 0, $722 = 0, $723 = 0, $724 = 0, $725 = 0, $726 = 0, $727 = 0, $728 = 0, $729 = 0, $73 = 0, $730 = 0, $731 = 0, $732 = 0, $733 = 0, $734 = 0, $735 = 0;
 var $736 = 0, $737 = 0, $738 = 0, $739 = 0, $74 = 0, $740 = 0, $741 = 0, $742 = 0, $743 = 0, $744 = 0, $745 = 0, $746 = 0, $747 = 0, $748 = 0, $749 = 0, $75 = 0, $750 = 0, $751 = 0, $752 = 0, $753 = 0;
 var $754 = 0, $755 = 0, $756 = 0, $757 = 0, $758 = 0, $759 = 0, $76 = 0, $760 = 0, $761 = 0, $762 = 0, $763 = 0, $764 = 0, $765 = 0, $766 = 0, $767 = 0, $768 = 0, $769 = 0, $77 = 0, $770 = 0, $771 = 0;
 var $772 = 0, $773 = 0, $774 = 0, $775 = 0, $776 = 0, $777 = 0, $778 = 0, $779 = 0, $78 = 0, $780 = 0, $781 = 0, $782 = 0, $783 = 0, $784 = 0, $785 = 0, $786 = 0, $787 = 0, $788 = 0, $789 = 0, $79 = 0;
 var $790 = 0, $791 = 0, $792 = 0, $793 = 0, $794 = 0, $795 = 0, $796 = 0, $797 = 0, $798 = 0, $799 = 0, $8 = 0, $80 = 0, $800 = 0, $801 = 0, $802 = 0, $803 = 0, $804 = 0, $805 = 0, $806 = 0, $807 = 0;
 var $808 = 0, $809 = 0, $81 = 0, $810 = 0, $811 = 0, $812 = 0, $813 = 0, $814 = 0, $815 = 0, $816 = 0, $817 = 0, $818 = 0, $819 = 0, $82 = 0, $820 = 0, $821 = 0, $822 = 0, $823 = 0, $824 = 0, $825 = 0;
 var $826 = 0, $827 = 0, $828 = 0, $829 = 0, $83 = 0, $830 = 0, $831 = 0, $832 = 0, $833 = 0, $834 = 0, $835 = 0, $836 = 0, $837 = 0, $838 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0, $842 = 0, $843 = 0;
 var $844 = 0, $845 = 0, $846 = 0, $847 = 0, $848 = 0, $849 = 0, $85 = 0, $850 = 0, $851 = 0, $852 = 0, $853 = 0, $854 = 0, $855 = 0, $856 = 0, $857 = 0, $858 = 0, $859 = 0, $86 = 0, $860 = 0, $861 = 0;
 var $862 = 0, $863 = 0, $864 = 0, $865 = 0, $866 = 0, $867 = 0, $868 = 0, $869 = 0, $87 = 0, $870 = 0, $871 = 0, $872 = 0, $873 = 0, $874 = 0, $875 = 0, $876 = 0, $877 = 0, $878 = 0, $879 = 0, $88 = 0;
 var $880 = 0, $881 = 0, $882 = 0, $883 = 0, $884 = 0, $885 = 0, $886 = 0, $887 = 0, $888 = 0, $889 = 0, $89 = 0, $890 = 0, $891 = 0, $892 = 0, $893 = 0, $894 = 0, $895 = 0, $896 = 0, $897 = 0, $898 = 0;
 var $899 = 0, $9 = 0, $90 = 0, $900 = 0, $901 = 0, $902 = 0, $903 = 0, $904 = 0, $905 = 0, $906 = 0, $907 = 0, $908 = 0, $909 = 0, $91 = 0, $910 = 0, $911 = 0, $912 = 0, $913 = 0, $914 = 0, $915 = 0;
 var $916 = 0, $917 = 0, $918 = 0, $919 = 0, $92 = 0, $920 = 0, $921 = 0, $922 = 0, $923 = 0, $924 = 0, $925 = 0, $926 = 0, $927 = 0, $928 = 0, $929 = 0, $93 = 0, $930 = 0, $931 = 0, $932 = 0, $933 = 0;
 var $934 = 0, $935 = 0, $936 = 0, $937 = 0, $938 = 0, $939 = 0, $94 = 0, $940 = 0, $941 = 0, $942 = 0, $943 = 0, $944 = 0, $945 = 0, $946 = 0, $947 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $951 = 0;
 var $952 = 0, $953 = 0, $954 = 0, $955 = 0, $956 = 0, $957 = 0, $958 = 0, $959 = 0, $96 = 0, $960 = 0, $961 = 0, $962 = 0, $963 = 0, $964 = 0, $965 = 0, $966 = 0, $967 = 0, $968 = 0, $969 = 0, $97 = 0;
 var $970 = 0, $971 = 0, $972 = 0, $973 = 0, $974 = 0, $975 = 0, $976 = 0, $977 = 0, $978 = 0, $979 = 0, $98 = 0, $980 = 0, $981 = 0, $982 = 0, $983 = 0, $984 = 0, $985 = 0, $986 = 0, $987 = 0, $988 = 0;
 var $989 = 0, $99 = 0, $990 = 0, $991 = 0, $992 = 0, $993 = 0, $994 = 0, $995 = 0, $996 = 0, $997 = 0, $998 = 0, $999 = 0, $F$0$i$i = 0, $F1$0$i = 0, $F4$0 = 0, $F4$0$i$i = 0, $F5$0$i = 0, $I1$0$i$i = 0, $I7$0$i = 0, $I7$0$i$i = 0;
 var $K12$0$i = 0, $K2$0$i$i = 0, $K8$0$i$i = 0, $R$1$i = 0, $R$1$i$i = 0, $R$1$i$i$lcssa = 0, $R$1$i$lcssa = 0, $R$1$i9 = 0, $R$1$i9$lcssa = 0, $R$3$i = 0, $R$3$i$i = 0, $R$3$i11 = 0, $RP$1$i = 0, $RP$1$i$i = 0, $RP$1$i$i$lcssa = 0, $RP$1$i$lcssa = 0, $RP$1$i8 = 0, $RP$1$i8$lcssa = 0, $T$0$i = 0, $T$0$i$i = 0;
 var $T$0$i$i$lcssa = 0, $T$0$i$i$lcssa140 = 0, $T$0$i$lcssa = 0, $T$0$i$lcssa156 = 0, $T$0$i18$i = 0, $T$0$i18$i$lcssa = 0, $T$0$i18$i$lcssa139 = 0, $br$2$ph$i = 0, $cond$i = 0, $cond$i$i = 0, $cond$i12 = 0, $exitcond$i$i = 0, $i$01$i$i = 0, $idx$0$i = 0, $nb$0 = 0, $not$$i$i = 0, $not$$i20$i = 0, $not$7$i = 0, $oldfirst$0$i$i = 0, $or$cond$i = 0;
 var $or$cond$i17 = 0, $or$cond1$i = 0, $or$cond1$i16 = 0, $or$cond10$i = 0, $or$cond11$i = 0, $or$cond2$i = 0, $or$cond48$i = 0, $or$cond5$i = 0, $or$cond7$i = 0, $or$cond8$i = 0, $p$0$i$i = 0, $qsize$0$i$i = 0, $rsize$0$i = 0, $rsize$0$i$lcssa = 0, $rsize$0$i5 = 0, $rsize$1$i = 0, $rsize$3$i = 0, $rsize$4$lcssa$i = 0, $rsize$412$i = 0, $rst$0$i = 0;
 var $rst$1$i = 0, $sizebits$0$$i = 0, $sizebits$0$i = 0, $sp$0$i$i = 0, $sp$0$i$i$i = 0, $sp$068$i = 0, $sp$068$i$lcssa = 0, $sp$167$i = 0, $sp$167$i$lcssa = 0, $ssize$0$i = 0, $ssize$2$ph$i = 0, $ssize$5$i = 0, $t$0$i = 0, $t$0$i4 = 0, $t$2$i = 0, $t$4$ph$i = 0, $t$4$v$4$i = 0, $t$411$i = 0, $tbase$746$i = 0, $tsize$745$i = 0;
 var $v$0$i = 0, $v$0$i$lcssa = 0, $v$0$i6 = 0, $v$1$i = 0, $v$3$i = 0, $v$4$lcssa$i = 0, $v$413$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($bytes>>>0)<(245);
 do {
  if ($0) {
   $1 = ($bytes>>>0)<(11);
   $2 = (($bytes) + 11)|0;
   $3 = $2 & -8;
   $4 = $1 ? 16 : $3;
   $5 = $4 >>> 3;
   $6 = HEAP32[782]|0;
   $7 = $6 >>> $5;
   $8 = $7 & 3;
   $9 = ($8|0)==(0);
   if (!($9)) {
    $10 = $7 & 1;
    $11 = $10 ^ 1;
    $12 = (($11) + ($5))|0;
    $13 = $12 << 1;
    $14 = (3168 + ($13<<2)|0);
    $15 = ((($14)) + 8|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = ((($16)) + 8|0);
    $18 = HEAP32[$17>>2]|0;
    $19 = ($14|0)==($18|0);
    do {
     if ($19) {
      $20 = 1 << $12;
      $21 = $20 ^ -1;
      $22 = $6 & $21;
      HEAP32[782] = $22;
     } else {
      $23 = HEAP32[(3144)>>2]|0;
      $24 = ($18>>>0)<($23>>>0);
      if ($24) {
       _abort();
       // unreachable;
      }
      $25 = ((($18)) + 12|0);
      $26 = HEAP32[$25>>2]|0;
      $27 = ($26|0)==($16|0);
      if ($27) {
       HEAP32[$25>>2] = $14;
       HEAP32[$15>>2] = $18;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $28 = $12 << 3;
    $29 = $28 | 3;
    $30 = ((($16)) + 4|0);
    HEAP32[$30>>2] = $29;
    $31 = (($16) + ($28)|0);
    $32 = ((($31)) + 4|0);
    $33 = HEAP32[$32>>2]|0;
    $34 = $33 | 1;
    HEAP32[$32>>2] = $34;
    $$0 = $17;
    return ($$0|0);
   }
   $35 = HEAP32[(3136)>>2]|0;
   $36 = ($4>>>0)>($35>>>0);
   if ($36) {
    $37 = ($7|0)==(0);
    if (!($37)) {
     $38 = $7 << $5;
     $39 = 2 << $5;
     $40 = (0 - ($39))|0;
     $41 = $39 | $40;
     $42 = $38 & $41;
     $43 = (0 - ($42))|0;
     $44 = $42 & $43;
     $45 = (($44) + -1)|0;
     $46 = $45 >>> 12;
     $47 = $46 & 16;
     $48 = $45 >>> $47;
     $49 = $48 >>> 5;
     $50 = $49 & 8;
     $51 = $50 | $47;
     $52 = $48 >>> $50;
     $53 = $52 >>> 2;
     $54 = $53 & 4;
     $55 = $51 | $54;
     $56 = $52 >>> $54;
     $57 = $56 >>> 1;
     $58 = $57 & 2;
     $59 = $55 | $58;
     $60 = $56 >>> $58;
     $61 = $60 >>> 1;
     $62 = $61 & 1;
     $63 = $59 | $62;
     $64 = $60 >>> $62;
     $65 = (($63) + ($64))|0;
     $66 = $65 << 1;
     $67 = (3168 + ($66<<2)|0);
     $68 = ((($67)) + 8|0);
     $69 = HEAP32[$68>>2]|0;
     $70 = ((($69)) + 8|0);
     $71 = HEAP32[$70>>2]|0;
     $72 = ($67|0)==($71|0);
     do {
      if ($72) {
       $73 = 1 << $65;
       $74 = $73 ^ -1;
       $75 = $6 & $74;
       HEAP32[782] = $75;
       $89 = $35;
      } else {
       $76 = HEAP32[(3144)>>2]|0;
       $77 = ($71>>>0)<($76>>>0);
       if ($77) {
        _abort();
        // unreachable;
       }
       $78 = ((($71)) + 12|0);
       $79 = HEAP32[$78>>2]|0;
       $80 = ($79|0)==($69|0);
       if ($80) {
        HEAP32[$78>>2] = $67;
        HEAP32[$68>>2] = $71;
        $$pre = HEAP32[(3136)>>2]|0;
        $89 = $$pre;
        break;
       } else {
        _abort();
        // unreachable;
       }
      }
     } while(0);
     $81 = $65 << 3;
     $82 = (($81) - ($4))|0;
     $83 = $4 | 3;
     $84 = ((($69)) + 4|0);
     HEAP32[$84>>2] = $83;
     $85 = (($69) + ($4)|0);
     $86 = $82 | 1;
     $87 = ((($85)) + 4|0);
     HEAP32[$87>>2] = $86;
     $88 = (($85) + ($82)|0);
     HEAP32[$88>>2] = $82;
     $90 = ($89|0)==(0);
     if (!($90)) {
      $91 = HEAP32[(3148)>>2]|0;
      $92 = $89 >>> 3;
      $93 = $92 << 1;
      $94 = (3168 + ($93<<2)|0);
      $95 = HEAP32[782]|0;
      $96 = 1 << $92;
      $97 = $95 & $96;
      $98 = ($97|0)==(0);
      if ($98) {
       $99 = $95 | $96;
       HEAP32[782] = $99;
       $$pre71 = ((($94)) + 8|0);
       $$pre$phiZ2D = $$pre71;$F4$0 = $94;
      } else {
       $100 = ((($94)) + 8|0);
       $101 = HEAP32[$100>>2]|0;
       $102 = HEAP32[(3144)>>2]|0;
       $103 = ($101>>>0)<($102>>>0);
       if ($103) {
        _abort();
        // unreachable;
       } else {
        $$pre$phiZ2D = $100;$F4$0 = $101;
       }
      }
      HEAP32[$$pre$phiZ2D>>2] = $91;
      $104 = ((($F4$0)) + 12|0);
      HEAP32[$104>>2] = $91;
      $105 = ((($91)) + 8|0);
      HEAP32[$105>>2] = $F4$0;
      $106 = ((($91)) + 12|0);
      HEAP32[$106>>2] = $94;
     }
     HEAP32[(3136)>>2] = $82;
     HEAP32[(3148)>>2] = $85;
     $$0 = $70;
     return ($$0|0);
    }
    $107 = HEAP32[(3132)>>2]|0;
    $108 = ($107|0)==(0);
    if ($108) {
     $nb$0 = $4;
    } else {
     $109 = (0 - ($107))|0;
     $110 = $107 & $109;
     $111 = (($110) + -1)|0;
     $112 = $111 >>> 12;
     $113 = $112 & 16;
     $114 = $111 >>> $113;
     $115 = $114 >>> 5;
     $116 = $115 & 8;
     $117 = $116 | $113;
     $118 = $114 >>> $116;
     $119 = $118 >>> 2;
     $120 = $119 & 4;
     $121 = $117 | $120;
     $122 = $118 >>> $120;
     $123 = $122 >>> 1;
     $124 = $123 & 2;
     $125 = $121 | $124;
     $126 = $122 >>> $124;
     $127 = $126 >>> 1;
     $128 = $127 & 1;
     $129 = $125 | $128;
     $130 = $126 >>> $128;
     $131 = (($129) + ($130))|0;
     $132 = (3432 + ($131<<2)|0);
     $133 = HEAP32[$132>>2]|0;
     $134 = ((($133)) + 4|0);
     $135 = HEAP32[$134>>2]|0;
     $136 = $135 & -8;
     $137 = (($136) - ($4))|0;
     $rsize$0$i = $137;$t$0$i = $133;$v$0$i = $133;
     while(1) {
      $138 = ((($t$0$i)) + 16|0);
      $139 = HEAP32[$138>>2]|0;
      $140 = ($139|0)==(0|0);
      if ($140) {
       $141 = ((($t$0$i)) + 20|0);
       $142 = HEAP32[$141>>2]|0;
       $143 = ($142|0)==(0|0);
       if ($143) {
        $rsize$0$i$lcssa = $rsize$0$i;$v$0$i$lcssa = $v$0$i;
        break;
       } else {
        $145 = $142;
       }
      } else {
       $145 = $139;
      }
      $144 = ((($145)) + 4|0);
      $146 = HEAP32[$144>>2]|0;
      $147 = $146 & -8;
      $148 = (($147) - ($4))|0;
      $149 = ($148>>>0)<($rsize$0$i>>>0);
      $$rsize$0$i = $149 ? $148 : $rsize$0$i;
      $$v$0$i = $149 ? $145 : $v$0$i;
      $rsize$0$i = $$rsize$0$i;$t$0$i = $145;$v$0$i = $$v$0$i;
     }
     $150 = HEAP32[(3144)>>2]|0;
     $151 = ($v$0$i$lcssa>>>0)<($150>>>0);
     if ($151) {
      _abort();
      // unreachable;
     }
     $152 = (($v$0$i$lcssa) + ($4)|0);
     $153 = ($v$0$i$lcssa>>>0)<($152>>>0);
     if (!($153)) {
      _abort();
      // unreachable;
     }
     $154 = ((($v$0$i$lcssa)) + 24|0);
     $155 = HEAP32[$154>>2]|0;
     $156 = ((($v$0$i$lcssa)) + 12|0);
     $157 = HEAP32[$156>>2]|0;
     $158 = ($157|0)==($v$0$i$lcssa|0);
     do {
      if ($158) {
       $168 = ((($v$0$i$lcssa)) + 20|0);
       $169 = HEAP32[$168>>2]|0;
       $170 = ($169|0)==(0|0);
       if ($170) {
        $171 = ((($v$0$i$lcssa)) + 16|0);
        $172 = HEAP32[$171>>2]|0;
        $173 = ($172|0)==(0|0);
        if ($173) {
         $R$3$i = 0;
         break;
        } else {
         $R$1$i = $172;$RP$1$i = $171;
        }
       } else {
        $R$1$i = $169;$RP$1$i = $168;
       }
       while(1) {
        $174 = ((($R$1$i)) + 20|0);
        $175 = HEAP32[$174>>2]|0;
        $176 = ($175|0)==(0|0);
        if (!($176)) {
         $R$1$i = $175;$RP$1$i = $174;
         continue;
        }
        $177 = ((($R$1$i)) + 16|0);
        $178 = HEAP32[$177>>2]|0;
        $179 = ($178|0)==(0|0);
        if ($179) {
         $R$1$i$lcssa = $R$1$i;$RP$1$i$lcssa = $RP$1$i;
         break;
        } else {
         $R$1$i = $178;$RP$1$i = $177;
        }
       }
       $180 = ($RP$1$i$lcssa>>>0)<($150>>>0);
       if ($180) {
        _abort();
        // unreachable;
       } else {
        HEAP32[$RP$1$i$lcssa>>2] = 0;
        $R$3$i = $R$1$i$lcssa;
        break;
       }
      } else {
       $159 = ((($v$0$i$lcssa)) + 8|0);
       $160 = HEAP32[$159>>2]|0;
       $161 = ($160>>>0)<($150>>>0);
       if ($161) {
        _abort();
        // unreachable;
       }
       $162 = ((($160)) + 12|0);
       $163 = HEAP32[$162>>2]|0;
       $164 = ($163|0)==($v$0$i$lcssa|0);
       if (!($164)) {
        _abort();
        // unreachable;
       }
       $165 = ((($157)) + 8|0);
       $166 = HEAP32[$165>>2]|0;
       $167 = ($166|0)==($v$0$i$lcssa|0);
       if ($167) {
        HEAP32[$162>>2] = $157;
        HEAP32[$165>>2] = $160;
        $R$3$i = $157;
        break;
       } else {
        _abort();
        // unreachable;
       }
      }
     } while(0);
     $181 = ($155|0)==(0|0);
     do {
      if (!($181)) {
       $182 = ((($v$0$i$lcssa)) + 28|0);
       $183 = HEAP32[$182>>2]|0;
       $184 = (3432 + ($183<<2)|0);
       $185 = HEAP32[$184>>2]|0;
       $186 = ($v$0$i$lcssa|0)==($185|0);
       if ($186) {
        HEAP32[$184>>2] = $R$3$i;
        $cond$i = ($R$3$i|0)==(0|0);
        if ($cond$i) {
         $187 = 1 << $183;
         $188 = $187 ^ -1;
         $189 = HEAP32[(3132)>>2]|0;
         $190 = $189 & $188;
         HEAP32[(3132)>>2] = $190;
         break;
        }
       } else {
        $191 = HEAP32[(3144)>>2]|0;
        $192 = ($155>>>0)<($191>>>0);
        if ($192) {
         _abort();
         // unreachable;
        }
        $193 = ((($155)) + 16|0);
        $194 = HEAP32[$193>>2]|0;
        $195 = ($194|0)==($v$0$i$lcssa|0);
        if ($195) {
         HEAP32[$193>>2] = $R$3$i;
        } else {
         $196 = ((($155)) + 20|0);
         HEAP32[$196>>2] = $R$3$i;
        }
        $197 = ($R$3$i|0)==(0|0);
        if ($197) {
         break;
        }
       }
       $198 = HEAP32[(3144)>>2]|0;
       $199 = ($R$3$i>>>0)<($198>>>0);
       if ($199) {
        _abort();
        // unreachable;
       }
       $200 = ((($R$3$i)) + 24|0);
       HEAP32[$200>>2] = $155;
       $201 = ((($v$0$i$lcssa)) + 16|0);
       $202 = HEAP32[$201>>2]|0;
       $203 = ($202|0)==(0|0);
       do {
        if (!($203)) {
         $204 = ($202>>>0)<($198>>>0);
         if ($204) {
          _abort();
          // unreachable;
         } else {
          $205 = ((($R$3$i)) + 16|0);
          HEAP32[$205>>2] = $202;
          $206 = ((($202)) + 24|0);
          HEAP32[$206>>2] = $R$3$i;
          break;
         }
        }
       } while(0);
       $207 = ((($v$0$i$lcssa)) + 20|0);
       $208 = HEAP32[$207>>2]|0;
       $209 = ($208|0)==(0|0);
       if (!($209)) {
        $210 = HEAP32[(3144)>>2]|0;
        $211 = ($208>>>0)<($210>>>0);
        if ($211) {
         _abort();
         // unreachable;
        } else {
         $212 = ((($R$3$i)) + 20|0);
         HEAP32[$212>>2] = $208;
         $213 = ((($208)) + 24|0);
         HEAP32[$213>>2] = $R$3$i;
         break;
        }
       }
      }
     } while(0);
     $214 = ($rsize$0$i$lcssa>>>0)<(16);
     if ($214) {
      $215 = (($rsize$0$i$lcssa) + ($4))|0;
      $216 = $215 | 3;
      $217 = ((($v$0$i$lcssa)) + 4|0);
      HEAP32[$217>>2] = $216;
      $218 = (($v$0$i$lcssa) + ($215)|0);
      $219 = ((($218)) + 4|0);
      $220 = HEAP32[$219>>2]|0;
      $221 = $220 | 1;
      HEAP32[$219>>2] = $221;
     } else {
      $222 = $4 | 3;
      $223 = ((($v$0$i$lcssa)) + 4|0);
      HEAP32[$223>>2] = $222;
      $224 = $rsize$0$i$lcssa | 1;
      $225 = ((($152)) + 4|0);
      HEAP32[$225>>2] = $224;
      $226 = (($152) + ($rsize$0$i$lcssa)|0);
      HEAP32[$226>>2] = $rsize$0$i$lcssa;
      $227 = HEAP32[(3136)>>2]|0;
      $228 = ($227|0)==(0);
      if (!($228)) {
       $229 = HEAP32[(3148)>>2]|0;
       $230 = $227 >>> 3;
       $231 = $230 << 1;
       $232 = (3168 + ($231<<2)|0);
       $233 = HEAP32[782]|0;
       $234 = 1 << $230;
       $235 = $233 & $234;
       $236 = ($235|0)==(0);
       if ($236) {
        $237 = $233 | $234;
        HEAP32[782] = $237;
        $$pre$i = ((($232)) + 8|0);
        $$pre$phi$iZ2D = $$pre$i;$F1$0$i = $232;
       } else {
        $238 = ((($232)) + 8|0);
        $239 = HEAP32[$238>>2]|0;
        $240 = HEAP32[(3144)>>2]|0;
        $241 = ($239>>>0)<($240>>>0);
        if ($241) {
         _abort();
         // unreachable;
        } else {
         $$pre$phi$iZ2D = $238;$F1$0$i = $239;
        }
       }
       HEAP32[$$pre$phi$iZ2D>>2] = $229;
       $242 = ((($F1$0$i)) + 12|0);
       HEAP32[$242>>2] = $229;
       $243 = ((($229)) + 8|0);
       HEAP32[$243>>2] = $F1$0$i;
       $244 = ((($229)) + 12|0);
       HEAP32[$244>>2] = $232;
      }
      HEAP32[(3136)>>2] = $rsize$0$i$lcssa;
      HEAP32[(3148)>>2] = $152;
     }
     $245 = ((($v$0$i$lcssa)) + 8|0);
     $$0 = $245;
     return ($$0|0);
    }
   } else {
    $nb$0 = $4;
   }
  } else {
   $246 = ($bytes>>>0)>(4294967231);
   if ($246) {
    $nb$0 = -1;
   } else {
    $247 = (($bytes) + 11)|0;
    $248 = $247 & -8;
    $249 = HEAP32[(3132)>>2]|0;
    $250 = ($249|0)==(0);
    if ($250) {
     $nb$0 = $248;
    } else {
     $251 = (0 - ($248))|0;
     $252 = $247 >>> 8;
     $253 = ($252|0)==(0);
     if ($253) {
      $idx$0$i = 0;
     } else {
      $254 = ($248>>>0)>(16777215);
      if ($254) {
       $idx$0$i = 31;
      } else {
       $255 = (($252) + 1048320)|0;
       $256 = $255 >>> 16;
       $257 = $256 & 8;
       $258 = $252 << $257;
       $259 = (($258) + 520192)|0;
       $260 = $259 >>> 16;
       $261 = $260 & 4;
       $262 = $261 | $257;
       $263 = $258 << $261;
       $264 = (($263) + 245760)|0;
       $265 = $264 >>> 16;
       $266 = $265 & 2;
       $267 = $262 | $266;
       $268 = (14 - ($267))|0;
       $269 = $263 << $266;
       $270 = $269 >>> 15;
       $271 = (($268) + ($270))|0;
       $272 = $271 << 1;
       $273 = (($271) + 7)|0;
       $274 = $248 >>> $273;
       $275 = $274 & 1;
       $276 = $275 | $272;
       $idx$0$i = $276;
      }
     }
     $277 = (3432 + ($idx$0$i<<2)|0);
     $278 = HEAP32[$277>>2]|0;
     $279 = ($278|0)==(0|0);
     L123: do {
      if ($279) {
       $rsize$3$i = $251;$t$2$i = 0;$v$3$i = 0;
       label = 86;
      } else {
       $280 = ($idx$0$i|0)==(31);
       $281 = $idx$0$i >>> 1;
       $282 = (25 - ($281))|0;
       $283 = $280 ? 0 : $282;
       $284 = $248 << $283;
       $rsize$0$i5 = $251;$rst$0$i = 0;$sizebits$0$i = $284;$t$0$i4 = $278;$v$0$i6 = 0;
       while(1) {
        $285 = ((($t$0$i4)) + 4|0);
        $286 = HEAP32[$285>>2]|0;
        $287 = $286 & -8;
        $288 = (($287) - ($248))|0;
        $289 = ($288>>>0)<($rsize$0$i5>>>0);
        if ($289) {
         $290 = ($287|0)==($248|0);
         if ($290) {
          $rsize$412$i = $288;$t$411$i = $t$0$i4;$v$413$i = $t$0$i4;
          label = 90;
          break L123;
         } else {
          $rsize$1$i = $288;$v$1$i = $t$0$i4;
         }
        } else {
         $rsize$1$i = $rsize$0$i5;$v$1$i = $v$0$i6;
        }
        $291 = ((($t$0$i4)) + 20|0);
        $292 = HEAP32[$291>>2]|0;
        $293 = $sizebits$0$i >>> 31;
        $294 = (((($t$0$i4)) + 16|0) + ($293<<2)|0);
        $295 = HEAP32[$294>>2]|0;
        $296 = ($292|0)==(0|0);
        $297 = ($292|0)==($295|0);
        $or$cond1$i = $296 | $297;
        $rst$1$i = $or$cond1$i ? $rst$0$i : $292;
        $298 = ($295|0)==(0|0);
        $299 = $298&1;
        $300 = $299 ^ 1;
        $sizebits$0$$i = $sizebits$0$i << $300;
        if ($298) {
         $rsize$3$i = $rsize$1$i;$t$2$i = $rst$1$i;$v$3$i = $v$1$i;
         label = 86;
         break;
        } else {
         $rsize$0$i5 = $rsize$1$i;$rst$0$i = $rst$1$i;$sizebits$0$i = $sizebits$0$$i;$t$0$i4 = $295;$v$0$i6 = $v$1$i;
        }
       }
      }
     } while(0);
     if ((label|0) == 86) {
      $301 = ($t$2$i|0)==(0|0);
      $302 = ($v$3$i|0)==(0|0);
      $or$cond$i = $301 & $302;
      if ($or$cond$i) {
       $303 = 2 << $idx$0$i;
       $304 = (0 - ($303))|0;
       $305 = $303 | $304;
       $306 = $249 & $305;
       $307 = ($306|0)==(0);
       if ($307) {
        $nb$0 = $248;
        break;
       }
       $308 = (0 - ($306))|0;
       $309 = $306 & $308;
       $310 = (($309) + -1)|0;
       $311 = $310 >>> 12;
       $312 = $311 & 16;
       $313 = $310 >>> $312;
       $314 = $313 >>> 5;
       $315 = $314 & 8;
       $316 = $315 | $312;
       $317 = $313 >>> $315;
       $318 = $317 >>> 2;
       $319 = $318 & 4;
       $320 = $316 | $319;
       $321 = $317 >>> $319;
       $322 = $321 >>> 1;
       $323 = $322 & 2;
       $324 = $320 | $323;
       $325 = $321 >>> $323;
       $326 = $325 >>> 1;
       $327 = $326 & 1;
       $328 = $324 | $327;
       $329 = $325 >>> $327;
       $330 = (($328) + ($329))|0;
       $331 = (3432 + ($330<<2)|0);
       $332 = HEAP32[$331>>2]|0;
       $t$4$ph$i = $332;
      } else {
       $t$4$ph$i = $t$2$i;
      }
      $333 = ($t$4$ph$i|0)==(0|0);
      if ($333) {
       $rsize$4$lcssa$i = $rsize$3$i;$v$4$lcssa$i = $v$3$i;
      } else {
       $rsize$412$i = $rsize$3$i;$t$411$i = $t$4$ph$i;$v$413$i = $v$3$i;
       label = 90;
      }
     }
     if ((label|0) == 90) {
      while(1) {
       label = 0;
       $334 = ((($t$411$i)) + 4|0);
       $335 = HEAP32[$334>>2]|0;
       $336 = $335 & -8;
       $337 = (($336) - ($248))|0;
       $338 = ($337>>>0)<($rsize$412$i>>>0);
       $$rsize$4$i = $338 ? $337 : $rsize$412$i;
       $t$4$v$4$i = $338 ? $t$411$i : $v$413$i;
       $339 = ((($t$411$i)) + 16|0);
       $340 = HEAP32[$339>>2]|0;
       $341 = ($340|0)==(0|0);
       if (!($341)) {
        $rsize$412$i = $$rsize$4$i;$t$411$i = $340;$v$413$i = $t$4$v$4$i;
        label = 90;
        continue;
       }
       $342 = ((($t$411$i)) + 20|0);
       $343 = HEAP32[$342>>2]|0;
       $344 = ($343|0)==(0|0);
       if ($344) {
        $rsize$4$lcssa$i = $$rsize$4$i;$v$4$lcssa$i = $t$4$v$4$i;
        break;
       } else {
        $rsize$412$i = $$rsize$4$i;$t$411$i = $343;$v$413$i = $t$4$v$4$i;
        label = 90;
       }
      }
     }
     $345 = ($v$4$lcssa$i|0)==(0|0);
     if ($345) {
      $nb$0 = $248;
     } else {
      $346 = HEAP32[(3136)>>2]|0;
      $347 = (($346) - ($248))|0;
      $348 = ($rsize$4$lcssa$i>>>0)<($347>>>0);
      if ($348) {
       $349 = HEAP32[(3144)>>2]|0;
       $350 = ($v$4$lcssa$i>>>0)<($349>>>0);
       if ($350) {
        _abort();
        // unreachable;
       }
       $351 = (($v$4$lcssa$i) + ($248)|0);
       $352 = ($v$4$lcssa$i>>>0)<($351>>>0);
       if (!($352)) {
        _abort();
        // unreachable;
       }
       $353 = ((($v$4$lcssa$i)) + 24|0);
       $354 = HEAP32[$353>>2]|0;
       $355 = ((($v$4$lcssa$i)) + 12|0);
       $356 = HEAP32[$355>>2]|0;
       $357 = ($356|0)==($v$4$lcssa$i|0);
       do {
        if ($357) {
         $367 = ((($v$4$lcssa$i)) + 20|0);
         $368 = HEAP32[$367>>2]|0;
         $369 = ($368|0)==(0|0);
         if ($369) {
          $370 = ((($v$4$lcssa$i)) + 16|0);
          $371 = HEAP32[$370>>2]|0;
          $372 = ($371|0)==(0|0);
          if ($372) {
           $R$3$i11 = 0;
           break;
          } else {
           $R$1$i9 = $371;$RP$1$i8 = $370;
          }
         } else {
          $R$1$i9 = $368;$RP$1$i8 = $367;
         }
         while(1) {
          $373 = ((($R$1$i9)) + 20|0);
          $374 = HEAP32[$373>>2]|0;
          $375 = ($374|0)==(0|0);
          if (!($375)) {
           $R$1$i9 = $374;$RP$1$i8 = $373;
           continue;
          }
          $376 = ((($R$1$i9)) + 16|0);
          $377 = HEAP32[$376>>2]|0;
          $378 = ($377|0)==(0|0);
          if ($378) {
           $R$1$i9$lcssa = $R$1$i9;$RP$1$i8$lcssa = $RP$1$i8;
           break;
          } else {
           $R$1$i9 = $377;$RP$1$i8 = $376;
          }
         }
         $379 = ($RP$1$i8$lcssa>>>0)<($349>>>0);
         if ($379) {
          _abort();
          // unreachable;
         } else {
          HEAP32[$RP$1$i8$lcssa>>2] = 0;
          $R$3$i11 = $R$1$i9$lcssa;
          break;
         }
        } else {
         $358 = ((($v$4$lcssa$i)) + 8|0);
         $359 = HEAP32[$358>>2]|0;
         $360 = ($359>>>0)<($349>>>0);
         if ($360) {
          _abort();
          // unreachable;
         }
         $361 = ((($359)) + 12|0);
         $362 = HEAP32[$361>>2]|0;
         $363 = ($362|0)==($v$4$lcssa$i|0);
         if (!($363)) {
          _abort();
          // unreachable;
         }
         $364 = ((($356)) + 8|0);
         $365 = HEAP32[$364>>2]|0;
         $366 = ($365|0)==($v$4$lcssa$i|0);
         if ($366) {
          HEAP32[$361>>2] = $356;
          HEAP32[$364>>2] = $359;
          $R$3$i11 = $356;
          break;
         } else {
          _abort();
          // unreachable;
         }
        }
       } while(0);
       $380 = ($354|0)==(0|0);
       do {
        if (!($380)) {
         $381 = ((($v$4$lcssa$i)) + 28|0);
         $382 = HEAP32[$381>>2]|0;
         $383 = (3432 + ($382<<2)|0);
         $384 = HEAP32[$383>>2]|0;
         $385 = ($v$4$lcssa$i|0)==($384|0);
         if ($385) {
          HEAP32[$383>>2] = $R$3$i11;
          $cond$i12 = ($R$3$i11|0)==(0|0);
          if ($cond$i12) {
           $386 = 1 << $382;
           $387 = $386 ^ -1;
           $388 = HEAP32[(3132)>>2]|0;
           $389 = $388 & $387;
           HEAP32[(3132)>>2] = $389;
           break;
          }
         } else {
          $390 = HEAP32[(3144)>>2]|0;
          $391 = ($354>>>0)<($390>>>0);
          if ($391) {
           _abort();
           // unreachable;
          }
          $392 = ((($354)) + 16|0);
          $393 = HEAP32[$392>>2]|0;
          $394 = ($393|0)==($v$4$lcssa$i|0);
          if ($394) {
           HEAP32[$392>>2] = $R$3$i11;
          } else {
           $395 = ((($354)) + 20|0);
           HEAP32[$395>>2] = $R$3$i11;
          }
          $396 = ($R$3$i11|0)==(0|0);
          if ($396) {
           break;
          }
         }
         $397 = HEAP32[(3144)>>2]|0;
         $398 = ($R$3$i11>>>0)<($397>>>0);
         if ($398) {
          _abort();
          // unreachable;
         }
         $399 = ((($R$3$i11)) + 24|0);
         HEAP32[$399>>2] = $354;
         $400 = ((($v$4$lcssa$i)) + 16|0);
         $401 = HEAP32[$400>>2]|0;
         $402 = ($401|0)==(0|0);
         do {
          if (!($402)) {
           $403 = ($401>>>0)<($397>>>0);
           if ($403) {
            _abort();
            // unreachable;
           } else {
            $404 = ((($R$3$i11)) + 16|0);
            HEAP32[$404>>2] = $401;
            $405 = ((($401)) + 24|0);
            HEAP32[$405>>2] = $R$3$i11;
            break;
           }
          }
         } while(0);
         $406 = ((($v$4$lcssa$i)) + 20|0);
         $407 = HEAP32[$406>>2]|0;
         $408 = ($407|0)==(0|0);
         if (!($408)) {
          $409 = HEAP32[(3144)>>2]|0;
          $410 = ($407>>>0)<($409>>>0);
          if ($410) {
           _abort();
           // unreachable;
          } else {
           $411 = ((($R$3$i11)) + 20|0);
           HEAP32[$411>>2] = $407;
           $412 = ((($407)) + 24|0);
           HEAP32[$412>>2] = $R$3$i11;
           break;
          }
         }
        }
       } while(0);
       $413 = ($rsize$4$lcssa$i>>>0)<(16);
       do {
        if ($413) {
         $414 = (($rsize$4$lcssa$i) + ($248))|0;
         $415 = $414 | 3;
         $416 = ((($v$4$lcssa$i)) + 4|0);
         HEAP32[$416>>2] = $415;
         $417 = (($v$4$lcssa$i) + ($414)|0);
         $418 = ((($417)) + 4|0);
         $419 = HEAP32[$418>>2]|0;
         $420 = $419 | 1;
         HEAP32[$418>>2] = $420;
        } else {
         $421 = $248 | 3;
         $422 = ((($v$4$lcssa$i)) + 4|0);
         HEAP32[$422>>2] = $421;
         $423 = $rsize$4$lcssa$i | 1;
         $424 = ((($351)) + 4|0);
         HEAP32[$424>>2] = $423;
         $425 = (($351) + ($rsize$4$lcssa$i)|0);
         HEAP32[$425>>2] = $rsize$4$lcssa$i;
         $426 = $rsize$4$lcssa$i >>> 3;
         $427 = ($rsize$4$lcssa$i>>>0)<(256);
         if ($427) {
          $428 = $426 << 1;
          $429 = (3168 + ($428<<2)|0);
          $430 = HEAP32[782]|0;
          $431 = 1 << $426;
          $432 = $430 & $431;
          $433 = ($432|0)==(0);
          if ($433) {
           $434 = $430 | $431;
           HEAP32[782] = $434;
           $$pre$i13 = ((($429)) + 8|0);
           $$pre$phi$i14Z2D = $$pre$i13;$F5$0$i = $429;
          } else {
           $435 = ((($429)) + 8|0);
           $436 = HEAP32[$435>>2]|0;
           $437 = HEAP32[(3144)>>2]|0;
           $438 = ($436>>>0)<($437>>>0);
           if ($438) {
            _abort();
            // unreachable;
           } else {
            $$pre$phi$i14Z2D = $435;$F5$0$i = $436;
           }
          }
          HEAP32[$$pre$phi$i14Z2D>>2] = $351;
          $439 = ((($F5$0$i)) + 12|0);
          HEAP32[$439>>2] = $351;
          $440 = ((($351)) + 8|0);
          HEAP32[$440>>2] = $F5$0$i;
          $441 = ((($351)) + 12|0);
          HEAP32[$441>>2] = $429;
          break;
         }
         $442 = $rsize$4$lcssa$i >>> 8;
         $443 = ($442|0)==(0);
         if ($443) {
          $I7$0$i = 0;
         } else {
          $444 = ($rsize$4$lcssa$i>>>0)>(16777215);
          if ($444) {
           $I7$0$i = 31;
          } else {
           $445 = (($442) + 1048320)|0;
           $446 = $445 >>> 16;
           $447 = $446 & 8;
           $448 = $442 << $447;
           $449 = (($448) + 520192)|0;
           $450 = $449 >>> 16;
           $451 = $450 & 4;
           $452 = $451 | $447;
           $453 = $448 << $451;
           $454 = (($453) + 245760)|0;
           $455 = $454 >>> 16;
           $456 = $455 & 2;
           $457 = $452 | $456;
           $458 = (14 - ($457))|0;
           $459 = $453 << $456;
           $460 = $459 >>> 15;
           $461 = (($458) + ($460))|0;
           $462 = $461 << 1;
           $463 = (($461) + 7)|0;
           $464 = $rsize$4$lcssa$i >>> $463;
           $465 = $464 & 1;
           $466 = $465 | $462;
           $I7$0$i = $466;
          }
         }
         $467 = (3432 + ($I7$0$i<<2)|0);
         $468 = ((($351)) + 28|0);
         HEAP32[$468>>2] = $I7$0$i;
         $469 = ((($351)) + 16|0);
         $470 = ((($469)) + 4|0);
         HEAP32[$470>>2] = 0;
         HEAP32[$469>>2] = 0;
         $471 = HEAP32[(3132)>>2]|0;
         $472 = 1 << $I7$0$i;
         $473 = $471 & $472;
         $474 = ($473|0)==(0);
         if ($474) {
          $475 = $471 | $472;
          HEAP32[(3132)>>2] = $475;
          HEAP32[$467>>2] = $351;
          $476 = ((($351)) + 24|0);
          HEAP32[$476>>2] = $467;
          $477 = ((($351)) + 12|0);
          HEAP32[$477>>2] = $351;
          $478 = ((($351)) + 8|0);
          HEAP32[$478>>2] = $351;
          break;
         }
         $479 = HEAP32[$467>>2]|0;
         $480 = ($I7$0$i|0)==(31);
         $481 = $I7$0$i >>> 1;
         $482 = (25 - ($481))|0;
         $483 = $480 ? 0 : $482;
         $484 = $rsize$4$lcssa$i << $483;
         $K12$0$i = $484;$T$0$i = $479;
         while(1) {
          $485 = ((($T$0$i)) + 4|0);
          $486 = HEAP32[$485>>2]|0;
          $487 = $486 & -8;
          $488 = ($487|0)==($rsize$4$lcssa$i|0);
          if ($488) {
           $T$0$i$lcssa = $T$0$i;
           label = 148;
           break;
          }
          $489 = $K12$0$i >>> 31;
          $490 = (((($T$0$i)) + 16|0) + ($489<<2)|0);
          $491 = $K12$0$i << 1;
          $492 = HEAP32[$490>>2]|0;
          $493 = ($492|0)==(0|0);
          if ($493) {
           $$lcssa157 = $490;$T$0$i$lcssa156 = $T$0$i;
           label = 145;
           break;
          } else {
           $K12$0$i = $491;$T$0$i = $492;
          }
         }
         if ((label|0) == 145) {
          $494 = HEAP32[(3144)>>2]|0;
          $495 = ($$lcssa157>>>0)<($494>>>0);
          if ($495) {
           _abort();
           // unreachable;
          } else {
           HEAP32[$$lcssa157>>2] = $351;
           $496 = ((($351)) + 24|0);
           HEAP32[$496>>2] = $T$0$i$lcssa156;
           $497 = ((($351)) + 12|0);
           HEAP32[$497>>2] = $351;
           $498 = ((($351)) + 8|0);
           HEAP32[$498>>2] = $351;
           break;
          }
         }
         else if ((label|0) == 148) {
          $499 = ((($T$0$i$lcssa)) + 8|0);
          $500 = HEAP32[$499>>2]|0;
          $501 = HEAP32[(3144)>>2]|0;
          $502 = ($500>>>0)>=($501>>>0);
          $not$7$i = ($T$0$i$lcssa>>>0)>=($501>>>0);
          $503 = $502 & $not$7$i;
          if ($503) {
           $504 = ((($500)) + 12|0);
           HEAP32[$504>>2] = $351;
           HEAP32[$499>>2] = $351;
           $505 = ((($351)) + 8|0);
           HEAP32[$505>>2] = $500;
           $506 = ((($351)) + 12|0);
           HEAP32[$506>>2] = $T$0$i$lcssa;
           $507 = ((($351)) + 24|0);
           HEAP32[$507>>2] = 0;
           break;
          } else {
           _abort();
           // unreachable;
          }
         }
        }
       } while(0);
       $508 = ((($v$4$lcssa$i)) + 8|0);
       $$0 = $508;
       return ($$0|0);
      } else {
       $nb$0 = $248;
      }
     }
    }
   }
  }
 } while(0);
 $509 = HEAP32[(3136)>>2]|0;
 $510 = ($509>>>0)<($nb$0>>>0);
 if (!($510)) {
  $511 = (($509) - ($nb$0))|0;
  $512 = HEAP32[(3148)>>2]|0;
  $513 = ($511>>>0)>(15);
  if ($513) {
   $514 = (($512) + ($nb$0)|0);
   HEAP32[(3148)>>2] = $514;
   HEAP32[(3136)>>2] = $511;
   $515 = $511 | 1;
   $516 = ((($514)) + 4|0);
   HEAP32[$516>>2] = $515;
   $517 = (($514) + ($511)|0);
   HEAP32[$517>>2] = $511;
   $518 = $nb$0 | 3;
   $519 = ((($512)) + 4|0);
   HEAP32[$519>>2] = $518;
  } else {
   HEAP32[(3136)>>2] = 0;
   HEAP32[(3148)>>2] = 0;
   $520 = $509 | 3;
   $521 = ((($512)) + 4|0);
   HEAP32[$521>>2] = $520;
   $522 = (($512) + ($509)|0);
   $523 = ((($522)) + 4|0);
   $524 = HEAP32[$523>>2]|0;
   $525 = $524 | 1;
   HEAP32[$523>>2] = $525;
  }
  $526 = ((($512)) + 8|0);
  $$0 = $526;
  return ($$0|0);
 }
 $527 = HEAP32[(3140)>>2]|0;
 $528 = ($527>>>0)>($nb$0>>>0);
 if ($528) {
  $529 = (($527) - ($nb$0))|0;
  HEAP32[(3140)>>2] = $529;
  $530 = HEAP32[(3152)>>2]|0;
  $531 = (($530) + ($nb$0)|0);
  HEAP32[(3152)>>2] = $531;
  $532 = $529 | 1;
  $533 = ((($531)) + 4|0);
  HEAP32[$533>>2] = $532;
  $534 = $nb$0 | 3;
  $535 = ((($530)) + 4|0);
  HEAP32[$535>>2] = $534;
  $536 = ((($530)) + 8|0);
  $$0 = $536;
  return ($$0|0);
 }
 $537 = HEAP32[900]|0;
 $538 = ($537|0)==(0);
 do {
  if ($538) {
   $539 = (_sysconf(30)|0);
   $540 = (($539) + -1)|0;
   $541 = $540 & $539;
   $542 = ($541|0)==(0);
   if ($542) {
    HEAP32[(3608)>>2] = $539;
    HEAP32[(3604)>>2] = $539;
    HEAP32[(3612)>>2] = -1;
    HEAP32[(3616)>>2] = -1;
    HEAP32[(3620)>>2] = 0;
    HEAP32[(3572)>>2] = 0;
    $543 = (_time((0|0))|0);
    $544 = $543 & -16;
    $545 = $544 ^ 1431655768;
    HEAP32[900] = $545;
    break;
   } else {
    _abort();
    // unreachable;
   }
  }
 } while(0);
 $546 = (($nb$0) + 48)|0;
 $547 = HEAP32[(3608)>>2]|0;
 $548 = (($nb$0) + 47)|0;
 $549 = (($547) + ($548))|0;
 $550 = (0 - ($547))|0;
 $551 = $549 & $550;
 $552 = ($551>>>0)>($nb$0>>>0);
 if (!($552)) {
  $$0 = 0;
  return ($$0|0);
 }
 $553 = HEAP32[(3568)>>2]|0;
 $554 = ($553|0)==(0);
 if (!($554)) {
  $555 = HEAP32[(3560)>>2]|0;
  $556 = (($555) + ($551))|0;
  $557 = ($556>>>0)<=($555>>>0);
  $558 = ($556>>>0)>($553>>>0);
  $or$cond1$i16 = $557 | $558;
  if ($or$cond1$i16) {
   $$0 = 0;
   return ($$0|0);
  }
 }
 $559 = HEAP32[(3572)>>2]|0;
 $560 = $559 & 4;
 $561 = ($560|0)==(0);
 L257: do {
  if ($561) {
   $562 = HEAP32[(3152)>>2]|0;
   $563 = ($562|0)==(0|0);
   L259: do {
    if ($563) {
     label = 173;
    } else {
     $sp$0$i$i = (3576);
     while(1) {
      $564 = HEAP32[$sp$0$i$i>>2]|0;
      $565 = ($564>>>0)>($562>>>0);
      if (!($565)) {
       $566 = ((($sp$0$i$i)) + 4|0);
       $567 = HEAP32[$566>>2]|0;
       $568 = (($564) + ($567)|0);
       $569 = ($568>>>0)>($562>>>0);
       if ($569) {
        $$lcssa153 = $sp$0$i$i;$$lcssa155 = $566;
        break;
       }
      }
      $570 = ((($sp$0$i$i)) + 8|0);
      $571 = HEAP32[$570>>2]|0;
      $572 = ($571|0)==(0|0);
      if ($572) {
       label = 173;
       break L259;
      } else {
       $sp$0$i$i = $571;
      }
     }
     $595 = HEAP32[(3140)>>2]|0;
     $596 = (($549) - ($595))|0;
     $597 = $596 & $550;
     $598 = ($597>>>0)<(2147483647);
     if ($598) {
      $599 = (_sbrk(($597|0))|0);
      $600 = HEAP32[$$lcssa153>>2]|0;
      $601 = HEAP32[$$lcssa155>>2]|0;
      $602 = (($600) + ($601)|0);
      $603 = ($599|0)==($602|0);
      if ($603) {
       $604 = ($599|0)==((-1)|0);
       if (!($604)) {
        $tbase$746$i = $599;$tsize$745$i = $597;
        label = 193;
        break L257;
       }
      } else {
       $br$2$ph$i = $599;$ssize$2$ph$i = $597;
       label = 183;
      }
     }
    }
   } while(0);
   do {
    if ((label|0) == 173) {
     $573 = (_sbrk(0)|0);
     $574 = ($573|0)==((-1)|0);
     if (!($574)) {
      $575 = $573;
      $576 = HEAP32[(3604)>>2]|0;
      $577 = (($576) + -1)|0;
      $578 = $577 & $575;
      $579 = ($578|0)==(0);
      if ($579) {
       $ssize$0$i = $551;
      } else {
       $580 = (($577) + ($575))|0;
       $581 = (0 - ($576))|0;
       $582 = $580 & $581;
       $583 = (($551) - ($575))|0;
       $584 = (($583) + ($582))|0;
       $ssize$0$i = $584;
      }
      $585 = HEAP32[(3560)>>2]|0;
      $586 = (($585) + ($ssize$0$i))|0;
      $587 = ($ssize$0$i>>>0)>($nb$0>>>0);
      $588 = ($ssize$0$i>>>0)<(2147483647);
      $or$cond$i17 = $587 & $588;
      if ($or$cond$i17) {
       $589 = HEAP32[(3568)>>2]|0;
       $590 = ($589|0)==(0);
       if (!($590)) {
        $591 = ($586>>>0)<=($585>>>0);
        $592 = ($586>>>0)>($589>>>0);
        $or$cond2$i = $591 | $592;
        if ($or$cond2$i) {
         break;
        }
       }
       $593 = (_sbrk(($ssize$0$i|0))|0);
       $594 = ($593|0)==($573|0);
       if ($594) {
        $tbase$746$i = $573;$tsize$745$i = $ssize$0$i;
        label = 193;
        break L257;
       } else {
        $br$2$ph$i = $593;$ssize$2$ph$i = $ssize$0$i;
        label = 183;
       }
      }
     }
    }
   } while(0);
   L279: do {
    if ((label|0) == 183) {
     $605 = (0 - ($ssize$2$ph$i))|0;
     $606 = ($br$2$ph$i|0)!=((-1)|0);
     $607 = ($ssize$2$ph$i>>>0)<(2147483647);
     $or$cond7$i = $607 & $606;
     $608 = ($546>>>0)>($ssize$2$ph$i>>>0);
     $or$cond8$i = $608 & $or$cond7$i;
     do {
      if ($or$cond8$i) {
       $609 = HEAP32[(3608)>>2]|0;
       $610 = (($548) - ($ssize$2$ph$i))|0;
       $611 = (($610) + ($609))|0;
       $612 = (0 - ($609))|0;
       $613 = $611 & $612;
       $614 = ($613>>>0)<(2147483647);
       if ($614) {
        $615 = (_sbrk(($613|0))|0);
        $616 = ($615|0)==((-1)|0);
        if ($616) {
         (_sbrk(($605|0))|0);
         break L279;
        } else {
         $617 = (($613) + ($ssize$2$ph$i))|0;
         $ssize$5$i = $617;
         break;
        }
       } else {
        $ssize$5$i = $ssize$2$ph$i;
       }
      } else {
       $ssize$5$i = $ssize$2$ph$i;
      }
     } while(0);
     $618 = ($br$2$ph$i|0)==((-1)|0);
     if (!($618)) {
      $tbase$746$i = $br$2$ph$i;$tsize$745$i = $ssize$5$i;
      label = 193;
      break L257;
     }
    }
   } while(0);
   $619 = HEAP32[(3572)>>2]|0;
   $620 = $619 | 4;
   HEAP32[(3572)>>2] = $620;
   label = 190;
  } else {
   label = 190;
  }
 } while(0);
 if ((label|0) == 190) {
  $621 = ($551>>>0)<(2147483647);
  if ($621) {
   $622 = (_sbrk(($551|0))|0);
   $623 = (_sbrk(0)|0);
   $624 = ($622|0)!=((-1)|0);
   $625 = ($623|0)!=((-1)|0);
   $or$cond5$i = $624 & $625;
   $626 = ($622>>>0)<($623>>>0);
   $or$cond10$i = $626 & $or$cond5$i;
   if ($or$cond10$i) {
    $627 = $623;
    $628 = $622;
    $629 = (($627) - ($628))|0;
    $630 = (($nb$0) + 40)|0;
    $$not$i = ($629>>>0)>($630>>>0);
    if ($$not$i) {
     $tbase$746$i = $622;$tsize$745$i = $629;
     label = 193;
    }
   }
  }
 }
 if ((label|0) == 193) {
  $631 = HEAP32[(3560)>>2]|0;
  $632 = (($631) + ($tsize$745$i))|0;
  HEAP32[(3560)>>2] = $632;
  $633 = HEAP32[(3564)>>2]|0;
  $634 = ($632>>>0)>($633>>>0);
  if ($634) {
   HEAP32[(3564)>>2] = $632;
  }
  $635 = HEAP32[(3152)>>2]|0;
  $636 = ($635|0)==(0|0);
  do {
   if ($636) {
    $637 = HEAP32[(3144)>>2]|0;
    $638 = ($637|0)==(0|0);
    $639 = ($tbase$746$i>>>0)<($637>>>0);
    $or$cond11$i = $638 | $639;
    if ($or$cond11$i) {
     HEAP32[(3144)>>2] = $tbase$746$i;
    }
    HEAP32[(3576)>>2] = $tbase$746$i;
    HEAP32[(3580)>>2] = $tsize$745$i;
    HEAP32[(3588)>>2] = 0;
    $640 = HEAP32[900]|0;
    HEAP32[(3164)>>2] = $640;
    HEAP32[(3160)>>2] = -1;
    $i$01$i$i = 0;
    while(1) {
     $641 = $i$01$i$i << 1;
     $642 = (3168 + ($641<<2)|0);
     $643 = ((($642)) + 12|0);
     HEAP32[$643>>2] = $642;
     $644 = ((($642)) + 8|0);
     HEAP32[$644>>2] = $642;
     $645 = (($i$01$i$i) + 1)|0;
     $exitcond$i$i = ($645|0)==(32);
     if ($exitcond$i$i) {
      break;
     } else {
      $i$01$i$i = $645;
     }
    }
    $646 = (($tsize$745$i) + -40)|0;
    $647 = ((($tbase$746$i)) + 8|0);
    $648 = $647;
    $649 = $648 & 7;
    $650 = ($649|0)==(0);
    $651 = (0 - ($648))|0;
    $652 = $651 & 7;
    $653 = $650 ? 0 : $652;
    $654 = (($tbase$746$i) + ($653)|0);
    $655 = (($646) - ($653))|0;
    HEAP32[(3152)>>2] = $654;
    HEAP32[(3140)>>2] = $655;
    $656 = $655 | 1;
    $657 = ((($654)) + 4|0);
    HEAP32[$657>>2] = $656;
    $658 = (($654) + ($655)|0);
    $659 = ((($658)) + 4|0);
    HEAP32[$659>>2] = 40;
    $660 = HEAP32[(3616)>>2]|0;
    HEAP32[(3156)>>2] = $660;
   } else {
    $sp$068$i = (3576);
    while(1) {
     $661 = HEAP32[$sp$068$i>>2]|0;
     $662 = ((($sp$068$i)) + 4|0);
     $663 = HEAP32[$662>>2]|0;
     $664 = (($661) + ($663)|0);
     $665 = ($tbase$746$i|0)==($664|0);
     if ($665) {
      $$lcssa147 = $661;$$lcssa149 = $662;$$lcssa151 = $663;$sp$068$i$lcssa = $sp$068$i;
      label = 203;
      break;
     }
     $666 = ((($sp$068$i)) + 8|0);
     $667 = HEAP32[$666>>2]|0;
     $668 = ($667|0)==(0|0);
     if ($668) {
      break;
     } else {
      $sp$068$i = $667;
     }
    }
    if ((label|0) == 203) {
     $669 = ((($sp$068$i$lcssa)) + 12|0);
     $670 = HEAP32[$669>>2]|0;
     $671 = $670 & 8;
     $672 = ($671|0)==(0);
     if ($672) {
      $673 = ($635>>>0)>=($$lcssa147>>>0);
      $674 = ($635>>>0)<($tbase$746$i>>>0);
      $or$cond48$i = $674 & $673;
      if ($or$cond48$i) {
       $675 = (($$lcssa151) + ($tsize$745$i))|0;
       HEAP32[$$lcssa149>>2] = $675;
       $676 = HEAP32[(3140)>>2]|0;
       $677 = ((($635)) + 8|0);
       $678 = $677;
       $679 = $678 & 7;
       $680 = ($679|0)==(0);
       $681 = (0 - ($678))|0;
       $682 = $681 & 7;
       $683 = $680 ? 0 : $682;
       $684 = (($635) + ($683)|0);
       $685 = (($tsize$745$i) - ($683))|0;
       $686 = (($685) + ($676))|0;
       HEAP32[(3152)>>2] = $684;
       HEAP32[(3140)>>2] = $686;
       $687 = $686 | 1;
       $688 = ((($684)) + 4|0);
       HEAP32[$688>>2] = $687;
       $689 = (($684) + ($686)|0);
       $690 = ((($689)) + 4|0);
       HEAP32[$690>>2] = 40;
       $691 = HEAP32[(3616)>>2]|0;
       HEAP32[(3156)>>2] = $691;
       break;
      }
     }
    }
    $692 = HEAP32[(3144)>>2]|0;
    $693 = ($tbase$746$i>>>0)<($692>>>0);
    if ($693) {
     HEAP32[(3144)>>2] = $tbase$746$i;
     $757 = $tbase$746$i;
    } else {
     $757 = $692;
    }
    $694 = (($tbase$746$i) + ($tsize$745$i)|0);
    $sp$167$i = (3576);
    while(1) {
     $695 = HEAP32[$sp$167$i>>2]|0;
     $696 = ($695|0)==($694|0);
     if ($696) {
      $$lcssa144 = $sp$167$i;$sp$167$i$lcssa = $sp$167$i;
      label = 211;
      break;
     }
     $697 = ((($sp$167$i)) + 8|0);
     $698 = HEAP32[$697>>2]|0;
     $699 = ($698|0)==(0|0);
     if ($699) {
      $sp$0$i$i$i = (3576);
      break;
     } else {
      $sp$167$i = $698;
     }
    }
    if ((label|0) == 211) {
     $700 = ((($sp$167$i$lcssa)) + 12|0);
     $701 = HEAP32[$700>>2]|0;
     $702 = $701 & 8;
     $703 = ($702|0)==(0);
     if ($703) {
      HEAP32[$$lcssa144>>2] = $tbase$746$i;
      $704 = ((($sp$167$i$lcssa)) + 4|0);
      $705 = HEAP32[$704>>2]|0;
      $706 = (($705) + ($tsize$745$i))|0;
      HEAP32[$704>>2] = $706;
      $707 = ((($tbase$746$i)) + 8|0);
      $708 = $707;
      $709 = $708 & 7;
      $710 = ($709|0)==(0);
      $711 = (0 - ($708))|0;
      $712 = $711 & 7;
      $713 = $710 ? 0 : $712;
      $714 = (($tbase$746$i) + ($713)|0);
      $715 = ((($694)) + 8|0);
      $716 = $715;
      $717 = $716 & 7;
      $718 = ($717|0)==(0);
      $719 = (0 - ($716))|0;
      $720 = $719 & 7;
      $721 = $718 ? 0 : $720;
      $722 = (($694) + ($721)|0);
      $723 = $722;
      $724 = $714;
      $725 = (($723) - ($724))|0;
      $726 = (($714) + ($nb$0)|0);
      $727 = (($725) - ($nb$0))|0;
      $728 = $nb$0 | 3;
      $729 = ((($714)) + 4|0);
      HEAP32[$729>>2] = $728;
      $730 = ($722|0)==($635|0);
      do {
       if ($730) {
        $731 = HEAP32[(3140)>>2]|0;
        $732 = (($731) + ($727))|0;
        HEAP32[(3140)>>2] = $732;
        HEAP32[(3152)>>2] = $726;
        $733 = $732 | 1;
        $734 = ((($726)) + 4|0);
        HEAP32[$734>>2] = $733;
       } else {
        $735 = HEAP32[(3148)>>2]|0;
        $736 = ($722|0)==($735|0);
        if ($736) {
         $737 = HEAP32[(3136)>>2]|0;
         $738 = (($737) + ($727))|0;
         HEAP32[(3136)>>2] = $738;
         HEAP32[(3148)>>2] = $726;
         $739 = $738 | 1;
         $740 = ((($726)) + 4|0);
         HEAP32[$740>>2] = $739;
         $741 = (($726) + ($738)|0);
         HEAP32[$741>>2] = $738;
         break;
        }
        $742 = ((($722)) + 4|0);
        $743 = HEAP32[$742>>2]|0;
        $744 = $743 & 3;
        $745 = ($744|0)==(1);
        if ($745) {
         $746 = $743 & -8;
         $747 = $743 >>> 3;
         $748 = ($743>>>0)<(256);
         L331: do {
          if ($748) {
           $749 = ((($722)) + 8|0);
           $750 = HEAP32[$749>>2]|0;
           $751 = ((($722)) + 12|0);
           $752 = HEAP32[$751>>2]|0;
           $753 = $747 << 1;
           $754 = (3168 + ($753<<2)|0);
           $755 = ($750|0)==($754|0);
           do {
            if (!($755)) {
             $756 = ($750>>>0)<($757>>>0);
             if ($756) {
              _abort();
              // unreachable;
             }
             $758 = ((($750)) + 12|0);
             $759 = HEAP32[$758>>2]|0;
             $760 = ($759|0)==($722|0);
             if ($760) {
              break;
             }
             _abort();
             // unreachable;
            }
           } while(0);
           $761 = ($752|0)==($750|0);
           if ($761) {
            $762 = 1 << $747;
            $763 = $762 ^ -1;
            $764 = HEAP32[782]|0;
            $765 = $764 & $763;
            HEAP32[782] = $765;
            break;
           }
           $766 = ($752|0)==($754|0);
           do {
            if ($766) {
             $$pre9$i$i = ((($752)) + 8|0);
             $$pre$phi10$i$iZ2D = $$pre9$i$i;
            } else {
             $767 = ($752>>>0)<($757>>>0);
             if ($767) {
              _abort();
              // unreachable;
             }
             $768 = ((($752)) + 8|0);
             $769 = HEAP32[$768>>2]|0;
             $770 = ($769|0)==($722|0);
             if ($770) {
              $$pre$phi10$i$iZ2D = $768;
              break;
             }
             _abort();
             // unreachable;
            }
           } while(0);
           $771 = ((($750)) + 12|0);
           HEAP32[$771>>2] = $752;
           HEAP32[$$pre$phi10$i$iZ2D>>2] = $750;
          } else {
           $772 = ((($722)) + 24|0);
           $773 = HEAP32[$772>>2]|0;
           $774 = ((($722)) + 12|0);
           $775 = HEAP32[$774>>2]|0;
           $776 = ($775|0)==($722|0);
           do {
            if ($776) {
             $786 = ((($722)) + 16|0);
             $787 = ((($786)) + 4|0);
             $788 = HEAP32[$787>>2]|0;
             $789 = ($788|0)==(0|0);
             if ($789) {
              $790 = HEAP32[$786>>2]|0;
              $791 = ($790|0)==(0|0);
              if ($791) {
               $R$3$i$i = 0;
               break;
              } else {
               $R$1$i$i = $790;$RP$1$i$i = $786;
              }
             } else {
              $R$1$i$i = $788;$RP$1$i$i = $787;
             }
             while(1) {
              $792 = ((($R$1$i$i)) + 20|0);
              $793 = HEAP32[$792>>2]|0;
              $794 = ($793|0)==(0|0);
              if (!($794)) {
               $R$1$i$i = $793;$RP$1$i$i = $792;
               continue;
              }
              $795 = ((($R$1$i$i)) + 16|0);
              $796 = HEAP32[$795>>2]|0;
              $797 = ($796|0)==(0|0);
              if ($797) {
               $R$1$i$i$lcssa = $R$1$i$i;$RP$1$i$i$lcssa = $RP$1$i$i;
               break;
              } else {
               $R$1$i$i = $796;$RP$1$i$i = $795;
              }
             }
             $798 = ($RP$1$i$i$lcssa>>>0)<($757>>>0);
             if ($798) {
              _abort();
              // unreachable;
             } else {
              HEAP32[$RP$1$i$i$lcssa>>2] = 0;
              $R$3$i$i = $R$1$i$i$lcssa;
              break;
             }
            } else {
             $777 = ((($722)) + 8|0);
             $778 = HEAP32[$777>>2]|0;
             $779 = ($778>>>0)<($757>>>0);
             if ($779) {
              _abort();
              // unreachable;
             }
             $780 = ((($778)) + 12|0);
             $781 = HEAP32[$780>>2]|0;
             $782 = ($781|0)==($722|0);
             if (!($782)) {
              _abort();
              // unreachable;
             }
             $783 = ((($775)) + 8|0);
             $784 = HEAP32[$783>>2]|0;
             $785 = ($784|0)==($722|0);
             if ($785) {
              HEAP32[$780>>2] = $775;
              HEAP32[$783>>2] = $778;
              $R$3$i$i = $775;
              break;
             } else {
              _abort();
              // unreachable;
             }
            }
           } while(0);
           $799 = ($773|0)==(0|0);
           if ($799) {
            break;
           }
           $800 = ((($722)) + 28|0);
           $801 = HEAP32[$800>>2]|0;
           $802 = (3432 + ($801<<2)|0);
           $803 = HEAP32[$802>>2]|0;
           $804 = ($722|0)==($803|0);
           do {
            if ($804) {
             HEAP32[$802>>2] = $R$3$i$i;
             $cond$i$i = ($R$3$i$i|0)==(0|0);
             if (!($cond$i$i)) {
              break;
             }
             $805 = 1 << $801;
             $806 = $805 ^ -1;
             $807 = HEAP32[(3132)>>2]|0;
             $808 = $807 & $806;
             HEAP32[(3132)>>2] = $808;
             break L331;
            } else {
             $809 = HEAP32[(3144)>>2]|0;
             $810 = ($773>>>0)<($809>>>0);
             if ($810) {
              _abort();
              // unreachable;
             }
             $811 = ((($773)) + 16|0);
             $812 = HEAP32[$811>>2]|0;
             $813 = ($812|0)==($722|0);
             if ($813) {
              HEAP32[$811>>2] = $R$3$i$i;
             } else {
              $814 = ((($773)) + 20|0);
              HEAP32[$814>>2] = $R$3$i$i;
             }
             $815 = ($R$3$i$i|0)==(0|0);
             if ($815) {
              break L331;
             }
            }
           } while(0);
           $816 = HEAP32[(3144)>>2]|0;
           $817 = ($R$3$i$i>>>0)<($816>>>0);
           if ($817) {
            _abort();
            // unreachable;
           }
           $818 = ((($R$3$i$i)) + 24|0);
           HEAP32[$818>>2] = $773;
           $819 = ((($722)) + 16|0);
           $820 = HEAP32[$819>>2]|0;
           $821 = ($820|0)==(0|0);
           do {
            if (!($821)) {
             $822 = ($820>>>0)<($816>>>0);
             if ($822) {
              _abort();
              // unreachable;
             } else {
              $823 = ((($R$3$i$i)) + 16|0);
              HEAP32[$823>>2] = $820;
              $824 = ((($820)) + 24|0);
              HEAP32[$824>>2] = $R$3$i$i;
              break;
             }
            }
           } while(0);
           $825 = ((($819)) + 4|0);
           $826 = HEAP32[$825>>2]|0;
           $827 = ($826|0)==(0|0);
           if ($827) {
            break;
           }
           $828 = HEAP32[(3144)>>2]|0;
           $829 = ($826>>>0)<($828>>>0);
           if ($829) {
            _abort();
            // unreachable;
           } else {
            $830 = ((($R$3$i$i)) + 20|0);
            HEAP32[$830>>2] = $826;
            $831 = ((($826)) + 24|0);
            HEAP32[$831>>2] = $R$3$i$i;
            break;
           }
          }
         } while(0);
         $832 = (($722) + ($746)|0);
         $833 = (($746) + ($727))|0;
         $oldfirst$0$i$i = $832;$qsize$0$i$i = $833;
        } else {
         $oldfirst$0$i$i = $722;$qsize$0$i$i = $727;
        }
        $834 = ((($oldfirst$0$i$i)) + 4|0);
        $835 = HEAP32[$834>>2]|0;
        $836 = $835 & -2;
        HEAP32[$834>>2] = $836;
        $837 = $qsize$0$i$i | 1;
        $838 = ((($726)) + 4|0);
        HEAP32[$838>>2] = $837;
        $839 = (($726) + ($qsize$0$i$i)|0);
        HEAP32[$839>>2] = $qsize$0$i$i;
        $840 = $qsize$0$i$i >>> 3;
        $841 = ($qsize$0$i$i>>>0)<(256);
        if ($841) {
         $842 = $840 << 1;
         $843 = (3168 + ($842<<2)|0);
         $844 = HEAP32[782]|0;
         $845 = 1 << $840;
         $846 = $844 & $845;
         $847 = ($846|0)==(0);
         do {
          if ($847) {
           $848 = $844 | $845;
           HEAP32[782] = $848;
           $$pre$i16$i = ((($843)) + 8|0);
           $$pre$phi$i17$iZ2D = $$pre$i16$i;$F4$0$i$i = $843;
          } else {
           $849 = ((($843)) + 8|0);
           $850 = HEAP32[$849>>2]|0;
           $851 = HEAP32[(3144)>>2]|0;
           $852 = ($850>>>0)<($851>>>0);
           if (!($852)) {
            $$pre$phi$i17$iZ2D = $849;$F4$0$i$i = $850;
            break;
           }
           _abort();
           // unreachable;
          }
         } while(0);
         HEAP32[$$pre$phi$i17$iZ2D>>2] = $726;
         $853 = ((($F4$0$i$i)) + 12|0);
         HEAP32[$853>>2] = $726;
         $854 = ((($726)) + 8|0);
         HEAP32[$854>>2] = $F4$0$i$i;
         $855 = ((($726)) + 12|0);
         HEAP32[$855>>2] = $843;
         break;
        }
        $856 = $qsize$0$i$i >>> 8;
        $857 = ($856|0)==(0);
        do {
         if ($857) {
          $I7$0$i$i = 0;
         } else {
          $858 = ($qsize$0$i$i>>>0)>(16777215);
          if ($858) {
           $I7$0$i$i = 31;
           break;
          }
          $859 = (($856) + 1048320)|0;
          $860 = $859 >>> 16;
          $861 = $860 & 8;
          $862 = $856 << $861;
          $863 = (($862) + 520192)|0;
          $864 = $863 >>> 16;
          $865 = $864 & 4;
          $866 = $865 | $861;
          $867 = $862 << $865;
          $868 = (($867) + 245760)|0;
          $869 = $868 >>> 16;
          $870 = $869 & 2;
          $871 = $866 | $870;
          $872 = (14 - ($871))|0;
          $873 = $867 << $870;
          $874 = $873 >>> 15;
          $875 = (($872) + ($874))|0;
          $876 = $875 << 1;
          $877 = (($875) + 7)|0;
          $878 = $qsize$0$i$i >>> $877;
          $879 = $878 & 1;
          $880 = $879 | $876;
          $I7$0$i$i = $880;
         }
        } while(0);
        $881 = (3432 + ($I7$0$i$i<<2)|0);
        $882 = ((($726)) + 28|0);
        HEAP32[$882>>2] = $I7$0$i$i;
        $883 = ((($726)) + 16|0);
        $884 = ((($883)) + 4|0);
        HEAP32[$884>>2] = 0;
        HEAP32[$883>>2] = 0;
        $885 = HEAP32[(3132)>>2]|0;
        $886 = 1 << $I7$0$i$i;
        $887 = $885 & $886;
        $888 = ($887|0)==(0);
        if ($888) {
         $889 = $885 | $886;
         HEAP32[(3132)>>2] = $889;
         HEAP32[$881>>2] = $726;
         $890 = ((($726)) + 24|0);
         HEAP32[$890>>2] = $881;
         $891 = ((($726)) + 12|0);
         HEAP32[$891>>2] = $726;
         $892 = ((($726)) + 8|0);
         HEAP32[$892>>2] = $726;
         break;
        }
        $893 = HEAP32[$881>>2]|0;
        $894 = ($I7$0$i$i|0)==(31);
        $895 = $I7$0$i$i >>> 1;
        $896 = (25 - ($895))|0;
        $897 = $894 ? 0 : $896;
        $898 = $qsize$0$i$i << $897;
        $K8$0$i$i = $898;$T$0$i18$i = $893;
        while(1) {
         $899 = ((($T$0$i18$i)) + 4|0);
         $900 = HEAP32[$899>>2]|0;
         $901 = $900 & -8;
         $902 = ($901|0)==($qsize$0$i$i|0);
         if ($902) {
          $T$0$i18$i$lcssa = $T$0$i18$i;
          label = 281;
          break;
         }
         $903 = $K8$0$i$i >>> 31;
         $904 = (((($T$0$i18$i)) + 16|0) + ($903<<2)|0);
         $905 = $K8$0$i$i << 1;
         $906 = HEAP32[$904>>2]|0;
         $907 = ($906|0)==(0|0);
         if ($907) {
          $$lcssa = $904;$T$0$i18$i$lcssa139 = $T$0$i18$i;
          label = 278;
          break;
         } else {
          $K8$0$i$i = $905;$T$0$i18$i = $906;
         }
        }
        if ((label|0) == 278) {
         $908 = HEAP32[(3144)>>2]|0;
         $909 = ($$lcssa>>>0)<($908>>>0);
         if ($909) {
          _abort();
          // unreachable;
         } else {
          HEAP32[$$lcssa>>2] = $726;
          $910 = ((($726)) + 24|0);
          HEAP32[$910>>2] = $T$0$i18$i$lcssa139;
          $911 = ((($726)) + 12|0);
          HEAP32[$911>>2] = $726;
          $912 = ((($726)) + 8|0);
          HEAP32[$912>>2] = $726;
          break;
         }
        }
        else if ((label|0) == 281) {
         $913 = ((($T$0$i18$i$lcssa)) + 8|0);
         $914 = HEAP32[$913>>2]|0;
         $915 = HEAP32[(3144)>>2]|0;
         $916 = ($914>>>0)>=($915>>>0);
         $not$$i20$i = ($T$0$i18$i$lcssa>>>0)>=($915>>>0);
         $917 = $916 & $not$$i20$i;
         if ($917) {
          $918 = ((($914)) + 12|0);
          HEAP32[$918>>2] = $726;
          HEAP32[$913>>2] = $726;
          $919 = ((($726)) + 8|0);
          HEAP32[$919>>2] = $914;
          $920 = ((($726)) + 12|0);
          HEAP32[$920>>2] = $T$0$i18$i$lcssa;
          $921 = ((($726)) + 24|0);
          HEAP32[$921>>2] = 0;
          break;
         } else {
          _abort();
          // unreachable;
         }
        }
       }
      } while(0);
      $1052 = ((($714)) + 8|0);
      $$0 = $1052;
      return ($$0|0);
     } else {
      $sp$0$i$i$i = (3576);
     }
    }
    while(1) {
     $922 = HEAP32[$sp$0$i$i$i>>2]|0;
     $923 = ($922>>>0)>($635>>>0);
     if (!($923)) {
      $924 = ((($sp$0$i$i$i)) + 4|0);
      $925 = HEAP32[$924>>2]|0;
      $926 = (($922) + ($925)|0);
      $927 = ($926>>>0)>($635>>>0);
      if ($927) {
       $$lcssa142 = $926;
       break;
      }
     }
     $928 = ((($sp$0$i$i$i)) + 8|0);
     $929 = HEAP32[$928>>2]|0;
     $sp$0$i$i$i = $929;
    }
    $930 = ((($$lcssa142)) + -47|0);
    $931 = ((($930)) + 8|0);
    $932 = $931;
    $933 = $932 & 7;
    $934 = ($933|0)==(0);
    $935 = (0 - ($932))|0;
    $936 = $935 & 7;
    $937 = $934 ? 0 : $936;
    $938 = (($930) + ($937)|0);
    $939 = ((($635)) + 16|0);
    $940 = ($938>>>0)<($939>>>0);
    $941 = $940 ? $635 : $938;
    $942 = ((($941)) + 8|0);
    $943 = ((($941)) + 24|0);
    $944 = (($tsize$745$i) + -40)|0;
    $945 = ((($tbase$746$i)) + 8|0);
    $946 = $945;
    $947 = $946 & 7;
    $948 = ($947|0)==(0);
    $949 = (0 - ($946))|0;
    $950 = $949 & 7;
    $951 = $948 ? 0 : $950;
    $952 = (($tbase$746$i) + ($951)|0);
    $953 = (($944) - ($951))|0;
    HEAP32[(3152)>>2] = $952;
    HEAP32[(3140)>>2] = $953;
    $954 = $953 | 1;
    $955 = ((($952)) + 4|0);
    HEAP32[$955>>2] = $954;
    $956 = (($952) + ($953)|0);
    $957 = ((($956)) + 4|0);
    HEAP32[$957>>2] = 40;
    $958 = HEAP32[(3616)>>2]|0;
    HEAP32[(3156)>>2] = $958;
    $959 = ((($941)) + 4|0);
    HEAP32[$959>>2] = 27;
    ;HEAP32[$942>>2]=HEAP32[(3576)>>2]|0;HEAP32[$942+4>>2]=HEAP32[(3576)+4>>2]|0;HEAP32[$942+8>>2]=HEAP32[(3576)+8>>2]|0;HEAP32[$942+12>>2]=HEAP32[(3576)+12>>2]|0;
    HEAP32[(3576)>>2] = $tbase$746$i;
    HEAP32[(3580)>>2] = $tsize$745$i;
    HEAP32[(3588)>>2] = 0;
    HEAP32[(3584)>>2] = $942;
    $p$0$i$i = $943;
    while(1) {
     $960 = ((($p$0$i$i)) + 4|0);
     HEAP32[$960>>2] = 7;
     $961 = ((($960)) + 4|0);
     $962 = ($961>>>0)<($$lcssa142>>>0);
     if ($962) {
      $p$0$i$i = $960;
     } else {
      break;
     }
    }
    $963 = ($941|0)==($635|0);
    if (!($963)) {
     $964 = $941;
     $965 = $635;
     $966 = (($964) - ($965))|0;
     $967 = HEAP32[$959>>2]|0;
     $968 = $967 & -2;
     HEAP32[$959>>2] = $968;
     $969 = $966 | 1;
     $970 = ((($635)) + 4|0);
     HEAP32[$970>>2] = $969;
     HEAP32[$941>>2] = $966;
     $971 = $966 >>> 3;
     $972 = ($966>>>0)<(256);
     if ($972) {
      $973 = $971 << 1;
      $974 = (3168 + ($973<<2)|0);
      $975 = HEAP32[782]|0;
      $976 = 1 << $971;
      $977 = $975 & $976;
      $978 = ($977|0)==(0);
      if ($978) {
       $979 = $975 | $976;
       HEAP32[782] = $979;
       $$pre$i$i = ((($974)) + 8|0);
       $$pre$phi$i$iZ2D = $$pre$i$i;$F$0$i$i = $974;
      } else {
       $980 = ((($974)) + 8|0);
       $981 = HEAP32[$980>>2]|0;
       $982 = HEAP32[(3144)>>2]|0;
       $983 = ($981>>>0)<($982>>>0);
       if ($983) {
        _abort();
        // unreachable;
       } else {
        $$pre$phi$i$iZ2D = $980;$F$0$i$i = $981;
       }
      }
      HEAP32[$$pre$phi$i$iZ2D>>2] = $635;
      $984 = ((($F$0$i$i)) + 12|0);
      HEAP32[$984>>2] = $635;
      $985 = ((($635)) + 8|0);
      HEAP32[$985>>2] = $F$0$i$i;
      $986 = ((($635)) + 12|0);
      HEAP32[$986>>2] = $974;
      break;
     }
     $987 = $966 >>> 8;
     $988 = ($987|0)==(0);
     if ($988) {
      $I1$0$i$i = 0;
     } else {
      $989 = ($966>>>0)>(16777215);
      if ($989) {
       $I1$0$i$i = 31;
      } else {
       $990 = (($987) + 1048320)|0;
       $991 = $990 >>> 16;
       $992 = $991 & 8;
       $993 = $987 << $992;
       $994 = (($993) + 520192)|0;
       $995 = $994 >>> 16;
       $996 = $995 & 4;
       $997 = $996 | $992;
       $998 = $993 << $996;
       $999 = (($998) + 245760)|0;
       $1000 = $999 >>> 16;
       $1001 = $1000 & 2;
       $1002 = $997 | $1001;
       $1003 = (14 - ($1002))|0;
       $1004 = $998 << $1001;
       $1005 = $1004 >>> 15;
       $1006 = (($1003) + ($1005))|0;
       $1007 = $1006 << 1;
       $1008 = (($1006) + 7)|0;
       $1009 = $966 >>> $1008;
       $1010 = $1009 & 1;
       $1011 = $1010 | $1007;
       $I1$0$i$i = $1011;
      }
     }
     $1012 = (3432 + ($I1$0$i$i<<2)|0);
     $1013 = ((($635)) + 28|0);
     HEAP32[$1013>>2] = $I1$0$i$i;
     $1014 = ((($635)) + 20|0);
     HEAP32[$1014>>2] = 0;
     HEAP32[$939>>2] = 0;
     $1015 = HEAP32[(3132)>>2]|0;
     $1016 = 1 << $I1$0$i$i;
     $1017 = $1015 & $1016;
     $1018 = ($1017|0)==(0);
     if ($1018) {
      $1019 = $1015 | $1016;
      HEAP32[(3132)>>2] = $1019;
      HEAP32[$1012>>2] = $635;
      $1020 = ((($635)) + 24|0);
      HEAP32[$1020>>2] = $1012;
      $1021 = ((($635)) + 12|0);
      HEAP32[$1021>>2] = $635;
      $1022 = ((($635)) + 8|0);
      HEAP32[$1022>>2] = $635;
      break;
     }
     $1023 = HEAP32[$1012>>2]|0;
     $1024 = ($I1$0$i$i|0)==(31);
     $1025 = $I1$0$i$i >>> 1;
     $1026 = (25 - ($1025))|0;
     $1027 = $1024 ? 0 : $1026;
     $1028 = $966 << $1027;
     $K2$0$i$i = $1028;$T$0$i$i = $1023;
     while(1) {
      $1029 = ((($T$0$i$i)) + 4|0);
      $1030 = HEAP32[$1029>>2]|0;
      $1031 = $1030 & -8;
      $1032 = ($1031|0)==($966|0);
      if ($1032) {
       $T$0$i$i$lcssa = $T$0$i$i;
       label = 307;
       break;
      }
      $1033 = $K2$0$i$i >>> 31;
      $1034 = (((($T$0$i$i)) + 16|0) + ($1033<<2)|0);
      $1035 = $K2$0$i$i << 1;
      $1036 = HEAP32[$1034>>2]|0;
      $1037 = ($1036|0)==(0|0);
      if ($1037) {
       $$lcssa141 = $1034;$T$0$i$i$lcssa140 = $T$0$i$i;
       label = 304;
       break;
      } else {
       $K2$0$i$i = $1035;$T$0$i$i = $1036;
      }
     }
     if ((label|0) == 304) {
      $1038 = HEAP32[(3144)>>2]|0;
      $1039 = ($$lcssa141>>>0)<($1038>>>0);
      if ($1039) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$$lcssa141>>2] = $635;
       $1040 = ((($635)) + 24|0);
       HEAP32[$1040>>2] = $T$0$i$i$lcssa140;
       $1041 = ((($635)) + 12|0);
       HEAP32[$1041>>2] = $635;
       $1042 = ((($635)) + 8|0);
       HEAP32[$1042>>2] = $635;
       break;
      }
     }
     else if ((label|0) == 307) {
      $1043 = ((($T$0$i$i$lcssa)) + 8|0);
      $1044 = HEAP32[$1043>>2]|0;
      $1045 = HEAP32[(3144)>>2]|0;
      $1046 = ($1044>>>0)>=($1045>>>0);
      $not$$i$i = ($T$0$i$i$lcssa>>>0)>=($1045>>>0);
      $1047 = $1046 & $not$$i$i;
      if ($1047) {
       $1048 = ((($1044)) + 12|0);
       HEAP32[$1048>>2] = $635;
       HEAP32[$1043>>2] = $635;
       $1049 = ((($635)) + 8|0);
       HEAP32[$1049>>2] = $1044;
       $1050 = ((($635)) + 12|0);
       HEAP32[$1050>>2] = $T$0$i$i$lcssa;
       $1051 = ((($635)) + 24|0);
       HEAP32[$1051>>2] = 0;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    }
   }
  } while(0);
  $1053 = HEAP32[(3140)>>2]|0;
  $1054 = ($1053>>>0)>($nb$0>>>0);
  if ($1054) {
   $1055 = (($1053) - ($nb$0))|0;
   HEAP32[(3140)>>2] = $1055;
   $1056 = HEAP32[(3152)>>2]|0;
   $1057 = (($1056) + ($nb$0)|0);
   HEAP32[(3152)>>2] = $1057;
   $1058 = $1055 | 1;
   $1059 = ((($1057)) + 4|0);
   HEAP32[$1059>>2] = $1058;
   $1060 = $nb$0 | 3;
   $1061 = ((($1056)) + 4|0);
   HEAP32[$1061>>2] = $1060;
   $1062 = ((($1056)) + 8|0);
   $$0 = $1062;
   return ($$0|0);
  }
 }
 $1063 = (___errno_location()|0);
 HEAP32[$1063>>2] = 12;
 $$0 = 0;
 return ($$0|0);
}
function _free($mem) {
 $mem = $mem|0;
 var $$lcssa = 0, $$pre = 0, $$pre$phi41Z2D = 0, $$pre$phi43Z2D = 0, $$pre$phiZ2D = 0, $$pre40 = 0, $$pre42 = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0;
 var $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0;
 var $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0;
 var $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0;
 var $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0;
 var $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0;
 var $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0;
 var $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0;
 var $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0;
 var $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0;
 var $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0;
 var $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0;
 var $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0;
 var $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0;
 var $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0;
 var $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0;
 var $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $F18$0 = 0, $I20$0 = 0, $K21$0 = 0, $R$1 = 0, $R$1$lcssa = 0, $R$3 = 0, $R8$1 = 0, $R8$1$lcssa = 0, $R8$3 = 0, $RP$1 = 0, $RP$1$lcssa = 0, $RP10$1 = 0, $RP10$1$lcssa = 0;
 var $T$0 = 0, $T$0$lcssa = 0, $T$0$lcssa48 = 0, $cond20 = 0, $cond21 = 0, $not$ = 0, $p$1 = 0, $psize$1 = 0, $psize$2 = 0, $sp$0$i = 0, $sp$0$in$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($mem|0)==(0|0);
 if ($0) {
  return;
 }
 $1 = ((($mem)) + -8|0);
 $2 = HEAP32[(3144)>>2]|0;
 $3 = ($1>>>0)<($2>>>0);
 if ($3) {
  _abort();
  // unreachable;
 }
 $4 = ((($mem)) + -4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = $5 & 3;
 $7 = ($6|0)==(1);
 if ($7) {
  _abort();
  // unreachable;
 }
 $8 = $5 & -8;
 $9 = (($1) + ($8)|0);
 $10 = $5 & 1;
 $11 = ($10|0)==(0);
 do {
  if ($11) {
   $12 = HEAP32[$1>>2]|0;
   $13 = ($6|0)==(0);
   if ($13) {
    return;
   }
   $14 = (0 - ($12))|0;
   $15 = (($1) + ($14)|0);
   $16 = (($12) + ($8))|0;
   $17 = ($15>>>0)<($2>>>0);
   if ($17) {
    _abort();
    // unreachable;
   }
   $18 = HEAP32[(3148)>>2]|0;
   $19 = ($15|0)==($18|0);
   if ($19) {
    $104 = ((($9)) + 4|0);
    $105 = HEAP32[$104>>2]|0;
    $106 = $105 & 3;
    $107 = ($106|0)==(3);
    if (!($107)) {
     $p$1 = $15;$psize$1 = $16;
     break;
    }
    HEAP32[(3136)>>2] = $16;
    $108 = $105 & -2;
    HEAP32[$104>>2] = $108;
    $109 = $16 | 1;
    $110 = ((($15)) + 4|0);
    HEAP32[$110>>2] = $109;
    $111 = (($15) + ($16)|0);
    HEAP32[$111>>2] = $16;
    return;
   }
   $20 = $12 >>> 3;
   $21 = ($12>>>0)<(256);
   if ($21) {
    $22 = ((($15)) + 8|0);
    $23 = HEAP32[$22>>2]|0;
    $24 = ((($15)) + 12|0);
    $25 = HEAP32[$24>>2]|0;
    $26 = $20 << 1;
    $27 = (3168 + ($26<<2)|0);
    $28 = ($23|0)==($27|0);
    if (!($28)) {
     $29 = ($23>>>0)<($2>>>0);
     if ($29) {
      _abort();
      // unreachable;
     }
     $30 = ((($23)) + 12|0);
     $31 = HEAP32[$30>>2]|0;
     $32 = ($31|0)==($15|0);
     if (!($32)) {
      _abort();
      // unreachable;
     }
    }
    $33 = ($25|0)==($23|0);
    if ($33) {
     $34 = 1 << $20;
     $35 = $34 ^ -1;
     $36 = HEAP32[782]|0;
     $37 = $36 & $35;
     HEAP32[782] = $37;
     $p$1 = $15;$psize$1 = $16;
     break;
    }
    $38 = ($25|0)==($27|0);
    if ($38) {
     $$pre42 = ((($25)) + 8|0);
     $$pre$phi43Z2D = $$pre42;
    } else {
     $39 = ($25>>>0)<($2>>>0);
     if ($39) {
      _abort();
      // unreachable;
     }
     $40 = ((($25)) + 8|0);
     $41 = HEAP32[$40>>2]|0;
     $42 = ($41|0)==($15|0);
     if ($42) {
      $$pre$phi43Z2D = $40;
     } else {
      _abort();
      // unreachable;
     }
    }
    $43 = ((($23)) + 12|0);
    HEAP32[$43>>2] = $25;
    HEAP32[$$pre$phi43Z2D>>2] = $23;
    $p$1 = $15;$psize$1 = $16;
    break;
   }
   $44 = ((($15)) + 24|0);
   $45 = HEAP32[$44>>2]|0;
   $46 = ((($15)) + 12|0);
   $47 = HEAP32[$46>>2]|0;
   $48 = ($47|0)==($15|0);
   do {
    if ($48) {
     $58 = ((($15)) + 16|0);
     $59 = ((($58)) + 4|0);
     $60 = HEAP32[$59>>2]|0;
     $61 = ($60|0)==(0|0);
     if ($61) {
      $62 = HEAP32[$58>>2]|0;
      $63 = ($62|0)==(0|0);
      if ($63) {
       $R$3 = 0;
       break;
      } else {
       $R$1 = $62;$RP$1 = $58;
      }
     } else {
      $R$1 = $60;$RP$1 = $59;
     }
     while(1) {
      $64 = ((($R$1)) + 20|0);
      $65 = HEAP32[$64>>2]|0;
      $66 = ($65|0)==(0|0);
      if (!($66)) {
       $R$1 = $65;$RP$1 = $64;
       continue;
      }
      $67 = ((($R$1)) + 16|0);
      $68 = HEAP32[$67>>2]|0;
      $69 = ($68|0)==(0|0);
      if ($69) {
       $R$1$lcssa = $R$1;$RP$1$lcssa = $RP$1;
       break;
      } else {
       $R$1 = $68;$RP$1 = $67;
      }
     }
     $70 = ($RP$1$lcssa>>>0)<($2>>>0);
     if ($70) {
      _abort();
      // unreachable;
     } else {
      HEAP32[$RP$1$lcssa>>2] = 0;
      $R$3 = $R$1$lcssa;
      break;
     }
    } else {
     $49 = ((($15)) + 8|0);
     $50 = HEAP32[$49>>2]|0;
     $51 = ($50>>>0)<($2>>>0);
     if ($51) {
      _abort();
      // unreachable;
     }
     $52 = ((($50)) + 12|0);
     $53 = HEAP32[$52>>2]|0;
     $54 = ($53|0)==($15|0);
     if (!($54)) {
      _abort();
      // unreachable;
     }
     $55 = ((($47)) + 8|0);
     $56 = HEAP32[$55>>2]|0;
     $57 = ($56|0)==($15|0);
     if ($57) {
      HEAP32[$52>>2] = $47;
      HEAP32[$55>>2] = $50;
      $R$3 = $47;
      break;
     } else {
      _abort();
      // unreachable;
     }
    }
   } while(0);
   $71 = ($45|0)==(0|0);
   if ($71) {
    $p$1 = $15;$psize$1 = $16;
   } else {
    $72 = ((($15)) + 28|0);
    $73 = HEAP32[$72>>2]|0;
    $74 = (3432 + ($73<<2)|0);
    $75 = HEAP32[$74>>2]|0;
    $76 = ($15|0)==($75|0);
    if ($76) {
     HEAP32[$74>>2] = $R$3;
     $cond20 = ($R$3|0)==(0|0);
     if ($cond20) {
      $77 = 1 << $73;
      $78 = $77 ^ -1;
      $79 = HEAP32[(3132)>>2]|0;
      $80 = $79 & $78;
      HEAP32[(3132)>>2] = $80;
      $p$1 = $15;$psize$1 = $16;
      break;
     }
    } else {
     $81 = HEAP32[(3144)>>2]|0;
     $82 = ($45>>>0)<($81>>>0);
     if ($82) {
      _abort();
      // unreachable;
     }
     $83 = ((($45)) + 16|0);
     $84 = HEAP32[$83>>2]|0;
     $85 = ($84|0)==($15|0);
     if ($85) {
      HEAP32[$83>>2] = $R$3;
     } else {
      $86 = ((($45)) + 20|0);
      HEAP32[$86>>2] = $R$3;
     }
     $87 = ($R$3|0)==(0|0);
     if ($87) {
      $p$1 = $15;$psize$1 = $16;
      break;
     }
    }
    $88 = HEAP32[(3144)>>2]|0;
    $89 = ($R$3>>>0)<($88>>>0);
    if ($89) {
     _abort();
     // unreachable;
    }
    $90 = ((($R$3)) + 24|0);
    HEAP32[$90>>2] = $45;
    $91 = ((($15)) + 16|0);
    $92 = HEAP32[$91>>2]|0;
    $93 = ($92|0)==(0|0);
    do {
     if (!($93)) {
      $94 = ($92>>>0)<($88>>>0);
      if ($94) {
       _abort();
       // unreachable;
      } else {
       $95 = ((($R$3)) + 16|0);
       HEAP32[$95>>2] = $92;
       $96 = ((($92)) + 24|0);
       HEAP32[$96>>2] = $R$3;
       break;
      }
     }
    } while(0);
    $97 = ((($91)) + 4|0);
    $98 = HEAP32[$97>>2]|0;
    $99 = ($98|0)==(0|0);
    if ($99) {
     $p$1 = $15;$psize$1 = $16;
    } else {
     $100 = HEAP32[(3144)>>2]|0;
     $101 = ($98>>>0)<($100>>>0);
     if ($101) {
      _abort();
      // unreachable;
     } else {
      $102 = ((($R$3)) + 20|0);
      HEAP32[$102>>2] = $98;
      $103 = ((($98)) + 24|0);
      HEAP32[$103>>2] = $R$3;
      $p$1 = $15;$psize$1 = $16;
      break;
     }
    }
   }
  } else {
   $p$1 = $1;$psize$1 = $8;
  }
 } while(0);
 $112 = ($p$1>>>0)<($9>>>0);
 if (!($112)) {
  _abort();
  // unreachable;
 }
 $113 = ((($9)) + 4|0);
 $114 = HEAP32[$113>>2]|0;
 $115 = $114 & 1;
 $116 = ($115|0)==(0);
 if ($116) {
  _abort();
  // unreachable;
 }
 $117 = $114 & 2;
 $118 = ($117|0)==(0);
 if ($118) {
  $119 = HEAP32[(3152)>>2]|0;
  $120 = ($9|0)==($119|0);
  if ($120) {
   $121 = HEAP32[(3140)>>2]|0;
   $122 = (($121) + ($psize$1))|0;
   HEAP32[(3140)>>2] = $122;
   HEAP32[(3152)>>2] = $p$1;
   $123 = $122 | 1;
   $124 = ((($p$1)) + 4|0);
   HEAP32[$124>>2] = $123;
   $125 = HEAP32[(3148)>>2]|0;
   $126 = ($p$1|0)==($125|0);
   if (!($126)) {
    return;
   }
   HEAP32[(3148)>>2] = 0;
   HEAP32[(3136)>>2] = 0;
   return;
  }
  $127 = HEAP32[(3148)>>2]|0;
  $128 = ($9|0)==($127|0);
  if ($128) {
   $129 = HEAP32[(3136)>>2]|0;
   $130 = (($129) + ($psize$1))|0;
   HEAP32[(3136)>>2] = $130;
   HEAP32[(3148)>>2] = $p$1;
   $131 = $130 | 1;
   $132 = ((($p$1)) + 4|0);
   HEAP32[$132>>2] = $131;
   $133 = (($p$1) + ($130)|0);
   HEAP32[$133>>2] = $130;
   return;
  }
  $134 = $114 & -8;
  $135 = (($134) + ($psize$1))|0;
  $136 = $114 >>> 3;
  $137 = ($114>>>0)<(256);
  do {
   if ($137) {
    $138 = ((($9)) + 8|0);
    $139 = HEAP32[$138>>2]|0;
    $140 = ((($9)) + 12|0);
    $141 = HEAP32[$140>>2]|0;
    $142 = $136 << 1;
    $143 = (3168 + ($142<<2)|0);
    $144 = ($139|0)==($143|0);
    if (!($144)) {
     $145 = HEAP32[(3144)>>2]|0;
     $146 = ($139>>>0)<($145>>>0);
     if ($146) {
      _abort();
      // unreachable;
     }
     $147 = ((($139)) + 12|0);
     $148 = HEAP32[$147>>2]|0;
     $149 = ($148|0)==($9|0);
     if (!($149)) {
      _abort();
      // unreachable;
     }
    }
    $150 = ($141|0)==($139|0);
    if ($150) {
     $151 = 1 << $136;
     $152 = $151 ^ -1;
     $153 = HEAP32[782]|0;
     $154 = $153 & $152;
     HEAP32[782] = $154;
     break;
    }
    $155 = ($141|0)==($143|0);
    if ($155) {
     $$pre40 = ((($141)) + 8|0);
     $$pre$phi41Z2D = $$pre40;
    } else {
     $156 = HEAP32[(3144)>>2]|0;
     $157 = ($141>>>0)<($156>>>0);
     if ($157) {
      _abort();
      // unreachable;
     }
     $158 = ((($141)) + 8|0);
     $159 = HEAP32[$158>>2]|0;
     $160 = ($159|0)==($9|0);
     if ($160) {
      $$pre$phi41Z2D = $158;
     } else {
      _abort();
      // unreachable;
     }
    }
    $161 = ((($139)) + 12|0);
    HEAP32[$161>>2] = $141;
    HEAP32[$$pre$phi41Z2D>>2] = $139;
   } else {
    $162 = ((($9)) + 24|0);
    $163 = HEAP32[$162>>2]|0;
    $164 = ((($9)) + 12|0);
    $165 = HEAP32[$164>>2]|0;
    $166 = ($165|0)==($9|0);
    do {
     if ($166) {
      $177 = ((($9)) + 16|0);
      $178 = ((($177)) + 4|0);
      $179 = HEAP32[$178>>2]|0;
      $180 = ($179|0)==(0|0);
      if ($180) {
       $181 = HEAP32[$177>>2]|0;
       $182 = ($181|0)==(0|0);
       if ($182) {
        $R8$3 = 0;
        break;
       } else {
        $R8$1 = $181;$RP10$1 = $177;
       }
      } else {
       $R8$1 = $179;$RP10$1 = $178;
      }
      while(1) {
       $183 = ((($R8$1)) + 20|0);
       $184 = HEAP32[$183>>2]|0;
       $185 = ($184|0)==(0|0);
       if (!($185)) {
        $R8$1 = $184;$RP10$1 = $183;
        continue;
       }
       $186 = ((($R8$1)) + 16|0);
       $187 = HEAP32[$186>>2]|0;
       $188 = ($187|0)==(0|0);
       if ($188) {
        $R8$1$lcssa = $R8$1;$RP10$1$lcssa = $RP10$1;
        break;
       } else {
        $R8$1 = $187;$RP10$1 = $186;
       }
      }
      $189 = HEAP32[(3144)>>2]|0;
      $190 = ($RP10$1$lcssa>>>0)<($189>>>0);
      if ($190) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$RP10$1$lcssa>>2] = 0;
       $R8$3 = $R8$1$lcssa;
       break;
      }
     } else {
      $167 = ((($9)) + 8|0);
      $168 = HEAP32[$167>>2]|0;
      $169 = HEAP32[(3144)>>2]|0;
      $170 = ($168>>>0)<($169>>>0);
      if ($170) {
       _abort();
       // unreachable;
      }
      $171 = ((($168)) + 12|0);
      $172 = HEAP32[$171>>2]|0;
      $173 = ($172|0)==($9|0);
      if (!($173)) {
       _abort();
       // unreachable;
      }
      $174 = ((($165)) + 8|0);
      $175 = HEAP32[$174>>2]|0;
      $176 = ($175|0)==($9|0);
      if ($176) {
       HEAP32[$171>>2] = $165;
       HEAP32[$174>>2] = $168;
       $R8$3 = $165;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $191 = ($163|0)==(0|0);
    if (!($191)) {
     $192 = ((($9)) + 28|0);
     $193 = HEAP32[$192>>2]|0;
     $194 = (3432 + ($193<<2)|0);
     $195 = HEAP32[$194>>2]|0;
     $196 = ($9|0)==($195|0);
     if ($196) {
      HEAP32[$194>>2] = $R8$3;
      $cond21 = ($R8$3|0)==(0|0);
      if ($cond21) {
       $197 = 1 << $193;
       $198 = $197 ^ -1;
       $199 = HEAP32[(3132)>>2]|0;
       $200 = $199 & $198;
       HEAP32[(3132)>>2] = $200;
       break;
      }
     } else {
      $201 = HEAP32[(3144)>>2]|0;
      $202 = ($163>>>0)<($201>>>0);
      if ($202) {
       _abort();
       // unreachable;
      }
      $203 = ((($163)) + 16|0);
      $204 = HEAP32[$203>>2]|0;
      $205 = ($204|0)==($9|0);
      if ($205) {
       HEAP32[$203>>2] = $R8$3;
      } else {
       $206 = ((($163)) + 20|0);
       HEAP32[$206>>2] = $R8$3;
      }
      $207 = ($R8$3|0)==(0|0);
      if ($207) {
       break;
      }
     }
     $208 = HEAP32[(3144)>>2]|0;
     $209 = ($R8$3>>>0)<($208>>>0);
     if ($209) {
      _abort();
      // unreachable;
     }
     $210 = ((($R8$3)) + 24|0);
     HEAP32[$210>>2] = $163;
     $211 = ((($9)) + 16|0);
     $212 = HEAP32[$211>>2]|0;
     $213 = ($212|0)==(0|0);
     do {
      if (!($213)) {
       $214 = ($212>>>0)<($208>>>0);
       if ($214) {
        _abort();
        // unreachable;
       } else {
        $215 = ((($R8$3)) + 16|0);
        HEAP32[$215>>2] = $212;
        $216 = ((($212)) + 24|0);
        HEAP32[$216>>2] = $R8$3;
        break;
       }
      }
     } while(0);
     $217 = ((($211)) + 4|0);
     $218 = HEAP32[$217>>2]|0;
     $219 = ($218|0)==(0|0);
     if (!($219)) {
      $220 = HEAP32[(3144)>>2]|0;
      $221 = ($218>>>0)<($220>>>0);
      if ($221) {
       _abort();
       // unreachable;
      } else {
       $222 = ((($R8$3)) + 20|0);
       HEAP32[$222>>2] = $218;
       $223 = ((($218)) + 24|0);
       HEAP32[$223>>2] = $R8$3;
       break;
      }
     }
    }
   }
  } while(0);
  $224 = $135 | 1;
  $225 = ((($p$1)) + 4|0);
  HEAP32[$225>>2] = $224;
  $226 = (($p$1) + ($135)|0);
  HEAP32[$226>>2] = $135;
  $227 = HEAP32[(3148)>>2]|0;
  $228 = ($p$1|0)==($227|0);
  if ($228) {
   HEAP32[(3136)>>2] = $135;
   return;
  } else {
   $psize$2 = $135;
  }
 } else {
  $229 = $114 & -2;
  HEAP32[$113>>2] = $229;
  $230 = $psize$1 | 1;
  $231 = ((($p$1)) + 4|0);
  HEAP32[$231>>2] = $230;
  $232 = (($p$1) + ($psize$1)|0);
  HEAP32[$232>>2] = $psize$1;
  $psize$2 = $psize$1;
 }
 $233 = $psize$2 >>> 3;
 $234 = ($psize$2>>>0)<(256);
 if ($234) {
  $235 = $233 << 1;
  $236 = (3168 + ($235<<2)|0);
  $237 = HEAP32[782]|0;
  $238 = 1 << $233;
  $239 = $237 & $238;
  $240 = ($239|0)==(0);
  if ($240) {
   $241 = $237 | $238;
   HEAP32[782] = $241;
   $$pre = ((($236)) + 8|0);
   $$pre$phiZ2D = $$pre;$F18$0 = $236;
  } else {
   $242 = ((($236)) + 8|0);
   $243 = HEAP32[$242>>2]|0;
   $244 = HEAP32[(3144)>>2]|0;
   $245 = ($243>>>0)<($244>>>0);
   if ($245) {
    _abort();
    // unreachable;
   } else {
    $$pre$phiZ2D = $242;$F18$0 = $243;
   }
  }
  HEAP32[$$pre$phiZ2D>>2] = $p$1;
  $246 = ((($F18$0)) + 12|0);
  HEAP32[$246>>2] = $p$1;
  $247 = ((($p$1)) + 8|0);
  HEAP32[$247>>2] = $F18$0;
  $248 = ((($p$1)) + 12|0);
  HEAP32[$248>>2] = $236;
  return;
 }
 $249 = $psize$2 >>> 8;
 $250 = ($249|0)==(0);
 if ($250) {
  $I20$0 = 0;
 } else {
  $251 = ($psize$2>>>0)>(16777215);
  if ($251) {
   $I20$0 = 31;
  } else {
   $252 = (($249) + 1048320)|0;
   $253 = $252 >>> 16;
   $254 = $253 & 8;
   $255 = $249 << $254;
   $256 = (($255) + 520192)|0;
   $257 = $256 >>> 16;
   $258 = $257 & 4;
   $259 = $258 | $254;
   $260 = $255 << $258;
   $261 = (($260) + 245760)|0;
   $262 = $261 >>> 16;
   $263 = $262 & 2;
   $264 = $259 | $263;
   $265 = (14 - ($264))|0;
   $266 = $260 << $263;
   $267 = $266 >>> 15;
   $268 = (($265) + ($267))|0;
   $269 = $268 << 1;
   $270 = (($268) + 7)|0;
   $271 = $psize$2 >>> $270;
   $272 = $271 & 1;
   $273 = $272 | $269;
   $I20$0 = $273;
  }
 }
 $274 = (3432 + ($I20$0<<2)|0);
 $275 = ((($p$1)) + 28|0);
 HEAP32[$275>>2] = $I20$0;
 $276 = ((($p$1)) + 16|0);
 $277 = ((($p$1)) + 20|0);
 HEAP32[$277>>2] = 0;
 HEAP32[$276>>2] = 0;
 $278 = HEAP32[(3132)>>2]|0;
 $279 = 1 << $I20$0;
 $280 = $278 & $279;
 $281 = ($280|0)==(0);
 do {
  if ($281) {
   $282 = $278 | $279;
   HEAP32[(3132)>>2] = $282;
   HEAP32[$274>>2] = $p$1;
   $283 = ((($p$1)) + 24|0);
   HEAP32[$283>>2] = $274;
   $284 = ((($p$1)) + 12|0);
   HEAP32[$284>>2] = $p$1;
   $285 = ((($p$1)) + 8|0);
   HEAP32[$285>>2] = $p$1;
  } else {
   $286 = HEAP32[$274>>2]|0;
   $287 = ($I20$0|0)==(31);
   $288 = $I20$0 >>> 1;
   $289 = (25 - ($288))|0;
   $290 = $287 ? 0 : $289;
   $291 = $psize$2 << $290;
   $K21$0 = $291;$T$0 = $286;
   while(1) {
    $292 = ((($T$0)) + 4|0);
    $293 = HEAP32[$292>>2]|0;
    $294 = $293 & -8;
    $295 = ($294|0)==($psize$2|0);
    if ($295) {
     $T$0$lcssa = $T$0;
     label = 130;
     break;
    }
    $296 = $K21$0 >>> 31;
    $297 = (((($T$0)) + 16|0) + ($296<<2)|0);
    $298 = $K21$0 << 1;
    $299 = HEAP32[$297>>2]|0;
    $300 = ($299|0)==(0|0);
    if ($300) {
     $$lcssa = $297;$T$0$lcssa48 = $T$0;
     label = 127;
     break;
    } else {
     $K21$0 = $298;$T$0 = $299;
    }
   }
   if ((label|0) == 127) {
    $301 = HEAP32[(3144)>>2]|0;
    $302 = ($$lcssa>>>0)<($301>>>0);
    if ($302) {
     _abort();
     // unreachable;
    } else {
     HEAP32[$$lcssa>>2] = $p$1;
     $303 = ((($p$1)) + 24|0);
     HEAP32[$303>>2] = $T$0$lcssa48;
     $304 = ((($p$1)) + 12|0);
     HEAP32[$304>>2] = $p$1;
     $305 = ((($p$1)) + 8|0);
     HEAP32[$305>>2] = $p$1;
     break;
    }
   }
   else if ((label|0) == 130) {
    $306 = ((($T$0$lcssa)) + 8|0);
    $307 = HEAP32[$306>>2]|0;
    $308 = HEAP32[(3144)>>2]|0;
    $309 = ($307>>>0)>=($308>>>0);
    $not$ = ($T$0$lcssa>>>0)>=($308>>>0);
    $310 = $309 & $not$;
    if ($310) {
     $311 = ((($307)) + 12|0);
     HEAP32[$311>>2] = $p$1;
     HEAP32[$306>>2] = $p$1;
     $312 = ((($p$1)) + 8|0);
     HEAP32[$312>>2] = $307;
     $313 = ((($p$1)) + 12|0);
     HEAP32[$313>>2] = $T$0$lcssa;
     $314 = ((($p$1)) + 24|0);
     HEAP32[$314>>2] = 0;
     break;
    } else {
     _abort();
     // unreachable;
    }
   }
  }
 } while(0);
 $315 = HEAP32[(3160)>>2]|0;
 $316 = (($315) + -1)|0;
 HEAP32[(3160)>>2] = $316;
 $317 = ($316|0)==(0);
 if ($317) {
  $sp$0$in$i = (3584);
 } else {
  return;
 }
 while(1) {
  $sp$0$i = HEAP32[$sp$0$in$i>>2]|0;
  $318 = ($sp$0$i|0)==(0|0);
  $319 = ((($sp$0$i)) + 8|0);
  if ($318) {
   break;
  } else {
   $sp$0$in$i = $319;
  }
 }
 HEAP32[(3160)>>2] = -1;
 return;
}
function runPostSets() {
}
function _memcpy(dest, src, num) {
    dest = dest|0; src = src|0; num = num|0;
    var ret = 0;
    if ((num|0) >= 4096) return _emscripten_memcpy_big(dest|0, src|0, num|0)|0;
    ret = dest|0;
    if ((dest&3) == (src&3)) {
      while (dest & 3) {
        if ((num|0) == 0) return ret|0;
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        dest = (dest+1)|0;
        src = (src+1)|0;
        num = (num-1)|0;
      }
      while ((num|0) >= 4) {
        HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
        dest = (dest+4)|0;
        src = (src+4)|0;
        num = (num-4)|0;
      }
    }
    while ((num|0) > 0) {
      HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
      dest = (dest+1)|0;
      src = (src+1)|0;
      num = (num-1)|0;
    }
    return ret|0;
}
function _memset(ptr, value, num) {
    ptr = ptr|0; value = value|0; num = num|0;
    var stop = 0, value4 = 0, stop4 = 0, unaligned = 0;
    stop = (ptr + num)|0;
    if ((num|0) >= 20) {
      // This is unaligned, but quite large, so work hard to get to aligned settings
      value = value & 0xff;
      unaligned = ptr & 3;
      value4 = value | (value << 8) | (value << 16) | (value << 24);
      stop4 = stop & ~3;
      if (unaligned) {
        unaligned = (ptr + 4 - unaligned)|0;
        while ((ptr|0) < (unaligned|0)) { // no need to check for stop, since we have large num
          HEAP8[((ptr)>>0)]=value;
          ptr = (ptr+1)|0;
        }
      }
      while ((ptr|0) < (stop4|0)) {
        HEAP32[((ptr)>>2)]=value4;
        ptr = (ptr+4)|0;
      }
    }
    while ((ptr|0) < (stop|0)) {
      HEAP8[((ptr)>>0)]=value;
      ptr = (ptr+1)|0;
    }
    return (ptr-num)|0;
}


function dynCall_viiiii(index,a1,a2,a3,a4,a5) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0;
  FUNCTION_TABLE_viiiii[index&127](a1|0,a2|0,a3|0,a4|0,a5|0);
}


function dynCall_vd(index,a1) {
  index = index|0;
  a1=+a1;
  FUNCTION_TABLE_vd[index&255](+a1);
}


function dynCall_vid(index,a1,a2) {
  index = index|0;
  a1=a1|0; a2=+a2;
  FUNCTION_TABLE_vid[index&255](a1|0,+a2);
}


function dynCall_vi(index,a1) {
  index = index|0;
  a1=a1|0;
  FUNCTION_TABLE_vi[index&255](a1|0);
}


function dynCall_vii(index,a1,a2) {
  index = index|0;
  a1=a1|0; a2=a2|0;
  FUNCTION_TABLE_vii[index&255](a1|0,a2|0);
}


function dynCall_ii(index,a1) {
  index = index|0;
  a1=a1|0;
  return FUNCTION_TABLE_ii[index&255](a1|0)|0;
}


function dynCall_viddd(index,a1,a2,a3,a4) {
  index = index|0;
  a1=a1|0; a2=+a2; a3=+a3; a4=+a4;
  FUNCTION_TABLE_viddd[index&255](a1|0,+a2,+a3,+a4);
}


function dynCall_vidd(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=+a2; a3=+a3;
  FUNCTION_TABLE_vidd[index&255](a1|0,+a2,+a3);
}


function dynCall_iiii(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0;
  return FUNCTION_TABLE_iiii[index&255](a1|0,a2|0,a3|0)|0;
}


function dynCall_viiiiiiii(index,a1,a2,a3,a4,a5,a6,a7,a8) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0; a6=a6|0; a7=a7|0; a8=a8|0;
  FUNCTION_TABLE_viiiiiiii[index&255](a1|0,a2|0,a3|0,a4|0,a5|0,a6|0,a7|0,a8|0);
}


function dynCall_viiiiii(index,a1,a2,a3,a4,a5,a6) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0; a6=a6|0;
  FUNCTION_TABLE_viiiiii[index&127](a1|0,a2|0,a3|0,a4|0,a5|0,a6|0);
}


function dynCall_viii(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0;
  FUNCTION_TABLE_viii[index&255](a1|0,a2|0,a3|0);
}


function dynCall_vidddd(index,a1,a2,a3,a4,a5) {
  index = index|0;
  a1=a1|0; a2=+a2; a3=+a3; a4=+a4; a5=+a5;
  FUNCTION_TABLE_vidddd[index&255](a1|0,+a2,+a3,+a4,+a5);
}


function dynCall_vdi(index,a1,a2) {
  index = index|0;
  a1=+a1; a2=a2|0;
  FUNCTION_TABLE_vdi[index&255](+a1,a2|0);
}


function dynCall_viiiiiii(index,a1,a2,a3,a4,a5,a6,a7) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0; a6=a6|0; a7=a7|0;
  FUNCTION_TABLE_viiiiiii[index&127](a1|0,a2|0,a3|0,a4|0,a5|0,a6|0,a7|0);
}


function dynCall_viiiiiiiii(index,a1,a2,a3,a4,a5,a6,a7,a8,a9) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0; a6=a6|0; a7=a7|0; a8=a8|0; a9=a9|0;
  FUNCTION_TABLE_viiiiiiiii[index&15](a1|0,a2|0,a3|0,a4|0,a5|0,a6|0,a7|0,a8|0,a9|0);
}


function dynCall_iii(index,a1,a2) {
  index = index|0;
  a1=a1|0; a2=a2|0;
  return FUNCTION_TABLE_iii[index&127](a1|0,a2|0)|0;
}


function dynCall_i(index) {
  index = index|0;

  return FUNCTION_TABLE_i[index&127]()|0;
}


function dynCall_vdddddd(index,a1,a2,a3,a4,a5,a6) {
  index = index|0;
  a1=+a1; a2=+a2; a3=+a3; a4=+a4; a5=+a5; a6=+a6;
  FUNCTION_TABLE_vdddddd[index&127](+a1,+a2,+a3,+a4,+a5,+a6);
}


function dynCall_vdddd(index,a1,a2,a3,a4) {
  index = index|0;
  a1=+a1; a2=+a2; a3=+a3; a4=+a4;
  FUNCTION_TABLE_vdddd[index&255](+a1,+a2,+a3,+a4);
}


function dynCall_vdd(index,a1,a2) {
  index = index|0;
  a1=+a1; a2=+a2;
  FUNCTION_TABLE_vdd[index&255](+a1,+a2);
}


function dynCall_v(index) {
  index = index|0;

  FUNCTION_TABLE_v[index&127]();
}


function dynCall_viid(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=+a3;
  FUNCTION_TABLE_viid[index&255](a1|0,a2|0,+a3);
}


function dynCall_viiii(index,a1,a2,a3,a4) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0;
  FUNCTION_TABLE_viiii[index&255](a1|0,a2|0,a3|0,a4|0);
}

function b0(p0,p1,p2,p3,p4) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0; nullFunc_viiiii(0);
}
function _emscripten_glUniform4i__wrapper(p0,p1,p2,p3,p4) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0; _emscripten_glUniform4i(p0|0,p1|0,p2|0,p3|0,p4|0);
}
function _emscripten_glFramebufferTexture2D__wrapper(p0,p1,p2,p3,p4) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0; _emscripten_glFramebufferTexture2D(p0|0,p1|0,p2|0,p3|0,p4|0);
}
function _emscripten_glShaderBinary__wrapper(p0,p1,p2,p3,p4) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0; _emscripten_glShaderBinary(p0|0,p1|0,p2|0,p3|0,p4|0);
}
function _emscripten_glDrawElementsInstanced__wrapper(p0,p1,p2,p3,p4) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0; _emscripten_glDrawElementsInstanced(p0|0,p1|0,p2|0,p3|0,p4|0);
}
function b1(p0) {
 p0 = +p0; nullFunc_vd(1);
}
function _emscripten_glClearDepth__wrapper(p0) {
 p0 = +p0; _emscripten_glClearDepth(+p0);
}
function _emscripten_glClearDepthf__wrapper(p0) {
 p0 = +p0; _emscripten_glClearDepthf(+p0);
}
function _emscripten_glLineWidth__wrapper(p0) {
 p0 = +p0; _emscripten_glLineWidth(+p0);
}
function b2(p0,p1) {
 p0 = p0|0;p1 = +p1; nullFunc_vid(2);
}
function _emscripten_glUniform1f__wrapper(p0,p1) {
 p0 = p0|0;p1 = +p1; _emscripten_glUniform1f(p0|0,+p1);
}
function _emscripten_glVertexAttrib1f__wrapper(p0,p1) {
 p0 = p0|0;p1 = +p1; _emscripten_glVertexAttrib1f(p0|0,+p1);
}
function b3(p0) {
 p0 = p0|0; nullFunc_vi(3);
}
function _emscripten_glDeleteShader__wrapper(p0) {
 p0 = p0|0; _emscripten_glDeleteShader(p0|0);
}
function _emscripten_glCompileShader__wrapper(p0) {
 p0 = p0|0; _emscripten_glCompileShader(p0|0);
}
function _emscripten_glDeleteProgram__wrapper(p0) {
 p0 = p0|0; _emscripten_glDeleteProgram(p0|0);
}
function _emscripten_glLinkProgram__wrapper(p0) {
 p0 = p0|0; _emscripten_glLinkProgram(p0|0);
}
function _emscripten_glUseProgram__wrapper(p0) {
 p0 = p0|0; _emscripten_glUseProgram(p0|0);
}
function _emscripten_glValidateProgram__wrapper(p0) {
 p0 = p0|0; _emscripten_glValidateProgram(p0|0);
}
function _emscripten_glDeleteObjectARB__wrapper(p0) {
 p0 = p0|0; _emscripten_glDeleteObjectARB(p0|0);
}
function _emscripten_glEnableClientState__wrapper(p0) {
 p0 = p0|0; _emscripten_glEnableClientState(p0|0);
}
function _emscripten_glClientActiveTexture__wrapper(p0) {
 p0 = p0|0; _emscripten_glClientActiveTexture(p0|0);
}
function _emscripten_glBindVertexArray__wrapper(p0) {
 p0 = p0|0; _emscripten_glBindVertexArray(p0|0);
}
function _emscripten_glMatrixMode__wrapper(p0) {
 p0 = p0|0; _emscripten_glMatrixMode(p0|0);
}
function _emscripten_glLoadMatrixf__wrapper(p0) {
 p0 = p0|0; _emscripten_glLoadMatrixf(p0|0);
}
function _emscripten_glEnableVertexAttribArray__wrapper(p0) {
 p0 = p0|0; _emscripten_glEnableVertexAttribArray(p0|0);
}
function _emscripten_glDisableVertexAttribArray__wrapper(p0) {
 p0 = p0|0; _emscripten_glDisableVertexAttribArray(p0|0);
}
function _emscripten_glDepthFunc__wrapper(p0) {
 p0 = p0|0; _emscripten_glDepthFunc(p0|0);
}
function _emscripten_glEnable__wrapper(p0) {
 p0 = p0|0; _emscripten_glEnable(p0|0);
}
function _emscripten_glDisable__wrapper(p0) {
 p0 = p0|0; _emscripten_glDisable(p0|0);
}
function _emscripten_glFrontFace__wrapper(p0) {
 p0 = p0|0; _emscripten_glFrontFace(p0|0);
}
function _emscripten_glCullFace__wrapper(p0) {
 p0 = p0|0; _emscripten_glCullFace(p0|0);
}
function _emscripten_glClear__wrapper(p0) {
 p0 = p0|0; _emscripten_glClear(p0|0);
}
function _emscripten_glClearStencil__wrapper(p0) {
 p0 = p0|0; _emscripten_glClearStencil(p0|0);
}
function _emscripten_glDepthMask__wrapper(p0) {
 p0 = p0|0; _emscripten_glDepthMask(p0|0);
}
function _emscripten_glStencilMask__wrapper(p0) {
 p0 = p0|0; _emscripten_glStencilMask(p0|0);
}
function _emscripten_glGenerateMipmap__wrapper(p0) {
 p0 = p0|0; _emscripten_glGenerateMipmap(p0|0);
}
function _emscripten_glActiveTexture__wrapper(p0) {
 p0 = p0|0; _emscripten_glActiveTexture(p0|0);
}
function _emscripten_glBlendEquation__wrapper(p0) {
 p0 = p0|0; _emscripten_glBlendEquation(p0|0);
}
function b4(p0,p1) {
 p0 = p0|0;p1 = p1|0; nullFunc_vii(4);
}
function _emscripten_glPixelStorei__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glPixelStorei(p0|0,p1|0);
}
function _emscripten_glGetIntegerv__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glGetIntegerv(p0|0,p1|0);
}
function _emscripten_glGetFloatv__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glGetFloatv(p0|0,p1|0);
}
function _emscripten_glGetBooleanv__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glGetBooleanv(p0|0,p1|0);
}
function _emscripten_glGenTextures__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glGenTextures(p0|0,p1|0);
}
function _emscripten_glDeleteTextures__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glDeleteTextures(p0|0,p1|0);
}
function _emscripten_glBindTexture__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glBindTexture(p0|0,p1|0);
}
function _emscripten_glGenBuffers__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glGenBuffers(p0|0,p1|0);
}
function _emscripten_glDeleteBuffers__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glDeleteBuffers(p0|0,p1|0);
}
function _emscripten_glGenRenderbuffers__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glGenRenderbuffers(p0|0,p1|0);
}
function _emscripten_glDeleteRenderbuffers__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glDeleteRenderbuffers(p0|0,p1|0);
}
function _emscripten_glBindRenderbuffer__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glBindRenderbuffer(p0|0,p1|0);
}
function _emscripten_glUniform1i__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glUniform1i(p0|0,p1|0);
}
function _emscripten_glBindBuffer__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glBindBuffer(p0|0,p1|0);
}
function _emscripten_glVertexAttrib1fv__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glVertexAttrib1fv(p0|0,p1|0);
}
function _emscripten_glVertexAttrib2fv__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glVertexAttrib2fv(p0|0,p1|0);
}
function _emscripten_glVertexAttrib3fv__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glVertexAttrib3fv(p0|0,p1|0);
}
function _emscripten_glVertexAttrib4fv__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glVertexAttrib4fv(p0|0,p1|0);
}
function _emscripten_glAttachShader__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glAttachShader(p0|0,p1|0);
}
function _emscripten_glDetachShader__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glDetachShader(p0|0,p1|0);
}
function _emscripten_glBindFramebuffer__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glBindFramebuffer(p0|0,p1|0);
}
function _emscripten_glGenFramebuffers__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glGenFramebuffers(p0|0,p1|0);
}
function _emscripten_glDeleteFramebuffers__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glDeleteFramebuffers(p0|0,p1|0);
}
function _emscripten_glBindProgramARB__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glBindProgramARB(p0|0,p1|0);
}
function _emscripten_glGetPointerv__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glGetPointerv(p0|0,p1|0);
}
function _emscripten_glGenVertexArrays__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glGenVertexArrays(p0|0,p1|0);
}
function _emscripten_glDeleteVertexArrays__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glDeleteVertexArrays(p0|0,p1|0);
}
function _emscripten_glVertexAttribDivisor__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glVertexAttribDivisor(p0|0,p1|0);
}
function _emscripten_glBlendFunc__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glBlendFunc(p0|0,p1|0);
}
function _emscripten_glBlendEquationSeparate__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glBlendEquationSeparate(p0|0,p1|0);
}
function _emscripten_glStencilMaskSeparate__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glStencilMaskSeparate(p0|0,p1|0);
}
function _emscripten_glHint__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glHint(p0|0,p1|0);
}
function _emscripten_glDrawBuffers__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; _emscripten_glDrawBuffers(p0|0,p1|0);
}
function b5(p0) {
 p0 = p0|0; nullFunc_ii(5);return 0;
}
function _emscripten_glGetString__wrapper(p0) {
 p0 = p0|0; return _emscripten_glGetString(p0|0)|0;
}
function _emscripten_glIsTexture__wrapper(p0) {
 p0 = p0|0; return _emscripten_glIsTexture(p0|0)|0;
}
function _emscripten_glIsBuffer__wrapper(p0) {
 p0 = p0|0; return _emscripten_glIsBuffer(p0|0)|0;
}
function _emscripten_glIsRenderbuffer__wrapper(p0) {
 p0 = p0|0; return _emscripten_glIsRenderbuffer(p0|0)|0;
}
function _emscripten_glCreateShader__wrapper(p0) {
 p0 = p0|0; return _emscripten_glCreateShader(p0|0)|0;
}
function _emscripten_glIsShader__wrapper(p0) {
 p0 = p0|0; return _emscripten_glIsShader(p0|0)|0;
}
function _emscripten_glIsProgram__wrapper(p0) {
 p0 = p0|0; return _emscripten_glIsProgram(p0|0)|0;
}
function _emscripten_glIsFramebuffer__wrapper(p0) {
 p0 = p0|0; return _emscripten_glIsFramebuffer(p0|0)|0;
}
function _emscripten_glCheckFramebufferStatus__wrapper(p0) {
 p0 = p0|0; return _emscripten_glCheckFramebufferStatus(p0|0)|0;
}
function _emscripten_glIsEnabled__wrapper(p0) {
 p0 = p0|0; return _emscripten_glIsEnabled(p0|0)|0;
}
function b6(p0,p1,p2,p3) {
 p0 = p0|0;p1 = +p1;p2 = +p2;p3 = +p3; nullFunc_viddd(6);
}
function _emscripten_glUniform3f__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = +p1;p2 = +p2;p3 = +p3; _emscripten_glUniform3f(p0|0,+p1,+p2,+p3);
}
function _emscripten_glVertexAttrib3f__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = +p1;p2 = +p2;p3 = +p3; _emscripten_glVertexAttrib3f(p0|0,+p1,+p2,+p3);
}
function b7(p0,p1,p2) {
 p0 = p0|0;p1 = +p1;p2 = +p2; nullFunc_vidd(7);
}
function _emscripten_glUniform2f__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = +p1;p2 = +p2; _emscripten_glUniform2f(p0|0,+p1,+p2);
}
function _emscripten_glVertexAttrib2f__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = +p1;p2 = +p2; _emscripten_glVertexAttrib2f(p0|0,+p1,+p2);
}
function b8(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_iiii(8);return 0;
}
function b9(p0,p1,p2,p3,p4,p5,p6,p7) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0;p6 = p6|0;p7 = p7|0; nullFunc_viiiiiiii(9);
}
function _emscripten_glCompressedTexImage2D__wrapper(p0,p1,p2,p3,p4,p5,p6,p7) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0;p6 = p6|0;p7 = p7|0; _emscripten_glCompressedTexImage2D(p0|0,p1|0,p2|0,p3|0,p4|0,p5|0,p6|0,p7|0);
}
function _emscripten_glCopyTexImage2D__wrapper(p0,p1,p2,p3,p4,p5,p6,p7) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0;p6 = p6|0;p7 = p7|0; _emscripten_glCopyTexImage2D(p0|0,p1|0,p2|0,p3|0,p4|0,p5|0,p6|0,p7|0);
}
function _emscripten_glCopyTexSubImage2D__wrapper(p0,p1,p2,p3,p4,p5,p6,p7) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0;p6 = p6|0;p7 = p7|0; _emscripten_glCopyTexSubImage2D(p0|0,p1|0,p2|0,p3|0,p4|0,p5|0,p6|0,p7|0);
}
function b10(p0,p1,p2,p3,p4,p5) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0; nullFunc_viiiiii(10);
}
function _emscripten_glDrawRangeElements__wrapper(p0,p1,p2,p3,p4,p5) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0; _emscripten_glDrawRangeElements(p0|0,p1|0,p2|0,p3|0,p4|0,p5|0);
}
function _emscripten_glVertexAttribPointer__wrapper(p0,p1,p2,p3,p4,p5) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0; _emscripten_glVertexAttribPointer(p0|0,p1|0,p2|0,p3|0,p4|0,p5|0);
}
function b11(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_viii(11);
}
function _emscripten_glGetTexParameterfv__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; _emscripten_glGetTexParameterfv(p0|0,p1|0,p2|0);
}
function _emscripten_glGetTexParameteriv__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; _emscripten_glGetTexParameteriv(p0|0,p1|0,p2|0);
}
function _emscripten_glTexParameterfv__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; _emscripten_glTexParameterfv(p0|0,p1|0,p2|0);
}
function _emscripten_glTexParameteriv__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; _emscripten_glTexParameteriv(p0|0,p1|0,p2|0);
}
function _emscripten_glGetBufferParameteriv__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; _emscripten_glGetBufferParameteriv(p0|0,p1|0,p2|0);
}
function _emscripten_glGetRenderbufferParameteriv__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; _emscripten_glGetRenderbufferParameteriv(p0|0,p1|0,p2|0);
}
function _emscripten_glGetUniformfv__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; _emscripten_glGetUniformfv(p0|0,p1|0,p2|0);
}
function _emscripten_glGetUniformiv__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; _emscripten_glGetUniformiv(p0|0,p1|0,p2|0);
}
function _emscripten_glGetVertexAttribfv__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; _emscripten_glGetVertexAttribfv(p0|0,p1|0,p2|0);
}
function _emscripten_glGetVertexAttribiv__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; _emscripten_glGetVertexAttribiv(p0|0,p1|0,p2|0);
}
function _emscripten_glGetVertexAttribPointerv__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; _emscripten_glGetVertexAttribPointerv(p0|0,p1|0,p2|0);
}
function _emscripten_glUniform2i__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; _emscripten_glUniform2i(p0|0,p1|0,p2|0);
}
function _emscripten_glUniform1iv__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; _emscripten_glUniform1iv(p0|0,p1|0,p2|0);
}
function _emscripten_glUniform2iv__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; _emscripten_glUniform2iv(p0|0,p1|0,p2|0);
}
function _emscripten_glUniform3iv__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; _emscripten_glUniform3iv(p0|0,p1|0,p2|0);
}
function _emscripten_glUniform4iv__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; _emscripten_glUniform4iv(p0|0,p1|0,p2|0);
}
function _emscripten_glUniform1fv__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; _emscripten_glUniform1fv(p0|0,p1|0,p2|0);
}
function _emscripten_glUniform2fv__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; _emscripten_glUniform2fv(p0|0,p1|0,p2|0);
}
function _emscripten_glUniform3fv__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; _emscripten_glUniform3fv(p0|0,p1|0,p2|0);
}
function _emscripten_glUniform4fv__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; _emscripten_glUniform4fv(p0|0,p1|0,p2|0);
}
function _emscripten_glGetShaderiv__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; _emscripten_glGetShaderiv(p0|0,p1|0,p2|0);
}
function _emscripten_glGetProgramiv__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; _emscripten_glGetProgramiv(p0|0,p1|0,p2|0);
}
function _emscripten_glBindAttribLocation__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; _emscripten_glBindAttribLocation(p0|0,p1|0,p2|0);
}
function _emscripten_glGetObjectParameterivARB__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; _emscripten_glGetObjectParameterivARB(p0|0,p1|0,p2|0);
}
function _emscripten_glNormalPointer__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; _emscripten_glNormalPointer(p0|0,p1|0,p2|0);
}
function _emscripten_glDrawArrays__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; _emscripten_glDrawArrays(p0|0,p1|0,p2|0);
}
function _emscripten_glTexParameteri__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; _emscripten_glTexParameteri(p0|0,p1|0,p2|0);
}
function _emscripten_glStencilFunc__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; _emscripten_glStencilFunc(p0|0,p1|0,p2|0);
}
function _emscripten_glStencilOp__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; _emscripten_glStencilOp(p0|0,p1|0,p2|0);
}
function b12(p0,p1,p2,p3,p4) {
 p0 = p0|0;p1 = +p1;p2 = +p2;p3 = +p3;p4 = +p4; nullFunc_vidddd(12);
}
function _emscripten_glUniform4f__wrapper(p0,p1,p2,p3,p4) {
 p0 = p0|0;p1 = +p1;p2 = +p2;p3 = +p3;p4 = +p4; _emscripten_glUniform4f(p0|0,+p1,+p2,+p3,+p4);
}
function _emscripten_glVertexAttrib4f__wrapper(p0,p1,p2,p3,p4) {
 p0 = p0|0;p1 = +p1;p2 = +p2;p3 = +p3;p4 = +p4; _emscripten_glVertexAttrib4f(p0|0,+p1,+p2,+p3,+p4);
}
function b13(p0,p1) {
 p0 = +p0;p1 = p1|0; nullFunc_vdi(13);
}
function _emscripten_glSampleCoverage__wrapper(p0,p1) {
 p0 = +p0;p1 = p1|0; _emscripten_glSampleCoverage(+p0,p1|0);
}
function b14(p0,p1,p2,p3,p4,p5,p6) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0;p6 = p6|0; nullFunc_viiiiiii(14);
}
function _emscripten_glReadPixels__wrapper(p0,p1,p2,p3,p4,p5,p6) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0;p6 = p6|0; _emscripten_glReadPixels(p0|0,p1|0,p2|0,p3|0,p4|0,p5|0,p6|0);
}
function _emscripten_glGetActiveUniform__wrapper(p0,p1,p2,p3,p4,p5,p6) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0;p6 = p6|0; _emscripten_glGetActiveUniform(p0|0,p1|0,p2|0,p3|0,p4|0,p5|0,p6|0);
}
function _emscripten_glGetActiveAttrib__wrapper(p0,p1,p2,p3,p4,p5,p6) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0;p6 = p6|0; _emscripten_glGetActiveAttrib(p0|0,p1|0,p2|0,p3|0,p4|0,p5|0,p6|0);
}
function b15(p0,p1,p2,p3,p4,p5,p6,p7,p8) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0;p6 = p6|0;p7 = p7|0;p8 = p8|0; nullFunc_viiiiiiiii(15);
}
function _emscripten_glCompressedTexSubImage2D__wrapper(p0,p1,p2,p3,p4,p5,p6,p7,p8) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0;p6 = p6|0;p7 = p7|0;p8 = p8|0; _emscripten_glCompressedTexSubImage2D(p0|0,p1|0,p2|0,p3|0,p4|0,p5|0,p6|0,p7|0,p8|0);
}
function _emscripten_glTexImage2D__wrapper(p0,p1,p2,p3,p4,p5,p6,p7,p8) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0;p6 = p6|0;p7 = p7|0;p8 = p8|0; _emscripten_glTexImage2D(p0|0,p1|0,p2|0,p3|0,p4|0,p5|0,p6|0,p7|0,p8|0);
}
function _emscripten_glTexSubImage2D__wrapper(p0,p1,p2,p3,p4,p5,p6,p7,p8) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0;p6 = p6|0;p7 = p7|0;p8 = p8|0; _emscripten_glTexSubImage2D(p0|0,p1|0,p2|0,p3|0,p4|0,p5|0,p6|0,p7|0,p8|0);
}
function b16(p0,p1) {
 p0 = p0|0;p1 = p1|0; nullFunc_iii(16);return 0;
}
function _emscripten_glGetUniformLocation__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; return _emscripten_glGetUniformLocation(p0|0,p1|0)|0;
}
function _emscripten_glGetAttribLocation__wrapper(p0,p1) {
 p0 = p0|0;p1 = p1|0; return _emscripten_glGetAttribLocation(p0|0,p1|0)|0;
}
function b17() {
 ; nullFunc_i(17);return 0;
}
function _emscripten_glCreateProgram__wrapper() {
 ; return _emscripten_glCreateProgram()|0;
}
function _emscripten_glGetError__wrapper() {
 ; return _emscripten_glGetError()|0;
}
function b18(p0,p1,p2,p3,p4,p5) {
 p0 = +p0;p1 = +p1;p2 = +p2;p3 = +p3;p4 = +p4;p5 = +p5; nullFunc_vdddddd(18);
}
function _emscripten_glFrustum__wrapper(p0,p1,p2,p3,p4,p5) {
 p0 = +p0;p1 = +p1;p2 = +p2;p3 = +p3;p4 = +p4;p5 = +p5; _emscripten_glFrustum(+p0,+p1,+p2,+p3,+p4,+p5);
}
function b19(p0,p1,p2,p3) {
 p0 = +p0;p1 = +p1;p2 = +p2;p3 = +p3; nullFunc_vdddd(19);
}
function _emscripten_glRotatef__wrapper(p0,p1,p2,p3) {
 p0 = +p0;p1 = +p1;p2 = +p2;p3 = +p3; _emscripten_glRotatef(+p0,+p1,+p2,+p3);
}
function _emscripten_glClearColor__wrapper(p0,p1,p2,p3) {
 p0 = +p0;p1 = +p1;p2 = +p2;p3 = +p3; _emscripten_glClearColor(+p0,+p1,+p2,+p3);
}
function _emscripten_glBlendColor__wrapper(p0,p1,p2,p3) {
 p0 = +p0;p1 = +p1;p2 = +p2;p3 = +p3; _emscripten_glBlendColor(+p0,+p1,+p2,+p3);
}
function b20(p0,p1) {
 p0 = +p0;p1 = +p1; nullFunc_vdd(20);
}
function _emscripten_glDepthRange__wrapper(p0,p1) {
 p0 = +p0;p1 = +p1; _emscripten_glDepthRange(+p0,+p1);
}
function _emscripten_glDepthRangef__wrapper(p0,p1) {
 p0 = +p0;p1 = +p1; _emscripten_glDepthRangef(+p0,+p1);
}
function _emscripten_glPolygonOffset__wrapper(p0,p1) {
 p0 = +p0;p1 = +p1; _emscripten_glPolygonOffset(+p0,+p1);
}
function b21() {
 ; nullFunc_v(21);
}
function _emscripten_glLoadIdentity__wrapper() {
 ; _emscripten_glLoadIdentity();
}
function _emscripten_glReleaseShaderCompiler__wrapper() {
 ; _emscripten_glReleaseShaderCompiler();
}
function _emscripten_glFinish__wrapper() {
 ; _emscripten_glFinish();
}
function _emscripten_glFlush__wrapper() {
 ; _emscripten_glFlush();
}
function b22(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = +p2; nullFunc_viid(22);
}
function _emscripten_glTexParameterf__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = +p2; _emscripten_glTexParameterf(p0|0,p1|0,+p2);
}
function b23(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; nullFunc_viiii(23);
}
function _emscripten_glBufferData__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; _emscripten_glBufferData(p0|0,p1|0,p2|0,p3|0);
}
function _emscripten_glBufferSubData__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; _emscripten_glBufferSubData(p0|0,p1|0,p2|0,p3|0);
}
function _emscripten_glUniform3i__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; _emscripten_glUniform3i(p0|0,p1|0,p2|0,p3|0);
}
function _emscripten_glUniformMatrix2fv__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; _emscripten_glUniformMatrix2fv(p0|0,p1|0,p2|0,p3|0);
}
function _emscripten_glUniformMatrix3fv__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; _emscripten_glUniformMatrix3fv(p0|0,p1|0,p2|0,p3|0);
}
function _emscripten_glUniformMatrix4fv__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; _emscripten_glUniformMatrix4fv(p0|0,p1|0,p2|0,p3|0);
}
function _emscripten_glGetAttachedShaders__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; _emscripten_glGetAttachedShaders(p0|0,p1|0,p2|0,p3|0);
}
function _emscripten_glShaderSource__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; _emscripten_glShaderSource(p0|0,p1|0,p2|0,p3|0);
}
function _emscripten_glGetShaderSource__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; _emscripten_glGetShaderSource(p0|0,p1|0,p2|0,p3|0);
}
function _emscripten_glGetShaderInfoLog__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; _emscripten_glGetShaderInfoLog(p0|0,p1|0,p2|0,p3|0);
}
function _emscripten_glGetShaderPrecisionFormat__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; _emscripten_glGetShaderPrecisionFormat(p0|0,p1|0,p2|0,p3|0);
}
function _emscripten_glGetProgramInfoLog__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; _emscripten_glGetProgramInfoLog(p0|0,p1|0,p2|0,p3|0);
}
function _emscripten_glFramebufferRenderbuffer__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; _emscripten_glFramebufferRenderbuffer(p0|0,p1|0,p2|0,p3|0);
}
function _emscripten_glGetFramebufferAttachmentParameteriv__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; _emscripten_glGetFramebufferAttachmentParameteriv(p0|0,p1|0,p2|0,p3|0);
}
function _emscripten_glGetInfoLogARB__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; _emscripten_glGetInfoLogARB(p0|0,p1|0,p2|0,p3|0);
}
function _emscripten_glVertexPointer__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; _emscripten_glVertexPointer(p0|0,p1|0,p2|0,p3|0);
}
function _emscripten_glTexCoordPointer__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; _emscripten_glTexCoordPointer(p0|0,p1|0,p2|0,p3|0);
}
function _emscripten_glColorPointer__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; _emscripten_glColorPointer(p0|0,p1|0,p2|0,p3|0);
}
function _emscripten_glDrawElements__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; _emscripten_glDrawElements(p0|0,p1|0,p2|0,p3|0);
}
function _emscripten_glDrawArraysInstanced__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; _emscripten_glDrawArraysInstanced(p0|0,p1|0,p2|0,p3|0);
}
function _emscripten_glViewport__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; _emscripten_glViewport(p0|0,p1|0,p2|0,p3|0);
}
function _emscripten_glScissor__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; _emscripten_glScissor(p0|0,p1|0,p2|0,p3|0);
}
function _emscripten_glColorMask__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; _emscripten_glColorMask(p0|0,p1|0,p2|0,p3|0);
}
function _emscripten_glRenderbufferStorage__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; _emscripten_glRenderbufferStorage(p0|0,p1|0,p2|0,p3|0);
}
function _emscripten_glBlendFuncSeparate__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; _emscripten_glBlendFuncSeparate(p0|0,p1|0,p2|0,p3|0);
}
function _emscripten_glStencilFuncSeparate__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; _emscripten_glStencilFuncSeparate(p0|0,p1|0,p2|0,p3|0);
}
function _emscripten_glStencilOpSeparate__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; _emscripten_glStencilOpSeparate(p0|0,p1|0,p2|0,p3|0);
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_viiiii = [b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0
,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,_emscripten_glUniform4i__wrapper,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0
,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0
,b0,b0,_emscripten_glFramebufferTexture2D__wrapper,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0
,_emscripten_glShaderBinary__wrapper,b0,b0,b0,b0,_emscripten_glDrawElementsInstanced__wrapper,b0,b0,b0];
var FUNCTION_TABLE_vd = [b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1
,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1
,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1
,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1
,b1,b1,b1,b1,b1,b1,b1,b1,_emscripten_glClearDepth__wrapper,_emscripten_glClearDepthf__wrapper,b1,b1,b1,b1,b1,b1,_emscripten_glLineWidth__wrapper,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1
,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1
,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1
,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1
,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1];
var FUNCTION_TABLE_vid = [b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2
,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,_emscripten_glUniform1f__wrapper,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2
,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2
,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2
,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2
,b2,b2,_emscripten_glVertexAttrib1f__wrapper,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2
,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2
,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2
,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2];
var FUNCTION_TABLE_vi = [b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3
,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3
,b3,b3,b3,b3,b3,b3,b3,b3,_emscripten_glDeleteShader__wrapper,b3,b3,b3,_emscripten_glCompileShader__wrapper,b3,b3,b3,b3,b3,_emscripten_glDeleteProgram__wrapper,b3,b3,b3,_emscripten_glLinkProgram__wrapper,b3,_emscripten_glUseProgram__wrapper,_emscripten_glValidateProgram__wrapper,b3,b3,b3,b3
,b3,b3,b3,b3,b3,_emscripten_glDeleteObjectARB__wrapper,b3,b3,b3,b3,b3,_emscripten_glEnableClientState__wrapper,b3,b3,b3,b3,_emscripten_glClientActiveTexture__wrapper,b3,b3,_emscripten_glBindVertexArray__wrapper,_emscripten_glMatrixMode__wrapper,b3,_emscripten_glLoadMatrixf__wrapper,b3,b3,b3,_emscripten_glEnableVertexAttribArray__wrapper,_emscripten_glDisableVertexAttribArray__wrapper,b3,b3
,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,_emscripten_glDepthFunc__wrapper,_emscripten_glEnable__wrapper,_emscripten_glDisable__wrapper,_emscripten_glFrontFace__wrapper,_emscripten_glCullFace__wrapper,_emscripten_glClear__wrapper,b3,_emscripten_glClearStencil__wrapper,_emscripten_glDepthMask__wrapper,_emscripten_glStencilMask__wrapper,b3,_emscripten_glGenerateMipmap__wrapper,_emscripten_glActiveTexture__wrapper,_emscripten_glBlendEquation__wrapper,b3,b3,b3,b3,b3,b3
,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,_cleanup_141,b3,b3,b3,b3,b3
,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3
,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3
,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3];
var FUNCTION_TABLE_vii = [b4,b4,b4,b4,_emscripten_glPixelStorei__wrapper,b4,_emscripten_glGetIntegerv__wrapper,_emscripten_glGetFloatv__wrapper,_emscripten_glGetBooleanv__wrapper,_emscripten_glGenTextures__wrapper,_emscripten_glDeleteTextures__wrapper,b4,b4,b4,b4,b4,_emscripten_glBindTexture__wrapper,b4,b4,b4,b4,b4,_emscripten_glGenBuffers__wrapper,_emscripten_glDeleteBuffers__wrapper,b4,b4,b4,b4,_emscripten_glGenRenderbuffers__wrapper,_emscripten_glDeleteRenderbuffers__wrapper,_emscripten_glBindRenderbuffer__wrapper,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,_emscripten_glUniform1i__wrapper,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4
,_emscripten_glBindBuffer__wrapper,_emscripten_glVertexAttrib1fv__wrapper,_emscripten_glVertexAttrib2fv__wrapper,_emscripten_glVertexAttrib3fv__wrapper,_emscripten_glVertexAttrib4fv__wrapper,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,_emscripten_glAttachShader__wrapper,_emscripten_glDetachShader__wrapper,b4,b4,b4,b4,b4,b4,b4,_emscripten_glBindFramebuffer__wrapper,_emscripten_glGenFramebuffers__wrapper,_emscripten_glDeleteFramebuffers__wrapper,b4,b4,b4,b4,b4,b4,b4,_emscripten_glBindProgramARB__wrapper,_emscripten_glGetPointerv__wrapper,b4,b4,b4,b4,b4,b4,b4,_emscripten_glGenVertexArrays__wrapper,_emscripten_glDeleteVertexArrays__wrapper,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4
,b4,b4,b4,_emscripten_glVertexAttribDivisor__wrapper,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,_emscripten_glBlendFunc__wrapper,_emscripten_glBlendEquationSeparate__wrapper,b4,b4,_emscripten_glStencilMaskSeparate__wrapper,_emscripten_glHint__wrapper,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,_emscripten_glDrawBuffers__wrapper,b4,b4,b4,b4,b4,b4,b4
,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4
,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4
,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4];
var FUNCTION_TABLE_ii = [b5,___stdio_close,b5,b5,b5,_emscripten_glGetString__wrapper,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,_emscripten_glIsTexture__wrapper,b5,b5,b5,b5,b5,_emscripten_glIsBuffer__wrapper,b5
,b5,b5,b5,_emscripten_glIsRenderbuffer__wrapper,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5
,b5,b5,b5,b5,b5,b5,b5,_emscripten_glCreateShader__wrapper,b5,b5,b5,b5,b5,b5,b5,b5,_emscripten_glIsShader__wrapper,b5,b5,b5,b5,b5,b5,b5,b5,b5,_emscripten_glIsProgram__wrapper,b5,b5,b5
,b5,b5,b5,b5,_emscripten_glIsFramebuffer__wrapper,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5
,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,_emscripten_glCheckFramebufferStatus__wrapper,b5,b5,b5,_emscripten_glIsEnabled__wrapper,b5,b5,b5,b5,b5
,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5
,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5
,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5
,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5];
var FUNCTION_TABLE_viddd = [b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6
,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,_emscripten_glUniform3f__wrapper,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6
,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6
,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6
,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6
,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,_emscripten_glVertexAttrib3f__wrapper,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6
,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6
,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6
,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6];
var FUNCTION_TABLE_vidd = [b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7
,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,_emscripten_glUniform2f__wrapper,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7
,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7
,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7
,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7
,b7,b7,b7,b7,b7,b7,_emscripten_glVertexAttrib2f__wrapper,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7
,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7
,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7
,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7];
var FUNCTION_TABLE_iiii = [b8,b8,___stdout_write,___stdio_seek,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8
,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8
,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8
,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8
,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8
,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,___stdio_write,b8,b8,b8,b8,b8,b8
,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8
,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8
,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8];
var FUNCTION_TABLE_viiiiiiii = [b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,_emscripten_glCompressedTexImage2D__wrapper,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9
,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9
,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9
,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9
,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9
,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,_emscripten_glCopyTexImage2D__wrapper,_emscripten_glCopyTexSubImage2D__wrapper,b9,b9,b9,b9,b9,b9,b9,b9
,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9
,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9
,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9];
var FUNCTION_TABLE_viiiiii = [b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10
,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10
,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10
,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,_emscripten_glDrawRangeElements__wrapper,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,_emscripten_glVertexAttribPointer__wrapper,b10,b10,b10,b10
,b10,b10,b10,b10,b10,b10,b10,b10,b10];
var FUNCTION_TABLE_viii = [b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,_emscripten_glGetTexParameterfv__wrapper,_emscripten_glGetTexParameteriv__wrapper,_emscripten_glTexParameterfv__wrapper,_emscripten_glTexParameteriv__wrapper,b11,b11,b11,_emscripten_glGetBufferParameteriv__wrapper,b11,b11,b11,b11
,b11,b11,_emscripten_glGetRenderbufferParameteriv__wrapper,b11,_emscripten_glGetUniformfv__wrapper,_emscripten_glGetUniformiv__wrapper,b11,_emscripten_glGetVertexAttribfv__wrapper,_emscripten_glGetVertexAttribiv__wrapper,_emscripten_glGetVertexAttribPointerv__wrapper,b11,b11,b11,b11,b11,b11,_emscripten_glUniform2i__wrapper,b11,b11,_emscripten_glUniform1iv__wrapper,_emscripten_glUniform2iv__wrapper,_emscripten_glUniform3iv__wrapper,_emscripten_glUniform4iv__wrapper,_emscripten_glUniform1fv__wrapper,_emscripten_glUniform2fv__wrapper,_emscripten_glUniform3fv__wrapper,_emscripten_glUniform4fv__wrapper,b11,b11,b11
,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,_emscripten_glGetShaderiv__wrapper,_emscripten_glGetProgramiv__wrapper,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,_emscripten_glBindAttribLocation__wrapper,b11,b11
,b11,b11,b11,b11,b11,b11,_emscripten_glGetObjectParameterivARB__wrapper,b11,b11,b11,b11,b11,b11,b11,_emscripten_glNormalPointer__wrapper,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,_emscripten_glDrawArrays__wrapper,b11
,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11
,b11,b11,b11,b11,_emscripten_glTexParameteri__wrapper,b11,b11,_emscripten_glStencilFunc__wrapper,_emscripten_glStencilOp__wrapper,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11
,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11
,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11
,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11];
var FUNCTION_TABLE_vidddd = [b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12
,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,_emscripten_glUniform4f__wrapper,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12
,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12
,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12
,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12
,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,_emscripten_glVertexAttrib4f__wrapper,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12
,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12
,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12
,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12];
var FUNCTION_TABLE_vdi = [b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13
,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13
,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13
,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13
,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13
,b13,b13,b13,_emscripten_glSampleCoverage__wrapper,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13
,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13
,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13
,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13];
var FUNCTION_TABLE_viiiiiii = [b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,_emscripten_glReadPixels__wrapper,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14
,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,_emscripten_glGetActiveUniform__wrapper,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14
,b14,b14,b14,b14,b14,b14,_emscripten_glGetActiveAttrib__wrapper,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14
,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14,b14
,b14,b14,b14,b14,b14,b14,b14,b14,b14];
var FUNCTION_TABLE_viiiiiiiii = [b15,b15,b15,b15,b15,b15,b15,b15,b15,b15,b15,b15,_emscripten_glCompressedTexSubImage2D__wrapper,_emscripten_glTexImage2D__wrapper,_emscripten_glTexSubImage2D__wrapper,b15];
var FUNCTION_TABLE_iii = [b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16
,b16,b16,b16,b16,b16,b16,_emscripten_glGetUniformLocation__wrapper,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16
,b16,b16,b16,b16,b16,_emscripten_glGetAttribLocation__wrapper,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16
,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16,b16
,b16,b16,b16,b16,b16,b16,b16,b16,b16];
var FUNCTION_TABLE_i = [b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17
,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17
,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,_emscripten_glCreateProgram__wrapper,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17
,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17,b17
,b17,b17,_emscripten_glGetError__wrapper,b17,b17,b17,b17,b17,b17];
var FUNCTION_TABLE_vdddddd = [b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18
,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18
,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18
,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,b18,_emscripten_glFrustum__wrapper,b18,b18,b18,b18,b18,b18
,b18,b18,b18,b18,b18,b18,b18,b18,b18];
var FUNCTION_TABLE_vdddd = [b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19
,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19
,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19
,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,_emscripten_glRotatef__wrapper,b19,b19,b19,b19,b19
,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19
,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,_emscripten_glClearColor__wrapper,b19,b19,b19,b19,b19,_emscripten_glBlendColor__wrapper,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19
,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19
,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19
,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19,b19];
var FUNCTION_TABLE_vdd = [b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20
,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20
,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20
,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20
,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,_emscripten_glDepthRange__wrapper,_emscripten_glDepthRangef__wrapper,b20
,b20,_emscripten_glPolygonOffset__wrapper,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20
,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20
,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20
,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20,b20];
var FUNCTION_TABLE_v = [b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21
,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21
,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21
,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,b21,_emscripten_glLoadIdentity__wrapper,b21,b21,b21,b21,b21,b21,b21,b21
,b21,_emscripten_glReleaseShaderCompiler__wrapper,b21,b21,b21,b21,_emscripten_glFinish__wrapper,_emscripten_glFlush__wrapper,b21];
var FUNCTION_TABLE_viid = [b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22
,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22
,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22
,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22
,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22
,b22,b22,b22,b22,b22,_emscripten_glTexParameterf__wrapper,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22
,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22
,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22
,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22,b22];
var FUNCTION_TABLE_viiii = [b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,_emscripten_glBufferData__wrapper,_emscripten_glBufferSubData__wrapper,b23,b23
,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,_emscripten_glUniform3i__wrapper,b23,b23,b23,b23,b23,b23,b23,b23,b23,_emscripten_glUniformMatrix2fv__wrapper,_emscripten_glUniformMatrix3fv__wrapper,_emscripten_glUniformMatrix4fv__wrapper,b23,b23,b23,b23,b23,b23,b23,b23,b23,_emscripten_glGetAttachedShaders__wrapper,_emscripten_glShaderSource__wrapper,_emscripten_glGetShaderSource__wrapper,b23,_emscripten_glGetShaderInfoLog__wrapper,b23,b23,b23,b23,b23,b23,b23,_emscripten_glGetShaderPrecisionFormat__wrapper,b23,_emscripten_glGetProgramInfoLog__wrapper,b23,b23,b23,b23,b23,b23
,b23,_emscripten_glFramebufferRenderbuffer__wrapper,b23,_emscripten_glGetFramebufferAttachmentParameteriv__wrapper,b23,b23,b23,_emscripten_glGetInfoLogARB__wrapper,b23,b23,b23,b23,_emscripten_glVertexPointer__wrapper,_emscripten_glTexCoordPointer__wrapper,b23,_emscripten_glColorPointer__wrapper,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,_emscripten_glDrawElements__wrapper,b23,b23,b23,b23,_emscripten_glDrawArraysInstanced__wrapper,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23
,b23,b23,b23,b23,b23,b23,b23,b23,b23,_emscripten_glViewport__wrapper,b23,_emscripten_glScissor__wrapper,b23,_emscripten_glColorMask__wrapper,_emscripten_glRenderbufferStorage__wrapper,_emscripten_glBlendFuncSeparate__wrapper,b23,_emscripten_glStencilFuncSeparate__wrapper,_emscripten_glStencilOpSeparate__wrapper,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23
,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23
,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23
,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23,b23];

  return { _free: _free, _strstr: _strstr, _memset: _memset, _malloc: _malloc, _memcpy: _memcpy, _fflush: _fflush, _emscripten_GetProcAddress: _emscripten_GetProcAddress, ___errno_location: ___errno_location, runPostSets: runPostSets, stackAlloc: stackAlloc, stackSave: stackSave, stackRestore: stackRestore, establishStackSpace: establishStackSpace, setThrew: setThrew, setTempRet0: setTempRet0, getTempRet0: getTempRet0, dynCall_viiiii: dynCall_viiiii, dynCall_vd: dynCall_vd, dynCall_vid: dynCall_vid, dynCall_vi: dynCall_vi, dynCall_vii: dynCall_vii, dynCall_ii: dynCall_ii, dynCall_viddd: dynCall_viddd, dynCall_vidd: dynCall_vidd, dynCall_iiii: dynCall_iiii, dynCall_viiiiiiii: dynCall_viiiiiiii, dynCall_viiiiii: dynCall_viiiiii, dynCall_viii: dynCall_viii, dynCall_vidddd: dynCall_vidddd, dynCall_vdi: dynCall_vdi, dynCall_viiiiiii: dynCall_viiiiiii, dynCall_viiiiiiiii: dynCall_viiiiiiiii, dynCall_iii: dynCall_iii, dynCall_i: dynCall_i, dynCall_vdddddd: dynCall_vdddddd, dynCall_vdddd: dynCall_vdddd, dynCall_vdd: dynCall_vdd, dynCall_v: dynCall_v, dynCall_viid: dynCall_viid, dynCall_viiii: dynCall_viiii };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);
var real__fflush = asm["_fflush"]; asm["_fflush"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__fflush.apply(null, arguments);
};

var real__strstr = asm["_strstr"]; asm["_strstr"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__strstr.apply(null, arguments);
};

var real__malloc = asm["_malloc"]; asm["_malloc"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__malloc.apply(null, arguments);
};

var real__free = asm["_free"]; asm["_free"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__free.apply(null, arguments);
};

var real__emscripten_GetProcAddress = asm["_emscripten_GetProcAddress"]; asm["_emscripten_GetProcAddress"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_GetProcAddress.apply(null, arguments);
};

var real____errno_location = asm["___errno_location"]; asm["___errno_location"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____errno_location.apply(null, arguments);
};
var _fflush = Module["_fflush"] = asm["_fflush"];
var runPostSets = Module["runPostSets"] = asm["runPostSets"];
var _strstr = Module["_strstr"] = asm["_strstr"];
var _memset = Module["_memset"] = asm["_memset"];
var _malloc = Module["_malloc"] = asm["_malloc"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var _free = Module["_free"] = asm["_free"];
var _emscripten_GetProcAddress = Module["_emscripten_GetProcAddress"] = asm["_emscripten_GetProcAddress"];
var ___errno_location = Module["___errno_location"] = asm["___errno_location"];
var dynCall_viiiii = Module["dynCall_viiiii"] = asm["dynCall_viiiii"];
var dynCall_vd = Module["dynCall_vd"] = asm["dynCall_vd"];
var dynCall_vid = Module["dynCall_vid"] = asm["dynCall_vid"];
var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
var dynCall_vii = Module["dynCall_vii"] = asm["dynCall_vii"];
var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
var dynCall_viddd = Module["dynCall_viddd"] = asm["dynCall_viddd"];
var dynCall_vidd = Module["dynCall_vidd"] = asm["dynCall_vidd"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_viiiiiiii = Module["dynCall_viiiiiiii"] = asm["dynCall_viiiiiiii"];
var dynCall_viiiiii = Module["dynCall_viiiiii"] = asm["dynCall_viiiiii"];
var dynCall_viii = Module["dynCall_viii"] = asm["dynCall_viii"];
var dynCall_vidddd = Module["dynCall_vidddd"] = asm["dynCall_vidddd"];
var dynCall_vdi = Module["dynCall_vdi"] = asm["dynCall_vdi"];
var dynCall_viiiiiii = Module["dynCall_viiiiiii"] = asm["dynCall_viiiiiii"];
var dynCall_viiiiiiiii = Module["dynCall_viiiiiiiii"] = asm["dynCall_viiiiiiiii"];
var dynCall_iii = Module["dynCall_iii"] = asm["dynCall_iii"];
var dynCall_i = Module["dynCall_i"] = asm["dynCall_i"];
var dynCall_vdddddd = Module["dynCall_vdddddd"] = asm["dynCall_vdddddd"];
var dynCall_vdddd = Module["dynCall_vdddd"] = asm["dynCall_vdddd"];
var dynCall_vdd = Module["dynCall_vdd"] = asm["dynCall_vdd"];
var dynCall_v = Module["dynCall_v"] = asm["dynCall_v"];
var dynCall_viid = Module["dynCall_viid"] = asm["dynCall_viid"];
var dynCall_viiii = Module["dynCall_viiii"] = asm["dynCall_viiii"];
;

Runtime.stackAlloc = asm['stackAlloc'];
Runtime.stackSave = asm['stackSave'];
Runtime.stackRestore = asm['stackRestore'];
Runtime.establishStackSpace = asm['establishStackSpace'];

Runtime.setTempRet0 = asm['setTempRet0'];
Runtime.getTempRet0 = asm['getTempRet0'];



// === Auto-generated postamble setup entry stuff ===




function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
};
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;

var initialStackTop;
var preloadStartTime = null;
var calledMain = false;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!Module['calledRun']) run();
  if (!Module['calledRun']) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
}

Module['callMain'] = Module.callMain = function callMain(args) {
  assert(runDependencies == 0, 'cannot call main when async dependencies remain! (listen on __ATMAIN__)');
  assert(__ATPRERUN__.length == 0, 'cannot call main when preRun functions remain to be called');

  args = args || [];

  ensureInitRuntime();

  var argc = args.length+1;
  function pad() {
    for (var i = 0; i < 4-1; i++) {
      argv.push(0);
    }
  }
  var argv = [allocate(intArrayFromString(Module['thisProgram']), 'i8', ALLOC_NORMAL) ];
  pad();
  for (var i = 0; i < argc-1; i = i + 1) {
    argv.push(allocate(intArrayFromString(args[i]), 'i8', ALLOC_NORMAL));
    pad();
  }
  argv.push(0);
  argv = allocate(argv, 'i32', ALLOC_NORMAL);


  try {

    var ret = Module['_main'](argc, argv, 0);


    // if we're not running an evented main loop, it's time to exit
    exit(ret, /* implicit = */ true);
  }
  catch(e) {
    if (e instanceof ExitStatus) {
      // exit() throws this once it's done to make sure execution
      // has been stopped completely
      return;
    } else if (e == 'SimulateInfiniteLoop') {
      // running an evented main loop, don't immediately exit
      Module['noExitRuntime'] = true;
      return;
    } else {
      if (e && typeof e === 'object' && e.stack) Module.printErr('exception thrown: ' + [e, e.stack]);
      throw e;
    }
  } finally {
    calledMain = true;
  }
}




function run(args) {
  args = args || Module['arguments'];

  if (preloadStartTime === null) preloadStartTime = Date.now();

  if (runDependencies > 0) {
    Module.printErr('run() called, but dependencies remain, so not running');
    return;
  }

  preRun();

  if (runDependencies > 0) return; // a preRun added a dependency, run will be called later
  if (Module['calledRun']) return; // run may have just been called through dependencies being fulfilled just in this very frame

  function doRun() {
    if (Module['calledRun']) return; // run may have just been called while the async setStatus time below was happening
    Module['calledRun'] = true;

    if (ABORT) return;

    ensureInitRuntime();

    preMain();

    if (ENVIRONMENT_IS_WEB && preloadStartTime !== null) {
      Module.printErr('pre-main prep time: ' + (Date.now() - preloadStartTime) + ' ms');
    }

    if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();

    if (Module['_main'] && shouldRunNow) Module['callMain'](args);

    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function() {
      setTimeout(function() {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
}
Module['run'] = Module.run = run;

function exit(status, implicit) {
  if (implicit && Module['noExitRuntime']) {
    Module.printErr('exit(' + status + ') implicitly called by end of main(), but noExitRuntime, so not exiting the runtime (you can use emscripten_force_exit, if you want to force a true shutdown)');
    return;
  }

  if (Module['noExitRuntime']) {
    Module.printErr('exit(' + status + ') called, but noExitRuntime, so halting execution but not exiting the runtime or preventing further async execution (you can use emscripten_force_exit, if you want to force a true shutdown)');
  } else {

    ABORT = true;
    EXITSTATUS = status;
    STACKTOP = initialStackTop;

    exitRuntime();

    if (Module['onExit']) Module['onExit'](status);
  }

  if (ENVIRONMENT_IS_NODE) {
    process['exit'](status);
  } else if (ENVIRONMENT_IS_SHELL && typeof quit === 'function') {
    quit(status);
  }
  // if we reach here, we must throw an exception to halt the current execution
  throw new ExitStatus(status);
}
Module['exit'] = Module.exit = exit;

var abortDecorators = [];

function abort(what) {
  if (what !== undefined) {
    Module.print(what);
    Module.printErr(what);
    what = JSON.stringify(what)
  } else {
    what = '';
  }

  ABORT = true;
  EXITSTATUS = 1;

  var extra = '';

  var output = 'abort(' + what + ') at ' + stackTrace() + extra;
  if (abortDecorators) {
    abortDecorators.forEach(function(decorator) {
      output = decorator(output, what);
    });
  }
  throw output;
}
Module['abort'] = Module.abort = abort;

// {{PRE_RUN_ADDITIONS}}

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}

// shouldRunNow refers to calling main(), not run().
var shouldRunNow = true;
if (Module['noInitialRun']) {
  shouldRunNow = false;
}


run();

// {{POST_RUN_ADDITIONS}}






// {{MODULE_ADDITIONS}}



