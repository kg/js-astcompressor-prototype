'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['exports'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports);
  } else {
    factory((root.configuration = {}));
  }
}(this, function (exports) {
  exports.Default = function () {
    // Prune duplicate objects before serializing a module.
    this.DeduplicateObjects          = true;

    // At least this many identical nodes must exist for a node
    //  to be deduplicated.
    this.DeduplicationUsageThreshold = 1;

    // Write indices as LEB128 32-bit uints instead of 4-byte uints
    this.EnableVarints               = true;

    // Sorts the object table to reduce the average size of varints,
    //  and potentially improve stream compression in general.
    this.SortTables                  = true;
    // Two-pass object table sort. Highest frequency use objects
    //  at the front of the table, then lower frequency use objects
    //  sorted sequentially to improve locality (and compression?)
    this.LocalityAwareSorting        = true;
    // Tables over this size use the larger locality cutoff.
    // Roughly, we want to use this as a heuristic for cases
    //  where indexes would otherwise frequently be 3 bytes
    //  and hitcount sorting can reduce them to 2.
    this.LargeTableThreshold         = 1 << 13;
    // How many items at the front of the table (hitcount sorted)
    // Small is used for 'small' tables (see above), large etc
    this.LocalityCutoffSmall         = 128;
    this.LocalityCutoffLarge         = 1 << 13;
    // How low can the minimum hitcount be
    this.LocalityMinimumThreshold    = 3;

    // If set to an integer, objects with this # of uses or
    //  less are encoded inline.
    this.InlineUseCountThreshold     = 10;

    // If an object's estimated size is <= this, always inline it
    this.InlineObjectSizeThreshold   = null; // 7;

    // See above
    this.ConditionalInlining         = this.InlineUseCountThreshold !== null;

    // If conditional inlining is active, writes inlined nodes
    //  into their value streams instead of into the current stream
    this.PartitionedInlining         = true;

    // When doing partitioned inlining, don't force primitive values
    //  (ints, floats) out of their streams  
    this.NoOverridingPrimitiveStream = false;

    // Encode indexes as signed values relative to the index of
    //  the current object.
    this.RelativeIndexes             = false;

    // Separate sequential stream for all type tags
    this.TypeTagStream               = true;

    // Separate sequential streams of values, partitioned by type.
    this.ValueStreamPerType          = true;

    // If varints are disabled, writes indices as 3-byte uints
    this.ThreeByteIndices            = false;

    // Null-terminated strings instead of length headers
    this.NullTerminatedStrings       = false;

    // Maintains a scope chain and replaces names with numbered per-scope indices
    this.InternedNames               = true;
  };

  exports.FromDictionary = function (dict) {
    var result = new exports.Default();

    for (var k in dict)
      result[k] = dict[k];

    return result;
  };

  exports.FromJson = function (json) {
    var dict = JSON.parse(json);
    return exports.FromDictionary(dict);
  };

  exports.ToJson = function (configuration) {
    return JSON.stringify(configuration, null, 2);
  };
  
}));