(function () {
    var typedArrayConstructors = [
        Uint8Array, Uint16Array, Uint32Array,
        Int8Array, Int16Array, Int32Array,
        Float32Array, Float64Array
    ];

    for (var i = 0, l = typedArrayConstructors.length; i < l; i++) {
        var ac = typedArrayConstructors[i];

        var instance = new ac(1);

        if (!instance.slice) {
            Object.getPrototypeOf(instance).slice = function () {
                var subarray = this.subarray.apply(this, arguments);
                var copy = new ac(subarray);
                return copy;
            };
        }
    }
})();