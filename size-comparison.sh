#!/bin/bash
FILE=$1

function sizeof {
  stat -c%s "$1"
}

function kb {
  echo "scale=1; $1 / 1024" | bc
}

function percentage {
  echo "scale=2; $1 * 100 / $2" | bc
}

rm -f $FILE.brotli $FILE.lzham $FILE.gz

pigz -11 -f -k $FILE
third_party/bro --force --quality 11 --input $FILE --output $FILE.brotli
third_party/lzhamtest c $FILE $FILE.lzham > /dev/null

SIZE_RAW=$(sizeof $FILE)
SIZE_ZOPFLI=$(sizeof $FILE.gz)
SIZE_LZHAM=$(sizeof $FILE.lzham)
SIZE_BROTLI=$(sizeof $FILE.brotli)

echo $FILE $(kb $SIZE_RAW)KiB
echo " zopfli" $(percentage $SIZE_ZOPFLI $SIZE_RAW)%
echo " lzham " $(percentage $SIZE_LZHAM  $SIZE_RAW)%
echo " brotli" $(percentage $SIZE_BROTLI $SIZE_RAW)%
