const
    CacheHold = require('../cache-hold'),
    cache = new CacheHold({
        ttl: 10000,
        concurrentFetches: 2,
        firstFetchServesAll: false,
        holdMax: 0
    });
let
    callsMade = 0;
    callsFinished = 0;

function sleep(time, cb) {
    console.log("SLEEP");
    callsMade++;
    return setTimeout(() => {
        cb(null, "ERA UMA VEZ "+(callsFinished++))
    }, time);
}

cache.lookup('bla1', (cb) => sleep(2500, cb), (err, res) => {
    if (err)
        return console.log("ONE ERR: ", err);
    console.log("ONE: ", res);
});
setTimeout(() => {
    cache.lookup('bla1', (cb) => sleep(2500, cb), (err, res) => {
        if (err)
            return console.log("TWO ERR: ", err);
        console.log("TWO: ", res);
    });
}, 1000);
setTimeout(() => {
    cache.lookup('bla1', (cb) => sleep(2500, cb), (err, res) => {
        if (err)
            return console.log("THREE ERR: ", err);
        console.log("THREE: ", res);
    });
}, 1100);

setTimeout(() => {
    console.log("Calls to sleep: ", callsMade);
}, 2700);