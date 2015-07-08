@echo off

set INFILE=%1\%2

if "%INFILE%" == "\" (
    set INFILE=.\ast-encoder.js
    set FILE_PREFIX=ast-encoder.js
) else (
    set FILE_PREFIX=%2
)

echo // input
third_party\7z.exe a -bd -tzip -mx=9 %INFILE%.zip %INFILE% 1>NUL
third_party\7z.exe a -bd -m0=LZHAM -mx=8 %INFILE%.lzham %INFILE% 1>NUL
dir %INFILE%*
echo // encoding
node encode.js %INFILE% Test\%FILE_PREFIX%.webasm Test\%FILE_PREFIX%.ast.json Test\%FILE_PREFIX%.expected.js || (goto end)
echo // encoded sizes
third_party\7z.exe a -bd -tzip -mx=9 Test\%FILE_PREFIX%.webasm.zip Test\%FILE_PREFIX%.webasm 1>NUL
third_party\7z.exe a -bd -m0=LZHAM -mx=8 Test\%FILE_PREFIX%.webasm.lzham Test\%FILE_PREFIX%.webasm 1>NUL
dir Test\%FILE_PREFIX%.webasm*
echo // read ast json
node --expose-gc -e "var json = require('fs').readFileSync('Test/%FILE_PREFIX%.ast.json', { encoding: 'utf8' }); console.time('JSON.parse'); var tree = JSON.parse(json); console.timeEnd('JSON.parse'); json = null; global.gc(); console.log('heapUsed ' + process.memoryUsage().heapUsed);"
echo // decoding
node --expose-gc decode.js Test\%FILE_PREFIX%.webasm Test\%FILE_PREFIX%.decoded.js Test\%FILE_PREFIX%.ast.decoded.json || (goto end)
echo // diffing
fc /B Test\%FILE_PREFIX%.ast.json Test\%FILE_PREFIX%.ast.decoded.json

:end
