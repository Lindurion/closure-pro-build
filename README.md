closure-pro-build
=================

**Closure Project Builder**: An npm, node.js package that makes it super easy to build projects using some or all of Closure's [JavaScript Compiler](http://developers.google.com/closure/compiler/), [Templates (Soy)](http://developers.google.com/closure/templates/), [Stylesheets (GSS)](http://code.google.com/p/closure-stylesheets/), and [JS Library](http://developers.google.com/closure/library/).

Features
--------
- Can have multiple JS/Soy, CSS modules (multiple output JS or CSS files that can be served when needed).
- Automatically calculates Closure dependencies & moves input files common to multiple modules into lower modules as needed.
- Input JS files can be:
  - Fully Closure compatible (using goog.require(), goog.provide()).
  - Partly Closure compatible (not using goog.require(), goog.provide()), still run through compilation & minification.
  - Directly included without compilation or minification.
- Input CSS files can be:
  - GSS files (supports mixins, functions, basic logic) compiled by Closure Stylesheets (GSS) compiler.
  - Regular CSS files compiled by Closure Stylesheets (GSS) compiler.
  - Directly included without compilation or class renaming.
- Supports Debug & Release compilation modes.

Usage
-----
TODO

License & Copyright
-------------------
This package is released under the Apache License, Version 2.0. See LICENSE file for details.

License information for 3rd party tools used can be found under the 3p/ folder. License information for other npm packages used can be found in the information and/or source code for those packages listed on the [npm website](http://npmjs.org/).

Copyright &copy; 2013 Eric W. Barndollar.
