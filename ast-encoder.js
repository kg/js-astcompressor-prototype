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


  function JsAstModule () {
    this.strings     = new StringTable("String");
    this.typeNames   = new StringTable("TypeName");

    this.arrays      = new ObjectTable("Array");
    this.objects     = new ObjectTable("Object");

    this.root_id     = null;
  };


  // Converts an esprima ast into a JsAstModule.
  function astToModule (root) {
    var result = new JsAstModule();

    var walkCallback = function astToModule_walkCallback (key, typeToken, table, value) {
      if (typeof (key) === "string")
        result.strings.add(key);

      if (table)
        table.add(value);
    };

    astutil.mutate(root, function visit (context, node) {
      if (!node)
        return;

      var nodeTable;

      // TODO: Dedupe objects and arrays somehow?
      // The AST will never contain a cycle, and once decoded
      //  it isn't going to get mutated in-place, so instances 
      //  sharing is fine.
      // Many literals, subtrees, zero-element arrays and such are 
      //  probably frequently reused.
      // If done properly this could collapse common subtrees into
      //  a single table reference.
      if (Array.isArray(node)) {
        nodeTable = result.arrays;

        for (var i = 0, l = node.length; i < l; i++)
          result.walkValue(i, node[i], walkCallback);

      } else {
        nodeTable = result.objects;

        /*
        // HACK: esprima literals duplicate data with a nonstandard 'raw' key
        if (node.type === "Literal")
          delete node["raw"];
        */

        result.walkObject(node, walkCallback);
      }

      nodeTable.add(node);
    });

    result.root_id = result.objects.get_id(root);

    return result;
  };


  function serializeUtf8String (result, text) {
    // UGH

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

    var bytes = new Uint8Array(4 + lengthBytes);

    (new DataView(bytes.buffer, 0, 4)).setUint32(0, lengthBytes, true);

    encoding.UTF8.encode(text, bytes, 4);

    result.push(bytes);
  };


  JsAstModule.prototype.deduplicateObjects = function () {
    var objects = this.objects;
    var count = 0, originalCount = objects.count;
    var lookupTable = Object.create(null);

    objects.forEach(function deduplicateObjects_callback (id) {
      // FIXME: This is a gross hack where we do deduplication
      //  based on JSON-serializing the object and using that to
      //  find duplicates.
      // A tree-walking comparison or something would probably be better.
      // The main problem with this current approach is that the stringify
      //  ends up walking over child nodes many, many times because it has
      //  to stringify the whole tree from the root and do so each time it
      //  walks down the tree.
      // An approach where we walk up from the leaves to the root deduplicating
      //  would be much faster.

      var obj = id.get_value();
      var objJson = JSON.stringify(obj);

      var existing = lookupTable[objJson];

      if (existing && existing.equals(id)) {
        // Do nothing
      } else if (existing) {
        count += 1;
        objects.dedupe(id, existing);
      } else {
        lookupTable[objJson] = id;
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
        if (key === "type")
          callback(key, "t", this.typeNames, value);
        else
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


  function serializeValue (dataView, offset, typeToken, value) {
    var typeCode = typeToken.charCodeAt(0) | 0;

    dataView.setUint8(offset, typeCode, true);
    offset += 1;

    if ((typeof (value) === "undefined") || (value === null)) {
    } else if (typeof (value) === "object") {
      var index = value.get_index();
      dataView.setUint32(offset, index, true);
      offset += 4;
    } else if (typeof (value) === "number") {
      if (typeToken === "i") {
        dataView.setInt32(offset, value, true);
        offset += 4;
      } else {
        dataView.setFloat64(offset, value, true);
        offset += 8;
      }
    } else {
      console.log("Unhandled value [" + typeToken + "]", value);
    }

    return offset;
  }


  JsAstModule.prototype.serializeObject = function (result, node) {
    if (Array.isArray(node))
      throw new Error("Should have used serializeArray");

    var strings = this.strings;
    var triplets = [];

    this.walkObject(node, function serializeObject_walkCallback (key, typeToken, table, value) {
      var keyIndex = strings.get_index(key);

      if (table) {
        var id = table.get_id(value);
        if (!id)
          throw new Error("Value not interned: " + value);
        else if (typeof (id.get_index()) !== "number")
          throw new Error("Value has no index: " + value);

        triplets.push([keyIndex, typeToken, id]);
      } else {
        triplets.push([keyIndex, typeToken, value]);
      }
    });

    //                   float64  key  tag
    var tripletMaxSize = 8        + 4  + 1;

    var tripletBytes = new Uint8Array(8 + tripletMaxSize * triplets.length);
    var tripletView = new DataView(tripletBytes.buffer);
    var offset = 8;

    tripletView.setUint32(4, triplets.length, true);

    for (var i = 0, l = triplets.length; i < l; i++) {
      var triplet = triplets[i];

      var keyIndex  = triplet[0] | 0;
      var typeToken = triplet[1];
      var value     = triplet[2];

      tripletView.setUint32(offset, keyIndex, true);
      offset += 4;

      offset = serializeValue(tripletView, offset, typeToken, value);
    }

    // Write a length header so you can skip the object body
    tripletView.setUint32(0, offset - 4, true);
    result.push(tripletBytes.slice(0, offset));
  };


  JsAstModule.prototype.serializeArray = function (result, node) {
    if (!Array.isArray(node))
      throw new Error("Should have used serializeObject");

    var serialized = [];

    //                float64  tag
    var pairMaxSize = 8        + 1;

    var pairBytes = new Uint8Array(8 + pairMaxSize * node.length);
    var pairView = new DataView(pairBytes.buffer);
    var offset = 8;

    pairView.setUint32(4, node.length, true);

    var walkCallback = function (key, typeToken, table, value) {
      if (table) {
        var id = table.get_id(value);
        if (!id)
          throw new Error("Value not interned: " + value);
        else if (typeof (id.get_index()) !== "number")
          throw new Error("Value has no index: " + value);

        offset = serializeValue(pairView, offset, typeToken, id);
      } else {
        offset = serializeValue(pairView, offset, typeToken, value);
      }
    };

    for (var i = 0, l = node.length; i < l; i++)
      this.walkValue(i, node[i], walkCallback);

    // Write a length header so you can skip the array body
    pairView.setUint32(0, offset - 4, true);
    result.push(pairBytes.slice(0, offset));
  };


  JsAstModule.prototype.serializeTable = function (result, table, serializeEntry) {
    var finalized = table.finalize();

    var countBytes = new Uint8Array(4);    
    (new DataView(countBytes.buffer, 0, 4)).setUint32(0, finalized.length, true);
    result.push(countBytes);

    for (var i = 0, l = finalized.length; i < l; i++) {
      var id = finalized[i];
      var value = id.get_value();

      // gross
      serializeEntry.call(this, result, value);
    }
  };


  // Converts a JsAstModule into a sequence of typed arrays, 
  //  suitable for passing to the Blob constructor.
  function serializeModule (module) {
    var result = [common.Magic];

    serializeUtf8String(result, common.FormatName);

    /*
    module.serializeTable(result, module.identifiers, serializeUtf8String);
    */

    module.deduplicateObjects();

    module.typeNames.finalize();
    module.strings  .finalize();
    module.arrays   .finalize();
    module.objects  .finalize();

    var writeUint32 = function (value) {
      var tempBytes = new Uint8Array(4);
      (new DataView(tempBytes.buffer, 0, 4)).setUint32(0, value, true);
      result.push(tempBytes);
    };

    writeUint32(module.root_id.get_index());

    // We write out the lengths in advance of the (length-prefixed) tables.
    // This allows a decoder to preallocate space for all the tables and
    //  use that to reconstruct relationships in a single pass.
    writeUint32(module.typeNames.get_count());
    writeUint32(module.strings.get_count());
    writeUint32(module.objects.get_count());
    writeUint32(module.arrays.get_count());

    module.serializeTable(result, module.typeNames, serializeUtf8String);
    module.serializeTable(result, module.strings,   serializeUtf8String);
    module.serializeTable(result, module.objects,   module.serializeObject);
    module.serializeTable(result, module.arrays,    module.serializeArray);

    return result;
  };


  exports.astToModule = astToModule;
  exports.serializeModule = serializeModule;
}));