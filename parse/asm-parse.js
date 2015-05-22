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
  var treeBuilder = require("./json-treebuilder.js");

  var Tokenizer       = tokenizer.Tokenizer;
  var JsonTreeBuilder = treeBuilder.JSON;


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
      console.log("(rewound)");
    } else {
      result = this.tokenizer.read();
      console.log(result);
    }

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

      console.log("Statement", stmt);
      this.builder.appendToBlock(block, stmt);
    }
  };

  Parser.prototype.parseIfStatement = function () {
    this.expectToken("separator", "(");

    var cond = this.parseExpression("subexpression");

    var trueStatement = this.parseStatement();

    // FIXME: else blocks

    return this.builder.makeIfStatement(cond, trueStatement, null);    
  };

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

  // Parses complex keywords.
  // Returns false if the keyword was not handled by the parser.
  Parser.prototype.parseKeyword = function (keyword) {
    switch (keyword) {
      case "function":
        return this.parseFunctionExpression();

      case "if":
        return this.parseIfStatement();

      default:
        return false;
    }
  };

  // Parses a single expression. Handles nesting.
  Parser.prototype.parseExpression = function (context) {
    var terminator, stopAtComma, stopAtAny = false;

    switch (context) {
      // Free-standing expression (no surrounding parentheses).
      case "statement":
        terminator = ";"
        stopAtComma = false;
        break;

      // Unparenthesized expression. Used for weird constructs like typeof. Gross.
      case "expression":
        terminator = null;        
        stopAtComma = stopAtAny = true;
        break;

      // Parenthesized expression.
      case "subexpression":
        terminator = ")"
        stopAtComma = false;
        break;

      // Array subscript index.
      case "subscript":
        terminator = "]"
        stopAtComma = false;
        break;

      // Single argument within argument list.
      case "argument-list":
        terminator = ")";
        stopAtComma = true;
        break;

      // Single value within array literal.
      case "array-literal":
        terminator = "]";
        stopAtComma = true;
        break;

      // Single key/value pair within object literal.
      case "object-literal":
        terminator = "}";
        stopAtComma = true;
        break;

      default:
        this.abort("Unsupported expression context '" + context + "'");
    }

    var token = null;
    // HACK: Any non-nested expression elements are splatted onto the end of chain
    //  before being resolved in one final pass at the end. This enables us to
    //  properly handle operator precedence without having to go spelunking inside
    //  nodes constructed by the Builder.
    var chain = [];
    // Stores the most recently constructed expression. Some tokens wrap this or modify it
    var lhs = null;

    iter:
    while (token = this.readToken()) {
      switch (token.type) {
        case "separator":

          // We handle expected terminators here, so if they get encountered below,
          //  they're probably a syntax error.
          if (terminator === token.value)
            break iter;

          switch (token.value) {
            case "(":
              // Subexpression or function invocation
              // These are high-precedence and complicated so we just handle them now

              if (lhs) {
                // Function invocation

                var argumentValues = [], argumentValue = null;
                while (argumentValue = this.parseExpression("argument-list")) {
                  argumentValues.push(argumentValue);
                }

                console.log("arguments", argumentValues);

                lhs = this.builder.makeInvocationExpression(
                  lhs, argumentValues
                );
              } else {
                // Subexpression

                lhs = this.parseExpression("subexpression");
              }

              break;

            case ")":
              if (stopAtAny)
                break iter;

              return this.abort("Unexpected ) within expression");

            case "{":
              if (lhs) {
                return this.abort("Unexpected { juxtaposed with expression");
              } else {
                lhs = this.parseObjectLiteral();
              }

              break;

            case "[":
              // Subscript expression or array literal

              if (lhs) {
                // Subscripting
                // High-precedence so we can do it here
                var index = this.parseExpression("subscript");
                lhs = this.builder.makeSubscriptExpression(lhs, index);
              } else {
                // Array literal
                lhs = this.parseArrayLiteral();
              }

              break;

            case ";":
              if (stopAtAny)
                break iter;

              return this.abort("Unexpected ; within expression");

            case ":":
              return this.abort("Colon token NYI");

            case "]":
            case "}":
              if (stopAtAny)
                break iter;

            default:
              return this.abort("Unexpected ", token);
          }

          break;

        case "operator":
          if (token.value === ",") {
            if (stopAtComma || stopAtAny) {
              // The comma operator has minimum precedence so in scenarios where
              //  we want to abort at one, it's fine.
              break iter;
            } if (lhs) {
              // We could do this manually here, but it's easier to just fold the
              //  comma expression logic in with the rest of the precedence &
              //  associativity logic.
              chain.push(lhs);
              lhs = null;
              chain.push(",");
            } else {
              return this.abort("Expected expression before ,");
            }
          } else {
            // Operators push expressions and themselves onto the chain
            //  so that at the end of things we can order them by precedence
            //  and apply associativity.

            if (lhs) {
              chain.push(lhs);
              lhs = null;
            }

            chain.push(token.value);
          }

          break;

        case "identifier":
          lhs = this.builder.makeIdentifierExpression(token.value);
          break;

        case "keyword":
          // Attempt to parse complex keywords
          var kw = this.parseKeyword(token.value);
          if (kw === false) {
            return this.abort("Unhandled keyword '" + token.value + "' in expression");
          } else {
            lhs = kw;
          }

          break;

        case "integer":
        case "double":
        case "string":
          lhs = this.builder.makeLiteralExpression(token.type, token.value);
          break;
      }
    }

    // Now we finalize the chain, and apply precedence sorting
    if (lhs) {
      chain.push(lhs);
      lhs = null;
    }

    // At this point the chain will be a stream of operators and expressions.
    // Operators are raw string literals, expressions are objects (from the builder).
    // We don't need to know anything about the expressions, just know that they 
    //  aren't operators (i.e. not strings) so we can wrap them in other expression
    //  types.

    if (!chain.length)
      return this.abort("No expression parsed");

    // The common case is going to be a chain containing exactly one expression.
    // No work to be done there!
    if (chain.length === 1)
      return chain[0];

    console.log("chain", chain);

    return this.abort("NYI");
  };

  // parses a single statement, returns false if it hit a block-closing token.
  // handles nested blocks.
  Parser.prototype.parseStatement = function (block) {
    var token = null, stmt = null, expr = null;

    iter:
    while (token = this.readToken()) {
      switch (token.type) {
        case "separator":
          switch (token.value) {
            case "{":
              // Read nested block scope. Meaningless, but important to parse
              //  correctly.
              // FIXME: How do we distinguish between a free-standing object literal,
              //  and a block scope?
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
              expr = this.parseExpression("subexpression");
              break iter;

            default:
              // Fall-through
          }

        default:
          this.rewind(token);
          expr = this.parseExpression("statement");
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