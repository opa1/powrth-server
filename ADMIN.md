# Admin User Management

## 1. How to promote a user to ADMIN

**Option A — SQL:**

```sql
UPDATE "User" SET role = 'ADMIN' WHERE id = '<user-id>';
```

**Option B — Prisma Studio:**

Run `pnpm prisma studio`, find the user row, set `role` to `ADMIN`, save.

## 2. Warning

There is no API endpoint that creates or promotes admin users. This is
intentional. Never add one.

Admin promotion is a manual, out-of-band operation performed directly on the
database by a trusted operator.

## 3. Revoking admin

```sql
UPDATE "User" SET role = NULL WHERE id = '<user-id>';
```

Setting `role` to `NULL` puts the user back to the onboarding state.
