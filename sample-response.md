Sure! I've fixed the token refresh bug in `src/auth/token_store.ts`.

## What changed

- The `refreshToken()` call was firing **before** the mutex was acquired, so two
  concurrent requests could both see an expired token and both refresh.
- Moved the acquire above the expiry check and added a [regression test](https://example.com/pr/42).

```typescript
async function refresh(store: TokenStore) {
  const release = await store.mutex.acquire();
  try {
    if (!store.isExpired()) return store.token;
    return await store.fetchNew();
  } finally { release(); }
}
```

| Test | Before | After |
|---|---|---|
| concurrent refresh | fail | pass |

All 51 tests pass now. 🎉
