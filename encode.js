#!/usr/bin/node

require('./astutil.js');
require('./node-augh.js');
require('./Upstream/encoding/encoding.js');

var esprima = require('./Upstream/esprima/');
var escodegen = require('./Upstream/escodegen/escodegen.browser.js').escodegen;
var astEncoder = require('./ast-encoder.js');
var fs = require('fs');

if (process.argv.length < 4) {
  console.log("USAGE: encode input.js output.webasm [astOutput.json] [expectedOutput.js]");
  process.exit(1);
}

var inputFile = process.argv[2];
var outputFile = process.argv[3];
var outputAstFile = process.argv[4];
var expectedOutputJsFile = process.argv[5];

var inputJs = fs.readFileSync(inputFile, { encoding: "utf8" });
var fdOut = fs.openSync(outputFile, "w");

console.time("esprima parse");
var inputAst = esprima.parse(inputJs);
console.timeEnd("esprima parse");

console.time("astToModule");
var outputModule = astEncoder.astToModule(inputAst);
console.timeEnd("astToModule");

console.time("deduplicateObjects");
outputModule.deduplicateObjects();
console.timeEnd("deduplicateObjects");

console.time("serializeModule");
var segments = astEncoder.serializeModule(outputModule);
console.timeEnd("serializeModule");

console.time("write serialized module");
for (var i = 0; i < segments.length; i++) {
  var segment = segments[i];
  var buffer = new Buffer(segment);
  fs.writeSync(fdOut, buffer, 0, segment.length);
}
console.timeEnd("write serialized module");

fs.closeSync(fdOut);

if (outputAstFile)
  fs.writeFileSync(outputAstFile, JSON.stringify(inputAst));

if (expectedOutputJsFile)
  fs.writeFileSync(expectedOutputJsFile, escodegen.generate(inputAst));