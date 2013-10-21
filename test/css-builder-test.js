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

var cssBuilder = require('../lib/css-builder.js');

var child_process = require('child_process');
var common = require('../lib/common.js');
var dirManager = require('../lib/dir-manager.js');
var fileMatcher = require('../lib/file-matcher.js');
var fs = require('fs');
var kew = require('kew');
var path = require('path');
var should = require('should');
var shouldContain = require('./test-util.js').shouldContain;
var sinon = require('sinon');
var stream = require('stream');
var testUtil = require('./test-util.js');
var underscore = require('underscore');


//==============================================================================
// Test Data
//==============================================================================

function newProjectOptions() {
  return {
    rootSrcDir: 'mysrc/',
    cssModule: {
      name: 'mystyle',
      closureInputFiles: ['style.gss', 'css/*.css'],
      dontCompileInputFiles: ['3p/style/*.css']
    }
  };
}


function newBuildOptions() {
  return {
    type: common.DEBUG,
    javaCommand: 'myjava',
    suppressOutput: false,
    tempFileDir: 'mytmp',
    generatedCodeDir: 'mygen',
    outputDir: 'mybuild'
  };
}


function newExpectedArgs(renameType, renamingFile, isPrettyPrint) {
  var expectedArgs = [
    '-jar',
    cssBuilder.GSS_COMPILER_PATH,
    '--rename',
    renameType,
    '--output-renaming-map',
    renamingFile,
    '--output-renaming-map-format',
    'CLOSURE_COMPILED',
    'style.gss',
    'css/one.css',
    'css/two.css'
  ];
  if (isPrettyPrint) {
    expectedArgs.push('--pretty-print');
  }
  return expectedArgs;
}


var FAKE_COMPILER_OUT_CHUNK1 = '.someCompiledCss1 { color: red; }';
var FAKE_COMPILER_OUT_CHUNK2 = '.someCompiledCss2 { color: green; }';
var FAKE_COMPILER_OUT_CHUNK3 = '.someCompiledCss3 { color: blue; }';

var FAKE_UNCOMPILED1 = '.dontCompileMe1 { color: orange; }';
var FAKE_UNCOMPILED2 = '.dontCompileMe2 { color: yellow; }';
var FAKE_FILE_CONTENTS = {
  '3p/style/a.css': FAKE_UNCOMPILED1,
  '3p/style/b.css': FAKE_UNCOMPILED2
};

var EXPECTED_COMPILED_CSS = FAKE_COMPILER_OUT_CHUNK1 +
    FAKE_COMPILER_OUT_CHUNK2 + FAKE_COMPILER_OUT_CHUNK3;
var EXPECTED_UNCOMPILED_CSS = FAKE_UNCOMPILED1 + FAKE_UNCOMPILED2;
var EXPECTED_OUTPUT_CSS = EXPECTED_UNCOMPILED_CSS + EXPECTED_COMPILED_CSS;


//==============================================================================
// Stubbed Functions
//==============================================================================

var fakeResolveAnyGlobPatternsAsync = testUtil.fakeFileMatcherFor('mysrc/', [
  {in: [], out: []},
  {
    in: ['style.gss', 'css/*.css'],
    out: ['style.gss', 'css/one.css', 'css/two.css']
  },
  {in: ['3p/style/*.css'], out: ['3p/style/a.css', '3p/style/b.css']}
]);


var expectedArgs, expectedStderrBehavior, compilerExitCode;
function fakeSpawn(command, args, options) {
  // Verify arguments.
  command.should.equal('myjava');
  should.deepEqual(args, expectedArgs);
  should.deepEqual(options,
      {stdio: ['ignore', 'pipe', expectedStderrBehavior]});

  // Return fake ChildProcess that simulates the GSS compiler output.
  var awaitOutput = kew.defer();
  return {
    stdout: {
      setEncoding: function(encoding) { encoding.should.equal('utf8'); },
      on: function(eventName, callbackFn) {
        eventName.should.equal('data');
        kew.delay(2 /* ms */)
            .then(function() { callbackFn(FAKE_COMPILER_OUT_CHUNK1); })
            .then(function() { callbackFn(FAKE_COMPILER_OUT_CHUNK2); })
            .then(function() { callbackFn(FAKE_COMPILER_OUT_CHUNK3); })
            .then(function() { awaitOutput.resolve(null); })
            .end();
      }
    },
    on: function(eventName, callbackFn) {
      eventName.should.equal('close');
      awaitOutput
          .then(function() { callbackFn(compilerExitCode); })
          .end();
    }
  };
}


var expectedOutFilePath, mockOutFile;
function fakeCreateWriteStream(outFile, options) {
  outFile.should.equal(expectedOutFilePath);
  should.deepEqual(options, {encoding: 'utf8'});
  return mockOutFile;
}


var readFileFailsFor;
function fakeReadFile(filePath, options, callbackFn) {
  should.deepEqual(options, {encoding: 'utf8'});

  var contents = FAKE_FILE_CONTENTS[filePath];
  if (!contents) {
    throw new Error('Not expecting fs.readFile() call for ' + filePath);
  }

  if (readFileFailsFor[filePath]) {
    callbackFn(new Error('simulated error reading ' + filePath));
  } else {
    callbackFn(null, contents);
  }
}


//==============================================================================
// Test Cases
//==============================================================================

describe('cssBuilder', function() {
  var stubResolve, stubPathJoin, stubSpawn, stubCreateWriteStream, stubReadFile;
  before(function() {
    stubResolve = sinon.stub(fileMatcher, 'resolveAnyGlobPatternsAsync',
        fakeResolveAnyGlobPatternsAsync);
    stubPathJoin = sinon.stub(path, 'join', testUtil.pathJoin);
    stubSpawn = sinon.stub(child_process, 'spawn', fakeSpawn);
    stubCreateWriteStream = sinon.stub(fs, 'createWriteStream',
        fakeCreateWriteStream);
    stubReadFile = sinon.stub(fs, 'readFile', fakeReadFile);
  });
  after(function() {
    stubResolve.restore();
    stubPathJoin.restore();
    stubSpawn.restore();
    stubCreateWriteStream.restore();
    stubReadFile.restore();
  });

  describe('#build()', function() {
    // Reset state before each test case.
    var projectOpts, buildOpts, outDirsAsync, outFileExpectations;
    beforeEach(function() {
      projectOpts = newProjectOptions();
      buildOpts = newBuildOptions();
      expectedStderrBehavior = process.stderr;
      compilerExitCode = common.EXIT_SUCCESS;
      readFileFailsFor = {};
      outDirsAsync = kew.defer();
      mockOutFile = new stream.Writable({});
      outFileExpectations = sinon.mock(mockOutFile);
    });
    afterEach(function() { outFileExpectations.verify(); });

    var expectDebugCompile = function() {
      buildOpts.type = common.DEBUG;
      expectedArgs = newExpectedArgs(
          'DEBUG', 'mytmp/debug/css_renaming_map.js', true /* pretty? */);
      expectedOutFilePath = 'mybuild/debug/mystyle.css';
    };
    var expectReleaseCompile = function() {
      buildOpts.type = common.RELEASE;
      expectedArgs = newExpectedArgs(
          'CLOSURE', 'mytmp/release/css_renaming_map.js', false /* pretty? */);
      expectedOutFilePath = 'mybuild/release/mystyle.css';
    };

    var makeOutDirsReady = function() {
      outDirsAsync.resolve(new dirManager.OutputDirs(buildOpts));
    };
    var makeOutDirsFail = function() {
      outDirsAsync.reject(new Error('simulated outDirsAsync error'));
    };

    var SKIP = 's', OK = 'o', FAIL = 'f', EMPTY = 'e';
    var expectOutputWrites = function(uncompiled1, uncompiled2, compiled) {
      var err = new Error('simulated write error');

      if (uncompiled1 != SKIP) {
        outFileExpectations.expects('write')
            .withArgs(FAKE_UNCOMPILED1, 'utf8')
            .callsArgWithAsync(2, (uncompiled1 != FAIL) ? null : err);
      }

      if (uncompiled2 != SKIP) {
        outFileExpectations.expects('write')
            .withArgs(FAKE_UNCOMPILED2, 'utf8')
            .callsArgWithAsync(2, (uncompiled2 != FAIL) ? null : err);
      }

      if (compiled != SKIP) {
        outFileExpectations.expects('end')
            .withArgs((compiled == EMPTY) ? '' : EXPECTED_COMPILED_CSS, 'utf8')
            .callsArgWithAsync(2, (compiled != FAIL) ? null : err);
      }
    };

    var runAndExpectSuccess = function(expectedRenamingFile, callbackFn) {
      var res = cssBuilder.build(projectOpts, buildOpts, outDirsAsync);
      kew.all([res.getCssRenamingFileAsync(), res.awaitCompletion()])
          .then(function(results) {
            should.equal(results[0], expectedRenamingFile);
            should.not.exist(results[1]);
            callbackFn(null);
          }).end();
    };

    var runAndExpectFailure = function(expectedFailureMsg, callbackFn) {
      var res = cssBuilder.build(projectOpts, buildOpts, outDirsAsync);
      kew.all([res.getCssRenamingFileAsync(), res.awaitCompletion()])
          .then(function(results) {
            should.fail('Was expecting CSS build() to fail with ' +
                expectedFailureMsg);
          }).fail(function(err) {
            shouldContain(err.message, expectedFailureMsg);
            callbackFn(null);
          }).end();
    };

    it('is a no-op when cssModule not given', function(callbackFn) {
      delete projectOpts.cssModule;
      runAndExpectSuccess(null, callbackFn);
    });

    it('works for projects with closureInputFiles and dontCompileInputFiles',
        function(callbackFn) {
      expectDebugCompile();
      expectOutputWrites(OK, OK, OK);
      runAndExpectSuccess('mytmp/debug/css_renaming_map.js', callbackFn);

      makeOutDirsReady();
    });

    it('compiles a dontCompileInputFiles-only project successfully',
        function(callbackFn) {
      projectOpts.cssModule.closureInputFiles = [];

      expectDebugCompile();
      expectOutputWrites(OK, OK, EMPTY);
      runAndExpectSuccess(null, callbackFn);

      makeOutDirsReady();
    });

    it('compiles a closureInputFiles-only project successfully',
        function(callbackFn) {
      projectOpts.cssModule.dontCompileInputFiles = [];

      expectReleaseCompile();
      expectOutputWrites(SKIP, SKIP, OK);
      runAndExpectSuccess('mytmp/release/css_renaming_map.js', callbackFn);

      makeOutDirsReady();
    });

    it('suppresses compiler standard error output if requested',
        function(callbackFn) {
      buildOpts.suppressOutput = true;
      expectedStderrBehavior = 'ignore';

      expectReleaseCompile();
      expectOutputWrites(OK, OK, OK);
      runAndExpectSuccess('mytmp/release/css_renaming_map.js', callbackFn);

      makeOutDirsReady();
    });

    it('fails if GSS compiler fails', function(callbackFn) {
      compilerExitCode = common.EXIT_FAILURE;

      expectDebugCompile();
      runAndExpectFailure('GSS compilation failed', callbackFn);

      makeOutDirsReady();
    });

    it('fails if an uncompiled input file read fails', function(callbackFn) {
      readFileFailsFor['3p/style/b.css'] = true;

      expectDebugCompile();
      expectOutputWrites(OK, SKIP, SKIP);
      runAndExpectFailure('simulated error reading 3p/style/b.css', callbackFn);

      makeOutDirsReady();
    });

    it('fails if writing an uncompiled CSS file fails', function(callbackFn) {
      expectReleaseCompile();
      expectOutputWrites(FAIL, SKIP, SKIP);
      runAndExpectFailure('simulated write error', callbackFn);

      makeOutDirsReady();
    });

    it('fails if writing a compiled CSS fails', function(callbackFn) {
      expectDebugCompile();
      expectOutputWrites(OK, OK, FAIL);
      runAndExpectFailure('simulated write error', callbackFn);

      makeOutDirsReady();
    });

    it('fails if output dirs could not be created', function(callbackFn) {
      expectReleaseCompile();
      runAndExpectFailure('simulated outDirsAsync error', callbackFn);

      makeOutDirsFail();
    });
  });
});
