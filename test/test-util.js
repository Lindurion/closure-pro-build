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

var common = require('../common.js');
var kew = require('kew');
var should = require('should');
var path = require('path');
var underscore = require('underscore');


//==============================================================================
// Functions for Stubbing
//==============================================================================

// Save real path.join(), which will be stubbed by tests.
var realPathJoin = path.join;

/**
 * @param {...string} var_args
 * @return {string} Joined path, with forward slashes (regardless of platform).
 */
function pathJoin(var_args) {
  var realAnswer = realPathJoin.apply(null, arguments);
  return realAnswer.replace(common.ALL_BACKSLASHES, '/');
}


/**
 * @param {string} expectedRootSrcDir
 * @param {!Array.<!{in: !Array.<string>, out: !Array.<string>}>} resolutionList
 * @return {function(string, !Array.<string>):!Promise.<!Array.<string>>} A
 *     fake version of fileMatcher.resolveAnyGlobPatternsAsync().
 */
function fakeFileMatcherFor(expectedRootSrcDir, resolutionList) {
  return function(filesAndPatterns, rootSrcDir) {
    rootSrcDir.should.equal(expectedRootSrcDir);
    var resolvedFiles = underscore.find(resolutionList, function(resolution) {
      return underscore.isEqual(filesAndPatterns, resolution.in);
    });

    if (!resolvedFiles) {
      throw new Error('Not expecteding resolveAnyGlobPatternsAsync() for ' +
          filesAndPatterns);
    }

    return kew.delay(2 /* ms */, resolvedFiles.out);
  }
}


// Symbols exported by this internal module.
module.exports = {
  fakeFileMatcherFor: fakeFileMatcherFor,
  pathJoin: pathJoin
};
