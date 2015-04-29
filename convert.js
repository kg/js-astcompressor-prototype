#!/usr/bin/nodejs --harmony-collections

require('./astutil.js');
require('./encoding.js');

var esprima = require('./Upstream/esprima/esprima.js');
var js2webasm = require('./js2webasm.js');
var fs = require('fs');

if (process.argv.length !== 4) {
  console.log("USAGE: js2webasm input.js output.webasm");
  process.exit(1);
}

var inputFile = process.argv[2];
var outputFile = process.argv[3];

var inputJs = fs.readFileSync(inputFile, { encoding: "utf8" });
var fdOut = fs.openSync(outputFile, "w");

var inputAst = esprima.parse(inputJs);
var outputModule = js2webasm.astToModule(inputAst);

/*

function dumpTable (t) {
  var ids = t.finalize();

  for (var i = 0, l = ids.length; i < l; i++) {
    var id = ids[i];
    console.log(id.get_index(), id.get_value());
  }
}

console.log("\nTypes");
dumpTable(outputModule.types);
console.log("\nStrings");
dumpTable(outputModule.strings);
console.log("\nIdentifiers");
dumpTable(outputModule.identifiers);

*/

var segments = js2webasm.serializeModule(outputModule);
for (var i = 0; i < segments.length; i++) {
  var segment = segments[i];
  var buffer = new Buffer(segment);
  fs.writeSync(fdOut, buffer, 0, segment.length);
}

fs.closeSync(fdOut);