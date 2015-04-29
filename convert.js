#!/usr/bin/nodejs

var esprima = require('./Upstream/esprima/esprima.js');
var js2webasm = require('./js2webasm.js');
var fs = require('fs');

if (process.argv.length !== 4) {
  console.log("USAGE: js2webasm input.js output.webasm");
  process.exit(1);
}

var inputFile = process.argv[2];
var outputFile = process.argv[3];

var fdIn = fs.openSync(inputFile, "r");
var fdOut = fs.openSync(outputFile, "w");

console.log(fdIn, fdOut);