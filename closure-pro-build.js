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
var optionValidator = require('./option-validator.js');


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

// var soyJsAsync = soyBuilder.build(projectOptions, buildOptions, outDirsAsync)
//     .then(function() {
//       return jsBuilder.build(projectOptions, buildOptions, outDirsAsync,
//           buildingCss.getCssRenamingFileAsync()));
//     });
//
// kew.all([buildingCss.awaitCompletion(), soyJsAsync])
//     .then(function() { callbackFn(null); })
//     .fail(callbackFn);

  callbackFn(new Error('Not implemented yet'));
}


// [Public API] Symbols exported by this module:
module.exports = {
  build: build,
  DEBUG: common.DEBUG,
  RELEASE: common.RELEASE
};
