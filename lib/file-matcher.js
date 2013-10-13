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
var common = require('./common.js');
var glob = require('glob');
var kew = require('kew');
var underscore = require('underscore');


/** Regular expression to match file glob patterns. */
var IS_GLOB_REGEX = /[\^$|?*+()\[\]{}]/;


/**
 * Uses glob library to resolve any file patterns in input list. Removes any
 * duplicate file paths and converts any path backslashes into forward slashes.
 * @param {!Array.<string>} filesAndPatterns List of files and file patterns,
 *     e.g. ['my/single/file.js', 'dir/of/*.js'].
 * @param {string} rootSrcDir Root source directory that filesAndPatterns are
 *     relative to.
 * @return {!Promise.<!Array.<string>>} Async result that will be called with
 *     the list of resolved filenames on success.
 */
function resolveAnyGlobPatternsAsync(filesAndPatterns, rootSrcDir) {
  return resolveGlobsAsync(filesAndPatterns, rootSrcDir)
      .then(function(resolvedFiles) {
        var allFiles = insertResolvedFiles(filesAndPatterns, resolvedFiles);
        return allFiles.map(convertBackslashes);
      });
}


/**
 * Does the glob resolution for all glob file patterns in input.
 * @param {!Array.<string>} filesAndPatterns
 * @param {string} rootSrcDir
 * @return {!Promise.<!Object.<string, !Array.<string>>>} A future map from
 *     file pattern to list of resolved files (on success).
 */
function resolveGlobsAsync(filesAndPatterns, rootSrcDir) {
  var options = {cwd: rootSrcDir};

  var tasks = {};
  filesAndPatterns.forEach(function(fileOrPattern) {
    if (isGlobPattern(fileOrPattern)) {
      tasks[fileOrPattern] =
          underscore.partial(resolveGlobAsync, fileOrPattern, options);
    }
  });

  // TODO: Add kew.nfcall() and use that instead.
  // https://github.com/Obvious/kew/pull/21
  var deferred = kew.defer();
  async.parallel(tasks, deferred.makeNodeResolver());
  return deferred.promise;
}


/**
 * @param {string} fileOrPattern
 * @return {boolean}
 */
function isGlobPattern(fileOrPattern) {
  return IS_GLOB_REGEX.test(fileOrPattern);
}


/**
 * @param {string} pattern
 * @param {!Object} options For glob library.
 * @param {function(Error, Array.<string>=)} callbackFn
 */
function resolveGlobAsync(pattern, options, callbackFn) {
  return new glob.Glob(pattern, options, callbackFn);
}


/**
 * Once globs are resolved, inserts each resolved file list into the input in
 * place of the glob pattern. Also removes any duplicate files (in case multiple
 * patterns resolved to the same file).
 * @param {!Array.<string>} filesAndPatterns
 * @param {!Object.<string, !Array.<string>>} resolvedFiles Map from pattern to
 *     list of resolved files.
 * @return {!Array.<string>}
 */
function insertResolvedFiles(filesAndPatterns, resolvedFiles) {
  var allFiles = [];

  filesAndPatterns.forEach(function(fileOrPattern) {
    if (resolvedFiles[fileOrPattern]) {
      // Glob pattern: add all resolved files in its place.
      Array.prototype.push.apply(allFiles, resolvedFiles[fileOrPattern]);
    } else {
      // Regular file: just add it.
      allFiles.push(fileOrPattern);
    }
  });

  // Remove any duplicates.
  return underscore.unique(allFiles);
}


/**
 * Converts any backslashes in filePath to forward slashes.
 * @param {string} filePath
 * @return {string}
 */
function convertBackslashes(filePath) {
  return filePath.replace(common.ALL_BACKSLASHES, '/');
}


// Symbols exported by this internal module.
module.exports = {resolveAnyGlobPatternsAsync: resolveAnyGlobPatternsAsync};
