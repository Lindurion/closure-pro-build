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

var graphUtil = require('../lib/graph-util.js');

var should = require('should');


//==============================================================================
// Test Cases
//==============================================================================

describe('graphUtil', function() {
  describe('#deepClone()', function() {
    it('clones an object so that changes to input and output are independent',
        function() {
      var input = {'a': true, 'b': [1, 2, 3]};
      var output = graphUtil.deepClone(input);
      should.deepEqual(output, input);
      input['c'] = 'INPUT ONLY';
      should.not.exist(output['c']);
      output['b'].push('OUTPUT ONLY');
      input['b'].length.should.equal(3);
    });
  });

  describe('#topSortNodes()', function() {
    it('topologically sorts a simple graph', function() {
      var simpleGraph = {'A': {'B': true}, 'B': {}, 'C': {'A': true}};
      var sortedNodes = graphUtil.topSortNodes(simpleGraph);
      should.deepEqual(sortedNodes, ['B', 'A', 'C']);
    });

    it('topologically sorts a complex graph', function() {
      var complexGraph = {
        'F': {'B': true, 'D': true, 'C': true},
        'B': {'A': true},
        'G': {'C': true, 'D': true},
        'A': {},
        'D': {'A': true},
        'E': {'C': true, 'B': true},
        'C': {'A': true}
      };
      var sortedNodes = graphUtil.topSortNodes(complexGraph);

      // Result must start with A.
      var aIndex = sortedNodes.indexOf('A');
      aIndex.should.equal(0);

      // B, C, and D must appear after A.
      var bIndex = sortedNodes.indexOf('B');
      bIndex.should.be.above(aIndex);
      var cIndex = sortedNodes.indexOf('C');
      cIndex.should.be.above(aIndex);
      var dIndex = sortedNodes.indexOf('D');
      dIndex.should.be.above(aIndex);

      // E, F, and G must appear after their dependencies.
      var eIndex = sortedNodes.indexOf('E');
      eIndex.should.be.above(bIndex);
      eIndex.should.be.above(cIndex);

      var fIndex = sortedNodes.indexOf('F');
      fIndex.should.be.above(bIndex);
      fIndex.should.be.above(cIndex);
      fIndex.should.be.above(dIndex);

      var gIndex = sortedNodes.indexOf('G');
      gIndex.should.be.above(cIndex);
      gIndex.should.be.above(dIndex);
    });

    it('does not modify input graph', function() {
      var inputGraph = {'A': {'B': true}, 'B': {}};
      var sortedNodes = graphUtil.topSortNodes(inputGraph);
      should.deepEqual(inputGraph, {'A': {'B': true}, 'B': {}});
    });

    it('throws an exception if a simple cycle exists', function() {
      var simpleCycleGraph = {'A': {'B': true}, 'B': {'A': true}};
      (function() {
        graphUtil.topSortNodes(simpleCycleGraph);
      }).should.throwError(/within nodes A,B/);
    });

    it('throws an exception if a complex cycle exists', function() {
      var complexCycleGraph = {
        'A': {'B': true, 'C': true},
        'B': {'C': true, 'D': true},
        'C': {'E': true},
        'D': {'F': true},
        'E': {},
        'F': {'A': true}
      };
      (function() {
        graphUtil.topSortNodes(complexCycleGraph);
      }).should.throwError(/within nodes A,B,D,F/);
    });
  });
});
