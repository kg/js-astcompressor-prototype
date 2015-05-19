@echo off

set INFILE=%1\%2

if "%INFILE%" == "\" (
    set INFILE=.\ast-encoder.js
    set FILE_PREFIX=ast-encoder.js
) else (
    set FILE_PREFIX=%2
)

echo // input
dir %INFILE%
echo // encoding
node encode.js %INFILE% Test\%FILE_PREFIX%.webasm Test\%FILE_PREFIX%.ast.json Test\%FILE_PREFIX%.expected.js || (goto end)
echo // encoded sizes
dir Test\%FILE_PREFIX%.webasm Test\%FILE_PREFIX%.ast.json
echo // read ast json
node --expose-gc -e "var json = require('fs').readFileSync('Test/%FILE_PREFIX%.ast.json', { encoding: 'utf8' }); console.time('JSON.parse'); var tree = JSON.parse(json); console.timeEnd('JSON.parse'); json = null; global.gc(); console.log('heapUsed ' + process.memoryUsage().heapUsed);"
echo // decoding
node --expose-gc decode.js Test\%FILE_PREFIX%.webasm Test\%FILE_PREFIX%.decoded.js Test\%FILE_PREFIX%.ast.decoded.json || (goto end)
echo // diffing
fc /A /N /L Test\%FILE_PREFIX%.expected.js Test\%FILE_PREFIX%.decoded.js

:end