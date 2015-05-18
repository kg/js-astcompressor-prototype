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


  function isWhitespace (ch) {
    return (ch === 32) || 
      (ch === 9) ||
      (ch === 10) ||
      (ch === 13);
  };

  var _0 = "0".charCodeAt(0);
  var _9 = "9".charCodeAt(0);

  function isDigit (ch) {
    return (ch >= _0) && (ch <= _9);
  };

  function is32Bit (x) {
    return (x === (x | 0)) || (x === (x >>> 0));
  };

  var _forwardSlash = "/".charCodeAt(0);
  var _asterisk     = "*".charCodeAt(0);

  // Devour whitespace & comments from the reader
  function skipDeadSpace (reader) {
    while (!reader.eof) {
      var ch = reader.peek(0);

      if (isWhitespace(ch)) {
        reader.read();
        continue;
      } else if (ch === _forwardSlash) {
        var ch2 = reader.peek(1);

        if (ch2 === _forwardSlash) {
          // Greedily parse single-line comment
          reader.skip(2);

          while (
            !reader.eof && 
            (ch !== 10) && 
            (ch !== 13)
          ) {
            ch = reader.read();
          };

          continue;
        } else if (ch2 === _asterisk) {
          reader.skip(2);

          while (
            !reader.eof && 
            (ch  !== _asterisk) && 
            (ch2 !== _forwardSlash)
          ) {
            ch = reader.read();
            ch2 = reader.peek(1);
          };

          reader.read();
          continue;
        }
      } 

      break;
    }
  };


  // parses an input character stream into a stream of tokens
  // input is a ByteReader (see encoding.js)
  function Tokenizer (input) {
    this.reader = input;
  };

  Tokenizer.prototype.read = function () {
  };


  // parses an input character stream into a tree of asm.js AST nodes
  // input is a ByteReader (see encoding.js)
  // treebuilder is an object that implements the abstract TreeBuilder interface
  function parse (input, treeBuilder) {
    var tokenizer = new Tokenizer(input);
  };


  exports.JsonTreeBuilder = JsonTreeBuilder;
  exports.Tokenizer = Tokenizer;
  exports.parse = parse;
}));