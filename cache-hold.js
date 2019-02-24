function CacheHold(opts) {
    // Set my own internal basic properties
    this.opts = opts || {};
    this._currentFetches = {};

    // Apply defaults to the supplied options
    this._applyDefaultOpts();

    // Clear all the cache (sets internal properties too)
    this.clear();

    // Start the cleanup process
    this._startCleanup();
}

CacheHold.prototype._applyDefaultOpts = function() {
    var opts = this.opts;

    // The maximum number of concurrent fetches
    if (!opts.concurrentFetches || !_isInt(opts.concurrentFetches))
        opts.concurrentFetches = 1;

    // The maximum number of call to keep on hold
    if (opts.holdMax == null || !_isInt(opts.holdMax))
        opts.holdMax = Infinity;

    // Time to live of items in memory
    if (!opts.ttl || !_isInt(opts.ttl))
        opts.ttl = Infinity;
    if (!opts.gracePeriod || !_isInt(opts.gracePeriod))
        opts.gracePeriod = 0;
    if (typeof(opts.firstFetchServesAll) !== 'boolean')
        opts.firstFetchServesAll = true;
    if (!opts.cleanupInterval || (opts.cleanupInterval !== Infinity && !_isInt(opts.cleanupInterval)))
        opts.cleanupInterval = 10000;
    if (!opts.updateInterval || !_isInt(opts.updateInterval))
        opts.updateInterval = Infinity;
    if (!opts.concurrentUpdates || !_isInt(opts.concurrentUpdates))
        opts.concurrentUpdates = Infinity;
};

CacheHold.prototype.clear = function() {
    this.cache = { };
    this.callCache = { };
    this.callHold = { };
};

CacheHold.prototype.lookup = function(key, fetchFn, callback) {
    var
        self = this,
        now = (new Date()).getTime(),
        rv = false,
        fetchPromCallback = {
            callback: null
        };

    if (!callback && !global['Promise'])
        throw new Error('No callback was provided');

    // (1) Store the call for later
    if (self.opts.updateInterval !== Infinity)
        self.callCache[key] = fetchFn;

    // (2) If it's in cache, just return it!
    if (self.cache[key] !== undefined) {
        // Cache still valid
        if (self.cache[key].expires >= now)
            return _lookupReturn(self.cache[key].value, callback);
        // Cache not valid but within the grace period
        if (self.cache[key].dies > now) {
            // Ensures there's ONE background fetch task
            self._ensureBackgroundFetch(key, fetchFn);
            // Return what's still in cache
            return _lookupReturn(self.cache[key].value, callback);
        }
    }

    // If one fetch serves all, let's queue them all and the first finishing
    // fetch will answer all queued
    if (self.opts.firstFetchServesAll) {
        // (3) Queue the return
        rv = self._queueCall(key, callback);
        // (8) Are we still allowed to make fetches? Nope? Just return (Promise or false)
        if (self._fetching(key) >= self.opts.concurrentFetches)
            return rv;
    }
    // Otherwise, make a Promise or callback to answer this individual fetch
    else {
        fetchPromCallback = self._makeFetchCallback(callback);
        rv = fetchPromCallback.promise;
        // (8) Are we above the limit of concurrent fetches? So we'll have to queue calls, sorry
        if (self._fetching(key) >= self.opts.concurrentFetches) {
            // (3) Queue the return
            return self._queueCall(key, callback);
        }
    }

    // (4) Call fetcher
    self._callFetcher(key, fetchFn, fetchPromCallback.callback);

    return rv;
};

CacheHold.prototype._ensureBackgroundFetch = function(key, fetchFn) {
    // Is it already fetching? Just wait for it to complete
    if (this._fetching(key))
        return;

    // Not fetching? Trigger a fetch.
    // (4) Call fetcher
    this._callFetcher(key, fetchFn);
};

CacheHold.prototype._fetching = function(key) {
    return _tableValue(this._currentFetches, key);
};

CacheHold.prototype._queueCall = function(key, callback) {
    var
        self = this,
        curOnHold = self.callHold[key] ? self.callHold[key].length : 0;

    // (7) Can we really queue this call?
    if (curOnHold >= self.opts.holdMax) {
        var error = new Error("Both maximums for concurrent fetches and hold items were reached");
        if (!callback && global['Promise'])
            return new Promise(function (resolve, reject) { reject(error) });
        return callback(error);
    }

    // We need to call the fetch function. Put this callback(or Promise)
    // on hold to be called later
    if (!callback && global['Promise']) {
        return new Promise(function (resolve, reject) {
            _addToQueue(self.callHold, key, function(err, res) {
                err ? reject(err) : resolve(res)
            });
        });
    }

    _addToQueue(self.callHold, key, callback);
    return true;
};

CacheHold.prototype._makeFetchCallback = function(callback) {
    var fns = { };
    if (!callback && global['Promise']) {
        return {
            promise: new Promise(function (resolve, reject) {
                fns.resolve = resolve;
                fns.reject = reject;
            }),
            callback: function(err, res) { err ? fns.reject(err) : fns.resolve(res) }
        };
    }

    return {
        promise: false,
        callback: callback
    };
};

CacheHold.prototype._callFetcher = function(key, fetchFn, callback) {
    var
        self = this,
        fetchRetsPromise = false;

    // (8.1) Mark we are fetching
    _tableInc(self._currentFetches, key);

    // Call the fetcher function
    _callFetchFunc(fetchFn, function(err, res) {
        // (8.2) Mark we finished fetching
        _tableDec(self._currentFetches, key);

        // Sets the response in cache
        if (!err)
            self._set(key, res);

        // (6, 5) Answer all calls
        self._answer(key, callback, err, res);
    });
};

CacheHold.prototype._set = function(key, value, now) {
    var
        self = this,
        ttlSecs = self.opts.ttl * 1000;

    if (now === undefined)
        now = (new Date()).getTime();

    self.cache[key] = {
        expires: now + ttlSecs,
        dies:    now + ttlSecs + self.opts.gracePeriod * 1000,
        value:   value
    };

    return self.cache[key];
};

function _callFetchFunc(fetchFn, callback) {
    var
        fetchRetsPromise = false;

    var fetchRV = fetchFn(function(err, res) {
        // Ensure the callback never runs before the fetchFn() finishes
        // as we need to know if it returns a Promise.
        setImmediate(function(){
            if (fetchRetsPromise)
                return;
            callback(err, res);
        });
    });

    // The fetch function returned a Promise, wait for it
    if (global['Promise'] && fetchRV instanceof global['Promise']) {
        fetchRetsPromise = true;
        fetchRV.then(function(res){
            callback(null, res);
        })
        .catch(function(err){
            callback(err, null);
        });
    }
};

CacheHold.prototype._answer = function(key, callback, err, res) {
    // If there's a callback, call it, otherwise fulfill the queued ones
    if (callback)
        // (6) Call the one callback of the originating call
        _protectedCall(callback, err, res);

    // (5) Answer queued calls
    this._answerQueued(key, err, res);
};

CacheHold.prototype._answerQueued = function(key, err, res) {
    var
        queue = this.callHold[key];

    // It might be possible that this call has already been fulfilled
    if (!queue)
        return;
    while (queue.length > 0) {
        _protectedCall(queue.shift(), err, res);
    }
};

CacheHold.prototype._startCleanup = function() {
    var
        self = this;

    if (self.opts.cleanupInterval === Infinity) {
        self._cleanupInt = undefined;
        return;
    }
    self._cleanupInt = setInterval(self._cleanup, self.opts.cleanupInterval);
};

CacheHold.prototype._stopCleanup = function() {
    if (self._cleanupInt !== undefined)
        clearInterval(self._cleanupInt);
};

CacheHold.prototype._cleanup = function() {
    var
        now = (new Date()).getTime();

    for (var key in self.cache) {
        if (self.cache[key].dies < now)
            delete self.cache[key];
    }
};

// Utils
function _isInt(value) {
    return (typeof(value) === 'number' && value.toString().match(/^\d+$/));
}

function _protectedCall(callback, err, res) {
    try {
        return callback(err, res);
    }
    catch(ex) {
        return ex;
    }
};

function _setImmediate(callback) {
    if (global['setImmediate'])
        return setImmediate(callback);
    if (process['nextTick'])
        return process.nextTick(callback);
    return process.setTimeout(callback, 0);
}

function _addToQueue(table, key, value) {
    if (!table[key])
        table[key] = [];
    table[key].push(value);
}

function _tableValue(table, key) {
    if (!table[key])
        return 0;
    return table[key];
}

function _tableInc(table, key) {
    table[key] = _tableValue(table, key) + 1;
    return table[key];
}

function _tableDec(table, key) {
    table[key] = _tableValue(table, key) - 1;
    return table[key];
}

function _lookupReturn(value, callback) {
    if (!callback && global['Promise']) {
        return new Promise(function(res, rej) {
            return res(value);
        });
    }
    return callback(null, value);
}

// Export the "Class"
module.exports = CacheHold;