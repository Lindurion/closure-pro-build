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
    '3p/uncomp_client.js': ['uncomp.js', 'not_closure.js'],
    '3p/uncomp_common.js': ['uncomp.js', 'not_closure.js'],
    '3p/jquery.js': ['uncomp.js', 'not_closure.js', '3p/uncomp_client.js',
                     '3p/uncomp_common.js'],
    '3p/common.js': ['uncomp.js', 'not_closure.js', '3p/uncomp_common.js'],
    '3p/uncomp_server.js': ['uncomp.js', 'not_closure.js'],
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
// Test Cases
//==============================================================================

describe('jsModuleManager', function() {
  describe('#calcInputFiles()', function() {
    // Reset state before each test case.
    var projectOpts, transitiveClosureDeps, expectedOrderingConstraints;
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

      // The client and server modules can come in either order.
      var clientModule, serverModule;
      if (computedModules[1].name == 'client') {
        clientModule = computedModules[1];
        serverModule = computedModules[2];
      } else {
        clientModule = computedModules[2];
        serverModule = computedModules[1];
      }

      clientModule.name.should.equal('client');
      serverModule.name.should.equal('server');

      should.fail('Test TODO: Need to verify files.');
    });

    it('leaves files where they are if they are unique across modules');

    // TODO: Add a case with base <= middle <{A, B} to test that files common to
    // A and B can be moved to middle (not all the way to base).
    it('moves files common to multiple modules to their least common ancestor');
    it('also moves deps of files that are moved to a least common ancestor');
    it('moves files common to multiple root modules to a virtual base module');

    it('fails if module says it is always loaded after a non-existent module',
        function() {
      projectOpts.jsModules['server'].alwaysLoadedAfterModules.push('DNE');
      (function() {
        jsModuleManager.calcInputFiles(projectOpts, transitiveClosureDeps);
      }).should.throwError(/definition for module <DNE>/);
    });

    it('fails if modules contain cycles', function() {
      projectOpts.jsModules['loopy'] = {
        alwaysLoadedAfterModules: ['server'],
        closureRootNamespaces: [],
        nonClosureNamespacedInputFiles: [],
        dontCompileInputFiles: []
      };
      projectOpts.jsModules['explicit_base'].alwaysLoadedAfterModules = ['loopy'];

      try {
        jsModuleManager.calcInputFiles(projectOpts, transitiveClosureDeps);
        should.fail('Was expecting module cycle exception');
      } catch (e) {
        e.message.indexOf('Dependency cycle').should.not.equal(-1);
        e.message.indexOf('explicit_base').should.not.equal(-1);
        e.message.indexOf('loopy').should.not.equal(-1);
        e.message.indexOf('server').should.not.equal(-1);
      }
    });

    it('fails if any module has more than one root module');
    it('fails if any input file appears with different compilation types');
  });
});
