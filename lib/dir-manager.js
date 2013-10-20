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
var kew = require('kew');
var mkdirp = require('mkdirp');
var path = require('path');
var underscore = require('underscore');

// Allow mkdirp to be stubbed in tests.
var testable = {mkdirp: mkdirp};


/**
 * Creates output directories specified by buildOptions and returns a future
 * OutputDirs object with tmp, gen, and build properties for the created paths.
 * @param {!Object} buildOptions Specifies options specific to this build (like
 *     debug/release); see README.md for option documentation.
 * @return {!Promise.<!OutputDirs>}
 */
function createOutputDirsAsync(buildOptions) {
  var outputDirs = new OutputDirs(buildOptions);

  var tasks = [];
  tasks.push(makeDirAndParents(outputDirs.tmp));
  tasks.push(makeDirAndParents(outputDirs.gen));
  tasks.push(makeDirAndParents(outputDirs.build));

  return kew.all(tasks)
      .then(function() { return outputDirs; });
}


/**
 * @param {!Object} buildOptions
 * @constructor
 */
function OutputDirs(buildOptions) {
  /** @type {string} */
  this.tmp = getOutputDir(buildOptions.tempFileDir, buildOptions.type);

  /** @type {string} */
  this.gen = getOutputDir(buildOptions.generatedCodeDir, buildOptions.type);

  /** @type {string} */
  this.build = getOutputDir(buildOptions.outputDir, buildOptions.type);
}


/**
 * @param {string} dirPath
 * @param {string} buildType
 * @return {string} The input path, standardized for the current platform, with
 *     a subdirectory for the current build type (debug/ or relase/) added.
 */
function getOutputDir(dirPath, buildType) {
  return path.join(dirPath.replace(common.ALL_BACKSLASHES, '/'), buildType + '/');
}


/**
 * @param {string} dirPath
 * @return {!Promise} A promise tracking success.
 */
function makeDirAndParents(dirPath) {
  // TODO: Add kew.nfcall() and use that instead.
  // https://github.com/Obvious/kew/pull/21
  var deferred = kew.defer();
  testable.mkdirp(dirPath, deferred.makeNodeResolver());
  return deferred.promise;
}


// Symbols exported by this internal module.
module.exports = {
  OutputDirs: OutputDirs,
  createOutputDirsAsync: createOutputDirsAsync,
  testable: testable
};
