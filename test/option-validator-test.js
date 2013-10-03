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

var optionValidator = require('../option-validator.js');

var should = require('should');
var util = require('../util.js');


//==============================================================================
// Test Data
//==============================================================================

/** @return {!Object} */
function newValidProjectOptions() {
  return {
    'rootSrcDir': 'src/',
    'cssModules': {
      'style': {
        'description': 'Some styles',
        'closureInputFiles': ['src/style.gss'],
        'dontCompileInputFiles': ['3p/3p.css'],
      }
    },
    'jsModules': {
      'main': {
        'closureRootNamespaces': ['project.main'],
        'nonClosureNamespacedInputFiles': ['3p/jquery.js'],
        'dontCompileInputFiles': ['3p/punk.js', '3p/rebel.js']
      },
      'secondary': {
        'description': 'Downloaded later',
        'dependsOnModules': ['main'],
        'closureRootNamespaces': ['project.secondary'],
      }
    },
    'soyInputFiles': ['soy/*.soy'],
    'jsWarningsWhitelistFile': 'js_warnings_whitelist.txt'
  };
}


/** @return {!Object} */
function newValidBuildOptions() {
  return {
    'type': util.DEBUG,
    'outputDir': 'bin/',
    'python2Command': 'py2',
    'suppressOutput': true
  };
}


//==============================================================================
// Test Cases
//==============================================================================

describe('optionValidator', function() {
  describe('#assertValid()', function() {
    var projectOpts, buildOpts;
    beforeEach(function() {
      // Reset to valid state before each test case.
      projectOpts = newValidProjectOptions();
      buildOpts = newValidBuildOptions();
    });

    var runValidator = function() {
      optionValidator.assertValid(projectOpts, buildOpts);
    }

    it('does not throw when given valid project and build options', function() {
      runValidator.should.not.throw();
    });

    it('throws when expecting a string but getting another type', function() {
      buildOpts['python2Command'] = 2;
      runValidator.should.throw(/<2> is not a string/);
    });

    it('throws when expecting a boolean but getting another type', function() {
      buildOpts['suppressOutput'] = 1;
      runValidator.should.throw(/<1> is not a boolean/);
    });

    it('throws when given an invalid build type', function() {
      buildOpts['type'] = 'profile';
      runValidator.should.throw(/Invalid build type: <profile>/);
    });

    it('throws when expecting an array but getting another type', function() {
      projectOpts['jsModules']['main']['closureRootNamespaces'] = 'a.string';
      runValidator.should.throw(/<a.string> is not an array/);
    });

    it('throws when array elements do not match expected type', function() {
      projectOpts['cssModules']['style']['closureInputFiles'] = [42, 76];
      runValidator.should.throw(/<42> is not a string/);
    });

    it('throws when expecting an Object but getting another type', function() {
      projectOpts['cssModules'] = 'style.css';
      runValidator.should.throw(new RegExp(
          "<style.css> is not an Object map, projectOptions" +
              "\\['cssModules'\\]:"));
    });

    it('throws when Object map values do not match expected type', function() {
      projectOpts['cssModules'] = {'style': 'style.css'};
      runValidator.should.throw(new RegExp(
          "<style.css> is not an Object map, projectOptions" +
              "\\['cssModules'\\]\\['style'\\]:"));
    });

    it('throws when a CSS module is null', function() {
      projectOpts['cssModules'] = {'style': null};
      runValidator.should.throw(/null is not valid value/);
    });

    it('throws when a JS module is undefined', function() {
      projectOpts['jsModules'] = {'main': undefined};
      runValidator.should.throw(/undefined is not valid value/);
    });

    it('throws when given an unrecognized project option', function() {
      projectOpts['csharpModules'] = {'thisShouldWork': 'right?'};
      runValidator.should.throw(/Unrecognized option <csharpModules>/);
    });

    it('throws when given an unrecognized CSS module option', function() {
      projectOpts['cssModules']['style']['tintAllColors'] = '36%';
      runValidator.should.throw(/Unrecognized option <tintAllColors>/);
    });

    it('throws when given an unrecognized JS module option', function() {
      projectOpts['jsModules']['secondary']['unrollLoops'] = true;
      runValidator.should.throw(/Unrecognized option <unrollLoops>/);
    });

    it('throws when given an unrecognized build option', function() {
      buildOpts['rubyCommand'] = 'ruby';
      runValidator.should.throw(/Unrecognized option <rubyCommand>/);
    });

    it('throws when missing a required project option', function() {
      delete projectOpts['cssModules'];
      runValidator.should.throw(/Missing required option cssModules/);
    });

    it('throws when missing a required build option', function() {
      delete buildOpts['type'];
      runValidator.should.throw(/Missing required option type/);
    });

    it('does not throw when an optional option is not specified', function() {
      delete buildOpts['python2Command'];
      delete projectOpts['rootSrcDir'];
      runValidator.should.not.throw();
    });

    it('throws when no CSS input files are specified', function() {
      projectOpts['cssModules']['style']['closureInputFiles'] = [];
      delete projectOpts['cssModules']['style']['dontCompileInputFiles'];
      runValidator.should.throw(/Must specify at least one input CSS/);
    });

    it('throws when no JS inputs are specified', function() {
      projectOpts['jsModules']['secondary']['closureRootNamespaces'] = [];
      runValidator.should.throw(/Must specify at least one root Closure/);
    });

    it('does not throw when cssModules is an empty map', function() {
      projectOpts['cssModules'] = {};
      runValidator.should.not.throw();
    });

    it('does not throw when jsModules is an empty map', function() {
      projectOpts['jsModules'] = {};
      runValidator.should.not.throw();
    });
  });
});
