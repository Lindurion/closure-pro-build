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

var closureDepCalculator = require('../lib/closure-dep-calculator.js');

var child_process = require('child_process');
var common = require('../lib/common.js');
var dirManager = require('../lib/dir-manager.js');
var kew = require('kew');
var path = require('path');
var should = require('should');
var shouldContain = require('./test-util.js').shouldContain;
var sinon = require('sinon');
var testUtil = require('./test-util.js');
var underscore = require('underscore');


//==============================================================================
// Test Data
//==============================================================================

function newProjectOptions() {
  return {
    jsModules: {
      moduleA: {closureRootNamespaces: ['project.a1', 'project.a2']},
      moduleB: {closureRootNamespaces: ['project.b1', 'project.b2']},
      moduleC: {closureRootNamespaces: ['project.c1', 'project.c2']},
    },
    rootSrcDir: 'mysrc/',
    closureRootDirs: ['.', '../other_closure_dir/']
  };
}


function newBuildOptions() {
  return {
    type: common.DEBUG,
    python2Command: 'myPy2',
    suppressOutput: false,
    tempFileDir: 'mytmp/',
    generatedCodeDir: 'mygen/',
    outputDir: 'mybuild/'
  };
}


function getExpectedArgs(namespace1, namespace2) {
  return [
    closureDepCalculator.CLOSURE_BUILDER_PATH,
    '--root',
    closureDepCalculator.CLOSURE_LIBRARY_ROOT_DIRS[0],
    '--root',
    closureDepCalculator.CLOSURE_LIBRARY_ROOT_DIRS[1],
    '--root',
    closureDepCalculator.CLOSURE_LIBRARY_ROOT_DIRS[2],
    '--root',
    'mysrc',
    '--root',
    'other_closure_dir/',
    '--root',
    'mygen/debug/',
    '--namespace',
    namespace1,
    '--namespace',
    namespace2
  ];
}


// Test that blank lines will be filtered and both newline styles are okay.
var OUTPUT_A = 'base.js\r\n\na1.js\na2.js';
var OUTPUT_B = 'base.js\nb1.js\nb2.js\n';
var OUTPUT_C = 'base.js\n\n\n\r\n\r\n\nc1.js\r\nc2.js\r\n';


//==============================================================================
// Stubbed Functions
//==============================================================================

var processExitCode, expectedStderrBehavior;
function fakeSpawn(command, args, options) {
  // Verify arguments.
  command.should.equal('myPy2');
  should.deepEqual(options,
      {stdio: ['ignore', 'pipe', expectedStderrBehavior]});

  var namespace1, namespace2, output;
  if (underscore.contains(args, 'project.a1')) {
    namespace1 = 'project.a1';
    namespace2 = 'project.a2';
    output = OUTPUT_A;
  } else if (underscore.contains(args, 'project.b1')) {
    namespace1 = 'project.b1';
    namespace2 = 'project.b2';
    output = OUTPUT_B;
  } else if (underscore.contains(args, 'project.c1')) {
    namespace1 = 'project.c1';
    namespace2 = 'project.c2';
    output = OUTPUT_C;
  } else {
    should.fail('Unexpected args to spawn() ' + args);
  }

  should.deepEqual(args, getExpectedArgs(namespace1, namespace2));

  // Return fake ChildProcess that simulates Closure Builder.
  // Break output string into 3 ~arbitrary chunks.
  var awaitOutput = kew.defer();
  return {
    stdout: {
      setEncoding: function(encoding) { encoding.should.equal('utf8'); },
      on: function(eventName, callbackFn) {
        eventName.should.equal('data');
        kew.delay(2 /* ms */)
            .then(function() { callbackFn(output.substring(0, 4)); })
            .then(function() { callbackFn(output.substring(4, 9)); })
            .then(function() { callbackFn(output.substring(9)); })
            .then(function() { awaitOutput.resolve(null); })
            .end();
      }
    },
    on: function(eventName, callbackFn) {
      eventName.should.equal('close');
      awaitOutput
          .then(function() { callbackFn(processExitCode); })
          .end();
    }
  };
}


//==============================================================================
// Test Cases
//==============================================================================

describe('closureDepCalculator', function() {
  var stubPathJoin, stubSpawn;
  before(function() {
    stubPathJoin = sinon.stub(path, 'join', testUtil.pathJoin);
    stubSpawn = sinon.stub(child_process, 'spawn', fakeSpawn);
  });
  after(function() {
    stubPathJoin.restore();
    stubSpawn.restore();
  });

  describe('#calcDeps()', function() {
    // Reset state before each test case.
    var projectOpts, buildOpts, outDirs;
    beforeEach(function() {
      projectOpts = newProjectOptions();
      buildOpts = newBuildOptions();
      outDirs = new dirManager.OutputDirs(buildOpts);
      expectedStderrBehavior = process.stderr;
      processExitCode = common.EXIT_SUCCESS;
    });

    var expectedModuleBFiles = ['base.js', 'b1.js', 'b2.js'];
    var runAndExpectSuccess = function(callbackFn) {
      closureDepCalculator.calcDeps(projectOpts, buildOpts, outDirs)
          .then(function(result) {
            should.deepEqual(result, {
              moduleA: ['base.js', 'a1.js', 'a2.js'],
              moduleB: expectedModuleBFiles,
              moduleC: ['base.js', 'c1.js', 'c2.js']
            });
            callbackFn(null);
          }).end();
    };

    it('correctly yields output module deps from closurebuilder.py',
        function(callbackFn) {
      runAndExpectSuccess(callbackFn);
    });

    it('respects suppressOutput flag', function(callbackFn) {
      buildOpts.suppressOutput = true;
      expectedStderrBehavior = 'ignore';
      runAndExpectSuccess(callbackFn);
    });

    it('deals with modules that have no Closure namespaces correctly',
        function(callbackFn) {
      projectOpts.jsModules.moduleB.closureRootNamespaces = [];
      expectedModuleBFiles = [];
      runAndExpectSuccess(callbackFn);
    });

    it('fails if closurebuilder.py process fails', function(callbackFn) {
      processExitCode = common.EXIT_FAILURE;
      closureDepCalculator.calcDeps(projectOpts, buildOpts, outDirs)
          .then(function(result) { should.fail('Was expecting failure'); })
          .fail(function(e) {
            shouldContain(e.message, 'Calculating closure dependencies');
            callbackFn(null);
          }).end();
    });
  });
});
