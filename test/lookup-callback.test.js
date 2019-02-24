const
    assert = require('assert'),
    CacheHold = require('../cache-hold');


describe('Basic lookup with defaults', () => {

    const
        cache = new CacheHold({
            ttl: 10000
        }),
        fetch = (cb) => {
            cb(null, `ERA UMA VEZ`);
        },
        fetchSlow = (cb) => {
            setTimeout(() => {
                cb(null, `ERA UMA VEZ`);
            }, 500);
        },
        fetchError = (cb) => {
            cb(new Error("BAAD"));
        },
        fetchSlowError = (cb) => {
            setTimeout(() => {
                cb(new Error("BAAD"));
            }, 500);
        };


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
        ('fulfills two calls with one fetch', async (fetchName, fetchFn) => {
            // Create a new fetcher which adds a call number to the fetch function return value
            const cacheKey = `cache_key_test_h4 ${fetchName}`;
            const callCount = {};
            callCount[fetchName] = 0;
            const modifiedFetchFn = (cb) => {
                fetchFn((err, rv) => {
                    return err ? cb(err) : cb(null, `${rv} ${callCount[fetchName]++}`);
                });
            };

            for (let x = 0; x < 10; x++)
                cache.lookup(cacheKey, modifiedFetchFn); // Not awaiting on purpose, to make the calls after the first call go to hold

            const rv = await cache.lookup(`cache_key_test_h4 ${fetchName}`, fetchFn);
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
        ('rejects multiple calls with one fetch error (with %s fetcher)', async (fetchName, fetchFn) => {
            // Create a new fetcher which adds a call number to the fetch function return value
            const cacheKey = `cache_key_test_e3 ${fetchName}`;
            const callCount = {};
            callCount[fetchName] = 0;
            const modifiedFetchFn = (cb) => fetchFn((err) => cb(new Error(`${err.message} ${callCount[fetchName]++}`)));

            for (let x = 0; x < 10; x++) {
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
            expect(ex.toString()).toBe("Error: BAAD 0");
        });

        test.each([['fast', fetchError], ['slow', fetchSlowError]])
        ('raises in all calls after one fetch error (with %s fetcher)', async (fetchName, fetchFn) => {
            // Create a new fetcher which adds a call number to the fetch function return value
            const cacheKey = `cache_key_test_e3 ${fetchName}`;
            const callCount = {};
            let errors = 0;

            callCount[fetchName] = 0;
            const modifiedFetchFn = (cb) => fetchFn((err) => cb(new Error(`${err.message} ${callCount[fetchName]++}`)));
            for (let x = 0; x < 10; x++) {
                const rv = cache.lookup(cacheKey, modifiedFetchFn); // Not awaiting on purpose, to make the calls after the first call go to hold
                    rv.catch((ex) => {
                        errors++;
                    }); // just ignore for now - we'll tackle it on the next test
            }

            try {
                await cache.lookup(`cache_key_test_e3 ${fetchName}`, modifiedFetchFn);
            }
            catch(err) {
                ex = err;
                errors++;
            }
            expect(errors).toBe(11);
        });
    });

});


