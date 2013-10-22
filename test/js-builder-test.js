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

var jsBuilder = require('../lib/js-builder.js');

var child_process = require('child_process');
var closureDepCalculator = require('../lib/closure-dep-calculator.js');
var common = require('../lib/common.js');
var dirManager = require('../lib/dir-manager.js');
var fileMatcher = require('../lib/file-matcher.js');
var fs = require('fs');
var jsModuleManager = require('../lib/js-module-manager.js');
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

function newServerModule() {
  return {
    alwaysLoadedAfterModules: [],
    dontCompileInputFiles: ['uncompiled_common.js', 'uncompiled_server.js'],
    nonClosureNamespacedInputFiles: ['3p/**/*.js'],
    closureRootNamespaces: ['project.server']
  };
}


function newClientAModule() {
  return {
    alwaysLoadedAfterModules: [],
    dontCompileInputFiles: ['uncompiled_common.js', 'uncompiled_client_a.js'],
    nonClosureNamespacedInputFiles: [],
    closureRootNamespaces: []
  };
}


function newClientBModule() {
  return {
    alwaysLoadedAfterModules: ['clientA'],
    dontCompileInputFiles: [],
    nonClosureNamespacedInputFiles: ['3p/**/*.js'],
    closureRootNamespaces: ['project.clientb']
  };
}


var TRANSITIVE_CLOSURE_DEPS = {
  'project.server': ['base.js', 'array.js', 'server.js'],
  'project.clientb': ['base.js', 'dom.js', 'client_b.js']
};


function newProjectOptions() {
  return {
    rootSrcDir: 'mysrc/',
    jsModules: {
      server: newServerModule(),
      clientA: newClientAModule(),
      clientB: newClientBModule()
    },
    jsExterns: []
  };
}


function newBuildOptions() {
  return {
    type: common.RELEASE,
    javaCommand: 'myjava',
    suppressOutput: false,
    tempFileDir: 'mytmp',
    generatedCodeDir: 'mygen',
    outputDir: 'mybuild'
  };
}


var FAKE_FILE_CONTENTS = {
  'uncompiled_common.js': 'console.log("uncompiled_common");',
  'uncompiled_server.js': 'console.log("uncompiled_server");',
  'uncompiled_client_a.js': 'console.log("uncompiled_client_a");',
  'mytmp/debug/virtual_base_module.js':
      'console.log("debug! virtual_base_module");',
  'mytmp/debug/virtual_base_module_complete.js':
      'console.log("debug! virtual_base_module_complete");',
  'mytmp/debug/server.js': 'console.log("debug! server");',
  'mytmp/debug/clientB.js': 'console.log("debug! clientB");',
  'mytmp/release/virtual_base_module.js': 'console.log("virtual_base_module");',
  'mytmp/release/virtual_base_module_complete.js':
      'console.log("virtual_base_module_complete");',
  'mytmp/release/server.js': 'console.log("server");',
  'mytmp/release/clientB.js': 'console.log("clientB");'
};


function newExpectedBasicArgs(compilationLevel, outputPathPrefix) {
  return [
    '-jar',
    jsBuilder.JS_COMPILER_PATH,
    '--compilation_level',
    compilationLevel,
    '--module_output_path_prefix',
    outputPathPrefix
  ];
}


function newExpectedDebugArgs(remainingArgs) {
  return newExpectedBasicArgs('SIMPLE_OPTIMIZATIONS', 'mytmp/debug/')
      .concat(['--formatting', 'PRETTY_PRINT'])
      .concat(remainingArgs);
}


function newExpectedReleaseArgs(remainingArgs) {
  return newExpectedBasicArgs('ADVANCED_OPTIMIZATIONS', 'mytmp/release/')
      .concat(['--define', 'goog.DEBUG=false'])
      .concat(remainingArgs);
}


//==============================================================================
// Stubbed Functions
//==============================================================================

var fakeResolveAnyGlobPatternsAsync = testUtil.fakeFileMatcherFor('mysrc/', [
  {in: [], out: []},
  {
    in: ['uncompiled_common.js', 'uncompiled_server.js'],
    out: ['uncompiled_common.js', 'uncompiled_server.js']
  },
  {
    in: ['uncompiled_common.js', 'uncompiled_client_a.js'],
    out: ['uncompiled_common.js', 'uncompiled_client_a.js']
  },
  {in: ['3p/**/*.js'], out: ['3p/jquery.js']}
]);


var simulateCalcDepsFailure;
function fakeCalcDeps(projectOptions, buildOptions, outDirs) {
  if (simulateCalcDepsFailure) {
    return kew.reject(new Error('simulated calc deps failures'));
  }

  var fakeTransitiveClosureDeps = {};

  for (var moduleName in projectOptions.jsModules) {
    var deps = [];
    var namespaces = projectOptions.jsModules[moduleName].closureRootNamespaces;
    namespaces.length.should.be.below(2);
    if (namespaces[0]) {
      deps = TRANSITIVE_CLOSURE_DEPS[namespaces[0]];
    }

    fakeTransitiveClosureDeps[moduleName] = deps;
  }

  return kew.delay(2 /* ms */, fakeTransitiveClosureDeps);
}


// Stub jsModuleManager.calcInputFiles() to return modules in a stable order
// for testing (and to simulate failures).
var MODULE_ORDER = ['virtual_base_module', 'server', 'clientA', 'clientB'];
var realCalcInputFiles = jsModuleManager.calcInputFiles;
var simulateJsModuleManagerError;
function stableCalcInputFiles(projectOptions, transitiveClosureDeps) {
  if (simulateJsModuleManagerError) {
    throw new Error('simulated JS module manager error');
  }

  var results = realCalcInputFiles(projectOptions, transitiveClosureDeps);
  results.sort(function(first, second) {
    return MODULE_ORDER.indexOf(first.name) - MODULE_ORDER.indexOf(second.name);
  });
  return results;
}


var expectedArgs, expectedStderrBehavior, compilerExitCode;
function fakeSpawn(command, args, options) {
  // Verify arguments.
  command.should.equal('myjava');
  try {
    should.deepEqual(args, expectedArgs);
  } catch(e) {
    console.error('\nactual args:\n' + args);
    console.error('\nexpected args:\n' + expectedArgs);
    throw e;
  }

  should.deepEqual(options,
      {stdio: ['ignore', 'pipe', expectedStderrBehavior]});

  // Return fake ChildProcess that simulates the JS compiler.
  return {
    on: function(eventName, callbackFn) {
      eventName.should.equal('close');
      setTimeout(function() { callbackFn(compilerExitCode); }, 2 /* ms */);
    }
  };
}


var mockOutFiles;
function fakeCreateWriteStream(outFile, options) {
  should.exist(mockOutFiles[outFile]);
  should.deepEqual(options, {encoding: 'utf8'});
  return mockOutFiles[outFile];
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

describe('jsBuilder', function() {
  var stubResolve, stubPathJoin, stubSpawn, stubCreateWriteStream, stubReadFile;
  var stubCalcDeps, stubCalcInputFiles;
  before(function() {
    stubResolve = sinon.stub(fileMatcher, 'resolveAnyGlobPatternsAsync',
        fakeResolveAnyGlobPatternsAsync);
    stubPathJoin = sinon.stub(path, 'join', testUtil.pathJoin);
    stubSpawn = sinon.stub(child_process, 'spawn', fakeSpawn);
    stubCreateWriteStream = sinon.stub(fs, 'createWriteStream',
        fakeCreateWriteStream);
    stubReadFile = sinon.stub(fs, 'readFile', fakeReadFile);
    stubCalcDeps = sinon.stub(closureDepCalculator, 'calcDeps', fakeCalcDeps);
    stubCalcInputFiles = sinon.stub(jsModuleManager, 'calcInputFiles',
        stableCalcInputFiles);
  });
  after(function() {
    stubResolve.restore();
    stubPathJoin.restore();
    stubSpawn.restore();
    stubCreateWriteStream.restore();
    stubReadFile.restore();
    stubCalcDeps.restore();
    stubCalcInputFiles.restore();
  });

  describe('#build()', function() {
    // Reset state before each test case.
    var projectOpts, buildOpts, outDirsAsync, cssFileAsync, outFileExpectations;
    beforeEach(function() {
      projectOpts = newProjectOptions();
      buildOpts = newBuildOptions();
      simulateCalcDepsFailure = false;
      simulateJsModuleManagerError = false;
      expectedStderrBehavior = process.stderr;
      compilerExitCode = common.EXIT_SUCCESS;
      readFileFailsFor = {};
      outDirsAsync = kew.defer();
      cssFileAsync = kew.defer();
      mockOutFiles = {};
      outFileExpectations = {};
    });
    afterEach(function() {
      underscore.values(outFileExpectations).forEach(function(expectations) {
        expectations.verify();
      });
    });

    var makeOutDirsReady = function() {
      outDirsAsync.resolve(new dirManager.OutputDirs(buildOpts));
    };
    var makeOutDirsFail = function() {
      outDirsAsync.reject(new Error('simulated outDirsAsync error'));
    };

    var haveNoCssRenamingFile = function() {
      cssFileAsync.resolve(null);
    };
    var makeCssRenamingFileReady = function() {
      var dir = (buildOpts.type == common.DEBUG) ?
          'mytmp/debug/' : 'mytmp/release/';
      cssFileAsync.resolve(dir + 'css_renaming_map.js');
    };
    var makeCssRenamingFileFail = function() {
      cssFileAsync.reject(new Error('simulated CSS renaming file failure'));
    };

    var expectFileOutput = function(outputFilePath, inputFiles, failureOpts) {
      failureOpts = failureOpts || {};
      var failWriteIndex = failureOpts.failLastWrite ?
          inputFiles.length - 1 : null;

      mockOutFiles[outputFilePath] = new stream.Writable({});
      outFileExpectations[outputFilePath] =
          sinon.mock(mockOutFiles[outputFilePath]);

      for (var i = 0; i < inputFiles.length; i++) {
        var writeResult = (i == failWriteIndex) ?
            new Error('simulated write() failure') : null;
        var content = FAKE_FILE_CONTENTS[inputFiles[i]];
        outFileExpectations[outputFilePath].expects('write')
            .withArgs(content, 'utf8')
            .callsArgWithAsync(2, writeResult);
      }

      if (!failureOpts.failLastWrite && !failureOpts.shouldFailBeforeEnd) {
        outFileExpectations[outputFilePath].expects('end')
            .withArgs('', 'utf8')
            .callsArgWithAsync(2, null);
      }
    };

    var runAndExpectSuccess = function(callbackFn) {
      jsBuilder.build(projectOpts, buildOpts, outDirsAsync, cssFileAsync)
          .then(function() { callbackFn(null); })
          .end();
    };
    var runAndExpectFailure = function(expectedFailureMsg, callbackFn) {
      jsBuilder.build(projectOpts, buildOpts, outDirsAsync, cssFileAsync)
          .then(function() {
            should.fail('Was expecting JS build() to fail with ' +
                expectedFailureMsg);
          }).fail(function(err) {
            shouldContain(err.message, expectedFailureMsg);
            callbackFn(null);
          }).end();
    };

    it('correctly builds a project with no virtual base module',
        function(callbackFn) {
      projectOpts.jsModules = {server: newServerModule()};
      expectedArgs = newExpectedReleaseArgs([
        '--module',
        'server:4:',
        '--js',
        '3p/jquery.js',
        '--js',
        'base.js',
        '--js',
        'array.js',
        '--js',
        'server.js'
      ]);
      expectFileOutput('mybuild/release/server.js', [
        'uncompiled_common.js',
        'uncompiled_server.js',
        'mytmp/release/server.js'
      ]);

      runAndExpectSuccess(callbackFn);
      makeOutDirsReady();
      haveNoCssRenamingFile();
    });

    it('correctly builds a virtual base module with only compiled JS',
        function(callbackFn) {
      var clientBModule = newClientBModule();
      clientBModule.alwaysLoadedAfterModules = [];
      projectOpts.jsModules = {
        server: newServerModule(),
        clientB: clientBModule
      };

      expectedArgs = newExpectedReleaseArgs([
        '--module',
        'virtual_base_module:3:',
        '--js',
        'mytmp/release/css_renaming_map.js',
        '--js',
        '3p/jquery.js',
        '--js',
        'base.js',
        '--module',
        'server:2:virtual_base_module',
        '--js',
        'array.js',
        '--js',
        'server.js',
        '--module',
        'clientB:2:virtual_base_module',
        '--js',
        'dom.js',
        '--js',
        'client_b.js'
      ]);
      expectFileOutput('mybuild/release/server.js', [
        'mytmp/release/virtual_base_module.js',
        'uncompiled_common.js',
        'uncompiled_server.js',
        'mytmp/release/server.js'
      ]);
      expectFileOutput('mybuild/release/clientB.js', [
        'mytmp/release/virtual_base_module.js',
        'mytmp/release/clientB.js'
      ]);

      runAndExpectSuccess(callbackFn);
      makeOutDirsReady();
      makeCssRenamingFileReady();
    });

    it('correctly builds a virtual base module with only uncompiled JS',
        function(callbackFn) {
      buildOpts.type = common.DEBUG;
      projectOpts.jsModules = {
        server: newServerModule(),
        clientA: newClientAModule()
      };

      expectedArgs = newExpectedDebugArgs([
        '--module',
        'server:4:',
        '--js',
        '3p/jquery.js',
        '--js',
        'base.js',
        '--js',
        'array.js',
        '--js',
        'server.js'
      ]);
      expectFileOutput('mytmp/debug/virtual_base_module_complete.js', [
        'uncompiled_common.js'
      ]);
      expectFileOutput('mybuild/debug/server.js', [
        'mytmp/debug/virtual_base_module_complete.js',
        'uncompiled_server.js',
        'mytmp/debug/server.js'
      ]);
      expectFileOutput('mybuild/debug/clientA.js', [
        'mytmp/debug/virtual_base_module_complete.js',
        'uncompiled_client_a.js'
      ]);

      runAndExpectSuccess(callbackFn);
      makeOutDirsReady();
      haveNoCssRenamingFile();
    });

    it('correctly builds a virtual base module with compiled & uncompiled JS',
        function(callbackFn) {
      expectedArgs = newExpectedReleaseArgs([
        '--module',
        'virtual_base_module:3:',
        '--js',
        'mytmp/release/css_renaming_map.js',
        '--js',
        '3p/jquery.js',
        '--js',
        'base.js',
        '--module',
        'server:2:virtual_base_module',
        '--js',
        'array.js',
        '--js',
        'server.js',
        '--module',
        'clientB:2:virtual_base_module',
        '--js',
        'dom.js',
        '--js',
        'client_b.js'
      ]);
      expectFileOutput('mytmp/release/virtual_base_module_complete.js', [
        'uncompiled_common.js',
        'mytmp/release/virtual_base_module.js'
      ]);
      expectFileOutput('mybuild/release/server.js', [
        'mytmp/release/virtual_base_module_complete.js',
        'uncompiled_server.js',
        'mytmp/release/server.js'
      ]);
      expectFileOutput('mybuild/release/clientA.js', [
        'mytmp/release/virtual_base_module_complete.js',
        'uncompiled_client_a.js'
      ]);
      expectFileOutput('mybuild/release/clientB.js', [
        'mytmp/release/clientB.js'
      ]);

      runAndExpectSuccess(callbackFn);
      makeOutDirsReady();
      makeCssRenamingFileReady();
    });

    it('correctly builds a project with no compiled JS', function(callbackFn) {
      projectOpts.jsModules = {clientA: newClientAModule()};
      expectFileOutput('mybuild/release/clientA.js', [
        'uncompiled_common.js',
        'uncompiled_client_a.js'
      ]);

      runAndExpectSuccess(callbackFn);
      makeOutDirsReady();
      haveNoCssRenamingFile();
    });

    it('will pass a JS warnings file, if given', function(callbackFn) {
      projectOpts.jsModules = {server: newServerModule()};
      projectOpts.jsWarningsWhitelistFile = 'js_warnings_whitelist.txt';

      expectedArgs = newExpectedReleaseArgs([
        '--warnings_whitelist_file',
        'js_warnings_whitelist.txt',
        '--module',
        'server:4:',
        '--js',
        '3p/jquery.js',
        '--js',
        'base.js',
        '--js',
        'array.js',
        '--js',
        'server.js'
      ]);
      expectFileOutput('mybuild/release/server.js', [
        'uncompiled_common.js',
        'uncompiled_server.js',
        'mytmp/release/server.js'
      ]);

      runAndExpectSuccess(callbackFn);
      makeOutDirsReady();
      haveNoCssRenamingFile();
    });

    it('suppresses compiler output if requested', function(callbackFn) {
      buildOpts.suppressOutput = true;
      expectedStderrBehavior = 'ignore';

      projectOpts.jsModules = {server: newServerModule()};
      expectedArgs = newExpectedReleaseArgs([
        '--module',
        'server:4:',
        '--js',
        '3p/jquery.js',
        '--js',
        'base.js',
        '--js',
        'array.js',
        '--js',
        'server.js'
      ]);
      expectFileOutput('mybuild/release/server.js', [
        'uncompiled_common.js',
        'uncompiled_server.js',
        'mytmp/release/server.js'
      ]);

      runAndExpectSuccess(callbackFn);
      makeOutDirsReady();
      haveNoCssRenamingFile();
    });

    it('passes along all jsExterns files', function(callbackFn) {
      projectOpts.jsExterns = ['3p/externs/loaded_via_cdn.js', 'ext2.js'];
      projectOpts.jsModules = {server: newServerModule()};

      expectedArgs = newExpectedReleaseArgs([
        '--externs',
        '3p/externs/loaded_via_cdn.js',
        '--externs',
        'ext2.js',
        '--module',
        'server:4:',
        '--js',
        '3p/jquery.js',
        '--js',
        'base.js',
        '--js',
        'array.js',
        '--js',
        'server.js'
      ]);
      expectFileOutput('mybuild/release/server.js', [
        'uncompiled_common.js',
        'uncompiled_server.js',
        'mytmp/release/server.js'
      ]);

      runAndExpectSuccess(callbackFn);
      makeOutDirsReady();
      haveNoCssRenamingFile();
    });

    it('fails if output dir creation fails', function(callbackFn) {
      runAndExpectFailure('simulated outDirsAsync error', callbackFn);
      makeOutDirsFail();
    });

    it('fails if Closure deps calculation fails', function(callbackFn) {
      simulateCalcDepsFailure = true;

      runAndExpectFailure('simulated calc deps failure', callbackFn);
      makeOutDirsReady();
    });

    it('fails if JS module manager throws an exception', function(callbackFn) {
      simulateJsModuleManagerError = true;

      runAndExpectFailure('simulated JS module manager error', callbackFn);
      makeOutDirsReady();
    });

    it('fails if the CSS renaming file fails', function(callbackFn) {
      runAndExpectFailure('simulated CSS renaming file failure', callbackFn);
      makeOutDirsReady();
      makeCssRenamingFileFail();
    });

    it('fails if the JS compiler exits with errors', function(callbackFn) {
      compilerExitCode = common.EXIT_FAILURE;

      projectOpts.jsModules = {server: newServerModule()};
      expectedArgs = newExpectedReleaseArgs([
        '--module',
        'server:4:',
        '--js',
        '3p/jquery.js',
        '--js',
        'base.js',
        '--js',
        'array.js',
        '--js',
        'server.js'
      ]);

      runAndExpectFailure('errors compiling JavaScript', callbackFn);
      makeOutDirsReady();
      haveNoCssRenamingFile();
    });

    it('fails if reading an input file fails', function(callbackFn) {
      readFileFailsFor['uncompiled_server.js'] = true;

      projectOpts.jsModules = {server: newServerModule()};
      expectedArgs = newExpectedReleaseArgs([
        '--module',
        'server:4:',
        '--js',
        '3p/jquery.js',
        '--js',
        'base.js',
        '--js',
        'array.js',
        '--js',
        'server.js'
      ]);
      expectFileOutput('mybuild/release/server.js', [
        'uncompiled_common.js'
      ], {shouldFailBeforeEnd: true});

      runAndExpectFailure('error reading uncompiled_server.js', callbackFn);
      makeOutDirsReady();
      haveNoCssRenamingFile();
    });

    it('fails if writing to output file fails', function(callbackFn) {
      projectOpts.jsModules = {server: newServerModule()};
      expectedArgs = newExpectedReleaseArgs([
        '--module',
        'server:4:',
        '--js',
        '3p/jquery.js',
        '--js',
        'base.js',
        '--js',
        'array.js',
        '--js',
        'server.js'
      ]);
      expectFileOutput('mybuild/release/server.js', [
        'uncompiled_common.js',
        'uncompiled_server.js'
      ], {failLastWrite: true});

      runAndExpectFailure('simulated write() failure', callbackFn);
      makeOutDirsReady();
      haveNoCssRenamingFile();
    });
  });
});
