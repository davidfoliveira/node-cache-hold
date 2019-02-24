const
    CacheHold = require('../cache-hold'),
    cache = new CacheHold({
        ttl: 1,
        gracePeriod: 2
    }),
    now = (new Date()).getTime();

let
    callsMade = 0;

function sleep(time, cb) {
    console.log("SLEEP");
    callsMade++;
    return setTimeout(() => {
        cb(null, "I DID not COME FROM CACHE")
    }, time);
}


// Feed the cache with something
cache._set("bla", "I CAME FROM CACHE", now);


cache.lookup('bla', (cb) => sleep(3000, cb), (err, res) => {
    if (err)
        return console.log("ONE ERR: ", err);
    console.log("ONE: ", res);
});

setTimeout(() => {
    cache.lookup('bla', (cb) => sleep(3000, cb), (err, res) => {
        if (err)
            return console.log("TWO ERR: ", err);
        console.log("TWO: ", res);
    });
}, 1100);

setTimeout(() => {
    cache.lookup('bla', (cb) => sleep(3000, cb), (err, res) => {
        if (err)
            return console.log("THREE ERR: ", err);
        console.log("THREE: ", res);
    });
}, 3100);

setTimeout(() => {
    cache.lookup('bla', (cb) => sleep(500, cb), (err, res) => {
        if (err)
            return console.log("FOUR ERR: ", err);
        console.log("FOUR: ", res);
    });
}, 7000);
