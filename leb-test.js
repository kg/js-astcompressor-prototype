require("./third_party/encoding/encoding.js");
var common = require("./ast-common.js");

function testValue (i) {
    var bw = encoding.makeByteWriter();
    common.writeLEBInt32(bw, i);
    var bytes = bw.getResult();
    var bytestr = "";
    for (var j = 0; j < bytes.length; j++) {
        var byte = bytes[j];
        var hex = byte.toString(16);
        if (hex.length < 2)
            hex = "0" + hex;

        bytestr += hex;
    }

    // console.log(i, bytestr);

    var br = encoding.makeByteReader(bytes);
    var expected = i | 0;
    var result = common.readLEBInt32(br);

    if (expected !== result)
        console.log("expected " + expected + " got " + result);
};

testValue(0);
testValue(-624485);
testValue(0xFFF6789b);

for (var i = -65539; i < 65539; i += 1) {
    testValue(i);
}