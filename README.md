closure-pro-build
=================

**Closure Project Builder**: An npm, node.js package that makes it super easy to build projects using some or all of Closure's [JS Compiler](http://developers.google.com/closure/compiler/), [Templates (Soy)](http://developers.google.com/closure/templates/), [Stylesheets (GSS)](http://code.google.com/p/closure-stylesheets/), and [JS Library](http://developers.google.com/closure/library/).


Features
--------
- Can have multiple JS/Soy, CSS modules (multiple output JS or CSS files that can be served when needed).
- Automatically calculates Closure dependencies & moves input files common to multiple modules into lower modules as needed.
- Input JS files can be:
  - Fully Closure-compatible (using `goog.require()`, `goog.provide()`).
  - Partly Closure-compatible (not using `goog.require()`, `goog.provide()`), still run through compilation & minification.
  - Directly included without compilation or minification.
- Input CSS files can be:
  - GSS files (supports mixins, functions, basic logic) compiled by Closure Stylesheets (GSS) compiler.
  - Regular CSS files compiled by Closure Stylesheets (GSS) compiler.
  - Directly included without compilation or class renaming.
- Supports debug (human readable) & release (fully minified) compilation modes.


Usage
-----
Sample usage for a project using 1 CSS module (for application and 3rd party CSS) and 2 JS modules (one for server-side Soy templates to render initial HTML page and the other for all client-side JS that will be downloaded by users):

    var closureProBuild = require('closure-pro-build');

    var projectOptions = {
      rootSrcDir: 'src/',
      cssModules: {
        'style': {
          description: 'All CSS styles for the project',
          closureInputFiles: ['src/main.gss', 'src/other.css'],
          dontCompileInputFiles: ['path/to/some/third_party.css'],
        }
      },
      jsModules: {
        'page': {
          description: 'Soy template for shell HTML, loads main JS and CSS',
          closureRootNamespaces: ['sample.page']
        },
        'main': {
          description: 'Main JS module, with all client-side JS',
          closureRootNamespaces: ['sample.main'],
          nonClosureNamespacedInputFiles: ['path/to/jquery.js'],
          dontCompileInputFiles: ['path/to/wont-minify-this.js'],
        }
      }
    };

    var buildOptions = {type: closureProBuild.RELEASE};

    closureProBuild.build(projectOptions, buildOptions, function(err) {
      if (err) {
        // ...Handle the Error...
        return;
      }

      // Success: style.css, page.js, main.js were output to build/release/.
    });


### Requirements ###

Java and Python version 2 must be installed and part of the system path as `java` and `python`. These commands are also configurable via `buildOptions` (<i>e.g.</i> in case `python` resolves to Python 3).


### Project Options ###

Each CSS or JS module specifies the input files that should be compiled (or not) and combined together to produce a single output CSS or JS file for that module. In the case of JS files using `goog.require()` and `goog.provide()`, these input files are specified by listing the _root namespace(s)_ that transitively `goog.require()` all the JS that should be included in that module.

#### Required ####

- **rootSrcDir**: Path to root source directory, which all project Soy and Closure-namespaced JS files should be under.
- **cssModules**: JS Object map from module name (determines output CSS filename) to an object with these properties:
  - **description**: String that describes the module (for documentation).
  - **closureInputFiles**: (If any) List of GSS or CSS files that should be compiled & minified (including CSS class renaming) using the Closure Stylesheets compiler. Any CSS classes from these files should be accessed via `goog.getCssName('theClassName')` in JS or `{css theClassName}` in Soy.
  - **dontCompileInputFiles**: (If any) List of CSS files that should not be compiled by the GSS compiler (so no minification or CSS class renaming). CSS classes from these files should be accessed normally in JS or Soy (NOT using `goog.getCssName()` or `{css}`). This CSS will be included in the output before any closureInputFiles.
- **jsModules**: JS Object map from module name (determines output JS filename) to an object with these properties:
  - **description**: String that describes the module (for documentation).
  - **dependsOnModules**: (If any) List of JS module names that this module depends on (that will always be loaded before this one). Only immediate deps need to be specified; will automatically consider transitive dependencies.
  - **closureRootNamespaces**: (If any) List of the root Closure namespace(s) that transitively `goog.require()` all the Closure-namespaced JS that should be included in this module.
  - **nonClosureNamespacedInputFiles**: (If any) List of the JS files that do NOT use `goog.require()` or `goog.provide()` but that should still be compiled (including symbol renaming) by the Closure JS Compiler.
  - **dontCompileInputFiles**: (If any) List of JS files that should NOT be compiled or minified by the Closure JS compiler.

#### Optional ####

- **jsWarningsWhitelistFile**: A whitelist file for JS compiler warnings where each line is of the form:
  - `path/to/file.js:{line-number}  {first-line-of-warning}`
  - For example: <pre>src/main.js:294  Suspicious code. This code lacks side-effects. Is there a bug?</pre>


### Build Options ###

#### Required ####

- **type**: The type of build, either `closureProBuild.RELEASE` (fully minified) or `closureProBuild.DEBUG` (human readable).

#### Optional ####

- **generatedCodeDir**: What directory should generated code be put under? (default: gen/)
- **tempFileDir**: What directory should temporary build files be put under? (default: tmp/)
- **outputDir**: What directory should output JS and CSS files be placed under? (default: build/)
- **python2Command**: What command is used to invoke Python version 2? (default: python)
- **javaCommand**: What command is used to invoke Java? (default: java)
- **suppressOutput**: Set to true to suppress any standard output or standard error stream output during compilation. (default: false)


General Notes
-------------

- In all compiled JS, you typically want to access properties as `foo.bar` (NOT `foo['bar']`), since these symbols will be obfuscated in the compiled output (so the quoted string lookup would fail).
- The only possible exception to this is when interacting with JS that is compiled separately (or listed in dontCompileInputFiles) from your compiled JS, where you should do one of two things:
  1. Always use quoted strings to access these properties (<i>e.g.</i> `window['foo']['bar']`).
  2. Use an [externs file](http://developers.google.com/closure/compiler/docs/api-tutorial3#externs) to tell the Closure JS Compiler that certain symbols will be provided externally (so they shouldn't ever be renamed). In that case `foo.bar` access is fine, since the compiler will know not to rename those symbols. (Not yet supported by closure-pro-build, but support should be easy to add for this).


Planned Features
----------------
Future support is planned for:
- Message translation tools & separate output files for each supported locale.
- RTL flipping of CSS styles (<i>e.g.</i> "left: 20px" becomes "right: 20px") for RTL locales.
- Custom externs files (e.g. if you want to include jQuery via a CDN src script tag, an externs file could tell the Closure compiler which symbols it can trust to be defined and include type information).


License & Copyright
-------------------
This package is released under the Apache License, Version 2.0. See LICENSE file for details.

License information for 3rd party tools used can be found under the 3p/ folder. License information for other npm packages used can be found in the information and/or source code for those packages listed on the [npm website](http://npmjs.org/).

Copyright &copy; 2013 Eric W. Barndollar.
