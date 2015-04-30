#!/usr/bin/nodejs --harmony-collections

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

var inputAst = esprima.parse(inputJs);

var outputModule = astEncoder.astToModule(inputAst);

var segments = astEncoder.serializeModule(outputModule);
for (var i = 0; i < segments.length; i++) {
  var segment = segments[i];
  var buffer = new Buffer(segment);
  fs.writeSync(fdOut, buffer, 0, segment.length);
}

fs.closeSync(fdOut);

if (outputAstFile)
  fs.writeFileSync(outputAstFile, JSON.stringify(inputAst));

if (expectedOutputJsFile)
  fs.writeFileSync(expectedOutputJsFile, escodegen.generate(inputAst));