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

  JsonTreeBuilder.prototype.makeIfStatement = function (condition, trueStatement, falseStatement) {
    var result = this.make("IfStatement");
    result.condition = condition;
    result.trueStatement = trueStatement;
    result.falseStatement = falseStatement;
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


  exports.JSON = JsonTreeBuilder;
}));