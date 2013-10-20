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
var fs = require('fs');
var kew = require('kew');


/** Regular expression to match all backslashes in a path. */
var ALL_BACKSLASHES = /\\/g;

/** Constant indicating a debug build. */
var DEBUG = 'debug';

/** Constant indicating a release build. */
var RELEASE = 'release';

/** Successful process exit code. */
var EXIT_SUCCESS = 0;

/** Failed process exit code. */
var EXIT_FAILURE = 1;


/**
 * @param {!ChildProcess} childProcess
 * @return {!Promise.<string>} Yields string of stdout output once the stream
 *     is closed (usually when childProcess exits).
 */
function getStdoutString(childProcess) {
  var output = '';
  childProcess.stdout.setEncoding('utf8');
  childProcess.stdout.on('data', function(data) {
    output += data;
  });

  var promise = kew.defer();
  childProcess.on('close', function(exitCode) {
    if (exitCode != EXIT_SUCCESS) {
      promise.reject(new Error('Child process failed with code ' + exitCode));
    } else {
      promise.resolve(output);
    }
  });
  return promise;
}


/**
 * @param {!Array.<string>} inputFiles
 * @param {!fs.WriteStream} outputStream
 * @return {!Promise} To track success/failure.
 */
function writeTextFilesAsync(inputFiles, outputStream) {
  var queuedWrites = inputFiles.map(function(filePath) {
    return function(callbackFn) {
      writeTextFileAsync(filePath, outputStream)
          .then(function() { callbackFn(null); })
          .fail(callbackFn);
    };
  });

  // TODO: Switch to kew.nfcall() when ready...
  var promise = kew.defer();
  async.series(queuedWrites, promise.makeNodeResolver());
  return promise;
}


/**
 * @param {string} filePath
 * @param {!fs.WriteStream} outputStream
 * @return {!Promise} To track success/failure.
 */
function writeTextFileAsync(filePath, outputStream) {
  // Read input file in to string.
  // TODO: Switch to kew.nfcall() when ready...
  var readAsync = kew.defer();
  fs.readFile(filePath, {encoding: 'utf8'}, readAsync.makeNodeResolver());

  // Then write it to the output stream.
  return readAsync.then(function(fileContent) {
    // TODO: Switch to kew.nfcall() when ready...
    var writeAsync = kew.defer();
    outputStream.write(fileContent, 'utf8', writeAsync.makeNodeResolver());
    return writeAsync;
  });
}


// Symbols exported by this internal module.
module.exports = {
  ALL_BACKSLASHES: ALL_BACKSLASHES,
  DEBUG: DEBUG,
  EXIT_FAILURE: EXIT_FAILURE,
  EXIT_SUCCESS: EXIT_SUCCESS,
  RELEASE: RELEASE,
  getStdoutString: getStdoutString,
  writeTextFilesAsync: writeTextFilesAsync
};
