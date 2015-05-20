// Partially based on cashew asm.js parser (see Upstream/cashew/LICENSE)

'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['exports'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports);
  } else {
    factory((root.asmParse = {}));
  }
}(this, function (exports) {
  var tokenizer = require("./asm-tokenizer.js");

  var Tokenizer = tokenizer.Tokenizer;

  function JsonTreeBuilder () {
    this.result = null;
    this.protos = Object.create(null);
  };

  JsonTreeBuilder.prototype.make = function (type) {
    var proto = this.protos[type];
    if (!proto) {
      this.protos[type] = proto = Object.create(null);
      proto.type = type;
    }

    return Object.create(proto);
  };

  JsonTreeBuilder.prototype.makeTopLevel = function () {
    return this.make("TopLevel");
  };

  JsonTreeBuilder.prototype.makeStatement = function (expression) {
    var result = this.make("Statement");
    result.expression = expression;
    return result;
  };

  JsonTreeBuilder.prototype.makeBlock = function () {
    var result = this.make("Block");
    result.statements = [];
    return result;
  };

  JsonTreeBuilder.prototype.appendToBlock = function (block, statement) {
    block.statements.push(statement);
  };


  // parses an input character stream into a tree of asm.js AST nodes
  // input is a ByteReader (see encoding.js)
  // treebuilder is an object that implements the abstract TreeBuilder interface
  function parse (input, treeBuilder) {
    var tokenizer = new Tokenizer(input);
  };


  exports.JsonTreeBuilder = JsonTreeBuilder;
  exports.Tokenizer       = Tokenizer;

  exports.parse = parse;
}));