# node-cache-hold

An advanced in-memory cache module which allows you to keep hold of calls with the same cache key, avoiding the backend to get overwhelmed by calls in case an item expires. It supports both Promises and callbacks and it's fully written in ES5 for maximum compatibility.

## Using it

### With Promises/Async-Await

	const CacheHold = require('cache-hold');
	const cache = new CacheHold({
	  ttl: 120 // 2 minutes
	});
	
	async function makeHTTPCall() { ... }
	
	const value = await cache.lookup('cache_key', () => makeHTTPCall());

### With callbacks

	const CacheHold = require('cache-hold');
	const cache = new CacheHold({
	  ttl: 120 // 2 minutes
	});
	
	function makeHTTPCall(callback) { ... }

	cache.lookup('cache_key', (callback) => makeHTTPCall(callback), (err, res) => {
	  if (err)
	    throw new Error('Failed to make HTTP call');
	  console.log('HTTP call results: ', res);
	});


## The `lookup()` method

The `lookup()` method is the main (and almost only) method of node-cache-hold.

It's called this way: `lookup(cache_key, fetcherFunction[, callback])`.

- The `cache_key` is the key used to lookup and store the data in cache
- The `fetcherFunction` is the function responsible to retrieve the data in cache it's not found in cache; This function is called with one argument, the `callback` but it can also return a `Promise`
- The `callback` is the function called to return the final value; If a callback is not provided and node has built-in `Promise` support, the `lookup()` method will return a `Promise` instance, which you can await on.


## Supported options

The `CacheHold()` constructor options supports all the following settings:

- `ttl` - The time (in seconds) for an item to live in cache; Defaults to `Infinity`
- `gracePeriod` - The extra time (in seconds) for a item to be served from cache while it's retrieval (after ttl expiration) is in progress; Defaults to `0` (zero)
- `concurrentFetches` - The number of concurrent item retrieval calls for the same cache key, after which `lookup()` calls will be queued - in case the item is not found in cache; Example: If your fetch function will make an HTTP request to a backend service, this will be the number of concurrent requests (per cache key) hitting the backend service; Defaults to `1` (zero)
- `holdMax` - The maximum number of queued `lookup()` calls, after which calls will start to be answered with an error; Defaults to `Infinity`
- `firstFetchServesAll` - If set to `true` and `concurrentFetches` is higher than 1, this means that when the first on-going fetch finishes, all the pending calls (queued and on-going) will be fulfilled; If set to `false` all on-going fetches will only fulfill their own `lookup()` calls; Defaults to `true`
- `errorFailsAll` - If set to `true`, if a fetch function returns an error, it will fulfill all queued `lookup()` calls with the returned errors; If set to `false`, a fetch function returning an error will only result in an error being returned to its corresponding `lookup()` call; Defaults to `false`
- `cleanupInterval` - The interval for cleaning up "dead" items in the cache. Dead items are expired items after their grace period.
