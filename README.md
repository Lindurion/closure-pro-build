closure-pro-build
=================

**Closure Project Builder**: An npm, node.js package that makes it super easy to build projects using some or all of Closure's [JS Compiler](http://developers.google.com/closure/compiler/), [Templates (Soy)](http://developers.google.com/closure/templates/), [Stylesheets (GSS)](http://code.google.com/p/closure-stylesheets/), and [JS Library](http://developers.google.com/closure/library/).

Check out [closure-bxr-starter](http://github.com/Lindurion/closure-bxr-starter) for a sample starter project using closure-pro-build (along with Bootstrap, Express, jQuery, and RECESS).


Features
--------
- Can have multiple JS/Soy modules (multiple output JS files that can be loaded when needed on clients, servers, or both).
- Automatically calculates Closure dependencies & moves input files common to multiple modules into parent modules to prevent duplicate code loading.
- Input JS files can be:
  - **Fully Closure-compatible** (using `goog.require()`, `goog.provide()`).
  - **Partly Closure-compatible** (not using `goog.require()`, `goog.provide()`), still run through compilation & minification.
  - **Directly included** without compilation or minification.
- Input CSS files can be:
  - **GSS files** (supports mixins, functions, basic logic) compiled by Closure Stylesheets (GSS) compiler.
  - **Regular CSS** files compiled by Closure Stylesheets (GSS) compiler.
  - **Directly included** without compilation or class renaming.
- Supports debug (human readable) & release (fully minified) compilation modes.


Usage
-----
Sample usage for a project using a CSS module (for application and 3rd party CSS) and 2 JS modules (one for server-side Soy templates to render initial HTML page and the other for all client-side JS that will be downloaded by users):

    var closureProBuild = require('closure-pro-build');

    var projectOptions = {
      rootSrcDir: 'src/',
      cssModule: {
        name: 'style',
        description: 'All CSS styles for the project',
        closureInputFiles: ['main.gss', 'other.css'],
        dontCompileInputFiles: ['path/to/some/third_party.css']
      },
      jsModules: {
        page: {
          description: 'Soy template for shell HTML, loads main JS and CSS',
          closureRootNamespaces: ['sample.page']
        },
        main: {
          description: 'Main JS module, with all client-side JS',
          closureRootNamespaces: ['sample.main'],
          nonClosureNamespacedInputFiles: ['path/to/some/non-closure-lib.js'],
          dontCompileInputFiles: ['path/to/wont-minify-this.js']
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


### Input Files ###

All `InputFiles` parameters are handled as follows:
- Paths are interpreted relative to the `rootSrcDir` specified in the project options (defaults to current working directory, `.`).
- **Single File**: include full paths using forward slashes, <i>e.g.</i> `['path/to/my/file.js']`.
- **Glob Regex Pattern**: use [minimatch](http://github.com/isaacs/minimatch) style patterns with `*`, `**`, and other regex characters to match many files that fit the given pattern. Some common examples:
  - `['style/*.css']`: matches all .css files in the `style/` directory.
  - `['style/**/*.gss']`: matches all .gss files recursively under the `style/` directory.
  - `['**/*_layout.css']`: matches all files recursively that end in `_layout.css`.
- If a path contains backslashes (but no forward slashes or glob regex special characters), then the backslashes are converted to forward slashes and treated as single files.


### System Requirements ###

Java 7+ and Python 2 must be installed and part of the system path as `java` and `python` in order to run all Closure tools. These commands are also configurable via `buildOptions` (<i>e.g.</i> in case `python` would resolve to Python 3 on your system).


### Project Options ###

Each CSS or JS module specifies the input files that should be compiled (or not) and combined together to produce a single output CSS or JS file for that module. In the case of JS files using `goog.require()` and `goog.provide()`, these input files are specified by listing the _root namespace(s)_ that transitively `goog.require()` all the JS that should be included in that module.

#### Required ####

- **cssModule**: JS Object map with these properties:
  - **name**: (Optional) Name for CSS module (controls output file name). Defaults to `'style'`.
  - **description**: String that describes the module (for documentation).
  - **closureInputFiles**: (If any) List of GSS or CSS files that should be compiled & minified (including CSS class renaming) using the Closure Stylesheets compiler. Any CSS classes from these files should be accessed via `goog.getCssName('theClassName')` in JS or `{css theClassName}` in Soy.
  - **dontCompileInputFiles**: (If any) List of CSS files that should not be compiled by the GSS compiler (so no minification or CSS class renaming). CSS classes from these files should be accessed normally in JS or Soy (NOT using `goog.getCssName()` or `{css}`). This CSS will be included in the output before any closureInputFiles.
- **jsModules**: JS Object map from module name (determines output JS filename) to an object with these properties:
  - **description**: String that describes the module (for documentation).
  - **alwaysLoadedAfterModules**: (If any) List of JS module names that this module depends on (that will always be loaded before this one). Only immediate deps need to be specified; will automatically consider transitive dependencies.
  - **closureRootNamespaces**: (If any) List of the root Closure namespace(s) that transitively `goog.require()` all the Closure-namespaced JS that should be included in this module. This code can rely on all `nonClosureNamespacedInputFiles` and `dontCompileInputFiles` from this module (and parent modules) having been loaded first.
  - **nonClosureNamespacedInputFiles**: (If any) List of the JS files that do NOT use `goog.require()` or `goog.provide()` but that should still be compiled (including symbol renaming) by the Closure JS Compiler. These files must be specified in dependency order (such that a file only depends on files listed before it being loaded). These files will be loaded after any `dontCompileInputFiles`.
  - **dontCompileInputFiles**: (If any) List of JS files that should NOT be compiled or minified by the Closure JS compiler. These files must be specified in dependency order (such that a file only depends on files listed before it being loaded). These files will be loaded before any `nonClosureNamespacedInputFiles`.

#### Optional ####

- **rootSrcDir**: Path to root source directory, which all `InputFiles` paths will be interpreted as relative to. Defaults to current working directory (`.`). For example, `'src/'` is a very common root source directory for many projects.
- **closureRootDirs**: For fully Closure-compatible JS, list of root directories for Closure to recursively search under to resolve `goog.require()` dependencies. Directory paths are interpreted relative to `rootSrcDir`. Defaults to `['.']` (<i>i.e.</i> searches everywhere under `rootSrcDir`). Closure JS Library directories are automatically searched, so don't list them.
- **soyInputFiles**: List of input Soy files to compile to JS files using the Closure Templates compiler. Defaults to `['**/*.soy']`, which will automatically find any .soy files recursively under `rootSrcDir` and won't invoke the Closure Templates compiler at all if there are no matching .soy files. This option only needs to be set to choose particular input files or to include .soy files from outside directories. See the [Using Soy in JS Modules](#using-soy-in-js-modules) section below for more information.
- **jsExterns**: A list of externs files (relative to the current directory) to tell the Closure Compiler not to rename externally defined symbols (<i>e.g.</i> when loading jQuery via CDN script tag).
- **jsWarningsWhitelistFile**: A whitelist file (relative to the current directory) for JS compiler warnings where each line is of the form:
  - `path/to/file.js:{line-number}  {first-line-of-warning}`
  - For example: <pre>src/main.js:294  Suspicious code. This code lacks side-effects. Is there a bug?</pre>


### Build Options ###

#### Required ####

- **type**: The type of build, either `closureProBuild.RELEASE` (fully minified) or `closureProBuild.DEBUG` (human readable).

#### Optional ####

- **generatedCodeDir**: What directory should generated code be put under (relative to current working directory)? _default: gen/_
- **tempFileDir**: What directory should temporary build files be put under (relative to current working directory)? _default: tmp/_
- **outputDir**: What directory should output JS and CSS files be placed under (relative to current working directory)? _default: build/_
- **python2Command**: What command is used to invoke Python version 2? _default: python_
- **javaCommand**: What command is used to invoke Java? _default: java_
- **suppressOutput**: True to suppress any standard output/error stream output during compilation. _default: false_


### Using Soy in JS Modules ###

First, make sure all your Soy templates are being compiled:
- If all your .soy files are under `rootSrcDir` (or subdirectories), then this happens automatically.
- Otherwise, manually set `soyInputFiles` to match all of your .soy templates.

Let's assume the Soy template you want to use starts out like this:

    {namespace mysite.soy autoescape="contextual"}

Then all you need to do is add `goog.require('mysite.soy');` to the top of the JS file you want to invoke the Soy template from. (Of course, make sure that JS file is transitively `goog.require()`'d from your JS module's `closureRootNamespaces`).


General Notes
-------------
- In all compiled JS, you typically want to access properties as `foo.bar` (NOT `foo['bar']`), since these symbols will be obfuscated in the compiled output (so the quoted string lookup would fail).
- The only possible exception to this is when interacting with JS that is compiled separately (or listed in `dontCompileInputFiles`) from your compiled JS, where you should do one of two things:
  1. Always use quoted strings to access these properties (<i>e.g.</i> `window['foo']['bar']`).
  2. Use an [externs file](http://developers.google.com/closure/compiler/docs/api-tutorial3#externs) via `jsExterns` project option to tell the Closure JS Compiler that certain symbols will be provided externally (so they shouldn't ever be renamed). In that case `foo.bar` access is fine, since the compiler will know not to rename those symbols.

See also the externs files provided for convenience (such as for jQuery) in `closureProBuild.EXTERNS`, defined in [closure-pro-build.js](http://github.com/Lindurion/closure-pro-build/blob/master/lib/closure-pro-build.js). If more externs files would be generally useful, feel free to contribute them.


Planned Features
----------------
Future support is planned for:
- Message translation tools & separate output files for each supported locale.
- RTL flipping of CSS styles (<i>e.g.</i> `"left: 20px"` becomes `"right: 20px"`) for RTL locales.


License & Copyright
-------------------
This package is released under the Apache License, Version 2.0. See LICENSE file for details.

License information for 3rd party tools used can be found under the `3p/` folder. License information for other npm packages used can be found in the information and/or source code for those packages listed on the [npm website](http://npmjs.org/).

Copyright &copy; 2013 Eric W. Barndollar.
