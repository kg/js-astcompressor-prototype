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

  JsonTreeBuilder.prototype.makeTopLevelBlock = function () {
    return this._makeBlock("TopLevel");
  };

  JsonTreeBuilder.prototype.makeBlock = function () {
    return this._makeBlock("Block");
  };

  JsonTreeBuilder.prototype.makeExpressionStatement = function (expression) {
    var result = this.make("Statement");
    result.expression = expression;
    return result;
  };

  JsonTreeBuilder.prototype.makeBlockStatement = function (block) {
    var result = this.make("BlockStatement");
    result.block = block;
    return result;
  };

  JsonTreeBuilder.prototype.makeLiteral = function (type, value) {
    var result = this.make("Literal");
    result.valueType = type;
    result.value = value;
    return result;
  };

  JsonTreeBuilder.prototype._makeBlock = function (typeTag) {
    var result = this.make(typeTag);
    result.statements = [];
    return result;
  };

  JsonTreeBuilder.prototype.appendToBlock = function (block, statement) {
    block.statements.push(statement);
  };


  function Parser (tokenizer, treeBuilder) {
    this.tokenizer = tokenizer;
    this.builder = treeBuilder;
  };

  Parser.prototype.readToken = function () {
    var result = this.tokenizer.read();
    console.log(result);
    return result;
  };

  Parser.prototype.abort = function () {
    console.log.apply(console, arguments);
    throw new Error(arguments[0] || "Aborted");
  };

  Parser.prototype.parseTopLevel = function () {
    var result = this.builder.makeTopLevelBlock();

    this.parseBlockInterior(result);

    return result;
  };

  // parses the interior of a multi-statement block (i.e. the { has been consumed)
  // aborts at eof or uneven } (end of multi-statement block)
  Parser.prototype.parseBlockInterior = function (block) {
    while (true) {
      var stmt = this.parseStatement(block);

      if (stmt === false)
        break;

      this.builder.appendToBlock(block, stmt);
    }
  };

  // parses a single statement, returns false if it hit a block-closing token.
  // handles nested blocks.
  Parser.prototype.parseStatement = function (block) {
    var token = null, stmt = null, expr = null;

    iter:
    while (token = this.readToken()) {
      switch (token.type) {

        case "separator":
          // Read nested block scope. Meaningless, but important to parse
          //  correctly.
          if (
            (token.value === "{")
          ) {
            var childBlock = this.builder.makeBlock();
            stmt = this.builder.makeBlockStatement(childBlock);

            this.parseBlockInterior(childBlock);

            return stmt;
          } else if (token.value === "}") {
            return false;
          } else if (token.value === ";") {
            // HACK: Just skip stray semicolons. We don't care about
            //  no-op statements, and this lets us avoid conditionally
            //  eating a trailing ;.
            continue iter;
          } else {
            this.abort("Unexpected token", token);
          }

        case "string":
        case "integer":
        case "double":
          // Free-standing literal.
          expr = this.builder.makeLiteral(token.type, token.value);
          stmt = this.builder.makeExpressionStatement(expr);

          return stmt;

        default:
          this.abort("Unexpected token", token);
      }
    }

    this.abort("No tokens read");
  };


  // parses an input character stream into a tree of asm.js AST nodes
  // input is a ByteReader (see encoding.js)
  // treebuilder is an object that implements the abstract TreeBuilder interface
  function parse (input, treeBuilder) {
    var tokenizer = new Tokenizer(input);
    var parser    = new Parser(tokenizer, treeBuilder);

    return parser.parseTopLevel();
  };


  exports.JsonTreeBuilder = JsonTreeBuilder;
  exports.Tokenizer       = Tokenizer;
  exports.Parser          = Parser;


  exports.parse = parse;
}));