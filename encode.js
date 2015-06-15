#!/usr/bin/node

require('./astutil.js');
require('./node-augh.js');
require('./third_party/encoding/encoding.js');

var asmParse = require('./third_party/cashew/asm-parse.js');
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
  fs.readFileSync("shapes-jsontree.json", { encoding: "utf8" })
);

var inputJs = fs.readFileSync(inputFile, { encoding: "utf8" });
var fdOut = fs.openSync(outputFile, "w");

if (false) {
  console.time("asm-tokenize");
  var inputReader = encoding.makeCharacterReader(inputJs);
  var tokenizer = new asmParse.Tokenizer(inputReader);

  var token;
  while ((token = tokenizer.read()) !== false) {
    ;
  }

  console.timeEnd("asm-tokenize");
  process.exit(1);
}

var inputReader = encoding.makeCharacterReader(inputJs);
var astBuilder = new asmParse.TreeBuilder.AsmlikeJSON();

console.time("asm-parse");
var inputAst = asmParse.parse(inputReader, astBuilder);
console.timeEnd("asm-parse");

if (outputAstFile) {
  var json;
  if (astEncoder.PrettyJson)
    json = JSON.stringify(inputAst, null, 2)
  else
    json = JSON.stringify(inputAst);

  fs.writeFileSync(outputAstFile, json);
}

console.time("astToModule");
var outputModule = astEncoder.astToModule(inputAst, shapes);
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

if (false && expectedOutputJsFile) {
  fs.writeFileSync(expectedOutputJsFile, escodegen.generate(inputAst));
}
