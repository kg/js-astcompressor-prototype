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
      ObjectTable = common.ObjectTable,
      GetObjectId = common.GetObjectId;


  function ValueWriter () {
    // HACK: Max size 32mb because growable buffers are effort
    var maxSize = (1024 * 1024) * 32;

    this.bytes    = new Uint8Array(maxSize);
    this.position = 0;
    this.view     = new DataView(this.bytes.buffer);

    this.tagBytesWritten = 0;
    this.varintSizes = [0, 0, 0, 0, 0, 0];
  };

  ValueWriter.prototype.getPosition = function () {
    return this.position;
  };

  ValueWriter.prototype.skip = function (distance) {
    this.position += distance;
  };

  ValueWriter.prototype.write = 
  ValueWriter.prototype.writeByte = function (b) {
    if (this.position >= this.bytes.length)
      throw new Error("buffer full");

    this.bytes[this.position++] = b;
  };

  ValueWriter.prototype.writeBytes = function (bytes, offset, count) {
    if (this.position >= this.bytes.length)
      throw new Error("buffer full");

    if (arguments.length === 1) {
      this.bytes.set(bytes, this.position);
      this.position += bytes.length;
      return;
    } else if (arguments.length === 3) {
      offset |= 0;
      count |= 0;
    } else {
      throw new Error("Expected (bytes) or (bytes, offset, count)");
    }

    this.bytes.set(bytes.subarray(offset, offset + count), this.position);
    this.position += count;
  };

  ValueWriter.prototype.writeScratchBytes = function (count) {
    this.writeBytes(this.scratchBytes, 0, count);
  };

  ValueWriter.prototype.writeTagByte = function (tagByte) {
    this.writeByte(tagByte);
    this.tagBytesWritten += 1;
  };

  ValueWriter.prototype.writeUint32 = function (value) {
    this.view.setUint32(this.position, value, true);
    this.position += 4;
  };

  ValueWriter.prototype.writeInt32 = function (value) {
    this.view.setInt32(this.position, value, true);
    this.position += 4;
  };

  ValueWriter.prototype.writeVarUint32 = function (value) {
    if (common.EnableVarints) {
      var before = this.position;
      common.writeLEBUint32(this, value);
      var after = this.position;
      var lengthBytes = after - before;
      this.varintSizes[lengthBytes - 1] += 1;
    } else {
      this.writeUint32(value);
    }
  };

  ValueWriter.prototype.writeIndex = function (value) {
    if (value === 0xFFFFFFFF)
      this.writeVarUint32(0);
    else
      this.writeVarUint32(value + 1);
  };

  ValueWriter.prototype.writeFloat64 = function (value) {
    this.view.setFloat64(this.position, value, true);
    this.position += 8;
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

    this.writeVarUint32(lengthBytes);
    encoding.UTF8.encode(text, this);
  };

  ValueWriter.prototype.getResult = 
  ValueWriter.prototype.toArray = function () {
    return this.bytes.subarray(0, this.position);
  };


  function JsAstModule (shapes) {
    this.strings = new StringTable("String");
    this.arrays  = new ObjectTable("Array");
    this.objects = new ObjectTable("Object");

    this.shapes  = shapes;

    this.root_id = null;
  };

  function test () {
    var a, b, c, d, e, f, g, h, i, j, k;
    var b1, b2;
    
    i[b >> 0] = f;
    if (c << 24 >> 24 != f << 24 >> 24) {
        e = d + 56 | 0;
        g = k[e >> 2] | 0;
        if (g) {
            k[g + 56 >> 2] = 0;
            k[e >> 2] = 0
        }
    } else f = c;
    if (f << 24 >> 24 != 0 ? (b2(3, h), c << 24 >> 24 != (i[b >> 0] | 0)) : 0) b1(d);
  };


  // Converts an esprima ast into a JsAstModule.
  function astToModule (root, shapes) {
    var result = new JsAstModule(shapes);

    var walkedCount = 0;
    var progressInterval = 100000;

    var walkCallback = function astToModule_walkCallback (key, typeToken, table, value) {
      if (table && (value !== null))
        table.add(value);

      walkedCount++;
      if ((walkedCount % progressInterval) === 0) {
        console.log("Scanned " + walkedCount + " nodes");
        // console.log(key, value);
      }
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
        nodeTable = result.objects;

        result.walkObject(node, walkCallback);
      }

      nodeTable.add(node);
    });

    result.root_id = result.objects.get_id(root);

    return result;
  };


  JsAstModule.prototype.deduplicateObjects = function () {
    var objects = this.objects;
    var count = 0, originalCount = objects.count;

    // Assign temporary unique indices to all observed values
    var temporaryIndices = Object.create(null);
    var nextTemporaryIndex = 0;
    // On first visit to an object generate a content string
    var contentStrings = Object.create(null);
    var cycleSentinel = Object.create(null);
    // Lookup table by content string, for deduping
    var objectsByContentString = Object.create(null);

    function getTemporaryIndex (value) {
      var existing = temporaryIndices[value];
      if (typeof (existing) !== "number") {
        temporaryIndices[value] = existing = nextTemporaryIndex++;
      }

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
      var id = GetObjectId(obj);
      var existing = contentStrings[id];

      if (existing === cycleSentinel) {
        return id;
      } else if (typeof (existing) !== "string") {
        contentStrings[id] = cycleSentinel;

        existing = generateContentString(obj);

        contentStrings[id] = existing;
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

      var existing = objectsByContentString[objCS];

      if (existing && existing.equals(id)) {
        // Do nothing
      } else if (existing) {
        count += 1;
        objects.dedupe(id, existing);
      } else {
        objectsByContentString[objCS] = id;
      }
    });

    // We shouldn't need more than one pass since we were doing structural 
    //  deduplication - all possibly deduplicated objects should get caught
    //  in the first pass by looking at structure instead of for matching IDs

    console.log("Deduped " + count + " object(s) (" + (count / originalCount * 100.0).toFixed(1) + "%)");
  };


  JsAstModule.prototype.walkValue = function (key, value, callback, callbackArg) {
    switch (typeof (value)) {
      case "string":
        callback(key, "s", this.strings, value, callbackArg);
        break;

      case "number":
        var i = value | 0;
        if (i === value)
          callback(key, "i", null, i, callbackArg);
        else
          callback(key, "d", null, value, callbackArg);
        break;

      case "object":
        if (Array.isArray(value))
          callback(key, "a", this.arrays, value, callbackArg);
        else
          callback(key, "o", this.objects, value, callbackArg);
        break;

      case "boolean":
        callback(key, "b", null, value, callbackArg);
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


  function serializeValue (writer, integral, value) {
    if (typeof (value) === "undefined") {
    } else if (typeof (value) === "object") {
      var index;
      if (value === null) {
        // Encode nulls as 0xFFFFFFFF table indices.
        // Inefficient, but provides for typed nulls and
        //  eliminates the 'n' type tag
        index = 0xFFFFFFFF;
      } else {
        index = value.get_index();
      }
      writer.writeIndex(index);
    } else if (typeof (value) === "number") {
      if (integral) {
        writer.writeInt32(value);
      } else {
        writer.writeFloat64(value);
      }
    } else if (typeof (value) === "boolean") {
      writer.writeByte(value ? 1 : 0);
    } else {
      console.log("Unhandled value", value);
    }
  }

  function extractSerializationValue (
    table, value
  ) {
    if (table && (value !== null)) {
      var id = table.get_id(value);
      if (!id)
        throw new Error("Value not interned: " + value);
      else if (typeof (id.get_index()) !== "number")
        throw new Error("Value has no index: " + value);

      return id;
    }

    return value;
  }

  function serializePair (
    writer, serializeValue, 
    key, typeToken, table, value
  ) {
    var typeCode = typeToken.charCodeAt(0) | 0;

    writer.writeTagByte(typeCode);

    var serializationValue = extractSerializationValue(table, value);

    serializeValue(
      writer, typeToken === "i", serializationValue
    );
  };


  JsAstModule.prototype.serializeObject = function (writer, node) {
    if (Array.isArray(node))
      throw new Error("Should have used serializeArray");

    var shapeName = node[this.shapes.shapeKey];
    if (typeof (shapeName) !== "string") {
      // HACK for esprima nonsense
      if (Object.getPrototypeOf(node) === RegExp.prototype)
        shapeName = "RegExp";
    }

    var shape = this.shapes.get(shapeName);
    if (!shape) {
      console.log(shapeName, node, Object.getPrototypeOf(node), node.toString());
      throw new Error("Unknown shape " + shapeName);
    }

    var shapeNameIndex = this.strings.get_index(shapeName);

    writer.writeIndex(shapeNameIndex);

    var walkCallback = function (key, typeToken, table, value, fieldDefinition) {
      // If the type is known, omit the type tag
      if (Array.isArray(fieldDefinition.type)) {
        var serializationValue = extractSerializationValue(table, value);
        serializeValue(writer, true, serializationValue);

      } else switch (fieldDefinition.type) {
        case "Boolean":
          writer.writeByte(value ? 1 : 0);
          break;

        case "String":
          var serializationValue = extractSerializationValue(table, value);
          serializeValue(writer, true, serializationValue);
          break;

        case "Object":
        default:
          if (
            (typeof (value) !== "object") || 
            Array.isArray(value)
          ) {
            console.log(value);
            throw new Error("Unexpected type '" + typeof(value) + "' for field '" + key + "'");
          }

          var serializationValue = extractSerializationValue(table, value);
          serializeValue(writer, true, serializationValue);
          break;

        case "Any":
          // Variant; emit type tag
          serializePair(
            writer, serializeValue,
            key, typeToken, table, value
          );

          break;
      }
    };

    var self = this, fields = shape.fields;
    for (var i = 0, l = fields.length; i < l; i++) {
      var fd = fields[i];
      var value = node[fd.name];

      if (typeof (value) === "undefined")
        value = null;

      self.walkValue(fd.name, value, walkCallback, fd);
    }
  };


  JsAstModule.prototype.serializeArray = function (writer, node) {
    if (!Array.isArray(node))
      throw new Error("Should have used serializeObject");

    writer.writeVarUint32(node.length);

    // HACK: Identify arrays where all elements live in the same table.
    // This is to compensate for this prototype not using static type information
    //  from the shapes table when compressing arrays.
    // (A real implementation would not have this problem.)
    var commonType;
    for (var i = 0, l = node.length; i < l; i++) {
      var item = node[i];
      var itemType;

      if (item === null)
        continue;

      if (Array.isArray(item))
        itemType = "array";
      else
        itemType = typeof(item);

      if (typeof (commonType) === "undefined")
        commonType = itemType;
      else if (itemType !== commonType) {
        commonType = undefined;
        break;
      }
    }

    // If the common type is in our table, encode without type tags
    var commonTypeIndex = common.CommonTypes.indexOf(commonType);
    if (commonTypeIndex >= 0) {
      writer.writeByte(commonTypeIndex);

      for (var i = 0, l = node.length; i < l; i++) {
        this.walkValue(i, node[i], function (key, typeToken, table, value) {
          var serializationValue = extractSerializationValue(table, value);
          serializeValue(writer, true, serializationValue);
        });
      }
    } else {
      writer.writeByte(0xFF);

      for (var i = 0, l = node.length; i < l; i++) {
        this.walkValue(i, node[i], function (a, b, c, d) {
          serializePair(
            writer, serializeValue,
            a, b, c, d
          );
        });
      }
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
  function serializeModule (module, byteWriter, stats) {
    var writer = new ValueWriter();

    writer.writeBytes(common.Magic);
    writer.writeUtf8String(common.FormatName);

    /*
    module.serializeTable(writer, module.identifiers, serializeUtf8String);
    */

    module.strings.finalize(true);

    module.arrays .finalize(true);
    module.objects.finalize(true);

    writer.writeUint32(module.root_id.get_index());

    // We write out the lengths in advance of the (length-prefixed) tables.
    // This allows a decoder to preallocate space for all the tables and
    //  use that to reconstruct relationships in a single pass.

    var stringCount = module.strings.get_count();
    var objectCount = module.objects.get_count();
    var arrayCount  = module.arrays.get_count();

    writer.writeUint32(stringCount);
    writer.writeUint32(objectCount);
    writer.writeUint32(arrayCount);

    module.serializeTable(writer, module.strings, true,  function (writer, value) {
      writer.writeUtf8String(value);
    });
    module.serializeTable(writer, module.objects, true,  module.serializeObject);
    module.serializeTable(writer, module.arrays,  true,  module.serializeArray);

    console.log("tag bytes written:", writer.tagBytesWritten);
    console.log("varint sizes:", writer.varintSizes);

    return writer.toArray();
  };


  // Esprima is a nightmare that deviates from reflect.parse in unhelpful ways
  function esprimaCleanup (root) {
    var newRoot = astutil.mutate(root, function (context, node) {
      if (!node)
        return;

      if (node.type === "Literal") {
        // FIXME: UGH esprima/escodegen completely mangle literals
        delete node["raw"];
        delete node["regex"];
      }
    });

    return newRoot;
  };


  exports.ShapeTable = common.ShapeTable;

  exports.astToModule = astToModule;
  exports.serializeModule = serializeModule;
  exports.esprimaCleanup = esprimaCleanup;
}));