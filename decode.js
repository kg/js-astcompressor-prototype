#!/usr/bin/nodejs --harmony-collections

require('./astutil.js');
require('./node-augh.js');
require('./Upstream/encoding/encoding.js');

var esprima = require('./Upstream/esprima/');
var escodegen = require('./Upstream/escodegen/escodegen.browser.js').escodegen;
var astDecoder = require('./ast-decoder.js');
var fs = require('fs');

if (process.argv.length < 4) {
  console.log("USAGE: decode input.webasm output.js [astOutput.json]");
  process.exit(1);
}

var inputFile = process.argv[2];
var outputFile = process.argv[3];
var outputAstFile = process.argv[4];

var inputBuffer = fs.readFileSync(inputFile), inputBytes;
if (inputBuffer.toArrayBuffer)
    inputBytes = inputBuffer.toArrayBuffer;
else
    inputBytes = new Uint8Array(inputBuffer);

var inputModule = astDecoder.bytesToModule(inputBytes);
var outputAst = astDecoder.moduleToAst(inputModule);

if (outputAstFile)
  fs.writeFileSync(outputAstFile, JSON.stringify(outputAst));

var outputJs = escodegen.generate(outputAst);

fs.writeFileSync(outputFile, outputJs);