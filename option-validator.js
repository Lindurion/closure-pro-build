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
var util = require('./util.js');


//==============================================================================
// Value Validators
//==============================================================================

/**
 * Throws an Error if value isn't a string.
 * @param {*} value
 * @param {string} name The option name.
 * @param {string} description Description of the option.
 */
function assertString(value, name, description) {
  if (!underscore.isString(value)) {
    throw new Error(
        '<' + value + '> is not a string, ' + name + ': ' + description);
  }
}


/**
 * Throws an Error if value isn't a boolean.
 * @param {*} value
 * @param {string} name The option name.
 * @param {string} description Description of the option.
 */
function assertBoolean(value, name, description) {
  if (!underscore.isBoolean(value)) {
    throw new Error(
        '<' + value + '> is not a boolean, ' + name + ': ' + description);
  }
}


/**
 * Throws an Error if value isn't a valid build type.
 * @param {*} value
 * @param {string} name The option name.
 * @param {string} description Description of the option.
 */
function assertValidBuildType(value, name, description) {
  if ((value != util.DEBUG) && (value != util.RELEASE)) {
    throw new Error('Invalid build type: <' + value + '>, must be ' +
        'closureProBuild.DEBUG or closureProBuild.RELEASE');
  }
}


//==============================================================================
// Object & Array Validators
//==============================================================================

/**
 * Throws an Error if value isn't an array, and invokes elementValidatorFn for
 * each element of the array.
 * @param {function(*, string, string)} elementValidatorFn
 * @param {*} value
 * @param {string} name The option name.
 * @param {string} description Description of the option.
 */
function assertArrayOf(elementValidatorFn, value, name, description) {
  if (!underscore.isArray(value)) {
    throw new Error(
        '<' + value + '> is not an array, ' + name + ': ' + description);
  }

  // Check all elements.
  value.forEach(function(element, index) {
    elementValidatorFn(element, name + '[' + index + ']', description);
  });
}


/** @type {function(*, string, string)} */
var assertStringArray = underscore.partial(assertArrayOf, assertString);


/**
 * Throws an Error if value isn't an Object, and invokes elementValidatorFn for
 * each value within the map.
 * @param {function(*, string, string)} valueValidatorFn
 * @param {*} value
 * @param {string} name The option name.
 * @param {string} description Description of the option.
 */
function assertObjectMapOf(valueValidatorFn, value, name, description) {
  if (!underscore.isObject(value)) {
    throw new Error(
        '<' + value + '> is not an Object map, ' + name + ': ' + description);
  }

  // Check all values.
  for (var key in value) {
    valueValidatorFn(value[key], name + '[\'' + key + '\']', description);
  }
}


//==============================================================================
// Spec Validation
//==============================================================================

/**
 * Throws an Error if the given value doesn't meet the given spec.
 * @param {!Object} spec Map from key to {required, validatorFn, description}.
 * @param {*} value
 * @param {string} name The option name.
 * @param {string} description Description of the option.
 */
function assertMeetsSpec(spec, value, name, description) {
  if (!value) {
    throw new Error(
        value + ' is not valid value for option ' + name + ': ' + description);
  } else if (!underscore.isObject(value)) {
    throw new Error(
        '<' + value + '> is not an Object map, ' + name + ': ' + description);
  }

  // Don't allow unrecognized options.
  for (var givenOption in value) {
    if (!spec[givenOption]) {
      throw new Error('Unrecognized option <' + givenOption + '> within '
          + name);
    }
  }

  // Validate each spec option.
  for (var option in spec) {
    if (spec[option].required && !value.hasOwnProperty(option)) {
      throw new Error('Missing required option ' + option + ' within ' + name);
    }

    if (value.hasOwnProperty(option)) {
      spec[option].validatorFn(value[option], name + '[\'' + option + '\']',
          spec[option].description);
    } else if (spec[option].hasOwnProperty('defaultValue')) {
      // Populate default value if available and no value was given.
      value[option] = spec[option].defaultValue;
    }
  }
}


/**
 * @param {*} value
 * @param {string} name The option name.
 * @param {string} description Description of the option.
 */
function assertValidCssModuleSpec(value, name, description) {
  assertMeetsSpec(CSS_MODULE_SPEC, value, name, description);

  var hasClosureInputFiles = (value['closureInputFiles'] &&
      (value['closureInputFiles'].length >= 1));
  var hasDontCompileInputFiles = (value['dontCompileInputFiles'] &&
      (value['dontCompileInputFiles'].length >= 1));
  if (!hasClosureInputFiles && !hasDontCompileInputFiles) {
    throw new Error('Must specify at least one input CSS or GSS file, ' + name);
  }
}


/**
 * @param {*} value
 * @param {string} name The option name.
 * @param {string} description Description of the option.
 */
function assertValidJsModuleSpec(value, name, description) {
  assertMeetsSpec(JS_MODULE_SPEC, value, name, description);

  var hasClosureRootNamespaces = (value['closureRootNamespaces'] &&
      (value['closureRootNamespaces'].length >= 1));
  var hasNonClosureNamespacedInputFiles =
      (value['nonClosureNamespacedInputFiles'] &&
          (value['nonClosureNamespacedInputFiles'].length >= 1));
  var hasDontCompileInputFiles = (value['dontCompileInputFiles'] &&
      (value['dontCompileInputFiles'].length >= 1));
  if (!hasClosureRootNamespaces && !hasNonClosureNamespacedInputFiles &&
      !hasDontCompileInputFiles) {
    throw new Error('Must specify at least one root Closure namespace ' +
        'or input JS file, ' + name);
  }
}


/** @type {function(*, string, string)} */
var assertValidJsModules =
    underscore.partial(assertObjectMapOf, assertValidJsModuleSpec);


//==============================================================================
// Option Specs
//==============================================================================

var CSS_MODULE_SPEC = {
  'name': {
    required: false,
    validatorFn: assertString,
    description: 'Name of CSS module (controls output .css file name)',
    defaultValue: 'style'
  },
  'description': {
    required: false,
    validatorFn: assertString,
    description: 'String that describes the module (for documentation)'
  },
  'closureInputFiles': {
    required: false,
    validatorFn: assertStringArray,
    description: 'Input GSS or CSS files to compile with Closure Stylesheets',
    defaultValue: []
  },
  'dontCompileInputFiles': {
    required: false,
    validatorFn: assertStringArray,
    description: 'Input CSS files to NOT compile with Closure Stylesheets',
    defaultValue: []
  }
};


var JS_MODULE_SPEC = {
  'description': {
    required: false,
    validatorFn: assertString,
    description: 'String that describes the module (for documentation)'
  },
  'dependsOnModules': {
    required: false,
    validatorFn: assertStringArray,
    description: 'List of JS module names this module depends on',
    defaultValue: []
  },
  'closureRootNamespaces': {
    required: false,
    validatorFn: assertStringArray,
    description: 'List of root Closure namespace(s) for this module',
    defaultValue: []
  },
  'nonClosureNamespacedInputFiles': {
    required: false,
    validatorFn: assertStringArray,
    description: 'List of input JS files to compile that aren\'t using Closure',
    defaultValue: []
  },
  'dontCompileInputFiles': {
    required: false,
    validatorFn: assertStringArray,
    description: 'List of input JS files to NOT compile with Closure Compiler',
    defaultValue: []
  }
};


var PROJECT_OPTIONS_SPEC = {
  'cssModule': {
    required: false,
    validatorFn: assertValidCssModuleSpec,
    description: 'Map of CSS modules and their inputs'
  },
  'jsModules': {
    required: true,
    validatorFn: assertValidJsModules,
    description: 'Map of JS modules and their inputs'
  },
  'rootSrcDir': {
    required: false,
    validatorFn: assertString,
    description: 'Root directory that all input file paths are relative to',
    defaultValue: '.'
  },
  'closureRootDirs': {
    required: false,
    validatorFn: assertStringArray,
    description: 'List of root directories for Closure to resolve deps under',
    defaultValue: ['.']
  },
  'soyInputFiles': {
    required: false,
    validatorFn: assertStringArray,
    description: 'List of input Soy files',
    defaultValue: ['**/*.soy']
  },
  'jsWarningsWhitelistFile': {
    required: false,
    validatorFn: assertString,
    description: 'Whitelist file for JS compiler warnings'
  }
};


var BUILD_OPTIONS_SPEC = {
  'type': {
    required: true,
    validatorFn: assertValidBuildType,
    description: 'closureProBuild.RELEASE or closureProBuild.DEBUG'
  },
  'generatedCodeDir': {
    required: false,
    validatorFn: assertString,
    description: 'Directory to place generated code under',
    defaultValue: 'gen/'
  },
  'tempFileDir': {
    required: false,
    validatorFn: assertString,
    description: 'Directory to place temporary build files under',
    defaultValue: 'tmp/'
  },
  'outputDir': {
    required: false,
    validatorFn: assertString,
    description: 'Directory to output JS and CSS files under',
    defaultValue: 'build/'
  },
  'python2Command': {
    required: false,
    validatorFn: assertString,
    description: 'Command to invoke Python version 2',
    defaultValue: 'python'
  },
  'javaCommand': {
    required: false,
    validatorFn: assertString,
    description: 'Command to invoke Java',
    defaultValue: 'java'
  },
  'suppressOutput': {
    required: false,
    validatorFn: assertBoolean,
    description: 'True if standard output/error should be suppressed',
    defaultValue: false
  }
};


//==============================================================================
// Internal API
//==============================================================================

/**
 * Throws an Error if projectOptions or buildOptions have any validation errors.
 * After validation, fills in default values for any missing options.
 * @param {!Object} projectOptions
 * @param {!Object} buildOptions
 */
function assertValidAndFillDefaults(projectOptions, buildOptions) {
  assertMeetsSpec(PROJECT_OPTIONS_SPEC, projectOptions, 'projectOptions',
      'Configuration map that specifies the project inputs');
  assertMeetsSpec(BUILD_OPTIONS_SPEC, buildOptions, 'buildOptions',
      'Configuration map specific to this build (debug/release, etc.)');
}


// Symbols exported by this internal module.
module.exports = {assertValidAndFillDefaults: assertValidAndFillDefaults};
