const
    assert = require('assert'),
    CacheHold = require('../cache-hold'),

    fetch = () => {
        return new Promise((res, rej) => {
            res(`ERA UMA VEZ`);
        });
    },
    fetchSlow = () => {
        return new Promise((res, rej) => {
            setTimeout(() => {
                res(`ERA UMA VEZ`);
            }, 500);
        });
    };
    fetchError = () => {
        return new Promise((res, rej) => {
            rej(new Error("BAAD"));
        });
    },
    fetchSlowError = () => {
        return new Promise((res, rej) => {
            setTimeout(() => {
                rej(new Error("BAAD"));
            }, 500);
        });
    };



describe('Basic lookup with defaults', () => {

    const
        cache = new CacheHold({});

    // HAPPY PATH
    describe('Happy path', () => {
        test.each([['fast', fetch], ['slow', fetchSlow]])
        ('calls the callback (with %s fetcher)', (fetchName, fetchFn, done) => {
            const
                to = setTimeout(() => {
                    assert(false);
                    done();
                }, 2000);

            cache.lookup(`cache_key_test_h1 ${fetchName}`, fetchFn, (err, res) => {
                clearTimeout(to);
                assert(true);
                done();
            });
        });

        test.each([['fast', fetch], ['slow', fetchSlow]])
        ('works with fetch functions returning a Promise (with %s fetcher)', (fetchName, fetchFn, done) => {
            cache.lookup(`cache_key_test_h2 ${fetchName}`, fetchFn, (err, res) => {
                expect(res).toBe("ERA UMA VEZ");
                done();
            });
        });

        test.each([['fast', fetch], ['slow', fetchSlow]])
        ('returns a Promise if no callback is supplied (with %s fetcher)', (fetchName, fetchFn) => {
             const p = cache.lookup(`cache_key_test_h3 ${fetchName}`, fetchFn);
             expect(p).toBeInstanceOf(Promise);
        });

        test.each([['fast', fetch], ['slow', fetchSlow]])
        ('returns a Promise resolving to previously cached data (with %s fetcher)', async (fetchName, fetchFn) => {
            cache.cache[`cache_key_test_h3 ${fetchName}`] = {
                expires: Infinity,
                value: "I LIKE CASH"
            };
            const rv = await cache.lookup(`cache_key_test_h3 ${fetchName}`, fetchFn);
            expect(rv).toBe("I LIKE CASH");
        });

        test.each([['fast', fetch], ['slow', fetchSlow]])
        ('fulfills multiple calls with one fetch (with %s fetcher)', async (fetchName, fetchFn) => {
            // Create a new fetcher which adds a call number to the fetch function return value
            const cacheKey = `cache_key_test_h4 ${fetchName}`;
            const callCount = {};
            callCount[fetchName] = 0;
            const modifiedFetchFn = () => fetchFn().then((rv) => `${rv} ${callCount[fetchName]++}`);

            for (let x = 0; x < 10; x++)
                cache.lookup(cacheKey, modifiedFetchFn); // Not awaiting on purpose, to make the calls after the first call go to hold

            const rv = await cache.lookup(`cache_key_test_h4 ${fetchName}`, modifiedFetchFn);
            expect(rv).toBe("ERA UMA VEZ 0");
        });
    });

    // ERRORS
    describe('Errors', () => {
        test.each([['fast', fetchError], ['slow', fetchSlowError]])
        ('calls the callback (with %s fetcher)', (fetchName, fetchFn, done) => {
            const
                to = setTimeout(() => {
                    assert(false);
                    done();
                }, 2000);

            cache.lookup(`cache_key_test_e1 ${fetchName}`, fetchFn, (err, res) => {
                clearTimeout(to);
                assert(true);
                done();
            });
        });

        test.each([['fast', fetchError], ['slow', fetchSlowError]])
        ('works with fetch functions returning a Promise (with %s fetcher)', (fetchName, fetchFn, done) => {
            cache.lookup(`cache_key_test_e2 ${fetchName}`, fetchFn, (err, res) => {
                expect(err.toString()).toBe("Error: BAAD");
                done();
            });
        });

        test.each([['fast', fetchError], ['slow', fetchSlowError]])
        ('Doesnt reject multiple calls with one fetch error (with %s fetcher)', async (fetchName, fetchFn) => {
            // Create a new fetcher which adds a call number to the fetch function return value
            const cacheKey = `cache_key_test_e3 ${fetchName}`;
            const callCount = {};
            callCount[fetchName] = 0;
            const modifiedFetchFn = () => fetchFn().catch((err) => {
                throw new Error(`${err.message} ${callCount[fetchName]++}`);
            });

            for (let x = 0; x < 3; x++) {
                const rv = cache.lookup(cacheKey, modifiedFetchFn); // Not awaiting on purpose, to make the calls after the first call go to hold
                    rv.catch((ex) => {}); // just ignore for now - we'll tackle it on the next test
            }

            let ex;
            try {
                await cache.lookup(`cache_key_test_e3 ${fetchName}`, modifiedFetchFn);
            }
            catch(err) {
                ex = err;
            }
            expect(ex.toString()).toBe("Error: BAAD 3");
        });

        test.each([['fast', fetch], ['slow', fetchSlow]])
        ('not everything raises if one of the calls have an error (with %s fetcher)', async (fetchName, fetchFn) => {
            // Create a new fetcher which adds a call number to the fetch function return value
            const cacheKey = `cache_key_test_e4 ${fetchName}`;
            const callCount = {};
            let errors = 0;

            callCount[fetchName] = -1;
            const modifiedFetchFn = () => fetchFn().then((rv) => {
                callCount[fetchName]++;
                if (callCount[fetchName] == 0) {
                    throw new Error(`${err.message} ${callCount[fetchName]}`);
                }
                return rv;
            });
            for (let x = 0; x < 10; x++) {
                const rv = cache.lookup(cacheKey, modifiedFetchFn); // Not awaiting on purpose, to make the calls after the first call go to hold
                    rv.catch((ex) => {
                        errors++;
                    }); // just ignore for now - we'll tackle it on the next test
            }

            try {
                await cache.lookup(`cache_key_test_e4 ${fetchName}`, modifiedFetchFn);
            }
            catch(err) {
                ex = err;
                errors++;
            }
            expect(errors).toBe(1);
        });
    });

});

describe('Option errorFailsAll: true', () => {

    const
        cache = new CacheHold({
            errorFailsAll: true
        });

    test.each([['fast', fetch], ['slow', fetchSlow]])
    ('raises in all calls after one fetch error (with %s fetcher)', async (fetchName, fetchFn) => {
        // Create a new fetcher which adds a call number to the fetch function return value
        const cacheKey = `cache_key_test_e5 ${fetchName}`;
        const callCount = {};
        let errors = 0;

        callCount[fetchName] = 0;
        const modifiedFetchFn = () => fetchFn().then((rv) => {
            // Make the first call (only) fail
            if (callCount[fetchName] == 0)
                throw new Error(`${err.message} ${callCount[fetchName]++}`);
            return rv;
        });
        for (let x = 0; x < 10; x++) {
            const rv = cache.lookup(cacheKey, modifiedFetchFn); // Not awaiting on purpose, to make the calls after the first call go to hold
                rv.catch((ex) => {
                    errors++;
                }); // just ignore for now - we'll tackle it on the next test
        }

        try {
            await cache.lookup(`cache_key_test_e5 ${fetchName}`, modifiedFetchFn);
        }
        catch(err) {
            ex = err;
            errors++;
        }
        // All calls should fail with `errorFailsAll: true`
        expect(errors).toBe(11);
    });

});

