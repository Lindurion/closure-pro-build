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
var common = require('./common.js');
var fileMatcher = require('./file-matcher.js');
var fs = require('fs');
var kew = require('kew');
var path = require('path');


var GSS_COMPILER_PATH = path.join(__dirname,
    '3p/closure-stylesheets-20130208/closure-stylesheets.jar');


/**
 * Builds project CSS as specified in the given options, using Closure
 * Stylesheets (GSS) compiler if required. Note that some projects may have no
 * cssModule, in which case this will be a no-op.
 * @param {!Object} projectOptions Specifies the project input files; see
 *     README.md for option documentation.
 * @param {!Object} buildOptions Specifies options specific to this build (like
 *     debug/release); see README.md for option documentation.
 * @param {!Promise.<!OutputDirs>} outDirsAsync
 * @return {!BuildingCss} Object that allows tracking output of CSS renaming map
 *     (if any) and overall CSS build completion.
 */
function build(projectOptions, buildOptions, outDirsAsync) {
  // Nothing to do if no CSS module is specified.
  if (!projectOptions.cssModule) {
    return new BuildingCss(kew.resolve(null), kew.resolve(null));
  }

  // Resolve input files first, since those don't depend on outDirsAsync.
  var inputsAsync = resolveInputsAsync(projectOptions);

  // Then compile GSS (which outputs CSS renaming file) and concat the
  // dontCompileInputFiles with the compiled output for the final CSS file.
  var cssRenamingFileAsync = kew.defer();
  var completionAsync = outDirsAsync.then(function(outDirs) {
    return inputsAsync
        .then(function(resolvedInputs) {
          var gssAsync = compileGssAsync(projectOptions, buildOptions,
              resolvedInputs, outDirs, cssRenamingFileAsync);
          return gssAsync.then(function(compiledCss) {
            return outputFinalCssAsync(compiledCss, projectOptions,
                resolvedInputs, outDirs);
          });
        });
  });

  return new BuildingCss(cssRenamingFileAsync, completionAsync);
}


/**
 * @param {!Promise.<?string>} cssRenamingFilePromise
 * @param {!Promise} completionPromise
 * @constructor
 */
function BuildingCss(cssRenamingFilePromise, completionPromise) {
  this.cssRenamingFilePromise_ = cssRenamingFilePromise;
  this.completionPromise_ = completionPromise;
}


/** @return {!Promise.<?string>} Yields CSS renaming filename (or null). */
BuildingCss.prototype.getCssRenamingFileAsync = function() {
  return this.cssRenamingFilePromise_;
};


/** @return {!Promise} Promise tracking overall CSS build completion. */
BuildingCss.prototype.awaitCompletion = function() {
  return this.completionPromise_;
};


//==============================================================================
// 1. Resolve Input Files
//==============================================================================

/**
 * @param {!Object} projectOptions Specifies the project input files; see
 *     README.md for option documentation.
 * @return {!Promise} Yields map with closure and dontCompile file lists.
 */
function resolveInputsAsync(projectOptions) {
  var cssModule = projectOptions.cssModule;
  var rootSrcDir = projectOptions.rootSrcDir;

  var tasks = [];
  tasks.push(fileMatcher.resolveAnyGlobPatternsAsync(
      cssModule.closureInputFiles, rootSrcDir));
  tasks.push(fileMatcher.resolveAnyGlobPatternsAsync(
      cssModule.dontCompileInputFiles, rootSrcDir));

  return kew.all(tasks)
      .then(function(results) {
        return {closure: results[0], dontCompile: results[1]};
      });
}


//==============================================================================
// 2. Invoke GSS Compiler
//==============================================================================

/**
 * If needed, invokes GSS compiler to build all resolved closureInputFiles.
 * @param {!Object} projectOptions
 * @param {!Object} buildOptions
 * @param {!{closure: !Array.<string>, dontCompile: !Array.<string>}}
 *     resolvedInputs
 * @param {!OutputDirs} outDirs
 * @param {!Promise.<?string>} cssRenamingFileAsync
 * @return {!Promise.<string>} Yields compiled CSS (empty string if none).
 */
function compileGssAsync(
    projectOptions, buildOptions, resolvedInputs, outDirs,
    cssRenamingFileAsync) {
  // If there are no resolved Closure input files: no-op.
  if (resolvedInputs.closure.length == 0) {
    cssRenamingFileAsync.resolve(null);
    return kew.resolve('');
  }

  // Spawn GSS compiler in a child process.
  var renamingFile = path.join(outDirs.tmp, 'css_renaming_map.js');
  var gssCompilerArgs = getGssCompilerArgs(projectOptions, buildOptions,
      resolvedInputs, outDirs, renamingFile);

  var stderrBehavior = buildOptions.suppressOutput ? 'ignore' : process.stderr;
  var gssCompilation = child_process.spawn(buildOptions.javaCommand,
      gssCompilerArgs, {stdio: ['ignore', 'pipe', stderrBehavior]});

  // When it is finished, also resolve CSS renaming file (which JS compilation
  // has to wait on).
  return common.getStdoutString(gssCompilation)
      .then(function(compiledCss) {
        cssRenamingFileAsync.resolve(renamingFile);
        return compiledCss;
      })
      .fail(function(e) { throw new Error('GSS compilation failed: ' + e); });
}


/**
 * @param {!Object} projectOptions
 * @param {!Object} buildOptions
 * @param {!{closure: !Array.<string>, dontCompile: !Array.<string>}}
 *     resolvedInputs
 * @param {!OutputDirs} outDirs
 * @param {string} renamingFile
 * @return {!Array.<string>} Command-line args for GSS compiler.
 */
function getGssCompilerArgs(projectOptions, buildOptions, resolvedInputs,
    outDirs, renamingFile) {
  var isDebug = (buildOptions.type == common.DEBUG);

  // Standard options:
  var args = [
    '-jar',
    GSS_COMPILER_PATH,
    '--rename',
    isDebug ? 'DEBUG' : 'CLOSURE',
    '--output-renaming-map',
    renamingFile,
    '--output-renaming-map-format',
    'CLOSURE_COMPILED'
  ];

  // Input GSS/CSS files:
  args = args.concat(resolvedInputs.closure);

  // TODO: Add support for --allow-unrecognized-property,
  // --excluded-classes-from-renaming, --input-orientation, and
  // --output-orientation.

  // Debug-specific options:
  if (isDebug) {
    args.push('--pretty-print');
  }

  return args;
}


//==============================================================================
// 3. Prepend Non-Compiled CSS to Output Final Result
//==============================================================================

/**
 * @param {string} compiledCss
 * @param {!Object} projectOptions
 * @param {!{closure: !Array.<string>, dontCompile: !Array.<string>}}
 *     resolvedInputs
 * @param {!OutputDirs} outDirs
 * @return {!Promise} To track success/failure.
 */
function outputFinalCssAsync(
    compiledCss, projectOptions, resolvedInputs, outDirs) {
  // Create final output CSS file.
  var outputCssFile = fs.createWriteStream(
      path.join(outDirs.build, projectOptions.cssModule.name + '.css'),
      {encoding: 'utf8'});

  // Write all uncompiled CSS, then write compiledCss & close output file.
  return writeUncompiledCssAsync(resolvedInputs, outputCssFile)
      .then(function() {
        // TODO: Switch to kew.nfcall() when ready...
        var promise = kew.defer();
        outputCssFile.end(compiledCss, 'utf8', promise.makeNodeResolver());
        return promise;
      });
}


/**
 * @param {!{closure: !Array.<string>, dontCompile: !Array.<string>}}
 *     resolvedInputs
 * @param {!fs.WriteStream} outputCssFile
 * @return {!Promise} To track success/failure.
 */
function writeUncompiledCssAsync(resolvedInputs, outputCssFile) {
  // Write each file in series.
  var queuedWrites = resolvedInputs.dontCompile.map(function(filePath) {
    return function(callbackFn) {
      writeUncompiledFileToOutputAsync(filePath, outputCssFile)
          .then(function() { callbackFn(null); })
          .fail(function(e) { callbackFn(e); });
    }
  });

  // TODO: Switch to kew.nfcall() when ready...
  var promise = kew.defer();
  async.series(queuedWrites, promise.makeNodeResolver());
  return promise;
}


/**
 * @param {string} filePath
 * @param {!fs.WriteStream} outputCssFile
 * @return {!Promise} To track success/failure.
 */
function writeUncompiledFileToOutputAsync(filePath, outputCssFile) {
  // Read input file in to string.
  // TODO: Switch to kew.nfcall() when ready...
  var readAsync = kew.defer();
  fs.readFile(filePath, {encoding: 'utf8'}, readAsync.makeNodeResolver());

  // Then write it to the output CSS file.
  return readAsync.then(function(uncompiledCss) {
    // TODO: Switch to kew.nfcall() when ready...
    var writeAsync = kew.defer();
    outputCssFile.write(uncompiledCss, 'utf8', writeAsync.makeNodeResolver());
    return writeAsync;
  });
}


// Symbols exported by this internal module.
module.exports = {
  GSS_COMPILER_PATH: GSS_COMPILER_PATH,
  build: build
};
