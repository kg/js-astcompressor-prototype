#!/bin/bash
if [ -z $1 ]; then
FILE_PREFIX=ast-encoder.js
INFILE=./ast-encoder.js ;
else
FILE_PREFIX=$2
INFILE=$1/$2 ;
fi

echo // input
ls -la $INFILE
echo // encoding
node encode.js $INFILE Test/$FILE_PREFIX.webasm Test/$FILE_PREFIX.ast.json Test/$FILE_PREFIX.expected.js
echo // encoded sizes
ls -la Test/$FILE_PREFIX.webasm Test/$FILE_PREFIX.ast.json
echo // read ast json
node --expose-gc -e "var json = require('fs').readFileSync('Test/$FILE_PREFIX.ast.json', { encoding: 'utf8' }); console.time('JSON.parse'); var tree = JSON.parse(json); console.timeEnd('JSON.parse'); json = null; global.gc(); console.log('heapUsed ' + process.memoryUsage().heapUsed);"
echo // decoding
node --expose-gc decode.js Test/$FILE_PREFIX.webasm Test/$FILE_PREFIX.decoded.js Test/$FILE_PREFIX.ast.decoded.json
echo // diff follows
diff Test/$FILE_PREFIX.expected.js Test/$FILE_PREFIX.decoded.js