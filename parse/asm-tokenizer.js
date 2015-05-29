// Partially based on cashew asm.js parser (see Upstream/cashew/LICENSE)

'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['exports'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports);
  } else {
    factory((root.asmTokenizer = {}));
  }
}(this, function (exports) {
  var Keywords = "break do in typeof " +
    "case else instanceof var " +
    "catch export new void " +
    "class extends return while " +
    "const finally super with " +
    "continue for switch yield " +
    "debugger function " /* this " */ +
    "default if throw " +
    "delete import try " +
    "enum await " +
    "implements package protected " +
    "interface private public " +
    "true false";

  var KeywordLookup = Object.create(null);
  Keywords.split(" ").forEach(function (kw) { KeywordLookup[kw] = true; });

  var KeywordOperators = {
    "delete": true,
    "void": true,
    "typeof": true,
    "new": true,
    "in": true,
    "instanceof": true
  };

  var _0 = "0".charCodeAt(0), _9 = "9".charCodeAt(0);
  var _a = "a".charCodeAt(0), _z = "z".charCodeAt(0);
  var _A = "A".charCodeAt(0), _Z = "Z".charCodeAt(0);
  var __ = "_".charCodeAt(0), _$ = "$".charCodeAt(0);

  var ForwardSlash = "/".charCodeAt(0);
  var BackSlash    = "\\".charCodeAt(0);
  var Asterisk     = "*".charCodeAt(0);
  var DoubleQuote  = "\"".charCodeAt(0);
  var SingleQuote  = "\'".charCodeAt(0);
  var Period       = ".".charCodeAt(0);
  var LessThan     = "<".charCodeAt(0);
  var GreaterThan  = ">".charCodeAt(0);
  var Equal        = "=".charCodeAt(0);
  var Minus        = "-".charCodeAt(0);
  var Plus         = "+".charCodeAt(0);
  var Exclamation  = "!".charCodeAt(0);
  var Ampersand    = "&".charCodeAt(0);
  var Pipe         = "|".charCodeAt(0);

  var Tab = 9, CR = 10, LF = 13, Space = 32;

  var DigitChars = Array.prototype.slice.call("0123456789abcdefxABCDEFX.")
    .map(function (ch) { return ch.charCodeAt(0); });

  var OperatorInitialChars = Array.prototype.slice.call("!%&*+,-./:<=>?^|~")
    .map(function (ch) { return ch.charCodeAt(0); });

  var MutationAssignmentChars = Array.prototype.slice.call("!%&*+-/^|~")
    .map(function (ch) { return ch.charCodeAt(0); });

  var Separators = Array.prototype.slice.call("([];{})")
    .map(function (ch) { return ch.charCodeAt(0); });

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
    return isIdentifierPrefix(ch) ||
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
            (
              (ch  !== Asterisk) ||
              (ch2 !== ForwardSlash)
            )
          ) {
            ch = reader.read();
            ch2 = reader.peek(0);
          };

          reader.read();
          continue;
        }
      } 

      break;
    }
  };


  function Token (type, value) {
    if (arguments.length !== 2)
      throw new Error("Expected (type, value)");
    else if (!type)
      throw new Error("Expected type");

    this.type = type;
    this.value = value;
  };


  // parses an input character stream into a stream of tokens
  // input is a ByteReader (see encoding.js)
  function Tokenizer (input) {
    this.reader = input;
    this._previous = null;
  };

  Tokenizer.prototype.getPosition = function () {
    return this.reader.getPosition();
  }

  Tokenizer.prototype.makeResult = function (type, value) {
    var result = new Token(type, value);
    // HACK
    this._previous = result;
    return result;
  };

  Tokenizer.prototype.assert = function (cond) {
    if (!cond)
      throw new Error("Assertion failed");
  };

  Tokenizer.prototype.getPrevious = function () {
    return this._previous;
  }

  // Reads a single token from the stream.
  // Return value is reused between calls, so deep-copy it if you wish to retain it
  Tokenizer.prototype.read = function () {
    skipDeadSpace(this.reader);

    if (this.reader.eof)
      return false;

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
    } else if (
      OperatorInitialChars.indexOf(ch) >= 0
    ) {
      return this.readOperator(ch, ch2);
    } else if (
      Separators.indexOf(ch) >= 0
    ) {
      return this.readSeparator(ch);
    } else {
      var ch$2 = this.reader.peek(-2), 
        ch$1 = this.reader.peek(-1), 
        ch3 = this.reader.peek(2); 

      console.log(
        "Initial character not implemented: '" + String.fromCharCode(ch) + 
        "' (" + ch + ") at offset " + 
        this.reader.getPosition() + ", surrounding: '" +
        String.fromCharCode(ch$2, ch$1, ch, ch2, ch3) + "'"
      );
      return false;
    }

    return false;
  };

  Tokenizer.prototype.readOperator = function (ch, ch2) {
    var length = 1;
    var ch3 = this.reader.peek(2), ch4 = this.reader.peek(3);

    switch (ch) {
      case LessThan:
        if (ch2 === LessThan) {
          if (ch3 === Equal) {
            length = 3;
          } else {
            length = 2;
          }

        } else if (ch2 === Equal) {
          length = 2;
        } else {
          length = 1;
        }

        break;

      case GreaterThan:
        if (ch2 === GreaterThan) {
          if (ch3 === Equal) {
            length = 3;

          } else if (ch3 === GreaterThan) {
            if (ch4 === Equal) {
              length = 4;
            } else {
              length = 3;
            }

          } else {
            length = 2;
          }

        } else if (ch2 === Equal) {
          length = 2;
        } else {
          length = 1;
        }

        break;

      case Equal:
        length = (
            (ch2 === Equal) &&
            (ch3 === Equal)
          ) ? 3 : (ch2 === Equal) ? 2 : 1;

        break;

      case Minus:
        length = (
          (ch2 === Minus) ||
          (ch2 === Equal)
        ) ? 2 : 1;

        break;

      case Plus:
        length = (
          (ch2 === Plus) ||
          (ch2 === Equal)
        ) ? 2 : 1;

        break;

      case Ampersand:
        length = (
          (ch2 === Ampersand) ||
          (ch2 === Equal)
        ) ? 2 : 1;

        break;

      case Pipe:
        length = (
          (ch2 === Pipe) ||
          (ch2 === Equal)
        ) ? 2 : 1;

        break;

      case Exclamation:
        length = (
            (ch2 === Equal) &&
            (ch3 === Equal)
          ) ? 3 : (ch2 === Equal) ? 2 : 1;

        break;

      case ForwardSlash:
        // HACK: Heuristically figure out whether this is a regexp. UGH
        if (
          (this._previous.type === "operator") ||
          (
            (this._previous.type === "separator") &&
            (this._previous.value !== ")") &&
            (this._previous.value !== "]")
          )
        ) {
          return this.readRegExpLiteral();
        }

        // Fall through

      default:
        if (
          (MutationAssignmentChars.indexOf(ch) >= 0) &&
          (ch2 === Equal)
        )
          length = 2;

        break;
    }

    var text = String.fromCharCode(ch);

    for (var i = 1; i < length; i++)
      text += String.fromCharCode(this.reader.peek(i));

    this.reader.skip(length);

    return this.makeResult("operator", text);
  };

  Tokenizer.prototype.readIdentifier = function (ch) {
    var temp = String.fromCharCode(ch);
    this.reader.skip(1);

    while ((ch = this.reader.peek(0)) && isIdentifierBody(ch)) {
      temp += String.fromCharCode(ch);
      this.reader.skip(1);
    }

    var typeString = (KeywordOperators[temp] === true)
        ? "operator"
        : (KeywordLookup[temp] === true)
            ? "keyword"
            : "identifier";

    return this.makeResult(typeString, temp);
  };

  Tokenizer.prototype.readStringLiteral = function (quote) {
    var result = "";
    var ch;

    this.reader.skip(1);

    while (((ch = this.reader.read()) !== quote) && ch) {
      result += String.fromCharCode(ch);

      // HACK: Ensure \' and \" are read in their entirety
      // TODO: Actually parse out the escape sequences into regular chars?
      if (ch === BackSlash) {
        ch = this.reader.read();
        result += String.fromCharCode(ch);
      }
    }

    return this.makeResult("string", result);
  };

  Tokenizer.prototype.readNumberLiteral = function (ch, ch2) {
    // UGH
    var temp = "";
    var isDouble = false;
    for (var i = 0; i < 16; i++) {
      var ch = this.reader.peek(i);

      if (ch === false)
        break;
      else if (DigitChars.indexOf(ch) < 0)
        break;

      if (ch === Period)
        isDouble = true;

      temp += String.fromCharCode(ch);
    }

    var value;

    if (!isDouble) {
      value = parseInt(temp);
    } else {
      value = parseFloat(temp);
    }

    this.reader.skip(temp.length);

    if (is32Bit(value) && !isDouble)
      return this.makeResult("integer", value);
    else
      return this.makeResult("double", value);
  };

  Tokenizer.prototype.readRegExpLiteral = function () {
    var ch;

    // Skip opening /
    this.reader.skip(1);

    // Read body of the regexp pattern
    var body = "";
    while (((ch = this.reader.read()) !== ForwardSlash) && ch) {
      if (ch === BackSlash) {
        // Read escaped character
        // FIXME: \x00 and \u0000

        body += "\\";
        ch = this.reader.read();
      }

      body += String.fromCharCode(ch);
    }

    // Read regexp flags
    // FIXME: Is this right?
    var flags = "";
    while ((ch = this.reader.peek()) !== false) {
      if (
        ((ch >= _a) && (ch <= _z)) ||
        ((ch >= _A) && (ch <= _Z))
      ) {
        flags += String.fromCharCode(ch);
        this.reader.read();
      } else
        break;
    }

    try {
      var result = this.makeResult("regexp", new RegExp(body, flags));
    } catch (exc) {
      console.log("Expression body was " + JSON.stringify(body) + ", flags were " + JSON.stringify(flags));
      throw exc;
    }

    return result;
  };

  Tokenizer.prototype.readSeparator = function (ch) {
    this.reader.skip(1);

    return this.makeResult("separator", String.fromCharCode(ch));
  };


  exports.Tokenizer = Tokenizer;

  exports.skipDeadSpace = skipDeadSpace;
  exports.isIdentifierPrefix = isIdentifierPrefix;
  exports.isIdentifierBody = isIdentifierBody;
}));