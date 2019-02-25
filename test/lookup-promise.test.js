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
        ('doesnt reject multiple calls with one fetch error (with %s fetcher)', async (fetchName, fetchFn) => {
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
                await cache.lookup(cacheKey, modifiedFetchFn);
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
                await cache.lookup(cacheKey, modifiedFetchFn);
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

describe('Time tests', () => {

    const
        slowFetch = (time) => {
            return new Promise((res, rej) => setTimeout(() => res("NOT FROM CACHE"), time));
        },
        sleep = (time) => {
            return new Promise((res, rej) => setTimeout(res, time));
        };

    it('is blazing fast with everything on cache', async () => {
        const
            cacheKey = `cache_key_test_t1`,
            start = new Date().getTime(),
            cache = new CacheHold({
                ttl: 120
            });

        cache._set(cacheKey, "I CAME FROM CACHE");

        // Do 100 lookups in series
        for (let x = 0; x < 100; x++) {
            await cache.lookup(cacheKey, () => slowFetch(1000));
        }

        expect(new Date().getTime() - start).toBeLessThan(50);
    });

    it('takes a bit more than 1 fetch time for 100 calls with nothing in cache', async () => {
        const
            cacheKey = `cache_key_test_t2`,
            start = new Date().getTime(),
            cache = new CacheHold({
                ttl: 120
            });

        // Do 100 lookups in series
        for (let x = 0; x < 100; x++) {
            await cache.lookup(cacheKey, () => slowFetch(1000));
        }

        expect(new Date().getTime() - start).toBeLessThan(1500);
    });

    it('takes a bit more than 1 fetch time for 100 calls with expired item', async () => {
        const
            cacheKey = `cache_key_test_t2`,
            start = new Date().getTime(),
            cache = new CacheHold({
                ttl: 120
            });

        cache._set(cacheKey, "I CAME FROM CACHE", start - 130000);

        // Do 100 lookups in series
        for (let x = 0; x < 100; x++) {
            await cache.lookup(cacheKey, () => slowFetch(1000));
        }

        expect(new Date().getTime() - start).toBeLessThan(1500);
    });

    it('is blazing fast answering to 100 calls for expired item served from cache w/in grace period', async () => {
        const
            cacheKey = `cache_key_test_t2`,
            start = new Date().getTime(),
            cache = new CacheHold({
                ttl: 120,
                gracePeriod: 30
            });

        cache._set(cacheKey, "I CAME FROM CACHE", start - 130000);

        // Do 100 lookups in series
        for (let x = 0; x < 100; x++) {
            rv = await cache.lookup(cacheKey, () => slowFetch(100));
        }

        expect(new Date().getTime() - start).toBeLessThan(50);
    });

    it('when doing background fetch, the last return value comes from the fetch function and is diff from the first', async () => {
        const
            cacheKey = `cache_key_test_t2`,
            start = new Date().getTime(),
            cache = new CacheHold({
                ttl: 120,
                gracePeriod: 30
            }),
            fakeSlowFetch = jest.fn().mockImplementation(slowFetch);
        let
            firstRV,
            lastRV;

        cache._set(cacheKey, "I CAME FROM CACHE", start - 130000);

        // Do 100 lookups in series
        firstRV = await cache.lookup(cacheKey, () => fakeSlowFetch(1000));
        for (let x = 0; x < 10; x++) {
            await sleep(150);
            lastRV = await cache.lookup(cacheKey, () => fakeSlowFetch(1000));
        }

        expect(firstRV).toBe("I CAME FROM CACHE");
        expect(lastRV).toBe("NOT FROM CACHE");
        expect(fakeSlowFetch).toHaveBeenCalledTimes(1);
        expect(new Date().getTime() - start).toBeLessThan(2000);
    });

});
