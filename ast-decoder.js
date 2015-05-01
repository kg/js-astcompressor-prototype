'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['exports'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports);
  } else {
    factory((root.astDecoder = {}));
  }
}(this, function (exports) {
  var common = require("./ast-common.js");

  var NamedTable  = common.NamedTable,
      UniqueTable = common.UniqueTable,
      StringTable = common.StringTable,
      ObjectTable = common.ObjectTable;


  function ValueReader (bytes, index, count) {
    this.bytes        = bytes;
    this.byteReader   = encoding.makeByteReader(bytes, index, count);
    this.scratchBytes = new Uint8Array(128);
    this.scratchView  = new DataView(this.scratchBytes.buffer);
  }

  ValueReader.prototype.readByte = function () {
    return this.byteReader.read();
  };

  ValueReader.prototype.readBytes = function (buffer, offset, count) {
    if (arguments.length === 1) {
      var temp = new Uint8Array(buffer | 0);
      if (this.readBytes(temp, 0, buffer | 0))
        return temp;
      else
        return false;
    }

    for (var i = 0; i < count; i++) {
      var b = this.byteReader.read();

      if (b === false)
        return false;

      buffer[offset + i] = b;
    }

    return true;
  };

  ValueReader.prototype.readScratchBytes = function (count) {
    return this.readBytes(this.scratchBytes, 0, count);
  };

  ValueReader.prototype.readUint32 = function () {
    if (!this.readScratchBytes(4))
      return false;

    return this.scratchView.getUint32(0, true);
  };

  ValueReader.prototype.readInt32 = function () {
    if (!this.readScratchBytes(4))
      return false;

    return this.scratchView.getInt32(0, true);
  };

  ValueReader.prototype.readVarUint32 = function () {
    if (!common.EnableVarints)
      return this.readUint32();

    var offset = this.byteReader.getPosition();
    var result = common.readLEBUint32(this.bytes, offset);
    this.byteReader.skip(result.length);
    return result.value;
  };

  ValueReader.prototype.readFloat64 = function () {
    if (!this.readScratchBytes(8))
      return false;

    return this.scratchView.getFloat64(0, true);
  };

  ValueReader.prototype.readUtf8String = function () {
    var length = this.readVarUint32();
    if (length === false)
      return false;

    if (length === 0)
      return "";

    var result = encoding.UTF8.decode(this.bytes, this.byteReader.getPosition(), length);

    this.byteReader.skip(length);

    return result;
  };

  ValueReader.prototype.skip = function (distance) {
    this.byteReader.skip(distance);
  };


  function JsAstModule () {
    this.strings = null;
    this.keysets = null;
    this.arrays  = null;
    this.objects = null;

    this.root_id = null;
  };


  function deserializeValue (reader, module) {
    var typeCode = reader.readByte();
    if (typeCode === false)
      throw new Error("Truncated file");

    var typeToken = String.fromCharCode(typeCode);

    switch (typeToken) {
      case "s":
      case "a":
      case "o": {
        var index = reader.readVarUint32();

        switch (typeToken) {
          case "s":
            return module.strings[index];

          case "a":
            return module.arrays[index];

          case "o":
            return module.objects[index];

          default:
            throw new Error("unexpected");            
        }
      }

      case "i":
        return reader.readInt32();

      case "d":
        return reader.readFloat64();

      case "N":
        return null;

      case "T":
        return true;

      case "F":
        return false;

      default:
        throw new Error("Unhandled value type " + typeToken);
    }
  };


  function deserializeArrayContents (reader, module, arr) {
    var count = reader.readVarUint32();

    for (var i = 0; i < count; i++) {
      var value = deserializeValue(reader, module);
      arr[i] = value;
    }
  };


  function deserializeObjectContents (reader, module, obj) {
    var keysetIndex = reader.readVarUint32();    
    var keyset = module.keysets[keysetIndex];

    for (var i = 0, l = keyset.length; i < l; i++) {
      var key = keyset[i];
      var value = deserializeValue(reader, module);
      obj[key] = value;
    }
  };


  function deserializeTable (reader, payloadReader) {
    var count = reader.readUint32();
    if (count === false)
      throw new Error("Truncated file");

    var result = new Array(count);

    for (var i = 0; i < count; i++) {
      var item = payloadReader(reader);
      result[i] = item;
    }

    return result;
  };


  function deserializeArrays (reader, module) {
    var count = reader.readUint32();
    if (count === false)
      throw new Error("Truncated file");

    for (var i = 0; i < count; i++) {
      var arr = module.arrays[i];
      deserializeArrayContents(reader, module, arr);
    }    
  };


  function deserializeObjects (reader, module) {
    var count = reader.readUint32();
    if (count === false)
      throw new Error("Truncated file");

    for (var i = 0; i < count; i++) {
      var obj = module.objects[i];
      deserializeObjectContents(reader, module, obj);
    }    
  };


  function bytesToModule (bytes) {
    var reader = new ValueReader(bytes, 0, bytes.length);

    var magic = reader.readBytes(common.Magic.length);
    if (JSON.stringify(magic) !== JSON.stringify(common.Magic)) {
      console.log(magic, common.Magic);
      throw new Error("Magic header does not match");
    }

    var formatName = reader.readUtf8String();
    if (formatName !== common.FormatName) {
      console.log(formatName, common.FormatName);
      throw new Error("Format name does not match");
    }

    var result = new JsAstModule();

    result.rootIndex = reader.readUint32();

    // The lengths are stored in front of the tables themselves,
    //  this simplifies table deserialization...
    var stringCount = reader.readUint32();
    var keysetCount = reader.readUint32();
    var objectCount = reader.readUint32();
    var arrayCount  = reader.readUint32();

    var readUtf8String = function (reader) { 
      var text = reader.readUtf8String();
      if (text === false)
        throw new Error("Truncated file");
      return text;
    };
    var readKeyset = function (reader) {
      var json = readUtf8String(reader);
      var result = JSON.parse(json);
      result.sort();
      return result;
    };
    var readDehydratedObject = function (reader) { 
      return new Object(); 
    };

    console.time("  read string tables");
    result.strings = deserializeTable(reader, readUtf8String);
    console.timeEnd("  read string tables");

    console.time("  read keysets");
    result.keysets = deserializeTable(reader, readKeyset);
    console.timeEnd("  read keysets");

    // Pre-allocate the objects and arrays for given IDs
    //  so that we can reconstruct relationships in one pass.
    result.objects   = new Array(objectCount);
    for (var i = 0; i < objectCount; i++)
      result.objects[i] = new Object();

    result.arrays    = new Array(arrayCount);
    for (var i = 0; i < arrayCount; i++)
      // FIXME: This means we have to grow it when repopulating it. :-(
      result.arrays[i] = new Array();

    console.time("  read objects");
    deserializeObjects(reader, result);
    console.timeEnd("  read objects");

    console.time("  read arrays");
    deserializeArrays (reader, result);
    console.timeEnd("  read arrays");

    return result;
  };


  function moduleToAst (module) {
    return module.objects[module.rootIndex];
  };


  exports.ValueReader   = ValueReader;
  exports.bytesToModule = bytesToModule;
  exports.moduleToAst   = moduleToAst;
}));