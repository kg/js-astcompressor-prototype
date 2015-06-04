'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['exports'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports);
  } else {
    factory((root.asmlikeJsonTreeBuilder = {}));
  }
}(this, function (exports) {
  var jsonTreeBuilder = require("./json-treebuilder.js");
  var JsonTreeBuilder = jsonTreeBuilder.Builder;

  var baseClass = JsonTreeBuilder.prototype;

  function AsmlikeJsonTreeBuilder () {
    JsonTreeBuilder.call(this);
  };

  AsmlikeJsonTreeBuilder.prototype = Object.create(JsonTreeBuilder.prototype);

  AsmlikeJsonTreeBuilder.prototype.makeUnaryOperatorExpression = function (operator, rhs) {
    if (operator === "+") {
      var result = this.make("ToDouble");
      result.expression = rhs;
      return this.finalize(result);
    } else {
      return baseClass.makeUnaryOperatorExpression.call(this, operator, rhs);
    }
  };

  AsmlikeJsonTreeBuilder.prototype.makeTruncation = function (isSigned, expression) {
    var result = this.make(
      isSigned
        ? "SignedTruncation"
        : "UnsignedTruncation"
    );
    result.expression = expression;
    return this.finalize(result);
  };

  AsmlikeJsonTreeBuilder.prototype.makeBinaryOperatorExpression = function (operator, lhs, rhs) {
    if (
      (
        (operator === ">>>") ||
        (operator === "|")
      ) &&
      (rhs.type === "IntegerLiteral") &&
      (rhs.value === 0)
    ) {
      var isSigned = (operator === "|");
      return this.makeTruncation(isSigned, lhs);
    } else {
      return baseClass.makeBinaryOperatorExpression.call(this, operator, lhs, rhs);
    }
  };

  AsmlikeJsonTreeBuilder.prototype.makeExpressionStatement = function (expression) {
    if (
      (expression.type === "StringLiteral") &&
      (expression.value === "use asm")
    ) {
      var result = this.make("UseAsmStatement");
      return this.finalize(result);
    } else {
      return baseClass.makeExpressionStatement.call(this, expression);
    }
  };  

  AsmlikeJsonTreeBuilder.prototype.finalize = function (obj) {
    return obj;
  };


  exports.Builder = AsmlikeJsonTreeBuilder;
}));