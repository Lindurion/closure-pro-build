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

var cssBuilder = require('../css-builder.js');

var kew = require('kew');
var should = require('should');
var sinon = require('sinon');


//==============================================================================
// Test Data
//==============================================================================

// TODO: Test this being resolved right away and not until later...
var outDirsAsync = null;


//==============================================================================
// Test Cases
//==============================================================================

describe('cssBuilder', function() {
  describe('#build()', function() {
    it('is no-op when cssModule not given', function(callbackFn) {
      var res = cssBuilder.build({}, {}, outDirsAsync);
      kew.all([res.getCssRenamingFileAsync(), res.awaitCompletion()])
          .then(function(results) {
            should.not.exist(results[0]);
            should.not.exist(results[1]);
            callbackFn(null);
          }).end();
    });

    it('compiles a dontCompileInputFiles-only project successfully');
    it('compiles a closureInputFiles-only project successfully');
    it('works for projects with closureInputFiles and dontCompileInputFiles');
    it('only concats CSS files when no closureInputFiles given');
  });
});
