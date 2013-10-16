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

  /** Map from module ID to {name, moduleDeps, transitiveModuleDeps, isRoot}. */
  this.modules = {};
  this.initModules(projectOptions);

  /** List of module IDs in dependency order (from no deps to most deps). */
  this.sortedModuleIds = this.getSortedModuleIds();

  this.fillInTransitiveModuleDeps();

  /** Map from file ID to {path, compileMode, inferredDeps, neededInModules}. */
  this.files = {};
  this.initFiles(projectOptions, transitiveClosureDeps);

  /** List of file IDs in dependency order (from no deps to most deps). */
  this.sortedFileIds = this.getSortedFileIds();

  /** Map from serialized module set to list of LCA module(s). */
  this.memoizedLcas = {};
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
      moduleDeps: {},
      transitiveModuleDeps: {}
    };

    // Record all modules this one depends on.
    // Note that transitiveModuleDeps will get filled in later.
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
    transitiveModuleDeps: {},
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
ModuleManager.prototype.fillInTransitiveModuleDeps = function() {
  this.sortedModuleIds.forEach(function(moduleId) {
    var module = this.modules[moduleId];

    // Add the transitive dependencies of each direct dependency.
    for (var directDep in module.moduleDeps) {
      for (var transitiveDep in this.modules[directDep].transitiveModuleDeps) {
        module.transitiveModuleDeps[transitiveDep] = true;
      }
    }

    // And include self in the set.
    module.transitiveModuleDeps[moduleId] = true;
  }, this);

  // Make sure every module only depends on a single root module (otherwise
  // module configuration is invalid).
  for (var moduleId in this.modules) {
    var rootModuleNames =
        underscore.keys(this.modules[moduleId].transitiveModuleDeps)
            .filter(function(id) { return this.modules[id].isRoot;  }, this)
            .map(function(id) { return this.modules[id].name; }, this);
    if (rootModuleNames.length > 1) {
      throw new Error('Module ' + this.modules[moduleId].name +
          ' depends on more than 1 root module, which is invalid. Maybe some' +
          ' of these root modules should depend on each other: ' +
          rootModuleNames);
    }
  }
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


/** @return {!Array.<string>} List of file IDs in dependency order. */
ModuleManager.prototype.getSortedFileIds = function() {
  // Build outgoing edge graph of file (inferred) dependencies.
  var depGraph = {};
  for (var fileId in this.files) {
    depGraph[fileId] = this.files[fileId].inferredDeps;
  }

  // Topologically sort nodes to get files in dependency order.
  try {
    return graphUtil.topSortNodes(depGraph);
  } catch (e) {
    if (e instanceof graphUtil.CycleError) {
      throw new Error('Unexpected cycle within inferred file deps ' +
          e.remainingNodes.map(function(fileId) {
            return this.files[fileId].path;
          }, this));
    }
    throw e;
  }
};


/**
 * @return {!Array.<!{name: string, compiledInputFiles: !Array.<string>,
 *     dontCompileInputFiles: !Array.<string>}>}
 */
ModuleManager.prototype.calcInputs = function() {
  // Initialize each module output.
  var inputsByModule = {};
  for (var moduleId in this.modules) {
    inputsByModule[moduleId] = {
      name: this.modules[moduleId].name,
      compiledInputFiles: [],
      dontCompileInputFiles: []
    };
  }

  // Choose module for each file (in reverse dependency order, because choosing
  // a module for a file can put new requirements on all the files it possibly
  // depends on).
  for (var i = this.sortedFileIds.length - 1; i >=0; i--) {
    var fileId = this.sortedFileIds[i];
    var file = this.files[fileId];
    var bestModuleId = this.chooseModuleFor(fileId);

    // Add file to chosen module.
    if (file.compileMode == ModuleManager.CompileMode.UNCOMPILED) {
      inputsByModule[bestModuleId].dontCompileInputFiles.unshift(file.path);
    } else {
      inputsByModule[bestModuleId].compiledInputFiles.unshift(file.path);
    }

    // If the file wasn't already needed in the chosen module, then we need to
    // make sure that we consider all of its inferred dependencies as needed in
    // the chosen module, so that we're sure they're all loaded first.
    if (!file.neededInModules[bestModuleId]) {
      file.neededInModules[bestModuleId] = true;
      for (var inferredDep in file.inferredDeps) {
        this.files[inferredDep].neededInModules[bestModuleId] = true;
      }
    }
  }

  // Return list of modules in dependency order.
  return this.sortedModuleIds.map(function(moduleId) {
    return inputsByModule[moduleId];
  });
};


/**
 * @param {string} fileId
 * @return {string} Module ID chosen for the given file.
 */
ModuleManager.prototype.chooseModuleFor = function(fileId) {
  // First, identify the LCA(s) for the set of modules the file is needed in.
  var lcaModules = this.calcLcaModules(fileId);

  // If there is a single module, use it.
  if (lcaModules.length == 1) {
    return lcaModules[0];
  }

  // Otherwise, choose the module that will minimize the # of file dependencies
  // that have to be added to it.
  return underscore.min(lcaModules, function(moduleId) {
    var numMovesRequired = 0;
    for (var inferredDep in this.files[fileId].inferredDeps) {
      if (!this.files[inferredDep].neededInModules[moduleId]) {
        numMovesRequired++;
      }
    }
    return numMovesRequired;
  }, this);
};


/**
 * @param {string} fileId
 * @return {!Array.<string>} The list of LCA module IDs.
 */
ModuleManager.prototype.calcLcaModules = function(fileId) {
  // Check for a memoized answer first.
  var neededInModules = this.files[fileId].neededInModules;
  var key = ModuleManager.serializeModuleSet(neededInModules);
  if (this.memoizedLcas[key]) {
    return this.memoizedLcas[key];
  }

  // Intersect transitive deps of each module this file is needed in to get
  // module dep(s) common to all of them.
  var commonModuleDeps = null;
  for (var moduleId in neededInModules) {
    var transitiveModuleDeps = this.modules[moduleId].transitiveModuleDeps;
    commonModuleDeps = commonModuleDeps ?
        graphUtil.intersectSets(commonModuleDeps, transitiveModuleDeps) :
        transitiveModuleDeps;
  }

  // Pick the "lowest" module(s) and memoize the answer.
  var lcaModules = this.chooseLowestModules(commonModuleDeps);
  this.memoizedLcas[key] = lcaModules;
  return lcaModules;
};


/**
 * @param {!Object.<string, boolean>} moduleSet
 * @return {string} Serialized form.
 */
ModuleManager.serializeModuleSet = function(moduleSet) {
  return underscore.keys(moduleSet).sort().join(':');
};


/**
 * @param {!Object.<string, boolean>} moduleSet
 * @return {!Array.<string>} The list of "lowest" module IDs.
 */
ModuleManager.prototype.chooseLowestModules = function(moduleSet) {
  var depCountModulePairs = [];
  for (var moduleId in moduleSet) {
    var numDeps =
        underscore.keys(this.modules[moduleId].transitiveModuleDeps).length;
    depCountModulePairs.push([numDeps, moduleId]);
  }

  // Sort modules from fewest to most transitive module deps.
  depCountModulePairs.sort();

  // Return the max depth module(s).
  var maxDepth = underscore.last(depCountModulePairs)[0];
  var lowestModules = [];

  for (var i = depCountModulePairs.length - 1; i >= 0; i--) {
    if (depCountModulePairs[i][0] < maxDepth) {
      break;
    }
    lowestModules.push(depCountModulePairs[i][1]);
  }

  return lowestModules;
};


// Symbols exported by this internal module.
module.exports = {
  VIRTUAL_BASE_MODULE: VIRTUAL_BASE_MODULE,
  calcInputFiles: calcInputFiles
};
