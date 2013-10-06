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

var fileMatcher = require('./file-matcher.js');
var kew = require('kew');


/**
 * Builds project CSS as specified in the given options, using Closure
 * Stylesheets (GSS) compiler if required. Note that some projects may have no
 * cssModule, in which case this will be a no-op.
 * @param {!Object} projectOptions Specifies the project input files; see
 *     README.md for option documentation.
 * @param {!Object} buildOptions Specifies options specific to this build (like
 *     debug/release); see README.md for option documentation.
 * @param {!Promise.<!OutputDirs>}
 * @return {!BuildingCss} Object that allows tracking output of CSS renaming map
 *     (if any) and overall CSS build completion.
 */
function build(projectOptions, buildOptions, outDirsAsync) {
  // Nothing to do if no CSS module is specified.
  if (!projectOptions['cssModule']) {
    return new BuildingCss(kew.resolve(null), kew.resolve(null));
  }

  // Resolve input files first, since those don't depend on outDirsAsync.
  var inputsAsync = resolveInputsAsync(projectOptions);

  // Then compile GSS (which outputs CSS renaming file) and concat the
  // dontCompileInputFiles with the compiled output for the final CSS file.
  var cssRenamingFile = kew.defer();
  var completionAsync = outDirsAsync.then(function(outDirs) {
    return inputsAsync
        .then(function(resolvedInputs) {
          return compileGssAsync(projectOptions, buildOptions,
              resolvedInputs, outDirs, cssRenamingFile);
        }).then(function() {
          return outputFinalCssAsync(projectOptions, resolvedInputs, outDirs);
        });
  });

  return new BuildingCss(cssRenamingFile.promise, completionAsync);
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


/**
 * @param {!Object} projectOptions Specifies the project input files; see
 *     README.md for option documentation.
 * @return {!Promise} Map with closure and dontCompile file list properties.
 */
function resolveInputsAsync(projectOptions) {
  var cssModule = projectOptions['cssModule'];
  var rootSrcDir = projectOptions['rootSrcDir'];

  var tasks = [];
  tasks.push(fileMatcher.resolveAnyGlobPatternsAsync(
      cssModule['closureInputFiles'] || [], rootSrcDir));
  tasks.push(fileMatcher.resolveAnyGlobPatternsAsync(
      cssModule['dontCompileInputFiles'] || [], rootSrcDir));

  return kew.all(tasks)
      .then(function(results) {
        return {closure: results[0], dontCompile: results[1]};
      });
}


// Symbols exported by this internal module.
module.exports = {build: build};
