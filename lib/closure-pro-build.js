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

var common = require('./common.js');
var cssBuilder = require('./css-builder.js');
var dirManager = require('./dir-manager.js');
var fileMatcher = require('./file-matcher.js');
var kew = require('kew');
var optionValidator = require('./option-validator.js');
var soyBuilder = require('./soy-builder.js');


/**
 * Builds project as specified in the given options, using (if required)
 * Closure's JS Compiler, Templates (Soy), Stylesheets (GSS), and JS Library.
 * @param {!Object} projectOptions Specifies the project input files; see
 *     README.md for option documentation.
 * @param {!Object} buildOptions Specifies options specific to this build (like
 *     debug/release); see README.md for option documentation.
 * @param {function(Error)} callbackFn Called when building is complete with
 *     null on success, or an Error on failure.
 */
function build(projectOptions, buildOptions, callbackFn) {
  optionValidator.assertValidAndFillDefaults(projectOptions, buildOptions);
  var outDirsAsync = dirManager.createOutputDirsAsync(buildOptions);

  var buildingCss =
      cssBuilder.build(projectOptions, buildOptions, outDirsAsync);

  var soyJsAsync = soyBuilder.build(projectOptions, buildOptions, outDirsAsync)
     .then(function() {
       throw new Error('JS compilation not implemented yet');
//     return jsBuilder.build(projectOptions, buildOptions, outDirsAsync,
//         buildingCss.getCssRenamingFileAsync()));
     });

  kew.all([buildingCss.awaitCompletion(), soyJsAsync])
     .then(function() { callbackFn(null); })
     .fail(callbackFn);
}


/**
 * As an exported convenience function, expands all glob patterns in the given
 * list of filesAndPatterns into the list of matched files.
 * @param {!Array.<string>} filesAndPatterns List of files and file patterns,
 *     e.g. ['my/single/file.js', 'dir/of/*.js'].
 * @param {string} rootDir Root directory that filesAndPatterns are relative to.
 * @param {function(Error, Array.<string>=)} callbackFn Called with the list of
 *     expanded files on success, or an Error on failure.
 */
function expandFileGlobs(filesAndPatterns, rootDir, callbackFn) {
  fileMatcher.resolveAnyGlobPatternsAsync(filesAndPatterns, rootDir)
      .then(function(result) { callbackFn(null, result); })
      .fail(function(err) { callbackFn(err); });
}


// [Public API] Symbols exported by this module:
module.exports = {
  build: build,
  expandFileGlobs: expandFileGlobs,
  DEBUG: common.DEBUG,
  RELEASE: common.RELEASE
};
