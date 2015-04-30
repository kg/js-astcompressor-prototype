'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['exports'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports);
  } else {
    factory((root.js2webasm = {}));
  }
}(this, function (exports) {
  function NamedTableId (entry, semantic) {
    this.entry = entry;
    this.semantic = semantic;
  };

  NamedTableId.prototype.get_name = function () {
    return this.entry.name;
  };

  NamedTableId.prototype.get_value = function () {
    return this.entry.value;
  };

  NamedTableId.prototype.get_index = function () {
    return this.entry.index;
  };

  NamedTableId.prototype.toString = function () {
    var index = this.get_index();
    var name = this.get_name();
    var prefix = "<#";
    if (this.semantic)
      prefix = "<" + this.semantic + " #";

    if (typeof (index) !== "number")
      index = "?";
    else if (index === name)
      return prefix + index + ">";
    else
      return prefix + index + " '" + name + "'>";
  }

  NamedTableId.prototype.valueOf = function () {
    var index = this.get_index();
    if (typeof (index) !== "number")
      throw new Error("No index assigned yet");

    return index;
  }


  function NamedTableEntry (name, value, semantic) {
    this.name = name;
    this.value = value;
    this.id = new NamedTableId(this, semantic);
    this.index = undefined;
  };


  function NamedTable (semantic) {
    this.entries = Object.create(null);
    this.count = 0;
    this.semantic = semantic || null;
    this.isFinalized = false;
  };

  NamedTable.prototype.add = function (name, value) {
    if (this.isFinalized)
      throw new Error("Table already finalized");

    var existing = this.entries[name];

    if (typeof (existing) !== "undefined") {
      if (existing.value !== value)
        throw new Error("A different value already exists with this name");
      else
        return existing.id;
    }

    var entry = new NamedTableEntry(name, value, this.semantic);
    this.count++;
    this.entries[name] = entry;
    return entry.id;
  };

  NamedTable.prototype.get = function (name) {
    var entry = this.entries[name];

    if (entry)
      return entry.value;
    else
      return;
  }

  NamedTable.prototype.get_id = function (name) {
    var entry = this.entries[name];

    if (entry)
      return entry.id;
    else
      return;
  }

  NamedTable.prototype.get_index = function (name) {
    var entry = this.entries[name];

    if (entry) {
      if (typeof (entry.index) === "number")
        return entry.index;
      else
        throw new Error("Table not finalized");
    } else
      throw new Error("No table entry for '" + name + "'");
  }

  NamedTable.prototype.get_count = function () {
    return this.count;
  };

  NamedTable.prototype.finalize = function () {
    var result = new Array(this.count);
    var i = 0;

    for (var k in this.entries) {
      result[i++] = this.entries[k].id;
    }

    if (this.isFinalized)
      return result;

    result.sort(function (_lhs, _rhs) {
      var lhs = _lhs.get_name();
      var rhs = _rhs.get_name();

      if (rhs > lhs)
        return -1;
      else if (rhs < lhs)
        return 1;
      else
        return 0;
    });

    for (i = 0; i < result.length; i++)
      result[i].entry.index = i;

    this.isFinalized = true;

    return result;
  };


  function UniqueTable (nameFromValue, semantic) {
    if (typeof (nameFromValue) !== "function")
      throw new Error("Name provider required");
    else
      this.nameFromValue = nameFromValue;

    NamedTable.call(this, semantic);
  };

  UniqueTable.prototype = Object.create(NamedTable.prototype);

  UniqueTable.prototype.add = function (value) {
    var name = this.nameFromValue(value);
    return NamedTable.prototype.add.call(this, name, value);
  };

  // No-op
  UniqueTable.prototype.get = function (value) {
    return value;
  };

  UniqueTable.prototype.get_id = function (value) {
    var name = this.nameFromValue(value);
    return NamedTable.prototype.get_id.call(this, name);
  };

  UniqueTable.prototype.get_index = function (value) {
    var name = this.nameFromValue(value);
    return NamedTable.prototype.get_index.call(this, name);
  };


  function StringTable (semantic) {
    UniqueTable.call(this, function (s) {
      // Fixme: This means we can put numbers in here...
      return String(s);
    }, semantic);
  };

  StringTable.prototype = Object.create(UniqueTable.prototype);


  function ObjectTable (semantic) {
    this.idMapping = new WeakMap();
    this.nextId = 0;

    UniqueTable.call(this, function (o) {
      var existingId = this.idMapping.get(o);
      if (typeof (existingId) !== "number")
        this.idMapping.set(o, existingId = (this.nextId++));

      return existingId;
    }, semantic);
  };

  ObjectTable.prototype = Object.create(UniqueTable.prototype);


  function WebasmModule () {
    this.strings     = new StringTable("String");
    // HACK: Just one global stringtable for now
    /*
    this.identifiers = new StringTable("Identifier");
    this.nodeTypes   = new StringTable("NodeType");
    */

    this.arrays      = new ObjectTable("Array");
    this.objects     = new ObjectTable("Object");

    this.root_id     = null;
  };


  // Converts an esprima ast into a WebasmModule.
  function astToModule (root) {
    var result = new WebasmModule();

    var walkCallback = function (key, typeToken, table, value) {
      if (typeof (key) === "string")
        result.strings.add(key);

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
        nodeTable = result.objects;

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

    (new DataView(bytes.buffer, 0, 4)).setUint32(0, lengthBytes);

    encoding.UTF8.encode(text, bytes, 4);

    result.push(bytes);
  };


  WebasmModule.prototype.walkValue = function (key, value, callback) {
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
          callback(key, "n");
        else if (Array.isArray(value))
          callback(key, "a", this.arrays, value);
        else
          callback(key, "o", this.objects, value);
        break;

      case "boolean":
        callback(key, value ? "t" : "f");
        break;

      default:
        throw new Error("Unhandled value type " + typeof (value));
    }      
  };


  WebasmModule.prototype.walkObject = function (node, callback) {
    for (var k in node) {
      if (!node.hasOwnProperty(k))
        continue;

      var v = node[k];

      this.walkValue(k, v, callback);
    }
  };


  WebasmModule.prototype.serializeObject = function (result, node) {
    if (Array.isArray(node))
      throw new Error("Should have used serializeArray");

    var serialized = Object.create(null);
    var strings = this.strings;

    this.walkObject(node, function (key, typeToken, table, value) {
      var keyIndex = strings.get_index(key);

      if (arguments.length === 2) {
        serialized[keyIndex] = [typeToken];
      } else {
        if (table) {
          serialized[keyIndex] = [typeToken, table.get_index(value)];
        } else {
          serialized[keyIndex] = [typeToken, value];
        }
      }
    });

    var json = JSON.stringify(serialized);
    serializeUtf8String(result, json);
  };


  WebasmModule.prototype.serializeArray = function (result, node) {
    if (!Array.isArray(node))
      throw new Error("Should have used serializeObject");

    var serialized = [];

    var walkCallback = function (key, typeToken, table, value) {
      if (arguments.length === 2) {
        serialized.push([typeToken]);
      } else {
        if (table) {
          serialized.push([typeToken, table.get_index(value)]);
        } else {
          serialized.push([typeToken, value]);
        }
      }
    };

    for (var i = 0, l = node.length; i < l; i++)
      this.walkValue(i, node[i], walkCallback);

    var json = JSON.stringify(serialized);
    serializeUtf8String(result, json);
  };


  WebasmModule.prototype.serializeTable = function (result, table, serializeEntry) {
    var finalized = table.finalize();

    var countBytes = new Uint8Array(4);    
    (new DataView(countBytes.buffer, 0, 4)).setUint32(0, finalized.length);
    result.push(countBytes);

    for (var i = 0, l = finalized.length; i < l; i++) {
      var id = finalized[i];
      var value = id.get_value();

      // gross
      serializeEntry.call(this, result, value);
    }
  };


  var magic = new Uint8Array([
    0x89,
    87, 101, 98, 65, 83, 77,
    0x0D, 0x0A, 0x1A, 0x0A
  ]);


  // Converts a WebasmModule into a sequence of typed arrays, 
  //  suitable for passing to the Blob constructor.
  function serializeModule (module) {
    var result = [magic];

    /*
    module.serializeTable(result, module.nodeTypes, serializeUtf8String);
    module.serializeTable(result, module.identifiers, serializeUtf8String);
    module.serializeTable(result, module.strings, serializeUtf8String);

    module.serializeTable(result, module.nodes, module.serializeNode);
    */

    module.strings.finalize();
    module.arrays .finalize();
    module.objects.finalize();

    module.serializeTable(result, module.strings, serializeUtf8String);

    module.serializeTable(result, module.arrays,  module.serializeArray);

    module.serializeTable(result, module.objects, module.serializeObject);

    return result;
  };


  exports.astToModule = astToModule;
  exports.serializeModule = serializeModule;
}));