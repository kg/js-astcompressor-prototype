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

SIZE_RAW=$(sizeof $FILE)
echo $FILE $(kb $SIZE_RAW)KiB

#tooooooo slow
#pigz -11 -f -k $FILE
#SIZE_ZOPFLI=$(sizeof $FILE.gz)

pigz -9 -f -k $FILE &
third_party/bro --force --quality 11 --input $FILE --output $FILE.brotli &
third_party/lzhamtest c $FILE $FILE.lzham > /dev/null &

wait

SIZE_GZIP=$(sizeof $FILE.gz)
SIZE_BROTLI=$(sizeof $FILE.brotli)
SIZE_LZHAM=$(sizeof $FILE.lzham)

echo " gzip  " $(kb $SIZE_GZIP)KiB $(percentage $SIZE_GZIP   $SIZE_RAW)%
echo " lzham " $(kb $SIZE_LZHAM)KiB $(percentage $SIZE_LZHAM  $SIZE_RAW)%
echo " brotli" $(kb $SIZE_BROTLI)KiB $(percentage $SIZE_BROTLI $SIZE_RAW)%
