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


  var IoTrace = false;


  function ValueReader (bytes, index, count) {
    this.bytes        = bytes;
    this.byteReader   = encoding.makeByteReader(bytes, index, count);
    this.scratchBytes = new Uint8Array  (128);
    this.scratchU32   = new Uint32Array (this.scratchBytes.buffer);
    this.scratchI32   = new Int32Array  (this.scratchBytes.buffer);
    this.scratchF64   = new Float64Array(this.scratchBytes.buffer);
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

    var result = this.scratchU32[0];
    if (IoTrace)
      console.log("read  uint", result.toString(16));
    return result;
  };

  ValueReader.prototype.readUint24 = function () {
    this.scratchU32[0] = 0;

    if (!this.readScratchBytes(3))
      return false;

    var result = this.scratchU32[0];
    if (IoTrace)
      console.log("read  uint24", result.toString(16));
    return result;
  };

  ValueReader.prototype.readInt32 = function () {
    if (!this.readScratchBytes(4))
      return false;

    var result = this.scratchI32[0];
    if (IoTrace)
      console.log("read  int", result.toString(16));
    return result;
  };

  ValueReader.prototype.readVarUint32 = function () {
    if (!common.EnableVarints) {
      if (common.ThreeByteIndices)
        return this.readUint24();
      else
        return this.readUint32();
    }

    var result = common.readLEBUint32(this.byteReader);
    if (IoTrace)
      console.log("read  varuint", result.toString(16));
    return result;
  };

  ValueReader.prototype.readVarInt32 = function () {
    if (!common.EnableVarints)
      return this.readInt32();

    var result = common.readLEBInt32(this.byteReader);
    if (IoTrace)
      console.log("read  varint", result.toString(16));
    return result;
  };

  ValueReader.prototype.readRelativeIndex = function (baseIndex) {
    var indexRaw = this.readVarInt32();
    if (indexRaw === 0)
      return 0xFFFFFFFF;

    var result;
    if (indexRaw > 0) {
      result = baseIndex + indexRaw - 1;
    } else {
      result = baseIndex + indexRaw;
    }

    if (IoTrace)
      console.log("read relindex " + indexRaw + " + " + baseIndex + " -> " + result);

    return result;
  };

  ValueReader.prototype.readIndex = function () {
    var indexRaw = this.readVarUint32();

    if (indexRaw === 0)
      return 0xFFFFFFFF;
    else
      return indexRaw - 1;
  };

  ValueReader.prototype.readFloat64 = function () {
    if (!this.readScratchBytes(8))
      return false;

    var result = this.scratchF64[0];
    if (IoTrace)
      console.log("read  float64", result.toFixed(4));
    return result;
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

  ValueReader.prototype.readSubstream = function () {
    var length = this.readUint32();

    var result = new ValueReader(this.bytes, this.byteReader.getPosition(), length);

    this.byteReader.skip(length);

    var length2 = this.readUint32();
    if (length2 !== length)
      throw new Error("Length footer didn't match length header");

    return result;
  };

  ValueReader.prototype.skip = function (distance) {
    this.byteReader.skip(distance);
  };


  function JsAstModule (shapes) {
    this.shapes  = shapes;

    this.valueStreams = Object.create(null);

    this.tags    = null;
    this.strings = null;

    this.objects = null;

    this.root = null;
  };


  function readTypeTag (reader, module) {
    var tagIndex = reader.readVarUint32();
    if (tagIndex === false)
      throw new Error("Truncated file");

    var tag = module.tags[tagIndex];
    if (typeof (tag) !== "string")
      throw new Error("Invalid tag index: " + tagIndex);

    return tag;
  };


  function getTableEntry (table, index) {
    if (!table)
      throw new Error("Table expected");

    if (index === 0xFFFFFFFF)
      return null;

    if ((index < 0) || (index >= table.length))
      throw new Error("Invalid index " + index);

    var result = table[index];
    if (typeof (result) === "undefined")
      throw new Error("Uninitialized at index " + index);

    return result;
  };


  function readMaybeRelativeIndex (reader, baseIndex) {
    if (
      common.RelativeIndexes &&
      typeof (baseIndex) === "number"
    ) {
      return reader.readRelativeIndex(baseIndex);
    } else {
      return reader.readIndex();
    }
  };


  function deserializeValueWithKnownTag (reader, module, tag, baseIndex) {
    switch (tag) {
      case "any": {
        tag = readTypeTag(reader, module);
        if (tag === "any")
          throw new Error("Found 'any' type tag when reading any-tag");

        if (IoTrace)
          console.log("read  any ->");
        return deserializeValueWithKnownTag(reader, module, tag, baseIndex);
      }

      case "string":
        var index = readMaybeRelativeIndex(reader, baseIndex);
        if (IoTrace)
          console.log("read  string");
        return getTableEntry(module.strings, index);

      case "array":
        var length = reader.readVarUint32();
        var array = new Array(length);

        var elementTag = readTypeTag(reader, module);

        for (var i = 0; i < length; i++) {
          var element = deserializeValueWithKnownTag(reader, module, elementTag, baseIndex);
          array[i] = element;
        }

        return array;

      case "object":
        var objectTable;
        if (IoTrace)
          console.log("read  object");

        objectTable = module.objects;

        var index = readMaybeRelativeIndex(reader, baseIndex);
        return getTableEntry(objectTable, index);

      case "boolean":
        return Boolean(reader.readByte());

      case "integer":
        return reader.readInt32();

      case "double":
        return reader.readFloat64();

      default:
        var shape = module.shapes.get(tag);
        if (!shape)
          throw new Error("Unhandled value type " + tag + " with no shape");

        var index = readMaybeRelativeIndex(reader, baseIndex);

        var objectTable;
        objectTable = module.objects;

        return getTableEntry(objectTable, index);
    }

    throw new Error("unexpected");
  };


  function deserializeArrayContents (reader, module, arr, index) {
    var count = reader.readVarUint32();
    var elementTypeTag = readTypeTag(reader, module);

    // Stream of tagged values
    for (var i = 0; i < count; i++) {
      var value = deserializeValueWithKnownTag(reader, module, elementTypeTag, null);
      arr[i] = value;
    }
  };


  function getReaderForField (defaultReader, module, field, tag) {
    if (common.ValueStreamPerType) {
      var reader = module.valueStreams[tag];
      if (!reader)
        throw new Error("No value stream for tag '" + tag + "'");

      return reader;
    } else {
      return defaultReader;
    }
  };


  function deserializeObjectContents (reader, module, obj, index) {
    var shapeName = readTypeTag(reader, module);

    if (IoTrace)
      console.log("// object body #" + index);

    var shape = module.shapes.get(shapeName);
    if (!shape)
      throw new Error("Could not find shape '" + shapeName + "'");

    obj[module.shapes.shapeKey] = shapeName;

    for (var i = 0, l = shape.fields.length; i < l; i++) {
      var fd = shape.fields[i];
      var value, index;

      var tag = common.pickTagForField(fd, function (t) {
        var shape = module.shapes.get(t);
        return shape;
      });

      var fieldReader = getReaderForField(reader, module, fd, tag);
      value = deserializeValueWithKnownTag(fieldReader, module, tag, index);

      if (IoTrace)
        console.log("// " + fd.name + " =", value);
      
      obj[fd.name] = value;
    }

    if (IoTrace)
      console.log(obj);
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


  function deserializeObjectTable (reader, module) {
    var count = reader.readUint32();
    if (count === false)
      throw new Error("Truncated file");

    var table = module.objects;

    if (count !== table.length)
      throw new Error("Read " + count + " object(s) into table of length " + table.length);

    for (var i = 0; i < count; i++) {
      var obj = table[i];
      deserializeObjectContents(reader, module, obj, i);
    }
  };


  function allocateObjectTable (module, count) {
    var table = new Array(count);
    for (var i = 0; i < count; i++) {
      var o = new Object();

      table[i] = o;
    };

    table.baseIndex = 0;

    if (module.objects)
      throw new Error("Object table already allocated");
    else
      module.objects = table;
  };


  function bytesToModule (bytes, shapes) {
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

    var result = new JsAstModule(shapes);

    // The lengths are stored in front of the tables themselves,
    //  this simplifies table deserialization...
    var tagCount    = reader.readUint32();
    var stringCount = reader.readUint32();
    var objectCount = reader.readUint32();


    var readUtf8String = function (_) { 
      var text = _.readUtf8String();
      if (text === false)
        throw new Error("Truncated file");
      return text;
    };

    console.time("  read tags");
    var tagReader    = reader.readSubstream();
    result.tags = deserializeTable(tagReader, readUtf8String);
    console.timeEnd("  read tags");


    console.time("  read string tables");
    var stringReader = reader.readSubstream();
    result.strings = deserializeTable(stringReader, readUtf8String);
    console.timeEnd("  read string tables");


    if (common.ValueStreamPerType)
    for (var i = 0; i < result.tags.length; i++) {
      var tagIndex = reader.readIndex();
      var tag = result.tags[tagIndex];

      var valueStream = reader.readSubstream();
      result.valueStreams[tag] = valueStream;
    }


    allocateObjectTable(result, objectCount);


    console.time("  read objects");
    var objectReader = reader.readSubstream();
    deserializeObjectTable(objectReader, result);
    console.timeEnd("  read objects");

    result.root = deserializeValueWithKnownTag(reader, result, "any", null);
    if (!result.root)
      throw new Error("Failed to retrieve root from module");

    return result;
  };


  function moduleToAst (module) {
    return module.root;
  };

  exports.PrettyJson    = common.PrettyJson;

  exports.ShapeTable    = common.ShapeTable;
  exports.ValueReader   = ValueReader;

  exports.bytesToModule = bytesToModule;
  exports.moduleToAst   = moduleToAst;
}));