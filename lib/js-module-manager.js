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
var underscore = require('underscore');


var VIRTUAL_BASE_MODULE = 'virtual_base_module';
var VIRTUAL_BASE_MODULE_ID = '@';


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

  /** Map from module ID to {name, moduleDeps, isRoot}. */
  this.modules = {};
  this.initModules(projectOptions);

  /** List of module IDs in dependency order (from no deps to most deps). */
  this.sortedModuleIds = this.getSortedModuleIds();

  /** Map from module ID to set of module IDs (including self) it depends on. */
  this.transitiveModuleDeps = this.getTransitiveModuleDeps();

  /** Map from file ID to {path, compileMode, inferredDeps, neededInModules}. */
  this.files = {};
  this.initFiles(projectOptions, transitiveClosureDeps);
}


/** A given file should always appear in exactly one compile mode. */
ModuleManager.CompileMode = {
  UNCOMPILED: 1,
  NON_NAMESPACED: 2,
  CLOSURE: 3
};


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

    this.modules[moduleId].isRoot =
        (moduleSpec.alwaysLoadedAfterModules.length == 0);
  }

  this.maybeAddVirtualBaseModule();
};


/** If needed, adds a virtual base module that all root modules depend on. */
ModuleManager.prototype.maybeAddVirtualBaseModule = function() {
  var rootModuleIds = underscore.keys(this.modules).filter(function(moduleId) {
    return this.modules[moduleId].isRoot;
  }, this);

  // If there is a single root module, it can serve as the common base.
  if (rootModuleIds.length == 1) {
    return;
  }

  // Otherwise, need to add a virtual base module that will later be prepended
  // to all root modules.
  this.modules[VIRTUAL_BASE_MODULE_ID] = {
    name: VIRTUAL_BASE_MODULE,
    moduleDeps: {},
    isRoot: false
  };

  rootModuleIds.forEach(function(rootModuleId) {
    this.modules[rootModuleId].moduleDeps[VIRTUAL_BASE_MODULE_ID] = true;
  }, this);
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
 * Note: Throws an exception if any module depends on more than one root module.
 * @return {!Object.<string, !Object.<string, boolean>>} Map from module ID to
 *     set of module IDs (including itself) it depends on.
 */
ModuleManager.prototype.getTransitiveModuleDeps = function() {
  var transitiveModuleDeps = {};

  this.sortedModuleIds.forEach(function(moduleId) {
    var module = this.modules[moduleId];
    transitiveModuleDeps[moduleId] = {};

    // Add the transitive dependencies of each direct dependency.
    for (var directDep in module.moduleDeps) {
      for (var transitiveDep in transitiveModuleDeps[directDep]) {
        transitiveModuleDeps[moduleId][transitiveDep] = true;
      }
    }

    // And include self in the set.
    transitiveModuleDeps[moduleId][moduleId] = true;
  }, this);

  // Make sure every module only depends on a single root module (otherwise
  // module configuration is invalid).
  for (var moduleId in transitiveModuleDeps) {
    var rootModuleNames = underscore.keys(transitiveModuleDeps[moduleId])
        .filter(function(id) { return this.modules[id].isRoot;  }, this)
        .map(function(id) { return this.modules[id].name; }, this);
    if (rootModuleNames.length > 1) {
      throw new Error('Module ' + this.modules[moduleId].name +
          ' depends on more than 1 root module, which is invalid. Maybe some' +
          ' of these root modules should depend on each other: ' +
          rootModuleNames);
    }
  }

  return transitiveModuleDeps;
};


/**
 * @param {!Object} projectOptions
 * @param {!Object.<string, !Array.<string>>} transitiveClosureDeps
 */
ModuleManager.prototype.initFiles =
    function(projectOptions, transitiveClosureDeps) {
  // Map from module ID to {uncompiled, uncompiledAndNonNamespaced}, each of
  // which is a set of all the file IDs of those types that have transitively
  // been seen after that module is loaded (built up progressively).
  var fileDeps = {};
  var files = this.files;

  var recordFile = function(fileId, path, compileMode, moduleId, depsBefore) {
    if (!files[fileId]) {
      // If this is the first time a file has been seen, assume all depsBefore.
      files[fileId] = {
        path: path,
        compileMode: compileMode,
        inferredDeps: graphUtil.deepClone(depsBefore),
        neededInModules: {}
      };
    } else {
      // Otherwise, inferred deps are those files that always appear before it.
      files[fileId].inferredDeps =
          graphUtil.intersectSets(files[fileId].inferredDeps, depsBefore);

      // Also check that compileMode is always the same for each file.
      if (files[fileId].compileMode != compileMode) {
        throw new Error(path + ' occurs in multiple compilation modes.' +
            ' Each given file should always appear in dontCompileInputFiles,' +
            ' nonClosureNamespacedInputFiles, or as part of Closure-managed' +
            ' dependencies from closureRootNamespaces.');
      }
    }

    files[fileId].neededInModules[moduleId] = true;
  };

  // General note: Non-namespaced and Closure files can depend on uncompiled
  // files, and Closure files can depend on non-namespaced files (but not the
  // other way around).
  this.sortedModuleIds.forEach(function(moduleId) {
    var moduleName = this.modules[moduleId].name;
    var moduleSpec = projectOptions.jsModules[moduleName];

    // Init the uncompiled files that have transitively been seen so far.
    fileDeps[moduleId] = {uncompiled: {}};
    for (var depModule in this.modules[moduleId].moduleDeps) {
      graphUtil.addSetValues({
        from: fileDeps[depModule].uncompiled,
        to: fileDeps[moduleId].uncompiled
      });
    }

    // Update information about each uncompiled file in this module.
    moduleSpec.dontCompileInputFiles.forEach(function(path) {
      var fileId = this.filePathToId[path];
      recordFile(fileId, path, ModuleManager.CompileMode.UNCOMPILED,
          moduleId, fileDeps[moduleId].uncompiled);
      fileDeps[moduleId].uncompiled[fileId] = true;
    }, this);

    // Init the non-Closure namespaced (plus uncompiled files) seen so far.
    fileDeps[moduleId].uncompiledAndNonNamespaced =
        graphUtil.deepClone(fileDeps[moduleId].uncompiled);
    for (var depModule in this.modules[moduleId].moduleDeps) {
      graphUtil.addSetValues({
        from: fileDeps[depModule].uncompiledAndNonNamespaced,
        to: fileDeps[moduleId].uncompiledAndNonNamespaced
      });
    }

    // Update information about each non-namespaced file in this module.
    moduleSpec.nonClosureNamespacedInputFiles.forEach(function(path) {
      var fileId = this.filePathToId[path];
      recordFile(fileId, path, ModuleManager.CompileMode.NON_NAMESPACED,
          moduleId, fileDeps[moduleId].uncompiledAndNonNamespaced);
      fileDeps[moduleId].uncompiledAndNonNamespaced[fileId] = true;
    }, this);

    // The list of transitive Closure deps is special, in that we know that each
    // Closure dependency is self contained within this module's list. So we
    // consider transitive uncompiled and non-namespaced dependencies from this
    // & parent modules, but we can ignore Closure deps from parent modules.
    var allFileDeps =
        graphUtil.deepClone(fileDeps[moduleId].uncompiledAndNonNamespaced);
    (transitiveClosureDeps[moduleName] || []).forEach(function(path) {
      var fileId = this.filePathToId[path];
      recordFile(fileId, path, ModuleManager.CompileMode.CLOSURE,
          moduleId, allFileDeps);
      allFileDeps[fileId] = true;
    }, this);
  }, this);
};


/**
 * @return {!Array.<!{name: string, compiledInputFiles: !Array.<string>,
 *     dontCompileInputFiles: !Array.<string>}>}
 */
ModuleManager.prototype.calcInputs = function() {
  return this.sortedModuleIds.map(function(moduleId) {
    // TODO: Implement.
    return {
      name: this.modules[moduleId].name,
      compiledInputFiles: [],
      dontCompileInputFiles: []
    };
  }, this);
};


// Symbols exported by this internal module.
module.exports = {
  VIRTUAL_BASE_MODULE: VIRTUAL_BASE_MODULE,
  calcInputFiles: calcInputFiles
};
