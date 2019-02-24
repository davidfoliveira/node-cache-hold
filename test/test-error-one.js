const
    CacheHold = require('../cache-hold'),
    cache = new CacheHold({
        cleanupInterval: 0,
        concurrentFetches: 2
    });

let
    callsMade = 0;
    callsFinished = 0;


function slowFail(time, cb) {
    return setTimeout(() => {
        cb(new Error("Random error"), null);
    }, time);
}

function slowOK(time, cb) {
    return setTimeout(() => {
        cb(null, "OK");
    }, time);
}


cache.lookup('bla', (cb) => slowFail(1000, cb), (err, res) => {
    if (err)
        console.log("ONE ERR: ", err);
    else
        console.log("ONE: ", res);
});

setTimeout(() => {
    cache.lookup('bla', (cb) => slowOK(2000, cb), (err, res) => {
        if (err)
            console.log("TWO ERR: ", err);
        else
            console.log("TWO: ", res);
    });
}, 300);

setTimeout(() => {
    cache.lookup('bla', (cb) => slowOK(1000, cb), (err, res) => {
        if (err)
            console.log("THREE ERR: ", err);
        else
            console.log("THREE: ", res);
    });
}, 500);

setTimeout(() => {
    cache.lookup('bla', (cb) => slowOK(1000, cb), (err, res) => {
        if (err)
            console.log("FOUR ERR: ", err);
        else
            console.log("FOUR: ", res);
    });
}, 700);