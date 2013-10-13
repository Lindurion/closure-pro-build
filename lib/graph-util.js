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

var underscore = require('underscore');


/**
 * @param {!Object} obj A set, map, or other pure value object.
 * @return {!Object} Deeply cloned version.
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
};


/**
 * @param {!Object.<string, !Object.<string, boolean>>} graph A JS object
 *     directed graph in adjacency list representation, where map keys are nodes
 *     and map values are the JS object set of outgoing edges.
 * @return {!Array.<string>} Sorted list of nodes. (Throws an exception if a
 *     cycle exists).
 */
function topSortNodes(graph) {
  var remainingGraph = deepClone(graph);
  var sortedNodes = [];

  while (underscore.size(remainingGraph) > 0) {
    // Choose a node with no more outgoing edges and add it to the list.
    var nextNode = chooseNodeWithNoOutgoingEdges(remainingGraph);
    if (!nextNode) {
      throw new CycleError(underscore.keys(remainingGraph));
    }
    sortedNodes.push(nextNode);

    // Now completely remove this node and edges to it from the graph.
    delete remainingGraph[nextNode];
    for (var remainingNode in remainingGraph) {
      delete remainingGraph[remainingNode][nextNode];
    }
  }

  return sortedNodes;
}


/**
 * @param {!Object.<string, !Object.<string, boolean>>} remainingGraph
 * @return {?string} Node with no outgoing edges, or null.
 */
function chooseNodeWithNoOutgoingEdges(remainingGraph) {
  for (var node in remainingGraph) {
    if (underscore.size(remainingGraph[node]) == 0) {
      return node;
    }
  }
  return null;
}


/**
 * @param {!Array.<string>} remainingNodes
 * @constructor
 */
function CycleError(remainingNodes) {
  this.message = 'Cycle exists in graph within nodes ' + remainingNodes;
  this.remainingNodes = remainingNodes;
}
CycleError.prototype = new Error();


// Symbols exported by this internal module.
module.exports = {
  CycleError: CycleError,
  deepClone: deepClone,
  topSortNodes: topSortNodes
};
