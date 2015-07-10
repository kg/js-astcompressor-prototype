#!/bin/bash
set -e
shopt -s nullglob

FILE_PREFIX=$2
NAME="${FILE_PREFIX%.*}"
INFILE=$1/$2

echo // Running encodings
echo // Encoding > batch-log.txt

for c in configurations/*.json
do
  CONFIGURATION="$c"
  CONFIGURATION_FILENAME=$(basename "$CONFIGURATION")
  CONFIGURATION_NAME="${CONFIGURATION_FILENAME%.*}"

  OUTDIR=Test/output/$FILE_PREFIX/$CONFIGURATION_NAME
  OUTFILE=$OUTDIR/$NAME.binast

  mkdir -p $OUTDIR

  echo $CONFIGURATION_NAME
  node --expose-gc --nouse-idle-notification --max-old-space-size=8192 encode.js $INFILE $OUTFILE $OUTFILE.ast.json $CONFIGURATION >> batch-log.txt
done

echo // Doing compression tests
echo // Compression test results > batch-results.txt

./size-comparison.sh $INFILE >> batch-results.txt

for c in configurations/*.json
do
  CONFIGURATION="$c"
  CONFIGURATION_FILENAME=$(basename "$CONFIGURATION")
  CONFIGURATION_NAME="${CONFIGURATION_FILENAME%.*}"

  OUTDIR=Test/output/$FILE_PREFIX/$CONFIGURATION_NAME
  OUTFILE=$OUTDIR/$NAME.binast
  
  echo $CONFIGURATION_NAME
  ./size-comparison.sh $OUTFILE >> batch-results.txt
done

echo // Done