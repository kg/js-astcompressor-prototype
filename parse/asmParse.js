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


  var _0 = "0".charCodeAt(0), _9 = "9".charCodeAt(0);
  var _a = "a".charCodeAt(0), _z = "z".charCodeAt(0);
  var _A = "A".charCodeAt(0), _Z = "Z".charCodeAt(0);
  var __ = "_".charCodeAt(0), _$ = "$".charCodeAt(0);

  var ForwardSlash = "/".charCodeAt(0);
  var Asterisk     = "*".charCodeAt(0);
  var DoubleQuote  = "\"".charCodeAt(0);
  var SingleQuote  = "\'".charCodeAt(0);
  var Period       = ".".charCodeAt(0);

  var Tab = 9, CR = 10, LF = 13, Space = 32;

  function isWhitespace (ch) {
    return (ch === Space) || 
      (ch === Tab) ||
      (ch === CR) ||
      (ch === LF);
  };

  function isDigit (ch) {
    return (ch >= _0) && (ch <= _9);
  };

  function is32Bit (x) {
    return (x === (x | 0)) || (x === (x >>> 0));
  };

  function isIdentifierPrefix (ch) {
    return ((ch >= _a) && (ch <= _z)) ||
      ((ch >= _A) && (ch <= _Z)) ||
      (ch === __) ||
      (ch === _$);
  };

  function isIdentifierBody (ch) {
    return isIdentifierBody(ch) ||
      ((ch >= _0) && (ch <= _9));
  }

  // Devour whitespace & comments from the reader
  function skipDeadSpace (reader) {
    while (!reader.eof) {
      var ch = reader.peek(0);

      if (isWhitespace(ch)) {
        reader.read();
        continue;
      } else if (ch === ForwardSlash) {
        var ch2 = reader.peek(1);

        if (ch2 === ForwardSlash) {
          // Greedily parse single-line comment
          reader.skip(2);

          while (
            !reader.eof && 
            (ch !== CR) && 
            (ch !== LF)
          ) {
            ch = reader.read();
          };

          continue;
        } else if (ch2 === Asterisk) {
          reader.skip(2);

          while (
            !reader.eof && 
            (ch  !== Asterisk) && 
            (ch2 !== ForwardSlash)
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

    this._temporaryResult = {
      type: "",
      value: null
    };
  };

  Tokenizer.prototype.assert = function (cond) {
    if (!cond)
      throw new Error("Assertion failed");
  };

  Tokenizer.prototype.read = function () {
    skipDeadSpace(this.reader);

    var ch  = this.reader.peek(0),
        ch2 = this.reader.peek(1);

    this.assert(!isWhitespace(ch));

    if (isIdentifierPrefix(ch)) {
      return this.readIdentifier(ch);
    } else if (
      (ch === SingleQuote) ||
      (ch === DoubleQuote)
    ) {
      return this.readStringLiteral(ch);
    } else if (
      isDigit(ch) || 
      ((ch === Period) && isDigit(ch2))
    ) {
      return this.readNumberLiteral(ch, ch2);
    } else {
      console.log("Initial character not implemented: " + String.fromCharCode(ch));
      return false;
    }

    return false;
  };

  Tokenizer.prototype.readIdentifier = function (ch) {
    this._temporaryResult.type = "identifier";
    this._temporaryResult.value = null;

    return this._temporaryResult;
  };

  Tokenizer.prototype.readStringLiteral = function (quote) {
    var result = "";
    var ch;

    this.reader.skip(1);

    while ((ch = this.reader.read()) !== quote) {
      result += String.fromCharCode(ch);
    }

    this._temporaryResult.type = "string";
    this._temporaryResult.value = result;

    return this._temporaryResult;
  };

  Tokenizer.prototype.readNumberLiteral = function (ch, ch2) {
    this._temporaryResult.type = "number";
    this._temporaryResult.value = null;
    
    return this._temporaryResult;
  };


  // parses an input character stream into a tree of asm.js AST nodes
  // input is a ByteReader (see encoding.js)
  // treebuilder is an object that implements the abstract TreeBuilder interface
  function parse (input, treeBuilder) {
    var tokenizer = new Tokenizer(input);
  };


  exports.JsonTreeBuilder = JsonTreeBuilder;
  exports.Tokenizer = Tokenizer;

  exports.skipDeadSpace = skipDeadSpace;
  exports.parse = parse;
}));