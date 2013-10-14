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

var jsModuleManager = require('../lib/js-module-manager.js');

var should = require('should');
var shouldContain = require('./test-util.js').shouldContain;
var shouldHaveSameElements = require('./test-util.js').shouldHaveSameElements;
var testUtil = require('./test-util.js');


//==============================================================================
// Test Data
//==============================================================================

function newProjectOptions() {
  return {
    jsModules: {
      explicit_base: {
        alwaysLoadedAfterModules: [],
        closureRootNamespaces: ['project.base'],
        nonClosureNamespacedInputFiles: ['not_closure.js'],
        dontCompileInputFiles: ['uncomp.js']
      },
      client: {
        alwaysLoadedAfterModules: ['explicit_base'],
        closureRootNamespaces: ['project.client'],
        nonClosureNamespacedInputFiles: ['3p/jquery.js', '3p/common.js'],
        dontCompileInputFiles: ['3p/uncomp_client.js', '3p/uncomp_common.js']
      },
      server: {
        alwaysLoadedAfterModules: ['explicit_base'],
        closureRootNamespaces: ['project.server'],
        nonClosureNamespacedInputFiles: ['3p/common.js'],
        dontCompileInputFiles: ['3p/uncomp_server.js', '3p/uncomp_common.js']
      }
    }
  };
}


function newTransitiveClosureDeps() {
  return {
    explicit_base: ['b.js', 'explicit_base.js'],
    client: ['3p/closure/base.js', 'a.js', 'b.js', 'c.js'],
    server: ['3p/closure/base.js', 'a.js', 'd.js', 'c.js']
  }
}


function newExpectedOrderingConstraints() {
  // Even though some of these aren't real deps, js-module-manager has to assume
  // they are, because every time a certain file appears, all of these inferred
  // deps always appear before it and never appear after it (we don't have a
  // true list of file dependencies, so that's the best we can do). So it should
  // preserve these ordering constraints.
  return {
    'uncomp.js': [],
    'not_closure.js': ['uncomp.js'],
    '3p/uncomp_client.js': ['uncomp.js'],
    '3p/uncomp_common.js': ['uncomp.js'],
    '3p/jquery.js': ['uncomp.js', 'not_closure.js', '3p/uncomp_client.js',
                     '3p/uncomp_common.js'],
    '3p/common.js': ['uncomp.js', 'not_closure.js', '3p/uncomp_common.js'],
    '3p/uncomp_server.js': ['uncomp.js'],
    'b.js': ['uncomp.js', 'not_closure.js'],
    'explicit_base.js': ['uncomp.js', 'not_closure.js', 'b.js'],
    '3p/closure/base.js': ['uncomp.js', 'not_closure.js', '3p/uncomp_common.js',
                           '3p/common.js'],
    'a.js': ['uncomp.js', 'not_closure.js', '3p/uncomp_common.js',
             '3p/common.js', '3p/closure/base.js'],
    'c.js': ['uncomp.js', 'not_closure.js', 'b.js', 'explicit_base.js',
             '3p/uncomp_common.js', '3p/common.js', '3p/closure/base.js',
             'a.js'],
    'd.js': ['uncomp.js', 'not_closure.js', 'b.js', 'explicit_base.js',
             '3p/uncomp_server.js', '3p/uncomp_common.js', '3p/common.js',
             '3p/closure/base.js', 'a.js']
  };
}


//==============================================================================
// Verification Functions
//==============================================================================

var expectedOrderingConstraints;

function verifyOrderingConstraints(module) {
  var filesAppearingAfterCurrent = {};
  var checkAndRecord = function(currentFile) {
    expectedOrderingConstraints[currentFile].forEach(function(file) {
      // If file appears in this module, it must be before currentFile.
      if (filesAppearingAfterCurrent[file]) {
        should.fail('Invalid file ordering in module ' + module.name +
            ', <' + file + '> appears after <' + currentFile + '>');
      }
    });

    filesAppearingAfterCurrent[currentFile] = true;
  };

  for (var i = module.dontCompileInputFiles.length - 1; i >= 0; i--) {
    checkAndRecord(module.dontCompileInputFiles[i]);
  }
  for (var j = module.compiledInputFiles.length - 1; j >= 0; j--) {
    checkAndRecord(module.compiledInputFiles[j]);
  }
}


//==============================================================================
// Test Cases
//==============================================================================

describe('jsModuleManager', function() {
  describe('#calcInputFiles()', function() {
    // Reset state before each test case.
    var projectOpts, transitiveClosureDeps;
    beforeEach(function() {
      projectOpts = newProjectOptions();
      transitiveClosureDeps = newTransitiveClosureDeps();
      expectedOrderingConstraints = newExpectedOrderingConstraints();
    });

    it('correctly computes input files for test default project', function() {
      var computedModules =
          jsModuleManager.calcInputFiles(projectOpts, transitiveClosureDeps);
      computedModules.should.have.length(3);

      // The explicit_base module must be first.
      var explicitBaseModule = computedModules[0];
      explicitBaseModule.name.should.equal('explicit_base');
      shouldHaveSameElements(explicitBaseModule.dontCompileInputFiles,
          ['uncomp.js', '3p/uncomp_common.js']);
      shouldHaveSameElements(explicitBaseModule.compiledInputFiles,
          ['not_closure.js', '3p/common.js', 'b.js', 'explicit_base.js',
           '3p/closure/base.js', 'a.js', 'c.js']);
      verifyOrderingConstraints(explicitBaseModule);

      // The client and server modules can come in either order.
      var clientModule = (computedModules[1].name == 'client') ?
          computedModules[1] : computedModules[2];
      clientModule.name.should.equal('client');
      shouldHaveSameElements(clientModule.dontCompileInputFiles,
          ['3p/uncomp_client.js']);
      shouldHaveSameElements(clientModule.compiledInputFiles, ['3p/jquery.js']);
      verifyOrderingConstraints(clientModule);

      var serverModule = (computedModules[1].name == 'server') ?
          computedModules[1] : computedModules[2];
      serverModule.name.should.equal('server');
      shouldHaveSameElements(serverModule.dontCompileInputFiles,
          ['3p/uncomp_server.js']);
      shouldHaveSameElements(serverModule.compiledInputFiles, ['d.js']);
      verifyOrderingConstraints(serverModule);
    });

    it('leaves files where they are if they are unique across modules');

    // TODO: Add a case with base <= middle <{A, B} to test that files common to
    // A and B can be moved to middle (not all the way to base).
    it('moves files common to multiple modules to their least common ancestor');
    it('also moves deps of files that are moved to a least common ancestor');
    it('moves files common to multiple root modules to a virtual base module');

    it('fails if module says it is always loaded after a non-existent module',
        function() {
      projectOpts.jsModules.server.alwaysLoadedAfterModules.push('DNE');
      (function() {
        jsModuleManager.calcInputFiles(projectOpts, transitiveClosureDeps);
      }).should.throwError(/definition for module <DNE>/);
    });

    it('fails if modules contain cycles', function() {
      projectOpts.jsModules.loopy = {
        alwaysLoadedAfterModules: ['server'],
        closureRootNamespaces: [],
        nonClosureNamespacedInputFiles: [],
        dontCompileInputFiles: []
      };
      projectOpts.jsModules.explicit_base.alwaysLoadedAfterModules = ['loopy'];

      try {
        jsModuleManager.calcInputFiles(projectOpts, transitiveClosureDeps);
        should.fail('Was expecting module cycle exception');
      } catch (e) {
        shouldContain(e.message, 'Dependency cycle');
        shouldContain(e.message, 'explicit_base');
        shouldContain(e.message, 'loopy');
        shouldContain(e.message, 'server');
      }
    });

    it('fails if any module has more than one root module', function() {
      projectOpts.jsModules.another_base = {
        alwaysLoadedAfterModules: [],
        closureRootNamespaces: [],
        nonClosureNamespacedInputFiles: [],
        dontCompileInputFiles: []
      };
      projectOpts.jsModules.server.alwaysLoadedAfterModules = ['another_base'];
      projectOpts.jsModules.trouble = {
        alwaysLoadedAfterModules: ['client', 'server'],
        closureRootNamespaces: [],
        nonClosureNamespacedInputFiles: [],
        dontCompileInputFiles: []
      };

      try {
        jsModuleManager.calcInputFiles(projectOpts, transitiveClosureDeps);
        should.fail('Was expecting multiple root module exception');
      } catch (e) {
        shouldContain(e.message, 'more than 1 root module');
        shouldContain(e.message, 'explicit_base');
        shouldContain(e.message, 'another_base');
      }
    });

    it('fails if any input file appears with different compilation types',
        function() {
      projectOpts.jsModules.explicit_base.dontCompileInputFiles.push('a.js');

      (function() {
        jsModuleManager.calcInputFiles(projectOpts, transitiveClosureDeps);
      }).should.throwError(/a\.js.*multiple compilation modes/);
    });
  });
});
