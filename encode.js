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

var shapes = astEncoder.ShapeTable.fromJson(
  fs.readFileSync("shapes-esprima.json", { encoding: "utf8" })
);

var inputJs = fs.readFileSync(inputFile, { encoding: "utf8" });
var fdOut = fs.openSync(outputFile, "w");

console.time("esprima parse");
var inputAst = esprima.parse(inputJs);
console.timeEnd("esprima parse");

console.time("esprima ast cleanup");
var cleanAst = astEncoder.esprimaCleanup(inputAst);
console.timeEnd("esprima ast cleanup");

if (outputAstFile)
  fs.writeFileSync(outputAstFile, JSON.stringify(cleanAst));

console.time("astToModule");
var outputModule = astEncoder.astToModule(cleanAst, shapes);
console.timeEnd("astToModule");

if (true) {
  console.time("deduplicateObjects");
  outputModule.deduplicateObjects();
  console.timeEnd("deduplicateObjects");
}

// TODO: Deduplicate arrays?

console.time("serializeModule");
var bytes = astEncoder.serializeModule(outputModule);
console.timeEnd("serializeModule");

console.time("write serialized module");
fs.writeSync(fdOut, new Buffer(bytes), 0, bytes.length);
console.timeEnd("write serialized module");

fs.closeSync(fdOut);

if (expectedOutputJsFile)
  fs.writeFileSync(expectedOutputJsFile, escodegen.generate(inputAst));