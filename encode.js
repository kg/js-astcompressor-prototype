#!/usr/bin/node

require('./astutil.js');
require('./node-augh.js');
require('./third_party/encoding/encoding.js');

var common = require("./ast-common.js");
var asmParse = require('./third_party/cashew/asm-parse.js');
var astEncoder = require('./ast-encoder.js');
var treeBuilder = require("./parse/treebuilder.js");
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
  fs.readFileSync("shapes-jsontree.json", { encoding: "utf8" })
);

var inputJs = fs.readFileSync(inputFile, { encoding: "utf8" });
var fdOut = fs.openSync(outputFile, "w");

var inputReader = encoding.makeCharacterReader(inputJs);
var astBuilder;

if (common.DeduplicateObjects) {
  var deduplicatingModuleBuilder = treeBuilder.MakeDeduplicating(
    astEncoder.JsAstModuleBuilder,
    common.GetObjectId,
    common.DeduplicationUsageThreshold
  );
  astBuilder = new deduplicatingModuleBuilder(shapes);
} else {
  astBuilder = new astEncoder.JsAstModuleBuilder(shapes);
}

if (true) {
  var configuration = Object.create(null);
  var omittedKeys = ["Magic", "TagIsPrimitive"];

  for (var k in common) {
    if (omittedKeys.indexOf(k) >= 0)
      continue;
    else if (
      (typeof (common[k]) === "object") ||
      (typeof (common[k]) === "function")
    )
      continue;

    configuration[k] = common[k];
  }

  console.log(JSON.stringify(configuration, null, 2));
}

console.time("asm-parse");
var inputAst = asmParse.parse(inputReader, astBuilder);
console.timeEnd("asm-parse");

if (common.DumpJson && outputAstFile) {
  var json;
  if (astEncoder.PrettyJson)
    json = JSON.stringify(inputAst, null, 2)
  else
    json = JSON.stringify(inputAst);

  fs.writeFileSync(outputAstFile, json);
}

var outputModule = astBuilder.finish(inputAst);

if (common.DeduplicateObjects) {
  console.log(
    "Early-deduplicated " + astBuilder.nodesPruned + 
    " node(s) (" + 
    (astBuilder.nodesPruned / astBuilder.nodesFinalized * 100)
      .toFixed(1) + "%)"
  );
}

// TODO: Deduplicate arrays?

console.time("serializeModule");
var bytes = astEncoder.serializeModule(outputModule);
console.timeEnd("serializeModule");

fs.writeSync(fdOut, new Buffer(bytes), 0, bytes.length);

fs.closeSync(fdOut);