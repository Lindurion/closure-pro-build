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

var child_process = require('child_process');
var common = require('./common.js');
var fileMatcher = require('./file-matcher.js');
var kew = require('kew');
var path = require('path');


var SOY_COMPILER_PATH = path.join(__dirname,
    '../3p/closure-templates-20121221/js/SoyToJsSrcCompiler.jar');


/**
 * Builds project Soy as specified in the given options, using Closure
 * Templates (Soy) compiler if any Soy files are found. Note that some projects
 * may have no soy files, in which case this will be a no-op.
 * @param {!Object} projectOptions Specifies the project input files; see
 *     README.md for option documentation.
 * @param {!Object} buildOptions Specifies options specific to this build (like
 *     debug/release); see README.md for option documentation.
 * @param {!Promise.<!OutputDirs>} outDirsAsync
 * @return {!Promise} Tracks success/failure.
 */
function build(projectOptions, buildOptions, outDirsAsync) {
  return kew.all([outDirsAsync, resolveSoyInputFiles(projectOptions)])
      .then(function(results) {
        var outDirs = results[0];
        var soyInputFiles = results[1];
        return compileSoy(projectOptions, buildOptions, outDirs, soyInputFiles);
      });
}


/**
 * @param {!Object} projectOptions
 * @return {!Promise.<!Array.<string>>} The resolved list of soy files.
 */
function resolveSoyInputFiles(projectOptions) {
  return fileMatcher.resolveAnyGlobPatternsAsync(
      projectOptions.soyInputFiles, projectOptions.rootSrcDir);
}


/**
 * @param {!Object} projectOptions
 * @param {!Object} buildOptions
 * @param {!OutputDirs} outDirs
 * @param {!Array.<string>} soyInputFiles
 * @return {!Promise} Tracks success/failure.
 */
function compileSoy(projectOptions, buildOptions, outDirs, soyInputFiles) {
  // If there are no soy files in this project: no-op.
  if (soyInputFiles.length == 0) {
    return kew.resolve(null);
  }

  var soyCompilerArgs = [
    '-jar',
    SOY_COMPILER_PATH,
    '--shouldProvideRequireSoyNamespaces',
    '--allowExternalCalls',
    'false',
    '--codeStyle',
    'CONCAT',
    '--cssHandlingScheme',
    'GOOG',
    '--shouldGenerateGoogMsgDefs',
    '--useGoogIsRtlForBidiGlobalDir',
    '--shouldGenerateJsdoc',
    '--inputPrefix',
    projectOptions.rootSrcDir,
    '--outputPathFormat',
    outDirs.gen + '{INPUT_DIRECTORY}/{INPUT_FILE_NAME}.js',
    '--srcs',
    soyInputFiles.join(',')
  ];

  var stdoutBehavior = buildOptions.suppressOutput ? 'ignore' : process.stdout;
  var stderrBehavior = buildOptions.suppressOutput ? 'ignore' : process.stderr;
  var soyCompilation = child_process.spawn(buildOptions.javaCommand,
      soyCompilerArgs, {stdio: ['ignore', stdoutBehavior, stderrBehavior]});

  var promise = kew.defer();
  soyCompilation.on('close', function(exitCode) {
    if (exitCode != common.EXIT_SUCCESS) {
      promise.reject(new Error('Had errors compiling Soy'));
    } else {
      promise.resolve(null);
    }
  });

  return promise;
}


// Symbols exported by this internal module.
module.exports = {
  SOY_COMPILER_PATH: SOY_COMPILER_PATH,
  build: build
};
