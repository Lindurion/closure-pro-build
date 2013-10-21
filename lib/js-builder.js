// Copyright 2013 Eric W. Barndollar.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var async = require('async');
var child_process = require('child_process');
var closureDepCalculator = require('./closure-dep-calculator.js');
var common = require('./common.js');
var fileMatcher = require('./file-matcher.js');
var fs = require('fs');
var graphUtil = require('./graph-util.js');
var jsModuleManager = require('./js-module-manager.js');
var kew = require('kew');
var path = require('path');
var underscore = require('underscore');


var JS_COMPILER_PATH = path.join(__dirname,
    '../3p/closure-compiler-20130823/compiler.jar');


/**
 * Builds project JS as specified in the given options, using Closure JS
 * Compiler if required and assembling final output JS files.
 * @param {!Object} projectOptions Specifies the project input files; see
 *     README.md for option documentation.
 * @param {!Object} buildOptions Specifies options specific to this build (like
 *     debug/release); see README.md for option documentation.
 * @param {!Promise.<!OutputDirs>} outDirsAsync
 * @param {!Promise.<?string>} cssRenamingFileAsync
 * @return {!Promise} Tracks success/failure.
 */
function build(
    projectOptions, buildOptions, outDirsAsync, cssRenamingFileAsync) {
  var inputFilesAsync = resolveInputsAsync(projectOptions);

  return outDirsAsync.then(function(outDirs) {
    var transitiveClosureDepsAsync =
        closureDepCalculator.calcDeps(projectOptions, buildOptions, outDirs);
    return kew.all([inputFilesAsync, transitiveClosureDepsAsync])
        .then(function(results) {
          var inputFiles = results[0];
          var transitiveClosureDeps = results[1];

          var resolvedProjectOptions =
              resolveProjectOptions(projectOptions, inputFiles);
          var jsModules = jsModuleManager.calcInputFiles(
              resolvedProjectOptions, transitiveClosureDeps);
          return compileAndOutputJs(resolvedProjectOptions, buildOptions,
              outDirs, cssRenamingFileAsync, jsModules);
        });
  });
}


/**
 * @param {!Object} projectOptions
 * @param {!Object} buildOptions
 * @param {!OutputDirs} outDirs
 * @param {!Promise.<?string>} cssRenamingFileAsync
 * @param {!Array.<!{name: string, compiledInputFiles: !Array.<string>,
 *     dontCompileInputFiles: !Array.<string>,
 *     alwaysLoadedAfterModules: !Array.<string>}>} jsModules
 * @return {!Promise} Tracks success/failure.
 */
function compileAndOutputJs(
    projectOptions, buildOptions, outDirs, cssRenamingFileAsync, jsModules) {
  return cssRenamingFileAsync
      .then(function(cssRenamingFile) {
        return compileJsAsync(projectOptions, buildOptions, outDirs,
            cssRenamingFile, jsModules);
      }).then(underscore.partial(outputFinalJsAsync, projectOptions, outDirs,
          jsModules));
}


//==============================================================================
// Resolve Input JS Files
//==============================================================================

/**
 * @param {!Object} projectOptions
 * @return {!Promise} Yields map from module name to dontCompileInputFiles and
 *     nonClosureNamespacedInputFiles.
 */
function resolveInputsAsync(projectOptions) {
  var tasks = {};

  for (var moduleName in projectOptions.jsModules) {
    tasks[moduleName] = underscore.partial(resolveInputsForModule,
        projectOptions.jsModules[moduleName], projectOptions.rootSrcDir);
  }

  // TODO: Switch to kew.nfcall() when ready...
  var promise = kew.defer();
  async.parallel(tasks, promise.makeNodeResolver());
  return promise;
}


/**
 * @param {!Object} jsModuleSpec JS module spec from projectOptions.
 * @param {string} rootSrcDir
 * @param {function(Error,
 *     {dontCompileInputFiles: !Array.<string>,
 *      nonClosureNamespacedInputFiles: !Array.<string>}} callbackFn
 */
function resolveInputsForModule(jsModuleSpec, rootSrcDir, callbackFn) {
  var tasks = [];
  tasks.push(fileMatcher.resolveAnyGlobPatternsAsync(
      jsModuleSpec.dontCompileInputFiles, rootSrcDir));
  tasks.push(fileMatcher.resolveAnyGlobPatternsAsync(
      jsModuleSpec.nonClosureNamespacedInputFiles, rootSrcDir));

  kew.all(tasks)
      .then(function(results) {
        callbackFn(null, {
          dontCompileInputFiles: results[0],
          nonClosureNamespacedInputFiles: results[1]
        });
      }).fail(callbackFn);
}


/**
 * @param {!Object} projectOptions
 * @param {!Object.<string, !Object>} inputFiles
 * @return {!Object} Copy of projectOptions, with dontCompileInputFiles and
 *     nonClosureNamespacedInputFiles updated based on inputFiles.
 */
function resolveProjectOptions(projectOptions, inputFiles) {
  var resolvedProjectOptions = graphUtil.deepClone(projectOptions);
  for (var moduleName in inputFiles) {
    // Update resolved files (e.g. replace [*.js] with [file1.js, file2.js]).
    underscore.extend(resolvedProjectOptions.jsModules[moduleName],
        inputFiles[moduleName]);
  }
  return resolvedProjectOptions;
}


//==============================================================================
// Invoke Closure JS Compiler
//==============================================================================

/**
 * @param {!Object} projectOptions
 * @param {!Object} buildOptions
 * @param {!OutputDirs} outDirs
 * @param {?string} cssRenamingFile
 * @param {!Array.<!{name: string, compiledInputFiles: !Array.<string>,
 *     dontCompileInputFiles: !Array.<string>,
 *     alwaysLoadedAfterModules: !Array.<string>}>} jsModules
 * @return {!Promise} Tracks success/failure.
 */
function compileJsAsync(
    projectOptions, buildOptions, outDirs, cssRenamingFile, jsModules) {
  var isDebug = (buildOptions.type == common.DEBUG);

  // Standard options:
  var jsCompilerArgs = [
    '-jar',
    JS_COMPILER_PATH,
    '--compilation_level',
    isDebug ? 'WHITESPACE_ONLY' : 'ADVANCED_OPTIMIZATIONS',
    '--module_output_path_prefix',
    outDirs.tmp
  ];

  // Debug- and release-specific options:
  if (isDebug) {
    jsCompilerArgs.push('--formatting');
    jsCompilerArgs.push('PRETTY_PRINT');
  } else {
    jsCompilerArgs.push('--define');
    jsCompilerArgs.push('goog.DEBUG=false');
  }

  if (projectOptions.jsWarningsWhitelistFile) {
    jsCompilerArgs.push('--warnings_whitelist_file');
    jsCompilerArgs.push(projectOptions.jsWarningsWhitelistFile);
  }

  // TODO: Consider support for --process_jquery_primitives.

  // No-op if there is no JS that needs to be compiled.
  var modulesToCompile = getModulesToCompile(jsModules, cssRenamingFile);
  if (modulesToCompile.length == 0) {
    return kew.resolve(null);
  }

  // List input files for each module with JS files to be compiled.
  modulesToCompile.forEach(function(jsModule) {
    jsCompilerArgs.push('--module');
    jsCompilerArgs.push(jsModule.name + ':' +
        jsModule.compiledInputFiles.length + ':' +
        jsModule.alwaysLoadedAfterModules.join(','));

    jsModule.compiledInputFiles.forEach(function(inputFile) {
      jsCompilerArgs.push('--js');
      jsCompilerArgs.push(inputFile);
    });
  });

  // Launch JS compiler in a child process.
  var stderrBehavior = buildOptions.suppressOutput ? 'ignore' : process.stderr;
  var jsCompilation = child_process.spawn(buildOptions.javaCommand,
      jsCompilerArgs, {stdio: ['ignore', 'pipe', stderrBehavior]});

  var promise = kew.defer();
  jsCompilation.on('close', function(exitCode) {
    if (exitCode == common.EXIT_SUCCESS) {
      promise.resolve(null);
    } else {
      promise.reject(new Error('Had errors compiling JavaScript'));
    }
  });
  return promise;
}


/**
 * Filters out modules with no JS to compile and prepends cssRenamingFile to
 * the base module (so long as there are any modules to compile).
 * @param {!Array.<!{name: string, compiledInputFiles: !Array.<string>,
 *     dontCompileInputFiles: !Array.<string>,
 *     alwaysLoadedAfterModules: !Array.<string>}>} jsModules
 * @param {?string} cssRenamingFile
 * @return {!Array.<!{name: string, compiledInputFiles: !Array.<string>,
 *     dontCompileInputFiles: !Array.<string>,
 *     alwaysLoadedAfterModules: !Array.<string>}>}
 */
function getModulesToCompile(jsModules, cssRenamingFile) {
  var modulesWithCompiledJs = {};
  jsModules.forEach(function(jsModule) {
    if (jsModule.compiledInputFiles.length > 0) {
      modulesWithCompiledJs[jsModule.name] = true;
    }
  });

  // If no modules have JS to compile, then there is nothing to do.
  if (underscore.keys(modulesWithCompiledJs).length == 0) {
    return [];
  }

  // If there are CSS classes to rename, prepend them to the base module.
  if (cssRenamingFile) {
    jsModules[0].compiledInputFiles.unshift(cssRenamingFile);
    modulesWithCompiledJs[jsModules[0].name] = true;
  }

  // Filter out any modules with no JS to compile.
  var modulesToCompile = [];

  jsModules.forEach(function(jsModule) {
    if (modulesWithCompiledJs[jsModule.name]) {
      var filteredModule = graphUtil.deepClone(jsModule);
      filteredModule.alwaysLoadedAfterModules =
          filteredModule.alwaysLoadedAfterModules.filter(function(moduleName) {
            return !!modulesWithCompiledJs[moduleName];
          });
      modulesToCompile.push(filteredModule);
    }
  });

  return modulesToCompile;
}


//==============================================================================
// Concat & Output Final JS Files
//==============================================================================

/**
 * @param {!Object} projectOptions
 * @param {!OutputDirs} outDirs
 * @param {!Array.<!{name: string, compiledInputFiles: !Array.<string>,
 *     dontCompileInputFiles: !Array.<string>,
 *     alwaysLoadedAfterModules: !Array.<string>}>} jsModules
 * @return {!Promise} Tracks success/failure.
 */
function outputFinalJsAsync(projectOptions, outDirs, jsModules) {
  // If it exists, will prepend the virtual base module to all root modules.
  var virtualBaseModuleFile = getVirtualBaseModuleFile(outDirs, jsModules);
  var tasks = [];

  jsModules.forEach(function(jsModule) {
    var outputFilePath = path.join(outDirs.build, jsModule.name + '.js');

    // The virtual base module is special. Check if we need to prepend any
    // uncompiled JS to it.
    if (jsModule.name == jsModuleManager.VIRTUAL_BASE_MODULE) {
      if (jsModule.dontCompileInputFiles.length == 0) {
        return;  // Nothing to do (virtualBaseModuleFile already complete).
      }
      outputFilePath = virtualBaseModuleFile;
    }

    // Write virtual base module (if needed), uncompiled JS files, and then
    // compiled JS (if any) to the final module output JS file.
    var inputFiles = isRootModuleWithVirtualBase(jsModule) ?
        [virtualBaseModuleFile] : [];
    inputFiles = inputFiles.concat(jsModule.dontCompileInputFiles);
    if (jsModule.compiledInputFiles.length > 0) {
      inputFiles.push(getModuleCompiledJsFile(jsModule.name, outDirs));
    }

    tasks.push(writeFinalModuleJsFile(inputFiles, outputFilePath));
  });

  return kew.all(tasks);
}


/**
 * @param {!OutputDirs} outDirs
 * @param {!Array.<!{name: string, compiledInputFiles: !Array.<string>,
 *     dontCompileInputFiles: !Array.<string>}>,
 *     alwaysLoadedAfterModules: !Array.<string>} jsModules
 * @return {?string} File path to complete virtual base module, or null.
 */
function getVirtualBaseModuleFile(outDirs, jsModules) {
  // Check whether a virtual base module even exists.
  if (jsModules[0].name != jsModuleManager.VIRTUAL_BASE_MODULE) {
    return null;
  }

  // If the virtual base module doesn't have any uncompiled JS to prepend, then
  // the JS compiler output file is complete.
  if (jsModules[0].dontCompileInputFiles.length == 0) {
    return getModuleCompiledJsFile(jsModules[0].name, outDirs);
  }

  // Otherwise, we'll need to prepend uncompiled JS and output a new file.
  return path.join(outDirs.tmp,
      jsModuleManager.VIRTUAL_BASE_MODULE + '_complete.js');
}


/**
 * @param {string} moduleName
 * @param {!OutputDirs} outDirs
 * @return {string} Path to compiled module JS file.
 */
function getModuleCompiledJsFile(moduleName, outDirs) {
  return path.join(outDirs.tmp, moduleName + '.js');
}


/**
 * @param {!{name: string, compiledInputFiles: !Array.<string>,
 *     dontCompileInputFiles: !Array.<string>,
 *     alwaysLoadedAfterModules: !Array.<string>}} jsModule
 * @return {boolean}
 */
function isRootModuleWithVirtualBase(jsModule) {
  return (jsModule.alwaysLoadedAfterModules.length == 1) &&
      (jsModule.alwaysLoadedAfterModules[0] ==
          jsModuleManager.VIRTUAL_BASE_MODULE);
}


/**
 * @param {!Array.<string>} inputFiles
 * @param {string} outputFilePath
 * @return {!Promise} Tracks success/failure.
 */
function writeFinalModuleJsFile(inputFiles, outputFilePath) {
  var outputJsFile = fs.createWriteStream(outputFilePath, {encoding: 'utf8'});
  return common.writeTextFilesAsync(inputFiles, outputJsFile)
      .then(function() {
        // Close output stream.
        // TODO: Switch to kew.nfcall() when ready...
        var promise = kew.defer();
        outputJsFile.end('', 'utf8', promise.makeNodeResolver());
        return promise;
      });
}


// Symbols exported by this internal module.
module.exports = {
  JS_COMPILER_PATH: JS_COMPILER_PATH,
  build: build
};
