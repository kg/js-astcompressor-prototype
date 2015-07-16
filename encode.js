#!/usr/bin/node

require('./astutil.js');
require('./node-augh.js');
require('./third_party/encoding/encoding.js');

var common = require("./ast-common.js");
var Configuration = require("./configuration.js");
var asmParse = require('./third_party/cashew/asm-parse.js');
var astEncoder = require('./ast-encoder.js');
var treeBuilder = require("./parse/treebuilder.js");
var fs = require('fs');

if (process.argv.length < 4) {
  console.log("USAGE: encode input.js output.bast [astOutput.json] [configuration.json]");
  process.exit(1);
}

var inputFile = process.argv[2];
var outputFile = process.argv[3];
var outputAstFile = process.argv[4];
var configurationPath = process.argv[5];

var configuration = new Configuration.Default();
if (configurationPath) {
  console.log("// Configuration " + configurationPath);
  configuration = Configuration.FromJson(
    fs.readFileSync(configurationPath, { encoding: "utf8" })
  );
} else {
  console.log("// Configuration (default)");
}

var shapes = astEncoder.ShapeTable.fromJson(
  fs.readFileSync("shapes-jsontree.json", { encoding: "utf8" })
);

var inputJs = fs.readFileSync(inputFile, { encoding: "utf8" });
var fdOut = fs.openSync(outputFile, "w");

var inputReader = encoding.makeCharacterReader(inputJs);

var astBuilderType = astEncoder.JsAstModuleBuilder;

if (configuration.DeduplicateObjects) {
  astBuilderType = treeBuilder.MakeDeduplicating(
    astBuilderType,
    common.GetObjectId,
    configuration.DeduplicationUsageThreshold
  );
}

var astBuilder = new (astBuilderType)(configuration, shapes);

console.time("asm-parse");
var inputAst = asmParse.parse(inputReader, astBuilder);
console.timeEnd("asm-parse");

var outputModule = astBuilder.finish(inputAst);

if (configuration.DeduplicateObjects) {
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

if (common.DumpJson && outputAstFile) {
  var json;
  if (astEncoder.PrettyJson)
    json = JSON.stringify(inputAst, null, 2)
  else
    json = JSON.stringify(inputAst);

  fs.writeFileSync(outputAstFile, json);
}

fs.closeSync(fdOut);