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
  function TableId (table, index) {
    this.table = table;
    this.index = index;
  };

  TableId.prototype.get_index = function () {
    return this.index;
  };

  TableId.prototype.get_value = function () {
    return this.table.get(this.index);
  };


  function Table () {
    this.values = [];
  };

  Table.prototype.add = function (value) {
    var index = this.values.length;
    this.values.push(value);

    return new TableId(this, index);
  };

  Table.prototype.get = function (index) {
    return this.values[index];
  };

  Table.prototype.get_count = function () {
    return this.values.length;
  };

  Table.prototype.finalize = function () {
    return this.values;
  };


  function NamedTableId (entry) {
    this.entry = entry;
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


  function NamedTableEntry (name, value) {
    this.name = name;
    this.value = value;
    this.id = new NamedTableId(this);
    this.index = undefined;
  };


  function NamedTable () {
    this.entries = Object.create(null);
    this.count = 0;
  };

  NamedTable.prototype.add = function (name, value) {
    var existing = this.entries[name];

    if (typeof (existing) !== "undefined") {
      if (existing.value !== value)
        throw new Error("A different value already exists with this name");
      else
        return existing.id;
    }

    var entry = new NamedTableEntry(name, value);
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

  NamedTable.prototype.get_count = function () {
    return this.count;
  };


  function UniqueTableId (entry) {
    this.entry = entry;
  };

  UniqueTableId.prototype.get_value = function () {
    return this.entry.value;
  };

  UniqueTableId.prototype.get_index = function () {
    return this.entry.index;
  };


  function UniqueTableEntry (value) {
    this.value = value;
    this.id = new UniqueTableId(this);
    this.index = undefined;
  };


  function UniqueTable () {
    this.entries = Object.create(null);
    this.count = 0;
  };

  UniqueTable.prototype.add = function (value) {
    var existing = this.entries[value];

    if (typeof (existing) !== "undefined")
      return existing.id;

    var entry = new UniqueTableEntry(value);
    this.count++;
    this.entries[value] = entry;
    return entry.id;
  };

  UniqueTable.prototype.get_id = function (value) {
    var entry = this.entries[value];

    if (entry)
      return entry.id;
    else
      return;
  };

  UniqueTable.prototype.get_count = function () {
    return this.count;
  };

  UniqueTable.prototype.finalize = function () {
    var result = new Array(this.count);
    var i = 0;

    for (var k in this.entries) {
      result[i++] = this.entries[k].id;
    }

    result.sort(function (_lhs, _rhs) {
      var lhs = _lhs.get_value();
      var rhs = _rhs.get_value();

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


  function WebasmModule () {
    this.strings     = new UniqueTable();
    this.identifiers = new UniqueTable();
    this.types       = new UniqueTable();
  };


  // Converts an esprima ast into a WebasmModule.
  function astToModule (root) {
    var result = new WebasmModule();

    astutil.mutate(root, function visit (context, node) {
      if (!node || !node.type)
        return;

      result.types.add(node.type);

      if (node.type === "Literal") {
        if (typeof (node.value) === "string") {
          result.strings.add(node.value);
        }
      } else if (node.type === "Identifier") {
        result.identifiers.add(node.name);
      }
    });

    return result;
  };


  function serializeUtf8String (value) {
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
    encoding.UTF8.encode(value, counter);

    var bytes = new Uint8Array(4 + lengthBytes);

    (new DataView(bytes.buffer, 0, 4)).setUint32(0, lengthBytes);

    encoding.UTF8.encode(value, bytes, 4);

    return bytes;
  };


  function serializeTable (result, table, serializeEntry) {
    var finalized = table.finalize();

    var countBytes = new Uint8Array(4);    
    (new DataView(countBytes.buffer, 0, 4)).setUint32(0, finalized.length);
    result.push(countBytes);

    for (var i = 0, l = finalized.length; i < l; i++) {
      var str = finalized[i].get_value();
      result.push(serializeUtf8String(str));
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

    serializeTable(result, module.types, serializeUtf8String);
    serializeTable(result, module.identifiers, serializeUtf8String);
    serializeTable(result, module.strings, serializeUtf8String);

    return result;
  };


  exports.astToModule = astToModule;
  exports.serializeModule = serializeModule;
}));