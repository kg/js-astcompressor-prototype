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

if (!configurationPath)
  throw new Error("Configuration file required");

console.log("// Configuration " + configurationPath);
var configuration = Configuration.FromJson(
  fs.readFileSync(configurationPath, { encoding: "utf8" })
);

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
astBuilder.brIf = configuration.BrIf;

console.time("asm-parse");
var inputAst = asmParse.parse(inputReader, astBuilder);
console.timeEnd("asm-parse");

var outputModule = astBuilder.finish(inputAst);

if (configuration.DeduplicateObjects) {
  console.log(
    astBuilder.nodesPruned + "/" + astBuilder.nodesFinalized + 
    " parse nodes deduplicated (" + 
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
  var converter = function (k, v) {
    if ((typeof (v) === "object") && v && (v.type === "symbol")) {
      return v.valueOf();
    }

    return v;
  };

  var json;
  if (astEncoder.PrettyJson)
    json = JSON.stringify(inputAst, converter, 2)
  else
    json = JSON.stringify(inputAst, converter);

  fs.writeFileSync(outputAstFile, json);
}

fs.closeSync(fdOut);