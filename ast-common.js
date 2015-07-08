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
  var LogTables = false;


  function NamedTableId (entry) {
    if (!entry)
      throw new Error("Id must have an entry");

    this.entry = entry;
    this.isRedirected = false;
  };

  NamedTableId.prototype.equals = function (rhs) {
    return this.entry === rhs.entry;
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

  NamedTableId.prototype.get_semantic = function () {
    this.checkInvariants();

    return this.entry.table.semantic;
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

  NamedTableId.prototype.get_hit_count = function () {
    this.checkInvariants();

    return this.entry.hitCount;
  };

  NamedTableId.prototype.set_hit_count = function (value) {
    this.checkInvariants();

    this.entry.hitCount = value | 0;
  };

  NamedTableId.prototype.is_omitted = function () {
    this.checkInvariants();

    return this.entry.isOmitted;
  };

  NamedTableId.prototype.get_global_index = function () {
    this.checkInvariants();

    if (typeof (this.entry.table.globalBaseIndex) !== "number")
      throw new Error("No base index assigned to table " + this.entry.table.semantic);

    return this.entry.table.globalBaseIndex + this.entry.index;
  };

  NamedTableId.prototype.toString = function () {
    var index = this.get_index();
    var name = this.get_name();
    var prefix = "<" + this.entry.table.semantic + " #";

    if (typeof (index) !== "number")
      index = "?";
    else if (index === name)
      return prefix + index + ">";
    else
      return prefix + index + " '" + name + "'>";
  }


  function NamedTableEntry (name, value, table) {
    this.table = table;

    this.name = name;
    this.value = value;
    this.index = undefined;
    this.order = undefined;
    this.hitCount = 1;
    this.isOmitted = false;

    this.id = new NamedTableId(this);
  };


  function NamedTable (semantic) {
    if (!semantic)
      throw new Error("Semantic name required");

    this.entries = Object.create(null);
    this.count = 0;
    this.nextOrder = 0;
    this.semantic = semantic;
    this.isFinalized = false;
    this.globalBaseIndex = null;
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

    var entry = new NamedTableEntry(name, value, this);
    entry.order = this.nextOrder++;

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
    } else {
      throw new Error("No '" + this.semantic + "' table entry for '" + name + "'");
    }
  }

  NamedTable.prototype.get_global_index = function (name) {
    if (typeof (this.globalBaseIndex) !== "number")
      throw new Error("No base index set");

    return this.get_index(name) + this.globalBaseIndex;
  }

  NamedTable.prototype.get_count = function () {
    return this.count;
  };

  NamedTable.prototype.forEach = function (callback) {
    for (var k in this.entries) {
      var entry = this.entries[k];

      // Skip over dedupe sources
      if (entry.isOmitted)
        continue;

      callback(entry.id);
    }
  };

  // Makes source's table entry a copy of target's.
  NamedTable.prototype.omit = function (value) {
    var entry;

    if (
      value instanceof NamedTableId
    )
      entry = value.entry;
    else
      entry = this.entries[value];

    if (!entry)
      throw new Error("value must be in the table");

    if (entry.isOmitted)
      return;

    entry.isOmitted = true;
    this.count -= 1;
  };

  NamedTable.prototype.finalize = function (baseIndex) {
    var result = new Array(this.count);
    var i = 0;

    baseIndex |= 0;

    this.forEach(function (id) {
      result[i++] = id;
    });

    if (result.length !== this.count) {
      console.log(result.length, this.count);
      throw new Error("Count mismatch");
    }

    if (exports.SortTables) {
      // First pass: sort by usage count so most frequently
      //  used objects have low (small) indices.
      var hitCountPredicate = function (lhs, rhs) {
        return (rhs.entry.hitCount - lhs.entry.hitCount);
      };

      result.sort(hitCountPredicate);

      if (exports.LocalityAwareSorting) {
        // Second pass: Sort objects below a usage count threshold
        //  by their ordering in the source file to increase locality.

        var isLargeTable =
          this.count >= exports.LargeTableThreshold;

        var cutoff =
          isLargeTable
            ? exports.LocalityCutoffLarge
            : exports.LocalityCutoffSmall;

        var thresholdIndex = Math.min(
          this.count - 1,
          cutoff - 1
        );

        var hitCountThreshold = result[thresholdIndex].entry.hitCount;
        if (hitCountThreshold < exports.LocalityMinimumThreshold)
          hitCountThreshold = exports.LocalityMinimumThreshold;

        var orderPredicate = function (lhs, rhs) {
          return (lhs.entry.order - rhs.entry.order);
        };

        result.sort(function (lhs, rhs) {
          var lhsBelowThreshold = lhs.entry.hitCount < hitCountThreshold;
          var rhsBelowThreshold = rhs.entry.hitCount < hitCountThreshold;

          if (lhsBelowThreshold && rhsBelowThreshold)
            return orderPredicate(lhs, rhs);
          else if (lhsBelowThreshold)
            return 1;
          else if (rhsBelowThreshold)
            return -1;
          else
            return hitCountPredicate(lhs, rhs);
        });

        if (this.semantic === "object") {
          if (false) {
            console.log("object table threshold (index=" + cutoff + ") = " + hitCountThreshold);

            for (var i = 0; i < result.length; i++) {
              console.log(i, result[i].entry.hitCount, result[i].entry.order);
            }
          }
        } 
      }
    }

    if (this.isFinalized)
      return result;

    for (i = 0; i < result.length; i++) {
      result[i].entry.index = baseIndex + i;

      if (LogTables)
        console.log(this.semantic, result[i].get_name(), result[i].entry.hitCount, result[i].entry.index);
    }

    this.isFinalized = true;

    return result;
  };

  NamedTable.prototype.setGlobalBaseIndex = function (value) {
    this.globalBaseIndex = value | 0;
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
      if (typeof (s) !== "string")
        throw new Error("StringTable entries must be strings");
      else
        return s;
    }, semantic);
  };

  StringTable.prototype = Object.create(UniqueTable.prototype);


  var GetObjectId_table = new WeakMap();
  var GetObjectId_nextId = 0;

  function NextObjectId () {
    return GetObjectId_nextId++;
  };

  function GetObjectId (obj) {
    if (typeof (obj.__id__) === "number")
      return obj.__id__;

    if (typeof (obj) !== "object")
      throw new Error("GetObjectId expected object, got '" + typeof (obj) + "'");
    else if (obj === null)
      // HACK
      return -1;

    var existing = GetObjectId_table.get(obj);
    if (typeof (existing) === "number")
      return existing;

    var result = NextObjectId();
    GetObjectId_table.set(obj, result);

    return result;
  };


  function ObjectTable (semantic) {
    UniqueTable.call(this, GetObjectId, semantic);
  };

  ObjectTable.prototype = Object.create(UniqueTable.prototype);


  function ShapeTable (shapeKey) {
    this.shapeKey = shapeKey;

    NamedTable.call(this, "Shape");
  };

  ShapeTable.fromJson = function (json) {
    var parsed = JSON.parse(json);

    var result = new ShapeTable(parsed.shapeKey);

    for (var k in parsed.shapes) {
      var definition = new ShapeDefinition(k);
      var fields = parsed.shapes[k];

      for (var j in fields) {
        var fieldType = fields[j];

        var isOptional = false;
        if (!Array.isArray(fieldType)) {
          isOptional = (fieldType.indexOf("?") >= 0);
          fieldType = fieldType.replace("?", "");
        }

        var fd = new FieldDefinition(j, fieldType, isOptional);
        definition.fields.push(fd);
      }

      result.add(k, definition);
    }

    return result;
  };

  ShapeTable.prototype = Object.create(NamedTable.prototype);


  function FieldDefinition (name, type, optional) {
    this.name = name;
    this.type = type;
    this.optional = optional;
  };


  function ShapeDefinition (key) {
    this.key = key;
    this.fields = [];
  };


  var nags = Object.create(null);

  function pickTagForField (field, getTableForTypeTag) {
    var declaredType = field.type;
    if (Array.isArray(declaredType))
      declaredType = "array";

    if (
      (declaredType !== "any") &&
      (declaredType !== "object") &&
      (declaredType !== "string") &&
      (declaredType !== "array") &&
      !exports.TagIsPrimitive[declaredType]
    ) {
      var table = getTableForTypeTag(declaredType);

      if (!table) {
        // HACK: Type (virtual base?) without shape
        if (false && !nags[declaredType]) {
          nags[declaredType] = true;
          console.log("'object' fallback for " + declaredType);
        }

        declaredType = "object";
      }
    }
    
    return declaredType;
  };


  function writeLEBUint32 (byteWriter, value) {
    var v = value;

    var b = 0;
    value |= 0;

    do {
      b = value & 0x7F;
      value >>>= 7;
      if (value)
        b |= 0x80;

      byteWriter.write(b);
    } while (value);
  };

  function readLEBUint32 (byteReader) {
    var result = 0, shift = 0;
    while (true) {
      var b = byteReader.read() | 0;
      var shifted = (b & 0x7F) << shift;
      result |= shifted;

      if ((b & 0x80) === 0)
        break;

      shift += 7;
    }

    result >>>= 0;
    return result;
  };

  function writeLEBInt32 (byteWriter, value) {
    var v = value;

    var b = 0;
    value |= 0;

    do {
      b = value & 0x7F;
      value >>= 7;

      var signBit = (b & 0x40) !== 0;

      if (
        ((value === 0) && !signBit) ||
        ((value === -1) && signBit)
      ) {
        byteWriter.write(b);
        break;
      } else {
        b |= 0x80;
        byteWriter.write(b);
      }
    } while (true);
  };

  function readLEBInt32 (byteReader) {
    var result = 0, shift = 0, b = 0;
    while (true) {
      b = byteReader.read() | 0;
      var shifted = (b & 0x7F) << shift;
      result |= shifted;
      shift += 7;
      
      if ((b & 0x80) === 0)
        break;
    }

    if (b & 0x40)
      result |= (-1 << shift);

    return result;
  };

  exports.writeLEBUint32 = writeLEBUint32;
  exports.readLEBUint32  = readLEBUint32;
  exports.writeLEBInt32 = writeLEBInt32;
  exports.readLEBInt32  = readLEBInt32;


  exports.Magic = new Uint8Array([
    0x89,
    87, 101, 98, 65, 83, 77,
    0x0D, 0x0A, 0x1A, 0x0A
  ]);

  // Type tags for which a value is emitted directly instead of
  //  referred to as a table index
  exports.TagIsPrimitive = {
    "null"   : true,
    "false"  : true,
    "true"   : true,
    "integer": true,
    "double" : true,
    "boolean": true
  };

  // Prune duplicate objects before serializing a module.
  exports.DeduplicateObjects          = true;

  // At least this many identical nodes must exist for a node
  //  to be deduplicated.
  exports.DeduplicationUsageThreshold = 1;

  // Write indices as LEB128 32-bit uints instead of 4-byte uints
  exports.EnableVarints               = true;

  // Sorts the object table to reduce the average size of varints,
  //  and potentially improve stream compression in general.
  exports.SortTables                  = true;
  // Two-pass object table sort. Highest frequency use objects
  //  at the front of the table, then lower frequency use objects
  //  sorted sequentially to improve locality (and compression?)
  exports.LocalityAwareSorting        = true;
  // Tables over this size use the larger locality cutoff.
  // Roughly, we want to use this as a heuristic for cases
  //  where indexes would otherwise frequently be 3 bytes
  //  and hitcount sorting can reduce them to 2.
  exports.LargeTableThreshold         = 1 << 13;
  // How many items at the front of the table (hitcount sorted)
  // Small is used for 'small' tables (see above), large etc
  exports.LocalityCutoffSmall         = 128;
  exports.LocalityCutoffLarge         = 1 << 13;
  // How low can the minimum hitcount be
  exports.LocalityMinimumThreshold    = 3;

  // If set to an integer, objects with this # of uses or
  //  less are encoded inline.
  exports.InlineUseCountThreshold     = 1;

  exports.ConditionalInlining         = !!exports.InlineUseCountThreshold;

  // Encode indexes as signed values relative to the index of
  //  the current object.
  exports.RelativeIndexes             = false;

  // Separate sequential streams of values, partitioned by type.
  exports.ValueStreamPerType          = true;

  // If varints are disabled, writes indices as 3-byte uints
  exports.ThreeByteIndices            = false;

  // Expected and decoded json ASTs are pretty printed.
  // Can't be on by default because JSON.stringify in node is
  //  super busted for large objects.
  exports.PrettyJson                  = false;

  // Disable this for ASTs too large for JSON.stringify
  exports.DumpJson                    = true;


  exports.ShapeDefinition = ShapeDefinition;

  exports.NamedTable   = NamedTable;
  exports.UniqueTable  = UniqueTable;
  exports.StringTable  = StringTable;
  exports.ObjectTable  = ObjectTable;
  exports.ShapeTable   = ShapeTable;

  exports.GetObjectId  = GetObjectId;
  exports.NextObjectId = NextObjectId;

  exports.pickTagForField = pickTagForField;
}));