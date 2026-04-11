# Testing ESCO Skills Cache

## Test the Cache Behavior

### 1. Check Cache Headers

```bash
# Make a request and check the response headers
curl -I "http://localhost:3000/api/skills/all?locale=en"

# Look for:
# Cache-Control: public, s-maxage=31536000, stale-while-revalidate=86400
```

### 2. Test Cache Hit/Miss

**First request (cache miss):**

```bash
time curl "http://localhost:3000/api/skills/all?locale=en" > /dev/null
# Note the time - should be slower (fetching from DB)
```

**Second request (cache hit):**

```bash
time curl "http://localhost:3000/api/skills/all?locale=en" > /dev/null
# Should be much faster (served from cache)
```

### 3. Add a Timestamp to Verify Caching

Temporarily add a timestamp to the API response to see when it was generated:

```typescript
// In wev-bulletin/app/api/skills/all/route.ts
return NextResponse.json(
  {
    skills,
    _cached_at: new Date().toISOString(), // Add this temporarily
  },
  // ... rest of code
);
```

Then make multiple requests:

```bash
curl "http://localhost:3000/api/skills/all?locale=en" | jq '._cached_at'
# Wait a few seconds
curl "http://localhost:3000/api/skills/all?locale=en" | jq '._cached_at'
# Should show the SAME timestamp (proving it's cached)
```

### 4. Test Manual Revalidation

**Step 1: Get initial cached timestamp**

```bash
curl "http://localhost:3000/api/skills/all?locale=en" | jq '._cached_at'
# Note the timestamp
```

**Step 2: Trigger revalidation**

```bash
curl -X POST "http://localhost:3000/api/skills/revalidate?secret=***REMOVED_REVALIDATION_SECRET***"
# Should return: {"revalidated":true,"timestamp":"..."}
```

**Step 3: Fetch again to see new timestamp**

```bash
curl "http://localhost:3000/api/skills/all?locale=en" | jq '._cached_at'
# Should show a NEW timestamp (proving cache was cleared)
```

### 5. Test Invalid Secret

```bash
curl -X POST "http://localhost:3000/api/skills/revalidate?secret=wrong"
# Should return: {"error":"Invalid secret"} with 401 status
```

## Production Testing

Once deployed, test the same way but with your production URL:

```bash
# Check headers
curl -I "https://bulletin.wevchange.org/api/skills/all?locale=en"

# Test revalidation
curl -X POST "https://bulletin.wevchange.org/api/skills/revalidate?secret=YOUR_PROD_SECRET"
```

## Monitoring Cache Performance

### Check Response Times

```bash
# Run this a few times to see cache performance
for i in {1..5}; do
  echo "Request $i:"
  time curl -s "http://localhost:3000/api/skills/all?locale=en" > /dev/null
  echo ""
done
```

First request should be slower (DB fetch), subsequent requests should be instant (cache hit).

### Browser DevTools

1. Open DevTools → Network tab
2. Navigate to profile page (loads skills)
3. Look for the `/api/skills/all` request
4. Check:
   - **Size**: Should show "from disk cache" or "from memory cache" on subsequent loads
   - **Time**: Should be <10ms for cached responses
   - **Headers**: Check `Cache-Control` header

## Clean Up

Remember to remove the `_cached_at` timestamp from the production code after testing!
