'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['exports'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports);
  } else {
    factory((root.treeBuilder = {}));
  }
}(this, function (exports) {
  var jsonTreeBuilder = require("./json-treebuilder.js");
  var asmlikeJsonTreeBuilder = require("./asmlike-json-treebuilder.js");

  exports.JSON = jsonTreeBuilder.Builder;
  exports.AsmlikeJSON = asmlikeJsonTreeBuilder.Builder;
}));