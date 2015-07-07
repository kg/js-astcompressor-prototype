'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['exports'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports);
  } else {
    factory((root.deduplicatingTreeBuilder = {}));
  }
}(this, function (exports) {
  function InternTableEntry (hash, node) {
    this.hash = hash;
    this.node = node;
    this.useCount = 1;
  };


  function MakeBuilder (baseClass, getObjectId, deduplicationUsageThreshold) {
    var ctor = function (/* ... */) {
      this.internTable = Object.create(null);
      this.nodesFinalized = 0;
      this.nodesPruned    = 0;

      return baseClass.apply(this, arguments);
    };

    ctor.prototype = Object.create(baseClass.prototype);

    ctor.prototype.$getTable = function (type) {
      var result = this.internTable[type];
      if (!result)
        result = this.internTable[type] = Object.create(null);

      return result;
    };

    var appendValueHash = function (head, v) {
      var vt = typeof (v);
      if (v === null)
        head += "\x01"
      else if (Array.isArray(v)) {
        // It's important to examine the structure of the array,
        //  since we want to deduplicate by contents instead of
        //  by referential identity
        head += "\x04";

        for (var i = 0, l = v.length; i < l; i++) {
          var element = v[i];
          head = appendValueHash(head, element);
        }
        
        head += "\x05";
      } else if (vt === "object")
        head += getObjectId(v);
      else if (vt === "string")
        head += v;
      else if (vt === "number")
        head += v.toString();
      else if (vt === "boolean")
        head += v ? "\x03" : "\x02";
      else
        throw new Error("Unexpected '" + vt + "' while interning"); 

      head += "\x00";

      return head;
    };

    ctor.prototype.finalize = function (obj) {
      var table = this.$getTable(obj.type);
      this.nodesFinalized += 1;      

      // TODO: Generate some sort of cheap integer hash instead
      // TODO: Use shape table instead of walking properties
      var bruteForceHash = "";
      for (var k in obj) {
        var v = obj[k];

        bruteForceHash = appendValueHash(bruteForceHash, v);
      }

      var interned = table[bruteForceHash];
      if (interned) {
        var shouldDeduplicate = interned.useCount >= deduplicationUsageThreshold
        interned.useCount += 1;

        if (shouldDeduplicate) {
          this.nodesPruned += 1;
          return interned.node;
        }
      } else {
        table[bruteForceHash] = new InternTableEntry(bruteForceHash, obj);
      }

      return baseClass.prototype.finalize.call(this, obj);
    };

    return ctor;
  };

  exports.MakeBuilder = MakeBuilder;
}));