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

var dirManager = require('../lib/dir-manager.js');

var common = require('../lib/common.js');
var path = require('path');
var should = require('should');
var sinon = require('sinon');
var testUtil = require('./test-util.js');
var underscore = require('underscore');


//==============================================================================
// Stub mkdirp()
//==============================================================================

// Fake mkdirp() behavior set by each test case.
var theseDirsSucceed, theseDirsFail;

function fakeMkdrip(dirPath, callbackFn) {
  // Succeed or fail mkdirp() call async, depending on test case setup.
  if (theseDirsSucceed[dirPath]) {
    setTimeout(underscore.partial(callbackFn, null), 2 /* ms */);
  } else if (theseDirsFail[dirPath]) {
    setTimeout(underscore.partial(callbackFn, new Error('sim. failure')), 2);
  } else {
    throw new Error('Not expecting mkdirp() call for path ' + dirPath);
  }
}


//==============================================================================
// Test Cases
//==============================================================================

describe('dirManager', function() {
  var stubMkdirp, stubPathJoin;
  before(function() {
    stubMkdirp = sinon.stub(dirManager.testable, 'mkdirp', fakeMkdrip);
    stubPathJoin = sinon.stub(path, 'join', testUtil.pathJoin);
  });
  after(function() {
    stubMkdirp.restore();
    stubPathJoin.restore();
  });

  describe('#createOutputDirsAsync()', function() {
    beforeEach(function() {
      // Reset state before each test.
      theseDirsSucceed = {};
      theseDirsFail = {};
    });

    var letSucceed = function(dirList) {
      dirList.forEach(function(dir) {
        theseDirsSucceed[dir] = true;
      });
    };

    var letFail = function(dirList) {
      dirList.forEach(function(dir) {
        theseDirsFail[dir] = true;
      });
    };

    var expectSuccess = function(buildOptions, tmp, gen, build, callbackFn) {
      letSucceed([tmp, gen, build]);
      dirManager.createOutputDirsAsync(buildOptions)
          .then(function(outputDirs) {
            outputDirs.tmp.should.equal(tmp);
            outputDirs.gen.should.equal(gen);
            outputDirs.build.should.equal(build);
            callbackFn(null);
          }).end();
    };

    var expectFailure = function(buildOptions, callbackFn) {
      dirManager.createOutputDirsAsync(buildOptions)
          .then(function(outputDirs) {
            should.fail('Was expecting failure');
          }).fail(function(err) {
            should.exist(err);
            should.equal(err.message, 'sim. failure');
            callbackFn(null);
          });
    };

    it('succeeds for default debug build options', function(callbackFn) {
      expectSuccess({
        'type': common.DEBUG,
        'tempFileDir': 'tmp/',
        'generatedCodeDir': 'gen/',
        'outputDir': 'build/'
      }, 'tmp/debug/', 'gen/debug/', 'build/debug/', callbackFn);
    });

    it('succeeds for default release build options', function(callbackFn) {
      expectSuccess({
        'type': common.RELEASE,
        'tempFileDir': 'tmp/',
        'generatedCodeDir': 'gen/',
        'outputDir': 'build/'
      }, 'tmp/release/', 'gen/release/', 'build/release/', callbackFn);
    });

    it('fails if any mkdirp() calls fail', function(callbackFn) {
      letSucceed(['tmp/debug/', 'build/debug/']);
      letFail(['gen/debug/']);
      expectFailure({
        'type': common.DEBUG,
        'tempFileDir': 'tmp/',
        'generatedCodeDir': 'gen/',
        'outputDir': 'build/'
      }, callbackFn);
    });

    it('fails if all mkdirp() calls fail', function(callbackFn) {
      letFail(['tmp/release/', 'gen/release/', 'build/release/']);
      expectFailure({
        'type': common.RELEASE,
        'tempFileDir': 'tmp/',
        'generatedCodeDir': 'gen/',
        'outputDir': 'build/'
      }, callbackFn);
    });

    it('respects all custom buildOptions dirs', function(callbackFn) {
      expectSuccess({
        'type': common.DEBUG,
        'tempFileDir': 'mytmp/',
        'generatedCodeDir': 'mygen/',
        'outputDir': 'mybuild/'
      }, 'mytmp/debug/', 'mygen/debug/', 'mybuild/debug/', callbackFn);
    });

    it('converts backslashes to forward slashes', function(callbackFn) {
      expectSuccess({
        'type': common.DEBUG,
        'tempFileDir': 'mytmp\\',
        'generatedCodeDir': 'gen/',
        'outputDir': 'build/'
      }, 'mytmp/debug/', 'gen/debug/', 'build/debug/', callbackFn);
    });

    it('tolerates dirs without trailing slashes', function(callbackFn) {
      expectSuccess({
        'type': common.RELEASE,
        'tempFileDir': 'mytmp',
        'generatedCodeDir': 'gen/',
        'outputDir': 'bin'
      }, 'mytmp/release/', 'gen/release/', 'bin/release/', callbackFn);
    });
  });
});
