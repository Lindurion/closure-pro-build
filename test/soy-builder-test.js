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

var soyBuilder = require('../soy-builder.js');

var child_process = require('child_process');
var common = require('../common.js');
var dirManager = require('../dir-manager.js');
var fileMatcher = require('../file-matcher.js');
var kew = require('kew');
var path = require('path');
var should = require('should');
var sinon = require('sinon');
var testUtil = require('./test-util.js');
var underscore = require('underscore');


//==============================================================================
// Test Data
//==============================================================================

function newProjectOptions() {
  return {
    rootSrcDir: 'src/',
    soyInputFiles: ['mysoy/**/*.soy', 'direct.soy']
  };
}


function newBuildOptions() {
  return {
    type: common.DEBUG,
    javaCommand: 'myjava',
    suppressOutput: false,
    tempFileDir: 'mytmp/',
    generatedCodeDir: 'mygen/',
    outputDir: 'mybuild/'
  };
}


function newExpectedArgs(expectedInputFiles) {
  return [
    '-jar',
    soyBuilder.SOY_COMPILER_PATH,
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
    'src/',
    '--outputPathFormat',
    'mygen/{INPUT_DIRECTORY}/{INPUT_FILE_NAME}.js',
    '--srcs',
    expectedInputFiles.join(',')
  ];
}


//==============================================================================
// Stubbed Functions
//==============================================================================

var fakeResolveAnyGlobPatternsAsync = testUtil.fakeFileMatcherFor('src/', [
  {in: [], out: []},
  {
    in: ['mysoy/**/*.soy', 'direct.soy'],
    out: ['mysoy/one.soy', 'mysoy/sub/two.soy', 'direct.soy']
  },
  {in: ['nosoyhere/*.soy'], out: []},
]);


var expectedStdoutBehavior, expectedStderrBehavior;
var expectedArgs, compilerExitCode;
function fakeSpawn(command, args, options) {
  // Verify arguments.
  command.should.equal('myjava');
  should.deepEqual(args, expectedArgs);
  should.deepEqual(options,
      {stdio: ['ignore', expectedStdoutBehavior, expectedStderrBehavior]});

  // Return fake ChildProcess that simulates the Soy compiler.
  return {
    on: function(eventName, callbackFn) {
      eventName.should.equal('close');
      setTimeout(function() { callbackFn(compilerExitCode); }, 2 /* ms */);
    }
  };
}


//==============================================================================
// Test Cases
//==============================================================================

describe('soyBuilder', function() {
  var stubResolve, stubPathJoin, stubSpawn;
  before(function() {
    stubResolve = sinon.stub(fileMatcher, 'resolveAnyGlobPatternsAsync',
        fakeResolveAnyGlobPatternsAsync);
    stubPathJoin = sinon.stub(path, 'join', testUtil.pathJoin);
    stubSpawn = sinon.stub(child_process, 'spawn', fakeSpawn);
  });
  after(function() {
    stubResolve.restore();
    stubPathJoin.restore();
    stubSpawn.restore();
  });

  describe('#build()', function() {
    // Reset state before each test case.
    var projectOpts, buildOpts, outDirsAsync;
    beforeEach(function() {
      projectOpts = newProjectOptions();
      buildOpts = newBuildOptions();
      expectedStdoutBehavior = process.stdout;
      expectedStderrBehavior = process.stderr;
      compilerExitCode = common.EXIT_SUCCESS;
      outDirsAsync = kew.defer();
    });

    var makeOutDirsReady = function() {
      outDirsAsync.resolve(new dirManager.OutputDirs(buildOpts));
    };
    var makeOutDirsFail = function() {
      outDirsAsync.reject(new Error('simulated outDirsAsync error'));
    };

    var runAndExpectSuccess = function(callbackFn) {
      soyBuilder.build(projectOpts, buildOpts, outDirsAsync)
          .then(function() { callbackFn(null); })
          .end();
    };

    var runAndExpectFailure = function(expectedFailureMsg, callbackFn) {
      soyBuilder.build(projectOpts, buildOpts, outDirsAsync)
          .then(function() {
            should.fail('Was expecting Soy build() to fail with ' +
                expectedFailureMsg);
          }).fail(function(err) {
            err.message.indexOf(expectedFailureMsg).should.not.equal(-1,
                'expected <' + err.message + '> to contain <' +
                expectedFailureMsg + '>');
            callbackFn(null);
          }).end();
    };

    it('is a no-op when soyInputFiles is empty', function(callbackFn) {
      projectOpts['soyInputFiles'] = [];
      runAndExpectSuccess(callbackFn);
      makeOutDirsReady();
    });

    it('is a no-op when there are no resolved Soy files', function(callbackFn) {
      projectOpts['soyInputFiles'] = ['nosoyhere/*.soy'];
      runAndExpectSuccess(callbackFn);
      makeOutDirsReady();
    });

    it('compiles all resolved Soy files on success', function(callbackFn) {
      expectedArgs =
          newExpectedArgs(['mysoy/one.soy', 'mysoy/sub/two.soy', 'direct.soy']);
      runAndExpectSuccess(callbackFn);
      makeOutDirsReady();
    });

    it('suppresses compiler stdout/stderr output if requested',
        function(callbackFn) {
      buildOpts['suppressOutput'] = true;
      expectedStdoutBehavior = 'ignore';
      expectedStderrBehavior = 'ignore';

      expectedArgs =
          newExpectedArgs(['mysoy/one.soy', 'mysoy/sub/two.soy', 'direct.soy']);
      runAndExpectSuccess(callbackFn);
      makeOutDirsReady();
    });

    it('fails if Soy compilation fails', function(callbackFn) {
      compilerExitCode = common.EXIT_FAILURE;
      expectedArgs =
          newExpectedArgs(['mysoy/one.soy', 'mysoy/sub/two.soy', 'direct.soy']);
      runAndExpectFailure('Had errors compiling Soy', callbackFn);
      makeOutDirsReady();
    });

    it('fails if output dirs could not be created', function(callbackFn) {
      runAndExpectFailure('simulated outDirsAsync error', callbackFn);
      makeOutDirsFail();
    });
  });
});
