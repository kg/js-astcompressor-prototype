'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['exports'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports);
  } else {
    factory((root.jsonTreeBuilder = {}));
  }
}(this, function (exports) {
  // If enabled, expressions are wrapped in ExpressionStatement nodes, making
  //  it possible to satisfy Statement type requirements.
  // This increases the filesize of the binary representation significantly, though.
  var GenerateExpressionStatements = false;


  function JsonTreeBuilder () {
    this.protos = Object.create(null);
  };

  JsonTreeBuilder.prototype.make = function (type) {
    var proto = this.protos[type];
    if (!proto) {
      this.protos[type] = proto = new Object();
      proto.type = type;
    }

    var result = Object.create(proto);
    // HACK For debugging and JSON.stringify
    result.type = type;
    
    return result;
  };

  JsonTreeBuilder.prototype.makeTopLevelBlock = function () {
    return this._makeBlock("TopLevel");
  };

  JsonTreeBuilder.prototype.makeBlock = function () {
    return this._makeBlock("Block");
  };

  JsonTreeBuilder.prototype.finalize = function (obj) {
    return obj;
  };

  JsonTreeBuilder.prototype.makeExpressionStatement = function (expression) {
    if (
      !expression || 
      (typeof (expression.type) !== "string")
    ) {
      console.log(expression);
      throw new Error("Expected an expression");
    } else if (expression.type.indexOf("Statement") >= 0) {
      console.log(expression);
      throw new Error("Cannot wrap a statement in an expression statement");
    }

    if (GenerateExpressionStatements) {
      var result = this.make("ExpressionStatement");
      result.expression = expression;
      return this.finalize(result);
    } else {
      return expression;
    }
  };

  JsonTreeBuilder.prototype.makeBlockStatement = function (block) {
    var result = this.make("BlockStatement");
    result.block = block;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeLabelStatement = function (labels, block) {
    var result = this.make("LabelStatement");
    result.labels = labels;
    result.block = block;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeIfStatement = function (condition, trueStatement, falseStatement) {
    var result = this.make("IfStatement");
    result.condition = condition;
    result.trueStatement = trueStatement;
    result.falseStatement = falseStatement;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeForStatement = function (initialize, update, condition, body) {
    var result = this.make("ForStatement");
    result.initialize = initialize;
    result.update = update;
    result.condition = condition;
    result.body = body;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeForInStatement = function (declaration, body) {
    var result = this.make("ForInStatement");
    result.declaration = declaration;
    result.body = body;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeWhileStatement = function (condition, body) {
    var result = this.make("WhileStatement");
    result.condition = condition;
    result.body = body;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeDoWhileStatement = function (condition, body) {
    var result = this.make("DoWhileStatement");
    result.condition = condition;
    result.body = body;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeNullStatement = function () {
    var result = this.make("NullStatement");
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeFunctionStatement = function (functionExpression) {
    var result = this.make("FunctionStatement");
    result.functionExpression = functionExpression;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeDeclarationStatement = function (declarations) {
    var result = this.make("DeclarationStatement");
    result.declarations = declarations;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeDeclaration = function (name, initialValue) {
    var result = this.make("Declaration");
    result.name = name;
    result.initialValue = initialValue || null;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeForInDeclaration = function (variableName, sequenceExpression) {
    var result = this.make("ForInDeclaration");
    result.variableName = variableName;
    result.sequenceExpression = sequenceExpression;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeReturnStatement = function (expression) {
    var result = this.make("ReturnStatement");
    result.expression = expression;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeBreakStatement = function (label) {
    var result = this.make("BreakStatement");
    result.label = label;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeContinueStatement = function (label) {
    var result = this.make("ContinueStatement");
    result.label = label;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeThrowStatement = function (expression) {
    var result = this.make("ThrowStatement");
    result.expression = expression;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeSwitchStatement = function (value, cases) {
    var result = this.make("SwitchStatement");
    result.value = value;
    result.cases = cases;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeSwitchCase = function (value, body) {
    var result = this.make("SwitchCase");
    result.value = value;
    result.body = body;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeTryStatement = function (body, catchExpression, catchBlock, finallyBlock) {
    var result = this.make("TryStatement");
    result.body = body;
    result.catchExpression = catchExpression;
    result.catchBlock = catchBlock;
    result.finallyBlock = finallyBlock;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeCommaExpression = function (expressions) {
    var result = this.make("Comma");
    result.expressions = expressions;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeFunctionExpression = function (name, argumentNames, body) {
    var result = this.make("Function");
    result.name = name;
    result.argumentNames = argumentNames;
    result.body = body;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeLiteralExpression = function (type, value) {
    var titleCaseType = type[0].toUpperCase() + type.substr(1);
    if (type === "regexp")
      titleCaseType = "RegExp";

    var result = this.make(titleCaseType + "Literal");
    result.value = value;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeArrayLiteralExpression = function (elements) {
    var result = this.make("ArrayLiteral");
    result.elements = elements;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeObjectLiteralExpression = function (pairs) {
    var result = this.make("ObjectLiteral");
    result.pairs = pairs;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makePair = function (key, value) {
    var result = this.make("Pair");
    result.key = key;
    result.value = value;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeIdentifierExpression = function (identifier) {
    var result = this.make("Identifier");
    result.identifier = identifier;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makePrefixMutationExpression = function (operator, rhs) {
    var result = this.make("PrefixMutation");
    result.operator = operator;
    result.rhs = rhs;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makePostfixMutationExpression = function (operator, lhs) {
    var result = this.make("PostfixMutation");
    result.operator = operator;
    result.lhs = lhs;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeUnaryOperatorExpression = function (operator, rhs) {
    var result = this.make("UnaryOperator");
    result.operator = operator;
    result.rhs = rhs;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeBinaryOperatorExpression = function (operator, lhs, rhs) {
    var result = this.make("BinaryOperator");
    result.operator = operator;
    result.lhs = lhs;
    result.rhs = rhs;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeAssignmentOperatorExpression = function (operator, lhs, rhs) {
    var result = this.make("AssignmentOperator");
    result.operator = operator;
    result.lhs = lhs;
    result.rhs = rhs;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeComputedMemberAccessExpression = function (lhs, rhs) {
    var result = this.make("ComputedMemberAccess");
    result.lhs = lhs;
    result.rhs = rhs;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeTernaryOperatorExpression = function (condition, trueExpression, falseExpression) {
    var result = this.make("TernaryOperator");
    result.condition = condition;
    result.trueExpression = trueExpression;
    result.falseExpression = falseExpression;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeMemberAccessExpression = function (lhs, memberName) {
    var result = this.make("MemberAccess");
    result.lhs = lhs;
    result.memberName = memberName;
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.makeInvocationExpression = function (callee, argumentValues) {
    var result = this.make("Invocation");
    result.callee = callee;
    result.argumentValues = argumentValues;
    return this.finalize(result);
  };


  JsonTreeBuilder.prototype._makeBlock = function (typeTag) {
    var result = this.make(typeTag);
    result.statements = [];
    return this.finalize(result);
  };

  JsonTreeBuilder.prototype.appendToBlock = function (block, statement) {
    block.statements.push(statement);
  };


  exports.Builder = JsonTreeBuilder;
}));