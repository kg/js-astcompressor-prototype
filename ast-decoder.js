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

    return this.scratchU32[0];
  };

  ValueReader.prototype.readInt32 = function () {
    if (!this.readScratchBytes(4))
      return false;

    return this.scratchI32[0];
  };

  ValueReader.prototype.readVarUint32 = function () {
    if (!common.EnableVarints)
      return this.readUint32();

    var result = common.readLEBUint32(this.byteReader);
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

    return this.scratchF64[0];
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


  function JsAstModule (shapes) {
    this.shapes  = shapes;

    this.tags    = null;
    this.strings = null;
    this.arrays  = null;

    if (common.PartitionedObjectTables) {
      this.objectTables = Object.create(null);

      Object.defineProperty(this, "objects", {
        configurable: false,
        enumerable: false,
        get: function () { throw new Error("module.objects not available in partitioned tables mode"); }
      });
    } else {
      this.objects = null;
    }

    this.root = null;
  };


  function readTypeTag (reader, module) {
    var tagIndex = reader.readVarUint32();
    if (tagIndex === false)
      throw new Error("Truncated file");

    var tag = module.tags[tagIndex];

    return tag;
  };


  function deserializeTaggedValue (reader, module) {
    var tag = readTypeTag(reader, module);

    return deserializeValueWithKnownTag(reader, module, tag);
  };


  function getTableEntry (table, index) {
    if (index === 0xFFFFFFFF)
      return null;

    if ((index < 0) || (index >= table.length))
      throw new Error("Invalid index " + index);

    var result = table[index];
    if (typeof (result) === "undefined")
      throw new Error("Uninitialized at index " + index);

    return result;
  };


  function deserializeValueWithKnownTag (reader, module, tag) {
    switch (tag) {
      case "any": {
        tag = readTypeTag(reader, module);
        if (tag === "any")
          throw new Error("Found 'any' type tag when reading any-tag");

        return deserializeValueWithKnownTag(reader, module, tag);
      }

      case "string":
      case "array":
      case "object": {
        var index = reader.readIndex();

        switch (tag) {
          case "string":
            return getTableEntry(module.strings, index);

          case "array":
            return getTableEntry(module.arrays, index);

          case "object":
            return getTableEntry(module.objects, index);

          default:
            throw new Error("unexpected");            
        }
      }

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

        // FIXME: partitioning
        var index = reader.readIndex();

        return getTableEntry(module.objects, index);
    }

    throw new Error("unexpected");
  };


  function deserializeArrayContents (reader, module, arr) {
    var count = reader.readVarUint32();
    var elementTypeTag = readTypeTag(reader, module);

    // Stream of tagged values
    for (var i = 0; i < count; i++) {
      var value = deserializeValueWithKnownTag(reader, module, elementTypeTag);
      arr[i] = value;
    }
  };


  function deserializeObjectContents (reader, module, obj) {
    var shapeName = readTypeTag(reader, module);

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

      value = deserializeValueWithKnownTag(reader, module, tag);

      obj[fd.name] = value;
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


  function deserializeObjectTable (reader, module, tagByte) {
    var count = reader.readUint32();
    if (count === false)
      throw new Error("Truncated file");

    var table;
    if (common.PartitionedObjectTables) {
      table = module.objectTables[tagByte];
      if (!table)
        throw new Error("Table not found");
    } else {
      table = module.objects;
    }

    if (count !== table.length)
      throw new Error("Read " + count + " object(s) into table of length " + table.length);

    for (var i = 0; i < count; i++) {
      var obj = table[i];
      deserializeObjectContents(reader, module, obj);
    }
  };


  function allocateObjectTable (module, tagByte, shapeName, count) {
    var table = new Array(count);
    for (var i = 0; i < count; i++) {
      // TODO: Pre-allocate with known shape for better perf
      var o = new Object();

      if (shapeName !== "Object")
        o.type = shapeName;

      table[i] = o;
    };

    if (common.PartitionedObjectTables) {
      module.objectTables[tagByte] = table;
    } else {
      if (module.objects)
        throw new Error("Object table already allocated");
      else
        module.objects = table;
    }
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
    var arrayCount  = reader.readUint32();


    var readUtf8String = function (reader) { 
      var text = reader.readUtf8String();
      if (text === false)
        throw new Error("Truncated file");
      return text;
    };

    console.time("  read tags");
    result.tags = deserializeTable(reader, readUtf8String);
    console.timeEnd("  read tags");


    console.time("  read object table directory");
    var objectTableCount = reader.readUint32();
    var objectTableNames = new Array(objectTableCount);

    for (var i = 0; i < objectTableCount; i++) {
      var tableType = objectTableNames[i] = reader.readUtf8String();
      var tableCount = reader.readUint32();

      allocateObjectTable(result, i, tableType, tableCount);
    }
    console.timeEnd("  read object table directory");


    console.time("  read string tables");
    result.strings = deserializeTable(reader, readUtf8String);
    console.timeEnd("  read string tables");


    result.arrays    = new Array(arrayCount);
    for (var i = 0; i < arrayCount; i++) {
      // FIXME: This means we have to grow it when repopulating it. :-(
      var a = new Array();

      result.arrays[i] = a;
    }

    console.time("  read objects");
    for (var i = 0; i < objectTableCount; i++) {
      deserializeObjectTable(reader, result, i);
    }
    console.timeEnd("  read objects");

    console.time("  read arrays");
    deserializeArrays(reader, result);
    console.timeEnd("  read arrays");

    try {
      result.root = deserializeValueWithKnownTag(reader, result, "any");
      if (!result.root)
        throw new Error("Failed to retrieve root from module");
    } catch (err) {
      console.log(result.objects.length, result.arrays.length);
      throw err;
    }

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