'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['exports'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports);
  } else {
    factory((root.astEncoder = {}));
  }
}(this, function (exports) {
  var common = require("./ast-common.js");

  var NamedTable  = common.NamedTable,
      UniqueTable = common.UniqueTable,
      StringTable = common.StringTable,
      ObjectTable = common.ObjectTable;


  function ValueWriter () {
    // HACK: Max size 32mb because growable buffers are effort
    var maxSize = (1024 * 1024) * 32;

    this.bytes      = new Uint8Array(maxSize);
    this.byteWriter = encoding.makeByteWriter(this.bytes, 0);

    this.scratchBytes = new Uint8Array(128);
    this.scratchView  = new DataView(this.scratchBytes.buffer);
  }

  ValueWriter.prototype.writeByte = function (b) {
    this.byteWriter.write(b);
  };

  ValueWriter.prototype.writeBytes = function (bytes, offset, count) {
    if (arguments.length === 1) {
      offset = 0;
      count = bytes.length | 0;
    } else if (arguments.length === 3) {
      offset |= 0;
      count |= 0;
    } else {
      throw new Error("Expected (bytes) or (bytes, offset, count)");
    }

    for (var i = 0; i < count; i++)
      this.byteWriter.write(bytes[offset + i]);
  };

  ValueWriter.prototype.writeScratchBytes = function (count) {
    this.writeBytes(this.scratchBytes, 0, count);
  };

  ValueWriter.prototype.writeUint32 = function (value) {
    this.scratchView.setUint32(0, value, true);
    this.writeScratchBytes(4);
  };

  ValueWriter.prototype.writeInt32 = function (value) {
    this.scratchView.setInt32(0, value, true);
    this.writeScratchBytes(4);
  };

  ValueWriter.prototype.writeVarUint32 = function () {
    common.writeLEBUint32(this.byteWriter);
  };

  ValueWriter.prototype.writeFloat64 = function (value) {
    this.scratchView.setFloat64(0, value, true);
    this.writeScratchBytes(8);
  };

  ValueWriter.prototype.writeUtf8String = function (text) {
    var lengthBytes = 0;
    var counter = {
      write: function (byte) {
        lengthBytes += 1;
      },
      getResult: function () {
      }
    };

    // Encode but discard bytes to compute length
    encoding.UTF8.encode(text, counter);

    this.writeUint32(lengthBytes);
    encoding.UTF8.encode(text, this.byteWriter);
  };

  ValueWriter.prototype.toArray = function () {
    return this.byteWriter.getResult();
  };



  function JsAstModule () {
    this.strings = new StringTable("String");

    this.keysets = new NamedTable("Keyset");

    this.arrays  = new ObjectTable("Array");
    this.objects = new ObjectTable("Object");

    this.root_id     = null;
  };


  // Converts an esprima ast into a JsAstModule.
  function astToModule (root) {
    var result = new JsAstModule();

    var walkCallback = function astToModule_walkCallback (key, typeToken, table, value) {
      if (table)
        table.add(value);
    };

    astutil.mutate(root, function visit (context, node) {
      if (!node)
        return;

      var nodeTable;

      if (Array.isArray(node)) {
        nodeTable = result.arrays;

        for (var i = 0, l = node.length; i < l; i++)
          result.walkValue(i, node[i], walkCallback);

      } else {
        var keyset = Object.keys(node);
        keyset.sort();
        var keysetJson = JSON.stringify(keyset);

        result.keysets.add(keysetJson, keyset, false);

        nodeTable = result.objects;

        result.walkObject(node, walkCallback);
      }

      nodeTable.add(node);
    });

    result.root_id = result.objects.get_id(root);

    return result;
  };


  function serializeKeyset (writer, keyset) {
    // FIXME: Store as series of stringtable indices?
    //  Doesn't matter if we end up with small # of keysets, ultimately.
    var json = JSON.stringify(keyset);
    writer.writeUtf8String(json);
  };


  JsAstModule.prototype.deduplicateObjects = function () {
    var objects = this.objects;
    var count = 0, originalCount = objects.count;

    // Assign temporary unique indices to all observed values
    var temporaryIndices = new Map();
    var nextTemporaryIndex = 0;
    // On first visit to an object generate a content string
    var contentStrings = new Map();
    var cycleSentinel = new Object();
    // Lookup table by content string, for deduping
    var objectsByContentString = new Map();

    function getTemporaryIndex (value) {
      var existing = temporaryIndices.get(value);
      if (!existing)
        temporaryIndices.set(value, existing = nextTemporaryIndex++);

      return existing;
    };

    function generateContentString (obj) {
      var result = "";

      for (var k in obj) {
        if (!obj.hasOwnProperty(k))
          continue;

        var v = obj[k];

        if (typeof (v) === "object") {
          if (v === null) {
            result += "n";
          } else {
            var cs = getContentString(v);
            result += "[" + cs + "]";
          }
        } else {
          var id = getTemporaryIndex(v);
          var hexId = id.toString(16);

          if (result !== "")
            result += " ";

          result += hexId;
        }
      }

      return result;
    };

    function getContentString (obj) {
      var existing = contentStrings.get(obj);

      if (existing === cycleSentinel) {
        return getTemporaryIndex(obj);
      } else if (!existing) {
        contentStrings.set(obj, cycleSentinel);

        existing = generateContentString(obj);

        contentStrings.set(obj, existing);
      }

      return existing;
    };

    objects.forEach(function deduplicateObjects_callback (id) {
      // FIXME: This is a gross hack where we do deduplication
      //  based on shallowly serializing the object and using that to
      //  find duplicates.
      // A tree-walking comparison or something would probably be better.
      // An approach where we walk up from the leaves to the root deduplicating
      //  might be faster.

      var obj = id.get_value();
      var objCS = getContentString(obj);

      var existing = objectsByContentString.get(objCS);

      if (existing && existing.equals(id)) {
        // Do nothing
      } else if (existing) {
        count += 1;
        objects.dedupe(id, existing);
      } else {
        objectsByContentString.set(objCS, id);
      }
    });

    // We shouldn't need more than one pass since we were doing structural 
    //  deduplication - all possibly deduplicated objects should get caught
    //  in the first pass by looking at structure instead of for matching IDs

    console.log("Deduped " + count + " object(s) (" + (count / originalCount * 100.0).toFixed(1) + "%)");
  };


  JsAstModule.prototype.walkValue = function (key, value, callback) {
    switch (typeof (value)) {
      case "string":
        callback(key, "s", this.strings, value);
        break;

      case "number":
        var i = value | 0;
        if (i === value)
          callback(key, "i", null, i);
        else
          callback(key, "d", null, value);
        break;

      case "object":
        if (value === null)
          callback(key, "N");
        else if (Array.isArray(value))
          callback(key, "a", this.arrays, value);
        else
          callback(key, "o", this.objects, value);
        break;

      case "boolean":
        callback(key, value ? "T" : "F");
        break;

      default:
        throw new Error("Unhandled value type " + typeof (value));
    }      
  };


  JsAstModule.prototype.walkObject = function (node, callback) {
    for (var k in node) {
      if (!node.hasOwnProperty(k))
        continue;

      var v = node[k];

      this.walkValue(k, v, callback);
    }
  };


  function serializeValue (writer, typeToken, value) {
    var typeCode = typeToken.charCodeAt(0) | 0;

    writer.writeByte(typeCode);

    if ((typeof (value) === "undefined") || (value === null)) {
    } else if (typeof (value) === "object") {
      var index = value.get_index();
      writer.writeUint32(index);
    } else if (typeof (value) === "number") {
      if (typeToken === "i") {
        writer.writeInt32(value);
      } else {
        writer.writeFloat64(value);
      }
    } else {
      console.log("Unhandled value [" + typeToken + "]", value);
    }
  }


  function serializePair (
    writer, serializeValue, 
    key, typeToken, table, value
  ) {
    if (table) {
      var id = table.get_id(value);
      if (!id)
        throw new Error("Value not interned: " + value);
      else if (typeof (id.get_index()) !== "number")
        throw new Error("Value has no index: " + value);

      serializeValue(writer, typeToken, id);
    } else {
      serializeValue(writer, typeToken, value);
    }
  };


  JsAstModule.prototype.serializeObject = function (writer, node) {
    if (Array.isArray(node))
      throw new Error("Should have used serializeArray");

    var keyset = Object.keys(node);
    keyset.sort();
    var keysetJson = JSON.stringify(keyset);

    var keysetIndex = this.keysets.get_index(keysetJson);
    if (typeof (keysetIndex) === "undefined") {
      throw new Error("Keyset not in table: " + keysetJson);
    }

    writer.writeUint32(keysetIndex);

    for (var i = 0, l = keyset.length; i < l; i++) {
      var key = keyset[i];
      var value = node[key];

      this.walkValue(key, value, function (a, b, c, d) {
        serializePair(
          writer, serializeValue,
          a, b, c, d
        );
      });
    }
  };


  JsAstModule.prototype.serializeArray = function (writer, node) {
    if (!Array.isArray(node))
      throw new Error("Should have used serializeObject");

    writer.writeUint32(node.length);

    for (var i = 0, l = node.length; i < l; i++) {
      this.walkValue(i, node[i], function (a, b, c, d) {
        serializePair(
          writer, serializeValue,
          a, b, c, d
        );
      });
    }
  };


  JsAstModule.prototype.serializeTable = function (writer, table, ordered, serializeEntry) {
    var finalized = table.finalize(ordered);

    writer.writeUint32(finalized.length);

    for (var i = 0, l = finalized.length; i < l; i++) {
      var id = finalized[i];
      var value = id.get_value();

      // gross
      serializeEntry.call(this, writer, value);
    }
  };


  // Converts a JsAstModule into bytes and writes them into byteWriter.
  function serializeModule (module, byteWriter) {
    var writer = new ValueWriter();

    writer.writeBytes(common.Magic);
    writer.writeUtf8String(common.FormatName);

    /*
    module.serializeTable(writer, module.identifiers, serializeUtf8String);
    */

    module.strings.finalize(true);
    module.keysets.finalize(true);

    module.arrays .finalize(true);
    module.objects.finalize(true);

    writer.writeUint32(module.root_id.get_index());

    // We write out the lengths in advance of the (length-prefixed) tables.
    // This allows a decoder to preallocate space for all the tables and
    //  use that to reconstruct relationships in a single pass.
    writer.writeUint32(module.strings.get_count());
    writer.writeUint32(module.keysets.get_count());
    writer.writeUint32(module.objects.get_count());
    writer.writeUint32(module.arrays.get_count());

    module.serializeTable(writer, module.strings, true,  function (writer, value) {
      writer.writeUtf8String(value);
    });
    module.serializeTable(writer, module.keysets, true,  serializeKeyset);
    module.serializeTable(writer, module.objects, true,  module.serializeObject);
    module.serializeTable(writer, module.arrays,  true,  module.serializeArray);

    return writer.toArray();
  };


  exports.astToModule = astToModule;
  exports.serializeModule = serializeModule;
}));