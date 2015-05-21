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

  JsonTreeBuilder.prototype.makeFunctionStatement = function (functionExpression) {
    var result = this.make("FunctionStatement");
    result.functionExpression = functionExpression;
    return result;
  };

  JsonTreeBuilder.prototype.makeFunctionExpression = function (name, argumentNames, body) {
    var result = this.make("Function");
    result.name = name;
    result.argumentNames = argumentNames;
    result.body = body;
    return result;
  };

  JsonTreeBuilder.prototype.makeLiteralExpression = function (type, value) {
    var result = this.make("Literal");
    result.valueType = type;
    result.value = value;
    return result;
  };

  JsonTreeBuilder.prototype.makeIdentifierExpression = function (identifier) {
    var result = this.make("Identifier");
    result.identifier = identifier;
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
    this._rewound = null;
  };

  Parser.prototype.readToken = function () {
    var result;

    if (this._rewound) {
      result = this._rewound;
      this._rewound = null;
    } else {
      result = this.tokenizer.read();
    }

    console.log(result);
    return result;
  };

  Parser.prototype.rewind = function (token) {
    if (this._rewound)
      throw new Error("Already rewound");
    else
      this._rewound = token;
  };

  Parser.prototype.expectToken = function (type, value) {
    var token = this.readToken();
    if (token.type === type) {
      if ((arguments.length === 2) && (token.value !== value)) {
        return this.abort("Expected a '" + type + "' with value '" + value + "', got '" + token.value + "'");
      } else {
        return token.value;
      }
    }

    return this.abort("Expected a token of type '" + type + "', got '" + token.type + "'.");
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

  // Parses an identifier into an expression or statement. Most identifiers are a single token,
  //  but we special-case ones like 'function' by parsing the stuff that follows.
  Parser.prototype.parseIdentifier = function (initialToken) {
    if (initialToken.type !== "identifier")
      return this.abort("Expected an identifier");

    switch (initialToken.value) {
      case "function":
        return this.parseFunctionExpression();

      case "if":
        return this.parseIfStatement();

      default:
        return this.builder.makeIdentifierExpression(initialToken.value);
    }
  }

  Parser.prototype.parseFunctionExpression = function () {
    var name = null;

    var token = this.readToken();
    if (token.type === "identifier") {
      name = token.value;

      this.expectToken("separator", "(");
    } else if (
      (token.type !== "separator") ||
      (token.value !== "(")
    ) {
      return this.abort("Expected a function name or an argument name list");
    }

    var argumentNames = [];

    token = this.readToken();

    while (
      (token = this.readToken()) && 
      (
        (token.type === "identifier") ||
        (
          (token.type === "operator") &&
          (token.value === ",")
        )
      )
    ) {

      if (token.type === "identifier")
        argumentNames.push(token.value);
      else;
        // Ignore comma
    }

    if (
      (token.type !== "separator") ||
      (token.value !== ")")
    ) {
      return this.abort("Expected an argument name list terminator or another argument name");
    }

    this.expectToken("separator", "{");

    var body = this.builder.makeBlock();
    this.parseBlockInterior();

    return this.builder.makeFunctionExpression(
      name, argumentNames, body
    );
  };

  // Parses a single expression. If it encounters a ( it handles nesting.
  Parser.prototype.parseExpression = function (isNested) {
    var token = null, lhs = null;

    iter:
    while (token = this.readToken()) {
      switch (token.type) {
        case "separator":

          switch (token.value) {
            case "(":
              // Subexpression or function invocation

              if (lhs) {
                // Function invocation
                lhs = this.builder.makeInvocationExpression(
                  lhs, this.parseArgumentList()
                );
              } else {
                // Subexpression
                lhs = this.parseExpression(true);
              }

              break;

            case ")":
              // Subexpression terminator
              if (isNested)
                break iter;
              else
                return this.abort("Unexpected ) within free-standing expression");

            case "{":
              // Object literal
              return this.abort("object literal");

            case "[":
              // Array literal
              return this.abort("array literal");

            case ";":
              // End of enclosing statement.
              if (isNested)
                return this.abort("Unexpected ; within parenthesized expression");
              else
                break iter;

            default:
              return this.abort("Unexpected ", token);
          }

          break;

        case "identifier":
          lhs = this.parseIdentifier(token);
          break;

        case "integer":
        case "double":
        case "string":
          lhs = this.builder.makeLiteralExpression(token.type, token.value);
          break;
      }
    }

    if (!lhs)
      return this.abort("No expression parsed");

    return lhs;
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

          switch (token.value) {
            case "{":
              var childBlock = this.builder.makeBlock();
              stmt = this.builder.makeBlockStatement(childBlock);

              this.parseBlockInterior(childBlock);

              return stmt;

            case "}":
              return false;

            case ";":
              // HACK: Just skip stray semicolons. We don't care about
              //  no-op statements, and this lets us avoid conditionally
              //  eating a trailing ;.
              continue iter;

            case "(":              
              expr = this.parseExpression(true);
              break iter;

            default:
              // Fall-through
          }

        default:
          this.rewind(token);
          expr = this.parseExpression(false);
          break iter;

      }
    }

    if (expr) {
      if (expr.type.indexOf("Statement"))
        // HACK: If parsing produced a statement instead of an expression,
        //  just use it
        return expr;
      else if (expr.type === "Function")
        // HACK: If parsing produced a free-standing function expression,
        //  convert it to a function statement
        return this.builder.makeFunctionStatement(expr);
      else
        return this.builder.makeExpressionStatement(expr);
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