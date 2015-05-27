'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['exports'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports);
  } else {
    factory((root.treeBuilder = {}));
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

    var result = Object.create(proto);
    // HACK For debugging
    result.type = type;
    
    return result;
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

  JsonTreeBuilder.prototype.makeIfStatement = function (condition, trueStatement, falseStatement) {
    var result = this.make("IfStatement");
    result.condition = condition;
    result.trueStatement = trueStatement;
    result.falseStatement = falseStatement;
    return result;
  };

  JsonTreeBuilder.prototype.makeForStatement = function (initialize, update, condition, body) {
    var result = this.make("ForStatement");
    result.initialize = initialize;
    result.update = update;
    result.condition = condition;
    result.body = body;
    return result;
  };

  JsonTreeBuilder.prototype.makeForInStatement = function (declaration, body) {
    var result = this.make("ForInStatement");
    result.declaration = declaration;
    result.body = body;
    return result;
  };

  JsonTreeBuilder.prototype.makeFunctionStatement = function (functionExpression) {
    var result = this.make("FunctionStatement");
    result.functionExpression = functionExpression;
    return result;
  };

  JsonTreeBuilder.prototype.makeDeclarationStatement = function (declarations) {
    var result = this.make("DeclarationStatement");
    result.declarations = declarations;
    return result;
  };

  JsonTreeBuilder.prototype.makeForInDeclaration = function (variableName, sequenceExpression) {
    var result = this.make("ForInDeclaration");
    result.variableName = variableName;
    result.sequenceExpression = sequenceExpression;
    return result;
  };

  JsonTreeBuilder.prototype.makeReturnStatement = function (expression) {
    var result = this.make("ReturnStatement");
    result.expression = expression;
    return result;
  };

  JsonTreeBuilder.prototype.makeBreakStatement = function (label) {
    var result = this.make("BreakStatement");
    result.label = label;
    return result;
  };

  JsonTreeBuilder.prototype.makeContinueStatement = function (label) {
    var result = this.make("ContinueStatement");
    result.label = label;
    return result;
  };

  JsonTreeBuilder.prototype.makeThrowStatement = function (expression) {
    var result = this.make("ThrowStatement");
    result.expression = expression;
    return result;
  };

  JsonTreeBuilder.prototype.makeSwitchStatement = function (value, cases) {
    var result = this.make("SwitchStatement");
    result.value = value;
    result.cases = cases;
    return result;
  };

  JsonTreeBuilder.prototype.makeTryStatement = function (body, catchBlock, finallyBlock) {
    var result = this.make("TryStatement");
    result.body = body;
    result.catchBlock = catchBlock;
    result.finallyBlock = finallyBlock;
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

  JsonTreeBuilder.prototype.makeArrayLiteralExpression = function (elements) {
    var result = this.make("ArrayLiteral");
    result.elements = elements;
    return result;
  };

  JsonTreeBuilder.prototype.makeObjectLiteralExpression = function (pairs) {
    var result = this.make("ObjectLiteral");
    result.pairs = pairs;
    return result;
  };

  JsonTreeBuilder.prototype.makeIdentifierExpression = function (identifier) {
    var result = this.make("Identifier");
    result.identifier = identifier;
    return result;
  };

  JsonTreeBuilder.prototype.makePrefixMutationExpression = function (operator, rhs) {
    var result = this.make("PrefixMutation");
    result.operator = operator;
    result.rhs = rhs;
    return result;
  };

  JsonTreeBuilder.prototype.makePostfixMutationExpression = function (operator, lhs) {
    var result = this.make("PostfixMutation");
    result.operator = operator;
    result.lhs = lhs;
    return result;
  };

  JsonTreeBuilder.prototype.makeUnaryOperatorExpression = function (operator, rhs) {
    var result = this.make("UnaryOperator");
    result.operator = operator;
    result.rhs = rhs;
    return result;
  };

  JsonTreeBuilder.prototype.makeBinaryOperatorExpression = function (operator, lhs, rhs) {
    var result = this.make("BinaryOperator");
    result.operator = operator;
    result.lhs = lhs;
    result.rhs = rhs;
    return result;
  };

  JsonTreeBuilder.prototype.makeAssignmentOperatorExpression = function (operator, lhs, rhs) {
    var result = this.make("AssignmentOperator");
    result.operator = operator;
    result.lhs = lhs;
    result.rhs = rhs;
    return result;
  };

  JsonTreeBuilder.prototype.makeComputedMemberAccessExpression = function (lhs, rhs) {
    var result = this.make("ComputedMemberAccess");
    result.lhs = lhs;
    result.rhs = rhs;
    return result;
  };

  JsonTreeBuilder.prototype.makeTernaryOperatorExpression = function (condition, trueExpression, falseExpression) {
    var result = this.make("TernaryOperator");
    result.condition = condition;
    result.trueExpression = trueExpression;
    result.falseExpression = falseExpression;
    return result;
  };

  JsonTreeBuilder.prototype.makeMemberAccessExpression = function (lhs, memberName) {
    var result = this.make("MemberAccess");
    result.lhs = lhs;
    result.memberName = memberName;
    return result;
  };

  JsonTreeBuilder.prototype.makeInvocationExpression = function (callee, argumentValues) {
    var result = this.make("Invocation");
    result.callee = callee;
    result.argumentValues = argumentValues;
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


  exports.JSON = JsonTreeBuilder;
}));