'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['exports'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports);
  } else {
    factory((root.astCommon = {}));
  }
}(this, function (exports) {
  var leb    = require("./Upstream/leb/leb.js");

  function NamedTableId (entry, semantic) {
    if (!entry)
      throw new Error("Id must have an entry");

    this.entry = entry;
    this.semantic = semantic;
    this.isRedirected = false;
  };

  NamedTableId.prototype.equals = function (rhs) {
    return this.entry === rhs.entry;
  };

  NamedTableId.prototype.redirect = function (newEntry) {
    if (!newEntry)
      throw new Error("Id must have an entry");

    if (newEntry === this.entry)
      throw new Error("Already pointing at this entry");

    if (newEntry.isInvalidated)
      throw new Error("Cannot redirect to an invalidated entry");

    // Maintain a list on the target entry that
    //  contains all redirected ids that point at it.
    if (!newEntry.dedupedIds)
      newEntry.dedupedIds = [];    

    this.entry = newEntry;
    this.isRedirected = true;
    newEntry.dedupedIds.push(this);
  };

  NamedTableId.prototype.checkInvariants = function () {
    if (this.entry.isInvalidated) {
      try {
        var dupe = Object.create(null);
        for (var k in this.entry) {
          if (k === "id")
            continue;

          dupe[k] = this.entry[k];
        }

        console.log("Invalidated entry", dupe);
      } catch (ex) {
        console.log(ex);
      }

      throw new Error("Invalidated entry");
    }
  };

  NamedTableId.prototype.get_name = function () {
    this.checkInvariants();

    return this.entry.name;
  };

  NamedTableId.prototype.get_value = function () {
    this.checkInvariants();

    return this.entry.value;
  };

  NamedTableId.prototype.get_index = function () {
    this.checkInvariants();

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
    this.checkInvariants();

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
    this.hitCount = 1;
    this.isInvalidated = false;
    this.dedupedIds = null;
  };


  function NamedTable (semantic) {
    this.entries = Object.create(null);
    this.count = 0;
    this.semantic = semantic || null;
    this.isFinalized = false;
  };

  NamedTable.prototype.add = function (name, value, throwOnDivergence) {
    if (this.isFinalized)
      throw new Error("Table already finalized");

    var existing = this.entries[name];

    if (typeof (existing) !== "undefined") {
      if (
        (throwOnDivergence !== false) &&
        (existing.value !== value)
      )
        throw new Error("A different value already exists with this name");

      existing.hitCount += 1;
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

  NamedTable.prototype.forEach = function (callback) {
    for (var k in this.entries) {
      var entry = this.entries[k];

      // Skip over dedupe sources
      if (entry.name != k)
        continue;

      callback(entry.id);
    }
  };

  // Makes source's table entry a copy of target's.
  NamedTable.prototype.dedupe = function (source, target) {
    var sourceEntry, targetEntry;

    if (
      source instanceof NamedTableId
    )
      sourceEntry = source.entry;
    else
      sourceEntry = this.entries[source];

    if (
      target instanceof NamedTableId
    )
      targetEntry = target.entry;
    else
      targetEntry = this.entries[target];

    if (!sourceEntry)
      throw new Error("source must exist");
    else if (!targetEntry)
      throw new Error("target must exist");

    // Invalidate the entry.
    sourceEntry.isInvalidated = true;
    // Deduped entries aren't counted or iterated by forEach
    this.count -= 1;

    // If this entry has redirected ids pointing at it,
    //  point them at the target entry.
    if (sourceEntry.dedupedIds && sourceEntry.dedupedIds.length) {
      for (var i = 0, l = sourceEntry.dedupedIds.length; i < l; i++) {
        var id = sourceEntry.dedupedIds[i];
        id.redirect(targetEntry);
      }

      sourceEntry.dedupedIds = null;
    }

    sourceEntry.id.redirect(targetEntry);

    this.entries[sourceEntry.name] = targetEntry;
  };

  NamedTable.prototype.finalize = function (ordered) {
    var result = new Array(this.count);
    var i = 0;

    this.forEach(function (id) {
      result[i++] = id;
    });

    if (i !== this.count)
      throw new Error("Count mismatch");

    if (ordered) {
      result.sort(function (lhs, rhs) {
        var lhsHitCount = lhs.entry.hitCount;
        var rhsHitCount = rhs.entry.hitCount;

        return (rhsHitCount - lhsHitCount);
      });
    }

    if (this.isFinalized)
      return result;

    // TODO: Maintain a hit count for each entry,
    //  sort by hit count descending, so that most used
    //  entries are first.
    // Then apply an efficient variable-length index encoding.
    // FIXME: This seems to break serialization somehow...
    /*
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
    */

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

  // Makes source's table entry a copy of target's.
  UniqueTable.prototype.dedupe = function (source, target) {
    var sourceName, targetName;
    
    if (source instanceof NamedTableId)
      sourceName = source;
    else
      sourceName = this.nameFromValue(source);

    if (target instanceof NamedTableId)
      targetName = target;
    else
      targetName = this.nameFromValue(target);

    return NamedTable.prototype.dedupe.call(this, sourceName, targetName);
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


  // FIXME: leb.js is gross and slow and node-only. Kill it.

  function writeLEBUint32 (byteWriter, value) {
    var tempUint32 = new Uint32Array(1);
    tempUint32[0] = value;
    var tempUintBytes = new Uint8Array(tempUint32.buffer);

    var encodedBuffer = leb.encodeUIntBuffer(tempUintBytes);
    
    for (var i = 0; i < encodedBuffer.length; i++)
      byteWriter.write(encodedBuffer[i]);
  }


  function readLEBUint32 (byteReader) {
    var buf = new Buffer(8);

    // FIXME: eof
    var numRead = 0;
    for (var i = 0; i < buf.length; i++) {
      var b = byteReader.read();
      if (b === false) {
        break;
      } else {
        numRead += 1;
      }

      buf[i] = b;
    }

    if (numRead === 0)
      return false;

    byteReader.skip(-numRead);

    var decoded = leb.decodeUIntBuffer(buf, 0);

    var distance = decoded.nextIndex;
    byteReader.skip(distance);

    var tempBytes = new Uint8Array(4);
    // Round size up to 4 bytes
    for (var i = 0; i < decoded.value.length; i++)
      tempBytes[i] = decoded.value[i];

    var tempUint32 = new Uint32Array(tempBytes.buffer);

    return tempUint32[0];
  }


  exports.writeLEBUint32 = writeLEBUint32;
  exports.readLEBUint32  = readLEBUint32;


  exports.Magic = new Uint8Array([
    0x89,
    87, 101, 98, 65, 83, 77,
    0x0D, 0x0A, 0x1A, 0x0A
  ]);

  exports.FormatName = "estree-compressed-v3";


  exports.NamedTable  = NamedTable;
  exports.UniqueTable = UniqueTable;
  exports.StringTable = StringTable;
  exports.ObjectTable = ObjectTable;
}));