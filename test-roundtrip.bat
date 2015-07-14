@echo off

set INFILE=%1\%2

if "%INFILE%" == "\" (
    set INFILE=.\ast-encoder.js
    set FILE_PREFIX=ast-encoder.js
) else (
    set FILE_PREFIX=%2
)

set CONFIGURATION_NAME=%3

if "%CONFIGURATION_NAME%" == "" (
    set CONFIGURATION_NAME=default
)

set CONFIGURATION=configurations\%CONFIGURATION_NAME%.json
set OUTDIR=Test\output\%CONFIGURATION_NAME%
set OUTFILE=%OUTDIR%\%FILE_PREFIX%.binast

mkdir %OUTDIR%

del /Q /F %OUTFILE%.ast.json %OUTFILE%.ast.json

echo // encoding
node --expose-gc --nouse-idle-notification --max-old-space-size=8192 encode.js %INFILE% %OUTFILE% %OUTFILE%.ast.json %CONFIGURATION%
echo // read ast json
node --expose-gc parse-json.js "%OUTFILE%.ast.json"
echo // decoding
node --expose-gc --nouse-idle-notification --max-old-space-size=8192 decode.js %OUTFILE% %OUTFILE%.ast.decoded.json %CONFIGURATION%
echo // size comparison
call size-comparison.bat %OUTFILE%
echo // diff
fc /B %OUTFILE%.ast.json %OUTFILE%.ast.decoded.json

:end
