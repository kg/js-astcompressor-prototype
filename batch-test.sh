#!/bin/bash
set -e
shopt -s nullglob

FILE_PREFIX=$2
NAME="${FILE_PREFIX%.*}"
INFILE=$1/$2

echo // Running encodings

RUNNING_ENCODERS=0
FORK_WIDTH=4

for c in configurations/*.json
do
  CONFIGURATION="$c"
  CONFIGURATION_FILENAME=$(basename "$CONFIGURATION")
  CONFIGURATION_NAME="${CONFIGURATION_FILENAME%.*}"

  OUTDIR=Test/output/$FILE_PREFIX/$CONFIGURATION_NAME
  OUTFILE=$OUTDIR/$NAME.binast

  mkdir -p $OUTDIR

  echo $OUTDIR
  node --expose-gc --nouse-idle-notification --max-old-space-size=8192 encode.js $INFILE $OUTFILE $OUTFILE.ast.json $CONFIGURATION > $OUTFILE.log &

  RUNNING_ENCODERS=$((RUNNING_ENCODERS + 1))
  if ((RUNNING_ENCODERS >= FORK_WIDTH))
  then
    RUNNING_ENCODERS=0
    echo ... waiting
    wait
    echo 
  fi
done

wait
echo 

echo // Doing compression tests

./size-comparison.sh $INFILE > $INFILE-sizes.log
cat $INFILE-sizes.log

RUNNING_COMPRESSORS=0

for c in configurations/*.json
do
  CONFIGURATION="$c"
  CONFIGURATION_FILENAME=$(basename "$CONFIGURATION")
  CONFIGURATION_NAME="${CONFIGURATION_FILENAME%.*}"

  OUTDIR=Test/output/$FILE_PREFIX/$CONFIGURATION_NAME
  OUTFILE=$OUTDIR/$NAME.binast

  echo $CONFIGURATION_NAME ...
  ./size-comparison.sh $OUTFILE > $OUTFILE-sizes.log &

  RUNNING_COMPRESSORS=$((RUNNING_COMPRESSORS + 1))
  if ((RUNNING_COMPRESSORS >= FORK_WIDTH))
  then
    RUNNING_COMPRESSORS=0
    echo ... waiting
    wait
  fi
done

wait

echo // Done