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

var graphUtil = require('./graph-util.js');


/**
 * Calculates input files to each module, moving files common to multiple
 * modules into parent modules as needed. Throws an exception if module
 * configuration is invalid (e.g. cycles in module dependency graph).
 * @param {!Object} projectOptions Specifies the project input files; see
 *     README.md for option documentation.
 * @param {!Object.<string, !Array.<string>>} transitiveClosureDeps Map from
 *     module name to dependency-ordered list of all Closure namespaced files
 *     required for that module.
 * @return {!Array.<!{name: string, compiledInputFiles: !Array.<string>,
 *     dontCompileInputFiles: !Array.<string>}>} Dependency-ordered list of
 *     modules and their compiled and non-compiled input files. Input files
 *     will now be unique across all modules.
 */
function calcInputFiles(projectOptions, transitiveClosureDeps) {
  var moduleManager = new ModuleManager(projectOptions, transitiveClosureDeps);
  return moduleManager.calcInputs();
}


/**
 * @param {!Object} projectOptions
 * @param {!Object.<string, !Array.<string>>} transitiveClosureDeps
 * @constructor
 */
function ModuleManager(projectOptions, transitiveClosureDeps) {
  // Index modules and files using short string identifiers to minimize the
  // memory overhead of building up the ton of maps/sets we're about to use.
  this.moduleNameToId = ModuleManager.indexModules(projectOptions);
  this.filePathToId =
      ModuleManager.indexFiles(projectOptions, transitiveClosureDeps);

  /** Map from module ID to {name, moduleDeps}. */
  this.modules = {};
  this.initModules(projectOptions);

  /** List of module IDs in dependency order (from no deps to most deps). */
  this.sortedModuleIds = this.getSortedModuleIds();

  /** Map from file ID to {path}. */
  this.files = {};
  this.initFiles(projectOptions, transitiveClosureDeps);
}


/**
 * @param {!Object} projectOptions
 * @return {!Object.<string, string>} Map from module name to unique module ID.
 */
ModuleManager.indexModules = function(projectOptions) {
  var moduleNameToId = {};

  var nextId = 'A';
  for (var moduleName in projectOptions.jsModules) {
    moduleNameToId[moduleName] = nextId;
    nextId = String.fromCharCode(nextId.charCodeAt(0) + 1);
  }

  return moduleNameToId;
};


/**
 * @param {!Object} projectOptions
 * @param {!Object.<string, !Array.<string>>} transitiveClosureDeps
 * @return {!Object.<string, string>} Map from file path to unique file ID.
 */
ModuleManager.indexFiles = function(projectOptions, transitiveClosureDeps) {
  var filePathToId = {};

  var nextId = 'a';
  var maybeAdd = function(filePath) {
    if (!filePathToId[filePath]) {
      filePathToId[filePath] = nextId;
      nextId = String.fromCharCode(nextId.charCodeAt(0) + 1);
    }
  };

  for (var moduleName in projectOptions.jsModules) {
    var closureInputFiles = transitiveClosureDeps[moduleName] || [];
    closureInputFiles.forEach(maybeAdd);

    var moduleSpec = projectOptions.jsModules[moduleName];
    moduleSpec.nonClosureNamespacedInputFiles.forEach(maybeAdd);
    moduleSpec.dontCompileInputFiles.forEach(maybeAdd);
  }

  return filePathToId;
};


/** @param {!Object} projectOptions */
ModuleManager.prototype.initModules = function(projectOptions) {
  // Add an entry for each module described in projectOptions.
  for (var moduleName in projectOptions.jsModules) {
    var moduleSpec = projectOptions.jsModules[moduleName];
    var moduleId = this.moduleNameToId[moduleName];
    this.modules[moduleId] = {
      name: moduleName,
      moduleDeps: {}
    };

    // Record all modules this one depends on.
    moduleSpec.alwaysLoadedAfterModules.forEach(function(depModuleName) {
      var depModuleId = this.moduleNameToId[depModuleName];
      if (!depModuleId) {
        throw new Error('Can\'t find a definition for module <' +
            depModuleName + '>, which is listed in alwaysLoadedAfterModules' +
            'for module <' + moduleName + '>');
      }
      this.modules[moduleId].moduleDeps[depModuleId] = true;
    }, this);
  }
};


/** @return {!Array.<string>} List of module IDs in dependency order. */
ModuleManager.prototype.getSortedModuleIds = function() {
  // Build outgoing edge graph of module dependencies.
  var depGraph = {};
  for (var moduleId in this.modules) {
    depGraph[moduleId] = this.modules[moduleId].moduleDeps;
  }

  // Topologically sort nodes to get modules in dependency order.
  try {
    return graphUtil.topSortNodes(depGraph);
  } catch (e) {
    if (e instanceof graphUtil.CycleError) {
      throw new Error('Dependency cycle exists within JS modules ' +
          e.remainingNodes.map(function(moduleId) {
            return this.modules[moduleId].name;
          }, this));
    }
    throw e;
  }
};


/**
 * @param {!Object} projectOptions
 * @param {!Object.<string, !Array.<string>>} transitiveClosureDeps
 */
ModuleManager.prototype.initFiles =
    function(projectOptions, transitiveClosureDeps) {
  // Add an entry to for each file, and update entries to record each module
  // a file is needed in.

  // TODO: Implement...
};


/**
 * @return {!Array.<!{name: string, compiledInputFiles: !Array.<string>,
 *     dontCompileInputFiles: !Array.<string>}>}
 */
ModuleManager.prototype.calcInputs = function() {
  // TODO: Implement.
  return [];
};


// Symbols exported by this internal module.
module.exports = {calcInputFiles: calcInputFiles};
