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

var async = require('async');
var child_process = require('child_process');
var common = require('./common.js');
var kew = require('kew');
var underscore = require('underscore');
var path = require('path');


var CLOSURE_BUILDER_PATH = path.join(__dirname,
    '../3p/closure-library-20130212/closure/bin/build/closurebuilder.py');
var CLOSURE_LIBRARY_ROOT_DIRS = [
  path.join(__dirname, '../3p/closure-library-20130212/closure/'),
  path.join(__dirname, '../3p/closure-library-20130212/third_party/closure/'),
  path.join(__dirname, '../3p/closure-templates-20121221/js/')
];


/**
 * @param {!Object} projectOptions Specifies the project input files; see
 *     README.md for option documentation.
 * @param {!Object} buildOptions Specifies options specific to this build (like
 *     debug/release); see README.md for option documentation.
 * @param {!OutputDirs} outDirs
 * @return {!Promise.<!Object.<string, !Array.<string>>>} Yields map from
 *     module name to ordered list of Closure dependencies on success.
 */
function calcDeps(projectOptions, buildOptions, outDirs) {
  var depsTasks = {};
  for (var moduleName in projectOptions.jsModules) {
    depsTasks[moduleName] = underscore.partial(calcModuleDeps,
        moduleName, projectOptions, buildOptions, outDirs);
  }

  // TODO: Switch to kew.nfcall() when ready...
  var promise = kew.defer();
  async.parallel(depsTasks, promise.makeNodeResolver());
  return promise;
}


/**
 * @param {string} moduleName
 * @param {!Object} projectOptions
 * @param {!Object} buildOptions
 * @param {!OutputDirs} outDirs
 * @param {function(Error, Array.<string>)} callbackFn Node-style callback.
 */
function calcModuleDeps(
    moduleName, projectOptions, buildOptions, outDirs, callbackFn) {
  // If module doesn't have any Closure inputs, no-op.
  var jsModuleSpec = projectOptions.jsModules[moduleName];
  if (jsModuleSpec.closureRootNamespaces.length == 0) {
    callbackFn(null, []);
    return;
  }

  // Launch closurebuilder.py script to calculate JS dependencies.
  var closureBuilderArgs = [CLOSURE_BUILDER_PATH];

  var projectRootDirs = projectOptions.closureRootDirs.map(function(rootDir) {
    return path.join(projectOptions.rootSrcDir, rootDir);
  });
  CLOSURE_LIBRARY_ROOT_DIRS.concat(projectRootDirs, [outDirs.gen])
      .forEach(function(rootDir) {
        closureBuilderArgs.push('--root');
        closureBuilderArgs.push(rootDir);
      });
  jsModuleSpec.closureRootNamespaces.forEach(function(namespace) {
    closureBuilderArgs.push('--namespace');
    closureBuilderArgs.push(namespace);
  });

  var stderrBehavior = buildOptions.suppressOutput ? 'ignore' : process.stderr;
  var closureBuilder = child_process.spawn(buildOptions.python2Command,
      closureBuilderArgs, {stdio: ['ignore', 'pipe', stderrBehavior]});

  common.getStdoutString(closureBuilder)
      .then(function(output) {
        var isNonEmpty = function(e) { return !!e; };
        var depList = output.split(/\r?\n/).filter(isNonEmpty);
        callbackFn(null, depList);
      }).fail(function(e) {
        callbackFn(new Error('Calculating closure dependencies for module ' +
            moduleName + ' failed.'));
      });
}


// Symbols exported by this internal module.
module.exports = {
  CLOSURE_BUILDER_PATH: CLOSURE_BUILDER_PATH,
  CLOSURE_LIBRARY_ROOT_DIRS: CLOSURE_LIBRARY_ROOT_DIRS,
  calcDeps: calcDeps
};
