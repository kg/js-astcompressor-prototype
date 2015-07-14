#!/usr/bin/node

var filename = process.argv[2];
var json = require('fs').readFileSync(filename, { encoding: 'utf8' }); 
console.time('JSON.parse'); 
var tree = JSON.parse(json); 
console.timeEnd('JSON.parse'); 
json = null; 
global.gc(); 
console.log('heapUsed ' + process.memoryUsage().heapUsed); 
