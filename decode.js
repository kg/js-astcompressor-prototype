#!/usr/bin/node

require('./astutil.js');
require('./node-augh.js');
require('./third_party/encoding/encoding.js');

var common = require("./ast-common.js");
var Configuration = require("./configuration.js");
var astDecoder = require('./ast-decoder.js');
var fs = require('fs');

if (process.argv.length < 4) {
  console.log("USAGE: decode input.bast [astOutput.json] [configuration.json]");
  process.exit(1);
}

var inputFile = process.argv[2];
var outputAstFile = process.argv[3];
var configurationPath = process.argv[4];

var configuration = new Configuration.Default();
if (configurationPath)
  configuration = Configuration.FromJson(
    fs.readFileSync(configurationPath, { encoding: "utf8" })
  );

var inputBuffer = fs.readFileSync(inputFile), inputBytes;
if (inputBuffer.toArrayBuffer)
    inputBytes = inputBuffer.toArrayBuffer;
else
    inputBytes = new Uint8Array(inputBuffer);

var shapes = astDecoder.ShapeTable.fromJson(
  fs.readFileSync("shapes-jsontree.json", { encoding: "utf8" })
);

console.time("bytesToModule");
var inputModule = astDecoder.bytesToModule(configuration, shapes, inputBytes);
console.timeEnd("bytesToModule");

inputBytes = null;
if ((typeof (global) !== "undefined") && global.gc) {
  global.gc();
}

var outputAst = inputModule.root;

console.log("heapUsed " + process.memoryUsage().heapUsed);

if (common.DumpJson && outputAstFile) {
  var json;
  if (astDecoder.PrettyJson)
    json = JSON.stringify(outputAst, null, 2)
  else
    json = JSON.stringify(outputAst);

  fs.writeFileSync(outputAstFile, json);
}