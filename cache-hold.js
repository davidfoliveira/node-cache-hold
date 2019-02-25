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
    if (typeof(opts.errorFailsAll) !== 'boolean')
        opts.errorFailsAll = false;
    if (opts.cleanupInterval == null || (opts.cleanupInterval !== Infinity && !_isInt(opts.cleanupInterval)))
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
        call = null,
        rv = null,
        fetchPromCall = {
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
            self._ensureBackgroundFetch(key, new Call(fetchFn, function(){}));
            // Return what's still in cache
            return _lookupReturn(self.cache[key].value, callback);
        }
    }

    // Create a call object which will be used until it's fulfilled
    call = new Call(fetchFn, callback);

    // If one fetch serves all, let's queue them all and the first finishing
    // fetch will answer all queued
    if (self.opts.firstFetchServesAll) {
        // (3) Queue the return
        rv = self._queueCall(key, call).promise;
        // (8) Are we still allowed to make fetches? Nope? Just return (Promise or false)
        if (self._fetching(key) >= self.opts.concurrentFetches)
            return rv || false;
    }
    // Otherwise, make a Promise or callback to answer this individual fetch
    else {
        rv = fetchPromCall.promise;
        // (8) Are we above the limit of concurrent fetches? So we'll have to queue calls, sorry
        if (self._fetching(key) >= self.opts.concurrentFetches)
            // (3) Queue the call
            return self._queueCall(key, fetchPromCall).promise || false;
    }

    // (4) Call fetcher
    self._callFetcher(key, call);

    return rv || true;
};

CacheHold.prototype._ensureBackgroundFetch = function(key, call) {
    // Is it already fetching? Just wait for it to complete
    if (this._fetching(key))
        return;

    // Not fetching? Trigger a fetch.
    // (4) Call fetcher
    this._callFetcher(key, call);
};

CacheHold.prototype._fetching = function(key) {
    return _tableValue(this._currentFetches, key);
};

CacheHold.prototype._queueCall = function(key, call) {
    var
        self = this,
        curOnHold = self.callHold[key] ? self.callHold[key].length : 0;

    // (7) Can we really queue this call?
    if (curOnHold >= self.opts.holdMax) {
        call.return(new Error("Both maximums for concurrent fetches and hold items were reached"));
        return call;
    }

    // Just queue it
    call.queued = true;
    _addToQueue(self.callHold, key, call);
    return call;
};

// TODO: This is not O(1)
CacheHold.prototype._dequeueCall = function(key, call) {
    var
        foundAt = null;

    // This should never happen but well....
    if (!this.callHold[key]) {
        console.log("node-cache-hold: CALL HOLD LIST IS EMTPY FOR "+key);
        return;
    }

    for (var x = 0; x < this.callHold[key].length; x++) {
        if (this.callHold[key][x] == call) {
            foundAt = x;
            break;
        }
    }

    // This should never happen as well
    if (foundAt === null) {
        console.log("node-cache-hold: CALL NOT FOUND FOR "+key);
        return;
    }

    // Just remove it
    this.callHold[key].splice(foundAt, 1);

    return call;
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

CacheHold.prototype._callFetcher = function(key, call) {
    var
        self = this,
        fetchRetsPromise = false;

    // (8.1) Mark we are fetching
    _tableInc(self._currentFetches, key);

    // Call the fetcher function
    call.fetch(function(err, res) {
        // (8.2) Mark we finished fetching
        _tableDec(self._currentFetches, key);

        // Sets the response in cache
        if (!err)
            self._set(key, res);

        // (6, 5) Answer all calls
        self._answer(key, call, err, res);
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

CacheHold.prototype._fetchNext = function(key) {
    var
        unfetchedCall;

    // Are there calls on hold? No! Forget it!
    if (!this.callHold[key])
        return;

    // Find a call on hold that hasn't fetched yet
    for (var x = 0; x < this.callHold[key].length; x++) {
        if (!this.callHold[key][x].fetched) {
            unfetchedCall = this.callHold[key][x];
            break;
        }
    }

    // Found nothing! Forget it!
    if (!unfetchedCall)
        return;

    // Call it's fetcher
    return this._callFetcher(key, unfetchedCall);
};

CacheHold.prototype._answer = function(key, call, err, res) {
    // If there's a callback, call it, otherwise fulfill the queued ones
    if (!call.queued)
        // (6) Call the one callback of the originating call
        call.return(err, res);

    // If there's an error, don't answer queued calls, unless `errorFailsAll: true`
    if (err && !this.opts.errorFailsAll) {
        // Actually, if the call triggering the fetch was queued, answer it!
        if (call.queued)
            call.return(err, res);

        // Remove this call from the queue
        this._dequeueCall(key, call);

        // If there's no on-going fetch, pull another task from the queue that
        // hasn't fetched and call it's fetcher.
        if (!this._fetching(key))
            this._fetchNext(key);
        return;
    }

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
        queue.shift().return(err, res);
    }
};

CacheHold.prototype._startCleanup = function() {
    var
        self = this;

    if (self.opts.cleanupInterval === Infinity || !self.opts.cleanupInterval) {
        self._cleanupInt = undefined;
        return;
    }
    self._cleanupInt = setInterval(self._cleanup, self.opts.cleanupInterval*1000);
};

CacheHold.prototype._stopCleanup = function() {
    if (self._cleanupInt !== undefined)
        clearInterval(self._cleanupInt);
};

CacheHold.prototype._cleanup = function() {
    var
        self = this,
        now = (new Date()).getTime();

    for (var key in self.cache) {
        if (self.cache[key].dies < now)
            delete self.cache[key];
    }
};


// The cache "request" object
function Call(fetcher, callback) {
    var fns = {};
    this.id = Math.random();
    this.fetcher = fetcher;
    this.callback = callback;
    this.queued = false;
    this.fetched = false;
    this.returned = false;

    // If a callback wasn't supplied, the user might be expecting a promise
    if (!callback && global['Promise']) {
        this.promise = new Promise(function (resolve, reject) {
            fns.resolve = resolve;
            fns.reject = reject;
        });
        this.callback = function(err, res) { err ? fns.reject(err) : fns.resolve(res) };
    }

    return this;
}

Call.prototype.fetch = function(callback) {
    // console.log("Fetching "+this.id);
    var
        fetchRetsPromise = false,
        fetchRV;

    // Mark the call as fetched
    this.fetched = true;

    // Call the fetcher function
    fetchRV = this.fetcher(function(err, res) {
        // Ensure the callback never runs before the fetchFn() finishes
        // as we need to know if it returns a Promise.
        _setImmediate(function(){
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

Call.prototype.return = function(err, res) {
    if (this.returned) {
        console.log("node-cache-hold: Trying to return to a call which already had its answer returned. Stopping it.");
        return;
    }
    // console.log("Returning "+this.id);

    this.returned = true;
    try {
        return this.callback(err, res);
    }
    catch(ex) {
        return ex;
    }
};


// Utils
function _isInt(value) {
    return (typeof(value) === 'number' && value.toString().match(/^\d+$/));
}

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