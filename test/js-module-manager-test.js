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
  // deps always appear before it (and we don't have a true list of file
  // dependencies, so that's the best we can do). So it should preserve these
  // ordering constraints.
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
    'c.js': ['uncomp.js', 'not_closure.js', '3p/uncomp_common.js',
             '3p/common.js', '3p/closure/base.js', 'a.js'],
    'd.js': ['uncomp.js', 'not_closure.js', '3p/uncomp_server.js',
             '3p/uncomp_common.js', '3p/common.js', '3p/closure/base.js',
             'a.js']
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

  for (var i = module.compiledInputFiles.length - 1; i >= 0; i--) {
    checkAndRecord(module.compiledInputFiles[i]);
  }
  for (var j = module.dontCompileInputFiles.length - 1; j >= 0; j--) {
    checkAndRecord(module.dontCompileInputFiles[j]);
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
      shouldHaveSameElements(explicitBaseModule.alwaysLoadedAfterModules, []);
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
      shouldHaveSameElements(clientModule.alwaysLoadedAfterModules,
          ['explicit_base']);
      shouldHaveSameElements(clientModule.dontCompileInputFiles,
          ['3p/uncomp_client.js']);
      shouldHaveSameElements(clientModule.compiledInputFiles, ['3p/jquery.js']);
      verifyOrderingConstraints(clientModule);

      var serverModule = (computedModules[1].name == 'server') ?
          computedModules[1] : computedModules[2];
      serverModule.name.should.equal('server');
      shouldHaveSameElements(serverModule.alwaysLoadedAfterModules,
          ['explicit_base']);
      shouldHaveSameElements(serverModule.dontCompileInputFiles,
          ['3p/uncomp_server.js']);
      shouldHaveSameElements(serverModule.compiledInputFiles, ['d.js']);
      verifyOrderingConstraints(serverModule);
    });

    it('leaves files where they are if they are unique across modules',
        function() {
      // Setup project so that each module has unique input files.
      projectOpts.jsModules = {
        explicit_base: {
          alwaysLoadedAfterModules: [],
          dontCompileInputFiles: ['base_dc1.js', 'base_dc2.js'],
          nonClosureNamespacedInputFiles: ['base_nc.js'],
          closureRootNamespaces: []
        },
        client: {
          alwaysLoadedAfterModules: ['explicit_base'],
          dontCompileInputFiles: ['client_dc1.js', 'client_dc2.js'],
          nonClosureNamespacedInputFiles: ['client_nc.js'],
          closureRootNamespaces: []
        },
        server: {
          alwaysLoadedAfterModules: ['explicit_base'],
          dontCompileInputFiles: ['server_dc1.js', 'server_dc2.js'],
          nonClosureNamespacedInputFiles: ['server_nc.js'],
          closureRootNamespaces: []
        }
      };
      transitiveClosureDeps = {};

      var computedModules =
          jsModuleManager.calcInputFiles(projectOpts, transitiveClosureDeps);
      computedModules.should.have.length(3);

      // The explicit_base module must be first.
      var explicitBaseModule = computedModules[0];
      explicitBaseModule.name.should.equal('explicit_base');
      shouldHaveSameElements(explicitBaseModule.alwaysLoadedAfterModules, []);
      should.deepEqual(explicitBaseModule.dontCompileInputFiles,
          ['base_dc1.js', 'base_dc2.js']);
      should.deepEqual(explicitBaseModule.compiledInputFiles,
          ['base_nc.js']);

      // The client and server modules can come in either order.
      var clientModule = (computedModules[1].name == 'client') ?
          computedModules[1] : computedModules[2];
      clientModule.name.should.equal('client');
      shouldHaveSameElements(clientModule.alwaysLoadedAfterModules,
          ['explicit_base']);
      should.deepEqual(clientModule.dontCompileInputFiles,
          ['client_dc1.js', 'client_dc2.js']);
      should.deepEqual(clientModule.compiledInputFiles,
          ['client_nc.js']);

      var serverModule = (computedModules[1].name == 'server') ?
          computedModules[1] : computedModules[2];
      serverModule.name.should.equal('server');
      shouldHaveSameElements(serverModule.alwaysLoadedAfterModules,
          ['explicit_base']);
      should.deepEqual(serverModule.dontCompileInputFiles,
          ['server_dc1.js', 'server_dc2.js']);
      should.deepEqual(serverModule.compiledInputFiles,
          ['server_nc.js']);
    });

    // TODO: Add a case with base <= middle <{A, B} to test that files common to
    // A and B can be moved to middle (not all the way to base).
    it('moves files common to multiple modules to their least common ancestor',
        function() {
      // Introduce a middle module that client and server depend on.
      projectOpts.jsModules = {
        explicit_base: {
          alwaysLoadedAfterModules: [],
          dontCompileInputFiles: [],
          nonClosureNamespacedInputFiles: [],
          closureRootNamespaces: ['project.base']
        },
        middle: {
          alwaysLoadedAfterModules: ['explicit_base'],
          dontCompileInputFiles: [],
          nonClosureNamespacedInputFiles: [],
          closureRootNamespaces: ['project.middle']
        },
        client: {
          alwaysLoadedAfterModules: ['middle'],
          dontCompileInputFiles: [],
          nonClosureNamespacedInputFiles: [],
          closureRootNamespaces: []
        },
        server: {
          alwaysLoadedAfterModules: ['middle'],
          dontCompileInputFiles: [],
          nonClosureNamespacedInputFiles: [],
          closureRootNamespaces: ['project.server']
        }
      };
      transitiveClosureDeps = {
        explicit_base: ['explicit_base.js'],
        middle: ['middle.js'],
        client: ['common.js', 'client.js'],
        server: ['common.js', 'server.js']
      };

      var computedModules =
          jsModuleManager.calcInputFiles(projectOpts, transitiveClosureDeps);
      computedModules.should.have.length(4);

      // The explicit_base module must be first.
      var explicitBaseModule = computedModules[0];
      explicitBaseModule.name.should.equal('explicit_base');
      shouldHaveSameElements(explicitBaseModule.alwaysLoadedAfterModules, []);
      shouldHaveSameElements(explicitBaseModule.dontCompileInputFiles, []);
      shouldHaveSameElements(explicitBaseModule.compiledInputFiles,
          ['explicit_base.js']);

      // The middle module must be second, and common.js should be here.
      var middleModule = computedModules[1];
      middleModule.name.should.equal('middle');
      shouldHaveSameElements(middleModule.alwaysLoadedAfterModules,
          ['explicit_base']);
      shouldHaveSameElements(middleModule.dontCompileInputFiles, []);
      shouldHaveSameElements(middleModule.compiledInputFiles,
          ['middle.js', 'common.js']);

      // The client and server modules can come in either order.
      var clientModule = (computedModules[2].name == 'client') ?
          computedModules[2] : computedModules[3];
      clientModule.name.should.equal('client');
      shouldHaveSameElements(clientModule.alwaysLoadedAfterModules,
          ['explicit_base', 'middle']);
      shouldHaveSameElements(clientModule.dontCompileInputFiles, []);
      shouldHaveSameElements(clientModule.compiledInputFiles, ['client.js']);

      var serverModule = (computedModules[2].name == 'server') ?
          computedModules[2] : computedModules[3];
      serverModule.name.should.equal('server');
      shouldHaveSameElements(serverModule.alwaysLoadedAfterModules,
          ['explicit_base', 'middle']);
      shouldHaveSameElements(serverModule.dontCompileInputFiles, []);
      shouldHaveSameElements(serverModule.compiledInputFiles, ['server.js']);
    });

    it('chooses among multiple possible LCA modules by depth, and it also' +
        ' moves deps of files that are moved to a lowest common ancestor',
        function() {
      // Bit of a complex module diagram here, to test against problem scenario.
      projectOpts.jsModules = {
        explicit_base: {
          alwaysLoadedAfterModules: [],
          dontCompileInputFiles: [],
          nonClosureNamespacedInputFiles: ['explicit_base.js'],
          closureRootNamespaces: []
        },
        moduleA: {
          alwaysLoadedAfterModules: ['explicit_base'],
          dontCompileInputFiles: [],
          nonClosureNamespacedInputFiles: ['module_a.js'],
          closureRootNamespaces: []
        },
        moduleB: {
          alwaysLoadedAfterModules: ['explicit_base'],
          dontCompileInputFiles: [],
          nonClosureNamespacedInputFiles: ['module_b.js'],
          closureRootNamespaces: []
        },
        moduleC: {
          alwaysLoadedAfterModules: ['moduleB'],
          dontCompileInputFiles: [],
          nonClosureNamespacedInputFiles: ['module_c.js'],
          closureRootNamespaces: []
        },
        moduleD: {
          alwaysLoadedAfterModules: ['moduleA', 'moduleC'],
          dontCompileInputFiles: [],
          nonClosureNamespacedInputFiles: ['common.js', 'module_d.js'],
          closureRootNamespaces: []
        },
        moduleE: {
          alwaysLoadedAfterModules: ['moduleA', 'moduleC'],
          dontCompileInputFiles: [],
          nonClosureNamespacedInputFiles: ['common.js', 'module_e.js'],
          closureRootNamespaces: []
        }
      };
      transitiveClosureDeps = {};

      var computedModules =
          jsModuleManager.calcInputFiles(projectOpts, transitiveClosureDeps);
      computedModules.should.have.length(6);

      // The explicit_base module must be first. Note that module_a.js should
      // be moved here, because common.js (which should be moved to moduleC)
      // could depend on it
      var explicitBaseModule = computedModules[0];
      explicitBaseModule.name.should.equal('explicit_base');
      shouldHaveSameElements(explicitBaseModule.alwaysLoadedAfterModules, []);
      shouldHaveSameElements(explicitBaseModule.dontCompileInputFiles, []);
      shouldHaveSameElements(explicitBaseModule.compiledInputFiles,
          ['explicit_base.js', 'module_a.js']);

      // Modules A and B can come in either order.
      var moduleA = (computedModules[1].name == 'moduleA') ?
          computedModules[1] : computedModules[2];
      moduleA.name.should.equal('moduleA');
      shouldHaveSameElements(moduleA.alwaysLoadedAfterModules,
          ['explicit_base']);
      shouldHaveSameElements(moduleA.dontCompileInputFiles, []);
      shouldHaveSameElements(moduleA.compiledInputFiles, []);

      var moduleB = (computedModules[1].name == 'moduleB') ?
          computedModules[1] : computedModules[2];
      moduleB.name.should.equal('moduleB');
      shouldHaveSameElements(moduleB.alwaysLoadedAfterModules,
          ['explicit_base']);
      shouldHaveSameElements(moduleB.dontCompileInputFiles, []);
      shouldHaveSameElements(moduleB.compiledInputFiles, ['module_b.js']);

      // Module C must be next, and common.js should have been moved here.
      var moduleC = computedModules[3];
      moduleC.name.should.equal('moduleC');
      shouldHaveSameElements(moduleC.alwaysLoadedAfterModules,
          ['explicit_base', 'moduleB']);
      shouldHaveSameElements(moduleC.dontCompileInputFiles, []);
      shouldHaveSameElements(moduleC.compiledInputFiles,
          ['module_c.js', 'common.js']);

      // Modules D and E can come in either order.
      var moduleD = (computedModules[4].name == 'moduleD') ?
          computedModules[4] : computedModules[5];
      moduleD.name.should.equal('moduleD');
      shouldHaveSameElements(moduleD.alwaysLoadedAfterModules,
          ['explicit_base', 'moduleA', 'moduleB', 'moduleC']);
      shouldHaveSameElements(moduleD.dontCompileInputFiles, []);
      shouldHaveSameElements(moduleD.compiledInputFiles, ['module_d.js']);

      var moduleE = (computedModules[4].name == 'moduleE') ?
          computedModules[4] : computedModules[5];
      moduleE.name.should.equal('moduleE');
      shouldHaveSameElements(moduleE.alwaysLoadedAfterModules,
          ['explicit_base', 'moduleA', 'moduleB', 'moduleC']);
      shouldHaveSameElements(moduleE.dontCompileInputFiles, []);
      shouldHaveSameElements(moduleE.compiledInputFiles, ['module_e.js']);
    });

    it('chooses among LCA modules at the same depth to minimize the number of' +
        ' files that need to be moved',
        function() {
      projectOpts.jsModules = {
        explicit_base: {
          alwaysLoadedAfterModules: [],
          dontCompileInputFiles: [],
          nonClosureNamespacedInputFiles: [],
          closureRootNamespaces: ['project.root']
        },
        moduleA: {
          alwaysLoadedAfterModules: ['explicit_base'],
          dontCompileInputFiles: [],
          nonClosureNamespacedInputFiles: [],
          closureRootNamespaces: ['project.a']
        },
        moduleB: {
          alwaysLoadedAfterModules: ['explicit_base'],
          dontCompileInputFiles: [],
          nonClosureNamespacedInputFiles: [],
          closureRootNamespaces: ['project.b']
        },
        moduleC: {
          alwaysLoadedAfterModules: ['moduleA', 'moduleB'],
          dontCompileInputFiles: [],
          nonClosureNamespacedInputFiles: [],
          closureRootNamespaces: ['project.c']
        },
        moduleD: {
          alwaysLoadedAfterModules: ['moduleA', 'moduleB'],
          dontCompileInputFiles: [],
          nonClosureNamespacedInputFiles: [],
          closureRootNamespaces: ['project.d']
        }
      };
      transitiveClosureDeps = {
        explicit_base: ['explicit_base.js'],
        moduleA: ['a.js'],
        moduleB: ['b.js'],
        moduleC: ['b.js', 'c.js', 'common.js'],
        moduleD: ['b.js', 'd.js', 'common.js']
      };

      var computedModules =
          jsModuleManager.calcInputFiles(projectOpts, transitiveClosureDeps);

      // The common file should be moved to moduleB, since that minimizes the
      // number of dependent files that would have to be moved.
      var moduleB = (computedModules[1].name == 'moduleB') ?
          computedModules[1] : computedModules[2];
      moduleB.name.should.equal('moduleB');
      shouldHaveSameElements(moduleB.dontCompileInputFiles, []);
      shouldHaveSameElements(moduleB.compiledInputFiles, ['b.js', 'common.js']);

      // But if the calculation is repeated with a.js as the dep of common.js,
      // then moving common.js to moduleA is a better choice.
      transitiveClosureDeps.moduleC[0] = 'a.js';
      transitiveClosureDeps.moduleD[0] = 'a.js';
      computedModules =
          jsModuleManager.calcInputFiles(projectOpts, transitiveClosureDeps);

      var moduleA = (computedModules[1].name == 'moduleA') ?
          computedModules[1] : computedModules[2];
      moduleA.name.should.equal('moduleA');
      shouldHaveSameElements(moduleA.dontCompileInputFiles, []);
      shouldHaveSameElements(moduleA.compiledInputFiles, ['a.js', 'common.js']);
    });

    it('moves files common to multiple root modules to a virtual base module',
        function() {
      // This time there is no common root module.
      projectOpts.jsModules = {
        client1: {
          alwaysLoadedAfterModules: [],
          dontCompileInputFiles: [],
          nonClosureNamespacedInputFiles: [],
          closureRootNamespaces: ['project.client1']
        },
        client2: {
          alwaysLoadedAfterModules: ['client1'],
          dontCompileInputFiles: [],
          nonClosureNamespacedInputFiles: ['underscore.js'],
          closureRootNamespaces: ['project.client2']
        },
        server: {
          alwaysLoadedAfterModules: [],
          dontCompileInputFiles: [],
          nonClosureNamespacedInputFiles: ['underscore.js'],
          closureRootNamespaces: ['project.server']
        }
      };
      transitiveClosureDeps = {
        client1: ['client1.js'],
        client2: ['client2.js', 'common.js'],
        server: ['server.js', 'common.js']
      };

      // A virtual base module should be created for the common deps.
      var computedModules =
          jsModuleManager.calcInputFiles(projectOpts, transitiveClosureDeps);
      computedModules.should.have.length(4);

      // The virtual base module must come first.
      var virtualBaseModule = computedModules[0];
      virtualBaseModule.name.should.equal('virtual_base_module');
      shouldHaveSameElements(virtualBaseModule.alwaysLoadedAfterModules, []);
      should.deepEqual(virtualBaseModule.dontCompileInputFiles, []);
      should.deepEqual(virtualBaseModule.compiledInputFiles,
          ['underscore.js', 'common.js']);

      // Either client1 or server can be next.
      var client1Module = (computedModules[1].name == 'client1') ?
          computedModules[1] : computedModules[2];
      client1Module.name.should.equal('client1');
      shouldHaveSameElements(client1Module.alwaysLoadedAfterModules,
          ['virtual_base_module']);
      should.deepEqual(client1Module.dontCompileInputFiles, []);
      should.deepEqual(client1Module.compiledInputFiles, ['client1.js']);

      var client2Module = (computedModules[2].name == 'client2') ?
          computedModules[2] : computedModules[3];
      client2Module.name.should.equal('client2');
      shouldHaveSameElements(client2Module.alwaysLoadedAfterModules,
          ['virtual_base_module', 'client1']);
      should.deepEqual(client2Module.dontCompileInputFiles, []);
      should.deepEqual(client2Module.compiledInputFiles, ['client2.js']);

      var serverModule = (computedModules[1].name == 'server') ?
          computedModules[1] :
          ((computedModules[2].name == 'server') ?
              computedModules[2] : computedModules[3]);
      serverModule.name.should.equal('server');
      shouldHaveSameElements(serverModule.alwaysLoadedAfterModules,
          ['virtual_base_module']);
      should.deepEqual(serverModule.dontCompileInputFiles, []);
      should.deepEqual(serverModule.compiledInputFiles, ['server.js']);
    });

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
