astutil = Object.create(null);


astutil.Context = function () {
    this.isAborted = false;
    this.stack = [];
    this.parent = null;
    this.key = null;
};

astutil.Context.prototype.abort = function () {
    this.isAborted = true;
};


astutil.Result = function () {
    this.parent = null;
    this.key = null;
    this.node = null;
};

astutil.Result.prototype.set = function (context, node) {
    this.parent = context.parent;
    this.key = context.key;
    this.node = node;
};

astutil.Result.prototype.remove = function () {
    if (!this.parent || (this.key === null))
        return false;

    if (Array.isArray(this.parent)) {
        this.parent.splice(this.key, 1);
    } else {
        delete this.parent[this.key];
    }

    this.key = null;
    return true;
};

astutil.Result.prototype.replaceWith = function (newNode) {
    this.parent[this.key] = newNode;
};


astutil.clone = function (ast) {
    return JSON.parse(JSON.stringify(ast));
};

// Mutates an AST subtree, partially in-place.
// Returns the new root (typically the original root, but it may have been replaced.)
// If you don't want to modify any of the original nodes, make a copy first.
astutil.mutate = function (root, mutator, context) {
    if (!context)
        context = new astutil.Context();

    context.stack.push(root);

    try {
        var newRoot = mutator(context, root);
        if (typeof (newRoot) === "undefined")
            newRoot = root;

        if (context.isAborted)
            return newRoot;

        for (var k in newRoot) {
            if (context.isAborted)
                return newRoot;

            if (!newRoot.hasOwnProperty(k))
                continue;

            var v = newRoot[k];
            if (typeof(v) !== "object")
                continue;

            if (context.stack.indexOf(v) >= 0)
                continue;

            context.parent = newRoot;
            context.key = k;
            var newValue = astutil.mutate(v, mutator, context);
            if (typeof (newValue) === "undefined")
                /* do nothing */ ;
            else if (newValue === null)
                /* delete */
                delete newRoot[k];
            else if (newValue !== v)
                /* replace */
                newRoot[k] = newValue;
        }

        return newRoot;
    } finally {
        context.stack.pop();
    }
};

astutil.find = function (root, predicate) {
    var result = new astutil.Result();

    var _predicate = predicate;
    if (_predicate.length === 1)
        _predicate = function (context, node) {
            return predicate(node);
        };

    astutil.mutate(root, function (context, node) {
        if (_predicate(context, node)) {
            result.set(context, node);
            context.abort();
        }
    });

    return result;
};