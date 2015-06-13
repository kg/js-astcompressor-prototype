#!/usr/bin/node

require('./astutil.js');
require('./node-augh.js');
require('./Upstream/encoding/encoding.js');

var astDecoder = require('./ast-decoder.js');
var fs = require('fs');

if (process.argv.length < 4) {
  console.log("USAGE: decode input.webasm output.js [astOutput.json]");
  process.exit(1);
}

var inputFile = process.argv[2];
var outputFile = process.argv[3];
var outputAstFile = process.argv[4];

console.time("read webasm");
var inputBuffer = fs.readFileSync(inputFile), inputBytes;
if (inputBuffer.toArrayBuffer)
    inputBytes = inputBuffer.toArrayBuffer;
else
    inputBytes = new Uint8Array(inputBuffer);
console.timeEnd("read webasm");

var shapes = astDecoder.ShapeTable.fromJson(
  fs.readFileSync("shapes-jsontree.json", { encoding: "utf8" })
);

console.time("bytesToModule");
var inputModule = astDecoder.bytesToModule(inputBytes, shapes);
console.timeEnd("bytesToModule");

inputBytes = null;
if ((typeof (global) !== "undefined") && global.gc) {
  global.gc();
}

console.time("moduleToAst");
var outputAst = astDecoder.moduleToAst(inputModule);
console.timeEnd("moduleToAst");

console.log("heapUsed " + process.memoryUsage().heapUsed);

if (true)
  astutil.assertNoCycles(outputAst);

if (outputAstFile) {
  var json;
  if (astDecoder.PrettyJson)
    json = JSON.stringify(outputAst, null, 2)
  else
    json = JSON.stringify(outputAst);

  fs.writeFileSync(outputAstFile, json);
}

if (false) {
    console.time("escodegen generate");
    var outputJs = escodegen.generate(outputAst);
    console.timeEnd("escodegen generate");

    fs.writeFileSync(outputFile, outputJs);
}