#!/bin/bash
set -e

if [ -z $1 ]; then
FILE_PREFIX=ast-encoder.js
INFILE=./ast-encoder.js ;
else
FILE_PREFIX=$2
INFILE=$1/$2 ;
fi

if [ -z $3 ]; then
CONFIGURATION=
else
CONFIGURATION=$3
fi;

rm -f Test/$FILE_PREFIX.ast.json Test/$FILE_PREFIX.ast.decoded.json

# echo // input
echo // encoding
node --expose-gc --nouse-idle-notification --max-old-space-size=8192 encode.js $INFILE Test/$FILE_PREFIX.webasm Test/$FILE_PREFIX.ast.json $CONFIGURATION
echo // read ast json
node --expose-gc -e "try { var json = require('fs').readFileSync('Test/$FILE_PREFIX.ast.json', { encoding: 'utf8' }); console.time('JSON.parse'); var tree = JSON.parse(json); console.timeEnd('JSON.parse'); json = null; global.gc(); console.log('heapUsed ' + process.memoryUsage().heapUsed); } catch (e) { console.log('failed: no ast'); }"
echo // decoding
node --expose-gc --nouse-idle-notification --max-old-space-size=8192 decode.js Test/$FILE_PREFIX.webasm Test/$FILE_PREFIX.ast.decoded.json $CONFIGURATION
echo // size comparison
./size-comparison.sh $INFILE
./size-comparison.sh Test/$FILE_PREFIX.webasm
echo // diff follows
diff Test/$FILE_PREFIX.ast.json Test/$FILE_PREFIX.ast.decoded.json