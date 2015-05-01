#!/bin/bash
echo // encoding
node encode.js ast-encoder.js Test/ast-encoder.webasm Test/ast-encoder.ast.json Test/ast-encoder.js.expected
echo // decoding
node decode.js Test/ast-encoder.webasm Test/ast-encoder.js.out Test/ast-encoder.ast.out.json
echo // diff follows
diff Test/ast-encoder.js.expected Test/ast-encoder.js.out