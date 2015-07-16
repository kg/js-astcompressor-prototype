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

    this.scopeChain = [
      Object.create(null)
    ];

    this.scopeChain[0].$$count = 0;
  };

  AsmlikeJsonTreeBuilder.prototype = Object.create(JsonTreeBuilder.prototype);

  AsmlikeJsonTreeBuilder.prototype.pushScope = function () {
    var previousScope = this.scopeChain[this.scopeChain.length - 1];
    var newScope = Object.create(previousScope);

    var count = previousScope.$$count;
    Object.defineProperty(newScope, "$$count", {
      value: count,
      configurable: true,
      enumerable: false,
      writable: true
    });

    this.scopeChain.push(newScope);

    baseClass.pushScope.call(this);
  };

  AsmlikeJsonTreeBuilder.prototype.popScope = function () {
    this.scopeChain.pop();

    if (this.scopeChain.length < 1)
      throw new Error("Mismatched scope push/pop");

    baseClass.popScope.call(this);
  };

  AsmlikeJsonTreeBuilder.prototype.internName = function (name) {
    if (name === null)
      return null;

    var currentScope = this.scopeChain[this.scopeChain.length - 1];
    var index = currentScope[name];

    if (typeof (index) !== "number") {
      index = currentScope[name] = (currentScope.$$count++) | 0;
    }

    // HACK: The shape table lists string for these...
    return "#" + index;
  };

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

  AsmlikeJsonTreeBuilder.prototype.makeLabelStatement = function (labels, labelled) {
    labels = Array.prototype.slice.call(labels);

    for (var i = 0; i < labels.length; i++)
      labels[i] = this.internName(labels[i]);

    return baseClass.makeLabelStatement.call(this, labels, labelled);
  };

  AsmlikeJsonTreeBuilder.prototype.makeDeclaration = function (name, initialValue) {
    name = this.internName(name);

    return baseClass.makeDeclaration.call(this, name, initialValue);
  };

  AsmlikeJsonTreeBuilder.prototype.makeForInDeclaration = function (variableName, sequenceExpression) {
    variableName = this.internName(variableName);

    return baseClass.makeForInDeclaration.call(this, variableName, sequenceExpression);
  };

  AsmlikeJsonTreeBuilder.prototype.makeBreakStatement = function (label) {
    label = this.internName(label);

    return baseClass.makeBreakStatement.call(this, label);
  };

  AsmlikeJsonTreeBuilder.prototype.makeContinueStatement = function (label) {
    label = this.internName(label);

    return baseClass.makeContinueStatement.call(this, label);
  };

  AsmlikeJsonTreeBuilder.prototype.makeFunctionExpression = function (name, argumentNames, body) {
    name = this.internName(name);
    argumentNames = Array.prototype.slice.call(argumentNames);

    for (var i = 0; i < argumentNames.length; i++)
      argumentNames[i] = this.internName(argumentNames[i]);

    return baseClass.makeFunctionExpression.call(this, name, argumentNames, body);
  };

  AsmlikeJsonTreeBuilder.prototype.makePair = function (key, value) {
    if (typeof (key) === "string")
      key = this.internName(key);

    return baseClass.makePair.call(this, key, value);
  };

  AsmlikeJsonTreeBuilder.prototype.makeIdentifierExpression = function (identifier) {
    identifier = this.internName(identifier);

    return baseClass.makeIdentifierExpression.call(this, identifier);
  };

  AsmlikeJsonTreeBuilder.prototype.makeMemberAccessExpression = function (lhs, memberName) {
    memberName = this.internName(memberName);

    return baseClass.makeMemberAccessExpression.call(this, lhs, memberName);
  };

  AsmlikeJsonTreeBuilder.prototype.finalize = function (obj) {
    return obj;
  };


  exports.Builder = AsmlikeJsonTreeBuilder;
}));