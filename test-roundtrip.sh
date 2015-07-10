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
CONFIGURATION_NAME=default
else
CONFIGURATION_NAME=$3
fi;

CONFIGURATION=configurations/$CONFIGURATION_NAME.json
OUTDIR=Test/output/$CONFIGURATION_NAME
OUTFILE=$OUTDIR/$FILE_PREFIX.binast

mkdir -p $OUTDIR

rm -f $OUTFILE.ast.json $OUTFILE.ast.json

# echo // input
echo // encoding
node --expose-gc --nouse-idle-notification --max-old-space-size=8192 encode.js $INFILE $OUTFILE $OUTFILE.ast.json $CONFIGURATION
echo // read ast json
node --expose-gc -e "try { var json = require('fs').readFileSync('$OUTFILE.ast.json', { encoding: 'utf8' }); console.time('JSON.parse'); var tree = JSON.parse(json); console.timeEnd('JSON.parse'); json = null; global.gc(); console.log('heapUsed ' + process.memoryUsage().heapUsed); } catch (e) { console.log('failed: no ast'); }"
echo // decoding
node --expose-gc --nouse-idle-notification --max-old-space-size=8192 decode.js $OUTFILE $OUTFILE.ast.decoded.json $CONFIGURATION
echo // size comparison
./size-comparison.sh $OUTFILE
echo // diff
diff $OUTFILE.ast.json $OUTFILE.ast.decoded.json