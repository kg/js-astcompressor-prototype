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
  var treeBuilder = require("./parse/treebuilder.js");

  var AsmlikeJsonTreeBuilder = treeBuilder.AsmlikeJSON;  
  var NamedTable   = common.NamedTable,
      UniqueTable  = common.UniqueTable,
      StringTable  = common.StringTable,
      ObjectTable  = common.ObjectTable,
      GetObjectId  = common.GetObjectId,
      NextObjectId = common.NextObjectId;

  var IoTrace = false;
  var TraceInlining = false;

  function ValueWriter (capacity, parent) {
    if (typeof (capacity) !== "number")
      // HACK: Default max size 128mb because growable buffers are effort
      capacity = (1024 * 1024) * 128;

    this.bytes    = new Uint8Array(capacity);
    this.position = 0;
    this.view     = new DataView(this.bytes.buffer);

    if (parent)
      this.varintSizes = parent.varintSizes;
    else
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

  ValueWriter.prototype.writeUint24 = function (value) {
    var masked = value & 0xFFFFFF;
    if (masked !== value)
      throw new Error("Value is larger than 24 bits");

    if (IoTrace)
      console.log("write uint24", masked.toString(16));

    this.view.setUint32(this.position, masked, true);
    this.position += 3;
  };

  ValueWriter.prototype.writeUint32 = function (value) {
    if (IoTrace)
      console.log("write uint", value.toString(16));

    this.view.setUint32(this.position, value, true);
    this.position += 4;
  };

  ValueWriter.prototype.writeInt32 = function (value) {
    if (IoTrace)
      console.log("write int", value.toString(16));

    this.view.setInt32(this.position, value, true);
    this.position += 4;
  };

  ValueWriter.prototype.writeVarUint32 = function (value) {
    if (common.EnableVarints) {
      if (IoTrace)
        console.log("write varuint", value.toString(16));

      var before = this.position;
      common.writeLEBUint32(this, value);
      var after = this.position;
      var lengthBytes = after - before;
      this.varintSizes[lengthBytes - 1] += 1;
    } else if (common.ThreeByteIndices) {
      this.writeUint24(value);
    } else {
      this.writeUint32(value);
    }
  };

  ValueWriter.prototype.writeVarInt32 = function (value) {
    if (common.EnableVarints) {
      if (IoTrace)
        console.log("write varint", value.toString(16));

      var before = this.position;
      common.writeLEBInt32(this, value);
      var after = this.position;
      var lengthBytes = after - before;
      this.varintSizes[lengthBytes - 1] += 1;
    } else {
      this.writeInt32(value);
    }
  };

  ValueWriter.prototype.writeRelativeIndex = function (value, base) {
    var relativeValue;

    if (value === 0xFFFFFFFF) {
      relativeValue = 0;
    } else {
      relativeValue = (value - base);  
      if (relativeValue >= 0)
        relativeValue += 1;
    }

    if (IoTrace)
      console.log(
        "write relindex " + 
        (
          (value === 0xFFFFFFFF)
            ? "null"
            : value
        ) + 
        " - " + base + " -> " + relativeValue
      );

    this.writeVarInt32(relativeValue);
  };

  ValueWriter.prototype.writeIndex = function (value) {
    if (value === 0xFFFFFFFF)
      this.writeVarUint32(0);
    else
      this.writeVarUint32(value + 1);
  };

  ValueWriter.prototype.writeFloat64 = function (value) {
    if (IoTrace)
      console.log("write float64", value.toFixed(4));

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

  ValueWriter.prototype.writeSubstream = function (otherWriter, description) {
    var sizeBytes = otherWriter.position;

    if (sizeBytes >= 16 * 1024)
      console.log(description + ": " + (sizeBytes / 1024).toFixed(2) + "KB");

    this.writeUint32(sizeBytes);

    this.writeBytes(otherWriter.bytes, 0, sizeBytes);

    this.writeUint32(sizeBytes);
  };

  ValueWriter.prototype.getResult = 
  ValueWriter.prototype.toArray = function () {
    return this.bytes.subarray(0, this.position);
  };


  function JsAstModule (shapes) {
    this.shapes  = shapes;

    // Used to store the inferred type tags for arrays during
    //  the initial tree-walk
    this.arrayTypeTags = new WeakMap();

    this.tags    = new StringTable("tag");
    this.strings = new StringTable("string");

    this.tags.add("any");
    this.tags.add("array");
    this.tags.add("object");
    this.tags.add("boolean");
    this.tags.add("string");
    this.tags.add("integer");
    this.tags.add("number");

    this.objects = new ObjectTable("object");

    this.valueStreams = Object.create(null);

    this.anyTypeValuesWritten = 0;

    this._getTableForTypeTag = this.getTableForTypeTag.bind(this);
  };


  JsAstModule.prototype.getObjectTable = function (nodeOrShape) {
    if (nodeOrShape === null)
      return null;

    return this.objects;
  };


  JsAstModule.prototype.getShapeForObject = function (obj) {
    var shapeName = obj[this.shapes.shapeKey];

    if (typeof (shapeName) !== "string") {
      // HACK so js RegExp instances can fit into this shape model
      if (
        (typeof (obj) === "object") &&
        (Object.getPrototypeOf(obj) === RegExp.prototype)
      )
        shapeName = "RegExp";
      else
        throw new Error("Unsupported object " + obj + " with shape name " + JSON.stringify(shapeName))
    }

    var shape = this.shapes.get(shapeName);
    if (!shape) {
      console.log(shapeName, obj, Object.getPrototypeOf(obj), obj.toString());
      throw new Error("Unknown shape " + shapeName);
    }

    var shapeTagIndex = null;
    if (this.tags.isFinalized) {
      shapeTagIndex = this.tags.get_index(shapeName);
    } else {
      this.tags.add(shapeName);
    }

    return {
      name: shapeName,
      shape: shape,
      tagIndex: shapeTagIndex
    };
  };


  JsAstModule.prototype.createValueStreams = function (writer) {
    var self = this;

    this.tags.forEach(function (entry) {
      var tag = entry.get_name();
      var size = 1024 * 1024 * 16;

      self.valueStreams[tag] = new ValueWriter(size, writer);
    });
  };


  JsAstModule.prototype.getValueWriterForField = function (defaultWriter, field, tag) {
    if (common.ValueStreamPerType) {
      var writer = this.valueStreams[tag];
      if (!writer)
        throw new Error("No value stream for tag '" + tag + "'");

      return writer;
    } else {
      return defaultWriter;
    }
  };


  JsAstModule.prototype.serializeFieldValue = function (writer, shape, field, value, baseIndex) {
    // FIXME: Hack together field definition type -> tag conversion
    var tag = common.pickTagForField(field, this._getTableForTypeTag);

    try {
      var specializedWriter = this.getValueWriterForField(writer, field, tag);
      this.serializeValueWithKnownTag(specializedWriter, value, tag, baseIndex);
    } catch (exc) {
      console.log("Failed while writing field " + field.name + " of type " + shape.name);
      throw exc;
    }
  };


  JsAstModule.prototype.serializeObject = function (writer, node, index) {
    if (Array.isArray(node))
      throw new Error("Should have used serializeArray");

    var shape = this.getShapeForObject(node);
    if (shape.tagIndex === null)
      throw new Error("Tag table not finalized");

    if (IoTrace)
      console.log("// object body #" + index);
    
    writer.writeVarUint32(shape.tagIndex);

    var self = this, fields = shape.shape.fields;
    for (var i = 0, l = fields.length; i < l; i++) {
      var fd = fields[i];
      var value = node[fd.name];

      if (typeof (value) === "undefined")
        value = null;

      this.serializeFieldValue(writer, shape, fd, value, index);

      if (IoTrace)
        console.log("// " + fd.name + " =", value);      
    }
  };


  JsAstModule.prototype.getTypeTagForValue = function (value) {
    var jsType = typeof (value);

    if (value === null)
      return "null";

    switch (jsType) {
      case "string":
        return "string";

      case "boolean":
        return value ? "true" : "false";

      case "number":
        var i = value | 0;
        if (i === value)
          return "integer";
        else
          return "double";

      case "object":
        if (Array.isArray(value)) {
          return "array";
        } else {
          var shape = this.getShapeForObject(value);
          return shape.name;
        }

      default: {
        throw new Error("Unhandled value type " + jsType);
      }
    }       
  };


  JsAstModule.prototype.getIndexForTypeTag = function (tag) {
    return this.tags.get_index(tag);
  };


  JsAstModule.prototype.getTableForTypeTag = function (tag, actualValueTag) {
    if (actualValueTag === "null")
      return null;

    if (tag === "string")
      return this.strings;
    else {
      var shape = this.shapes.get(tag);
      if (shape) {
        return this.getObjectTable(shape);
      } else if (tag === "object") {
        return this.getObjectTable("object");
      } else {
        return null;
      }
    }
  };


  // Or unknown tag, if you pass 'any', because why not.
  JsAstModule.prototype.serializeValueWithKnownTag = function (writer, value, tag, baseIndex) {
    switch (tag) {
      case "true":
      case "false":
      case "null":
        // no-op. value is encoded by the type tag.
        return;

      case "boolean":
        writer.writeByte(value ? 1 : 0);
        return;

      case "integer":
        // TODO: varint?
        writer.writeInt32(value);
        return;

      case "double":
        writer.writeFloat64(value);
        return;

      case "any": {
        if (IoTrace)
          console.log("write any ->");

        // FIXME: gross.
        tag = this.getTypeTagForValue(value);
        if (tag === "any")
          throw new Error("Couldn't identify a tag for 'any' value");

        this.anyTypeValuesWritten += 1;
        var tagIndex = this.getIndexForTypeTag(tag);
        writer.writeVarUint32(tagIndex);

        return this.serializeValueWithKnownTag(writer, value, tag, baseIndex);
      }

      case "array":
        writer.writeVarUint32(value.length);
        if (value.length === 0)
          return;

        // The tree-walker figured out whether we need to use 'any' earlier
        var elementTag = this.arrayTypeTags.get(value);
        var elementTagIndex = this.getIndexForTypeTag(elementTag);
        writer.writeVarUint32(elementTagIndex);

        for (var i = 0; i < value.length; i++) {
          var element = value[i];
          this.serializeValueWithKnownTag(writer, element, elementTag, baseIndex);
        }

        return;

      case "object":
      default:
        break;
    }

    if (value === null) {
      writer.writeIndex(0xFFFFFFFF);
      return;
    }

    var actualValueTag = this.getTypeTagForValue(value);
    var table = this.getTableForTypeTag(tag, actualValueTag);
    if (!table)
      throw new Error("No table for value with tag '" + tag + "'");

    var isUntypedObject = (tag === "object");

    if ((actualValueTag !== tag) && !isUntypedObject)
      throw new Error("Shape information specified type '" + tag + "' but actual type is '" + actualValueTag + "'");

    if (IoTrace) {
      if (tag !== actualValueTag)
        console.log("write " + tag + " -> " + actualValueTag);
      else
        console.log("write " + tag);
    }

    try {
      var id = table.get_id(value);
      var index = id.get_index();

      if (id.is_omitted()) {
        var name = id.get_name();
        var shape = this.getShapeForObject(value);
        if (shape) {
          if (isUntypedObject) {
            var inlineTag = this.getTypeTagForValue(value);
            var inlineTagIndex = this.getIndexForTypeTag(tag);
            writer.writeVarUint32(inlineTagIndex);
            if (TraceInlining)
              console.log("Inlined untyped", shape.name, name);
          } else {
            if (TraceInlining)
              console.log("Inlined", shape.name, name);
          }

          this.serializeObject(writer, value, index || null);

          return;
        } else {
          throw new Error("Object without shape was omitted");
        }
      }

      // There's only one global object table, so we can encode everything
      //  as a single index.
      if (
        common.RelativeIndexes && 
        (typeof (baseIndex) === "number")
      ) {
        // FIXME: Sometimes baseIndex will be undefined/null if the parent was inlined
        writer.writeRelativeIndex(index, baseIndex)
      } else {
        writer.writeIndex(index);
      }
    } catch (err) {
      console.log("Failed while writing '" + tag + "'", value);
      throw err;
    }
  }


  JsAstModule.prototype.serializeArray = function (writer, node) {
    if (!Array.isArray(node))
      throw new Error("Should have used serializeObject");

    writer.writeVarUint32(node.length);
    if (node.length === 0)
      return;

    var tag = this.arrayTypeTags.get(node);
    if (!tag)
      throw new Error("No precomputed type tag for array");

    var tagIndex = this.getIndexForTypeTag(tag);
    writer.writeVarUint32(tagIndex);

    // FIXME: Use relative indexes here?
    for (var i = 0, l = node.length; i < l; i++) {
      this.serializeValueWithKnownTag(writer, node[i], tag, null);
    }
  };


  JsAstModule.prototype.serializeTable = function (writer, table, ordered, serializeEntry) {
    var finalized = table.finalize(0);

    writer.writeUint32(finalized.length);

    for (var i = 0, l = finalized.length; i < l; i++) {
      var id = finalized[i];
      var value = id.get_value();

      // gross
      serializeEntry.call(this, writer, value, i);
    }
  };


  JsAstModule.prototype.finalize = function () {
    this.tags   .finalize(0);
    this.strings.finalize(0);
    this.objects.finalize(0);
  };


  function JsAstModuleBuilder (shapes) {
    AsmlikeJsonTreeBuilder.call(this);

    this.result = new JsAstModule(shapes);

    this.walkedCount = 0;
    this.progressInterval = 100000;
  };

  JsAstModuleBuilder.prototype = Object.create(AsmlikeJsonTreeBuilder.prototype);  
  var _make = AsmlikeJsonTreeBuilder.prototype.make;

  JsAstModuleBuilder.prototype.make = function (key) {
    var result = _make.call(this, key);

    // FIXME: This is a slow operation. RIP
    Object.defineProperty(result, "__id__", {
      configurable: false,
      enumerable: false,
      value: NextObjectId()
    });

    return result;
  };

  JsAstModuleBuilder.prototype.finalizeArray = function (array) {
    if (array.length === 0)
      return;

    var commonTypeTag = null;

    for (var i = 0, l = array.length; i < l; i++) {
      var item = array[i];
      var tag = this.result.getTypeTagForValue(item);

      // HACK: We know that we don't have primitives mixed in
      //  with objects in arrays, so we can cheat here.
      if ((tag !== "string") && !Array.isArray(item)) {
        // console.log(tag, "-> object");
        tag = "object";
      }

      if (commonTypeTag === null) {
        commonTypeTag = tag;
      } else if (commonTypeTag !== tag) {
        console.log("tag mismatch", commonTypeTag, tag);
        commonTypeTag = null;
        break;
      }
    }
    
    if (commonTypeTag === null) {
      console.log("any tag fallback for", array);
      commonTypeTag = "any";
    }

    this.result.arrayTypeTags.set(array, commonTypeTag);

    for (var i = 0, l = array.length; i < l; i++) {
      var element = array[i];

      if (Array.isArray(element))
        this.finalizeArray(element);
      else if (typeof (element) !== "object")
        this.finalizeValue(element);
    }

    return array;
  };

  JsAstModuleBuilder.prototype.finalizeValue = function (value) {
    var tag = this.result.getTypeTagForValue(value);
    this.result.tags.add(tag);

    var table = this.result.getTableForTypeTag(tag);
    if (table)
      table.add(value);

    return value;
  };

  JsAstModuleBuilder.prototype.finalize = function (node) {
    if (!node)
      return;

    this.walkedCount++;
    if ((this.walkedCount % this.progressInterval) === 0) {
      console.log("Scanned " + this.walkedCount + " nodes");
    }

    if (Array.isArray(node)) {
      return this.finalizeArray(node);
    } else {
      for (var k in node) {
        if (!node.hasOwnProperty(k))
          continue;

        var value = node[k];

        // Handle non-object properties
        if (typeof (value) !== "object")
          this.finalizeValue(value);
        else if (Array.isArray(value))
          this.finalizeArray(value);

        // Otherwise, it's been finalized since it was returned
        //  by the builder.
      }

      return this.finalizeValue(node);
    }
  };

  JsAstModuleBuilder.prototype.finish = function (root) {
    if (this.getHitCount) {
      var self = this;
      this.result.objects.forEach(function (id) {
        var hitCount = self.getHitCount(id.get_value());
        id.set_hit_count(hitCount);
      });    
    }

    var rootTag = this.result.getTypeTagForValue(root);
    var rootTable = this.result.getTableForTypeTag(rootTag);
    rootTable.add(root);

    this.result.root = root;

    return this.result;
  };


  // Converts a JsAstModule into bytes and writes them into byteWriter.
  function serializeModule (module, byteWriter, stats) {
    var writer = new ValueWriter();

    writer.writeBytes(common.Magic);

    var omitCount = 0;
    if (common.ConditionalInlining) {
      var maybeOmitCallback = function (id) {
        var hitCount = id.get_hit_count();

        if (hitCount <= common.InlineUseCountThreshold) {
          module.objects.omit(id);
          omitCount += 1;
        }
      };

      module.objects.forEach(maybeOmitCallback);
    }

    module.finalize();

    // We write out the lengths in advance of the (length-prefixed) tables.
    // This allows a decoder to preallocate space for all the tables and
    //  use that to reconstruct relationships in a single pass.

    var tagCount    = module.tags.get_count();
    var stringCount = module.strings.get_count();
    var objectCount = module.objects.get_count();

    writer.writeUint32(tagCount);
    writer.writeUint32(stringCount);
    writer.writeUint32(objectCount);

    var tagWriter = new ValueWriter(1024 * 1024 * 1, writer);
    module.serializeTable(tagWriter, module.tags, true, function (_, value) {
      _.writeUtf8String(value);
    });

    var stringWriter = new ValueWriter(1024 * 1024 * 4, writer);
    module.serializeTable(stringWriter, module.strings, true, function (_, value) {
      _.writeUtf8String(value);
    });

    if (common.ValueStreamPerType)
      module.createValueStreams(writer);

    var objectWriter = new ValueWriter(1024 * 1024 * 8, writer);
    module.serializeTable(objectWriter, module.objects, true,  module.serializeObject);

    writer.writeSubstream(tagWriter, "tags");
    writer.writeSubstream(stringWriter, "strings");

    if (common.ValueStreamPerType)
    for (var key in module.valueStreams) {
      var valueStream = module.valueStreams[key];
      writer.writeIndex(module.tags.get_index(key));      
      writer.writeSubstream(valueStream, "values[" + key + "]");
    }

    writer.writeSubstream(objectWriter, "objects");

    module.serializeValueWithKnownTag(writer, module.root, "any", null);

    if (omitCount > 0)
      console.log("objects written inline:", omitCount);
    
    console.log("any-typed values written:", module.anyTypeValuesWritten);
    console.log("varint sizes:", writer.varintSizes);

    return writer.toArray();
  };


  exports.PrettyJson         = common.PrettyJson;
  exports.ShapeTable         = common.ShapeTable;
  exports.JsAstModuleBuilder = JsAstModuleBuilder;

  exports.serializeModule    = serializeModule;
}));