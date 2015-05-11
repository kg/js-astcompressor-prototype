{
  shapeKey: "type",
  shapes: {
    "Function": {
      id : "Identifier?",
      params: [ "Pattern" ],
      defaults: [ "Expression" ],
      rest : "Identifier?",
      body : "BlockStatement | Expression"
    },
    "EmptyStatement": {
    },
    "BlockStatement": {
      body : [ "Statement" ]
    },
    "ExpressionStatement": {
      expression: "Expression"
    },
    "IfStatement": {
      test: "Expression",
      consequent: "Statement",
      alternate: "Statement?"
    },
    "LabeledStatement": {
      label: "Identifier",
      body: "Statement"
    },
    "BreakStatement": {
      label: "Identifier?"
    },
    "ContinueStatement": {
      label: "Identifier?"
    },
    "SwitchStatement": {
      discriminant: "Expression",
      cases: [ "SwitchCase" ],
      lexical: "Boolean"
    },
    "ReturnStatement": {
      argument: "Expression?"
    },
    "ThrowStatement": {
      argument: "Expression"
    },
    "TryStatement": {
      block: "BlockStatement",
      handler: "CatchClause?",
      guardedHandlers: [ "CatchClause" ],
      finalizer: "BlockStatement?"
    },
    "WhileStatement": {
      body: "Statement",
      test: "Expression"
    },
    "DoWhileStatement": {
      body: "Statement",
      test: "Expression"
    },
    "ForStatement": {
      init: "VariableDeclaration | Expression | null",
      test: "Expression?",
      update: "Expression?",
      body: "Statement"
    },
    "ForInStatement": {
      left: "VariableDeclaration | Expression",
      right: "Expression",
      body: "Statement",
      each: "Boolean"
    },
    "ForOfStatement": {
      left: "VariableDeclaration | Expression",
      right: "Expression",
      body: "Statement"
    },
    "LetStatement": {
      head: [ "VariableDeclarator" ],
      body: "Statement"
    },
    "DebuggerStatement": {
    },
    "FunctionDeclaration": {
      id: "Identifier",
      params: [ "Pattern" ],
      defaults: [ "Expression" ],
      rest: "Identifier?",
      body: "BlockStatement | Expression"
    },
    "VariableDeclaration": {
      declarations: [ "VariableDeclarator" ],
      kind: "String"
    }
  }
}