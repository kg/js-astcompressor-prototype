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
  };

  NamedTable.prototype.add = function (name, value) {
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

    this.objects     = new ObjectTable("Object");

    this.root_id     = null;
  };


  // Converts an esprima ast into a WebasmModule.
  function astToModule (root) {
    var result = new WebasmModule();

    astutil.mutate(root, function visit (context, node) {
      if (!node || Array.isArray(node))
        return;      

      result.walkObject(node, function (key, typeToken, table, value) {
        result.strings.add(key);

        if (table)
          table.add(value);
      });

      result.objects.add(node);
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


  WebasmModule.prototype.walkObject = function (node, callback) {
    for (var k in node) {
      if (!node.hasOwnProperty(k))
        continue;

      var v = node[k];

      switch (typeof (v)) {
        case "string":
          callback(k, "s", this.strings, v);
          break;

        case "number":
          var i = v | 0;
          if (i === v)
            callback(k, "i", null, i);
          else
            callback(k, "d", null, v);
          break;

        case "object":
          if (v === null)
            callback(k, "n");
          else
            callback(k, "o", this.objects, v);
          break;

        case "boolean":
          callback(k, "b", null, v ? 1 : 0);
          break;

        default:
          throw new Error("Unhandled value type " + typeof (v));
      }      
    }
  };


  WebasmModule.prototype.serializeObject = function (result, node) {
    if (Array.isArray(node))
      return;

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

    module.serializeTable(result, module.strings, serializeUtf8String);

    module.serializeTable(result, module.objects, module.serializeObject);

    return result;
  };


  exports.astToModule = astToModule;
  exports.serializeModule = serializeModule;
}));