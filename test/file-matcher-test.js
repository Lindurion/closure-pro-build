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

var fileMatcher = require('../file-matcher.js');

var glob = require('glob');
var should = require('should');
var sinon = require('sinon');
var underscore = require('underscore');


//==============================================================================
// Stub glob.Glob to Return Fake Test Data
//==============================================================================

var ROOT_SRC_DIR = 'src/';

var FAKE_RESOLUTIONS = {
  '**/f4*': ['sub/f4.js'],
  '*.js': ['f1.js', 'f2.js'],
  'sub/*.js': ['sub/f3.js', 'sub/f4.js'],
  'sub/f[4-6].js': ['sub/f4.js'],
  'sub\\\\*.js': ['sub\\f3.js', 'sub\\f4.js']
};

sinon.stub(glob, 'Glob', function(pattern, options, callbackFn) {
  should.deepEqual(options, {cwd: ROOT_SRC_DIR});

  if (pattern == '*fail-for-test*') {
    callbackFn(new Error('intentional glob failure for testing'));
    return;
  }

  var resolvedFiles = FAKE_RESOLUTIONS[pattern];
  if (!resolvedFiles) {
    should.fail('Not expecting glob.Glob() call with pattern ' + pattern);
  }

  // Return answer async.
  setTimeout(underscore.partial(callbackFn, null, resolvedFiles), 2 /* ms */);
});


//==============================================================================
// Test Cases
//==============================================================================

describe('fileMatcher', function() {
  describe('#resolveAnyGlobPatterns()', function() {
    var inputFiles;
    beforeEach(function() {
      // Reset state before each test.
      inputFiles = [];
    });

    var expectResolved = function(expectedResolvedFiles, callbackFn) {
      fileMatcher.resolveAnyGlobPatterns(inputFiles, ROOT_SRC_DIR,
          function(err, allFiles) {
            should.not.exist(err);
            should.deepEqual(allFiles, expectedResolvedFiles);
            callbackFn(null);
          });
    }

    var expectFailure = function(expectedErrorMessage, callbackFn) {
      fileMatcher.resolveAnyGlobPatterns(inputFiles, ROOT_SRC_DIR,
          function(err, allFiles) {
            should.exist(err);
            should.equal(err.message, expectedErrorMessage);
            should.not.exist(allFiles);
            callbackFn(null);
          });
    }

    it('passes back a simple list of files unaltered', function(callbackFn) {
      inputFiles = ['f1.js', 'f2.js'];
      expectResolved(['f1.js', 'f2.js'], callbackFn);
    });

    it('replaces backslashes in a simple list of files', function(callbackFn) {
      inputFiles = ['f1.js', 'sub\\f3.js'];
      expectResolved(['f1.js', 'sub/f3.js'], callbackFn);
    });

    it('removes duplicate files in simple list of files', function(callbackFn) {
      inputFiles = ['sub/f3.js', 'f1.js', 'f2.js', 'f1.js'];
      expectResolved(['sub/f3.js', 'f1.js', 'f2.js'], callbackFn);
    });

    it('inserts resolved files in the position of the glob pattern',
        function(callbackFn) {
      inputFiles = ['sub/f3.js', '*.js'];
      expectResolved(['sub/f3.js', 'f1.js', 'f2.js'], callbackFn);
    });

    it('treats backslashes in glob patterns as part of the regex',
        function(callbackFn) {
      inputFiles = ['f1.js', 'sub\\\\*.js', 'f2.js'];
      expectResolved(['f1.js', 'sub/f3.js', 'sub/f4.js', 'f2.js'], callbackFn);
    });

    it('treats regex characters other than * as glob patterns too',
        function(callbackFn) {
      inputFiles = ['sub/f[4-6].js'];
      expectResolved(['sub/f4.js'], callbackFn);
    });

    it('removes duplicate file paths across multiple resolved globs',
        function(callbackFn) {
      inputFiles = ['**/f4*', 'sub/*.js', 'f1.js'];
      expectResolved(['sub/f4.js', 'sub/f3.js', 'f1.js'], callbackFn);
    });

    it('fails if any glob lookups fail', function(callbackFn) {
      inputFiles = ['*.js', '*fail-for-test*', 'sub/f3.js'];
      expectFailure('intentional glob failure for testing', callbackFn);
    });
  });
});
