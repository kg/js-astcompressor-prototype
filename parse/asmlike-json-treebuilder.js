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
    this.internNames = false;
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

  // FIXME: Externally visible names should have their names stored in a table somewhere
  //  in order to accurately capture the cost of those names
  AsmlikeJsonTreeBuilder.prototype.internName = function (name, externallyVisible) {
    if (!this.internNames)
      return name;

    if (name === null)
      return 0xFFFFFFFF;

    var currentScope = this.scopeChain[this.scopeChain.length - 1];
    var index = currentScope[name];

    if (typeof (index) !== "number") {
      index = currentScope[name] = (currentScope.$$count++) | 0;
    }

    // HACK: The shape table lists string for these...
    return index;
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
      labels[i] = this.internName(labels[i], false);

    return baseClass.makeLabelStatement.call(this, labels, labelled);
  };

  AsmlikeJsonTreeBuilder.prototype.makeDeclaration = function (name, initialValue) {
    name = this.internName(name, false);

    return baseClass.makeDeclaration.call(this, name, initialValue);
  };

  AsmlikeJsonTreeBuilder.prototype.makeForInDeclaration = function (variableName, sequenceExpression) {
    variableName = this.internName(variableName, false);

    return baseClass.makeForInDeclaration.call(this, variableName, sequenceExpression);
  };

  AsmlikeJsonTreeBuilder.prototype.makeBreakStatement = function (label) {
    label = this.internName(label, false);

    return baseClass.makeBreakStatement.call(this, label);
  };

  AsmlikeJsonTreeBuilder.prototype.makeContinueStatement = function (label) {
    label = this.internName(label, false);

    return baseClass.makeContinueStatement.call(this, label);
  };

  AsmlikeJsonTreeBuilder.prototype.makeFunctionExpression = function (name, argumentNames, body) {
    // FIXME: The name should be interned in the outer scope
    name = this.internName(name, false);
    argumentNames = Array.prototype.slice.call(argumentNames);

    for (var i = 0; i < argumentNames.length; i++)
      argumentNames[i] = this.internName(argumentNames[i], false);

    return baseClass.makeFunctionExpression.call(this, name, argumentNames, body);
  };

  AsmlikeJsonTreeBuilder.prototype.makePair = function (key, value) {
    // FIXME: Identifier vs string literal
    /*
    if (typeof (key) === "string")
      key = this.internName(key, true);
    */

    return baseClass.makePair.call(this, key, value);
  };

  AsmlikeJsonTreeBuilder.prototype.makeIdentifierExpression = function (identifier) {
    identifier = this.internName(identifier, false);

    return baseClass.makeIdentifierExpression.call(this, identifier);
  };

  AsmlikeJsonTreeBuilder.prototype.makeMemberAccessExpression = function (lhs, memberName) {
    memberName = this.internName(memberName, true);

    return baseClass.makeMemberAccessExpression.call(this, lhs, memberName);
  };

  AsmlikeJsonTreeBuilder.prototype.finalize = function (obj) {
    return obj;
  };


  exports.Builder = AsmlikeJsonTreeBuilder;
}));