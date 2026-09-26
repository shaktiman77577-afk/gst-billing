"""
GST Billing sync server (FastAPI).

The app keeps working offline and sends every changed record here.
On a new phone, the same Google account pulls everything back.

Env vars (set in Railway):
  DATABASE_URL         Supabase Postgres "Session pooler" connection string
  FIREBASE_PROJECT_ID  Firebase project id (default: gst-billing-6af3d)
"""

import os
from contextlib import asynccontextmanager
from typing import Any

import firebase_admin
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from firebase_admin import auth as fb_auth
from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool
from pydantic import BaseModel, Field

DATABASE_URL = os.environ["DATABASE_URL"]
FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "gst-billing-6af3d")

# Only these app tables are accepted.
TABLES = {"businesses", "parties", "items", "invoices", "invoice_items", "payments"}
MAX_RECORDS_PER_PUSH = 500
MAX_PULL = 1000

SCHEMA = """
create table if not exists sync_records (
  user_id    text        not null,
  tbl        text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at text        not null,          -- time from the phone (ISO)
  server_seq bigserial,                      -- order in which the server received it
  received   timestamptz not null default now(),
  primary key (user_id, tbl, id)
);
create index if not exists sync_records_user_seq on sync_records (user_id, server_seq);
-- Nobody can read this table through Supabase's public API; only this server can.
alter table sync_records enable row level security;
"""

firebase_admin.initialize_app(options={"projectId": FIREBASE_PROJECT_ID})
pool = AsyncConnectionPool(DATABASE_URL, min_size=1, max_size=5, open=False, kwargs={"prepare_threshold": None})


@asynccontextmanager
async def lifespan(_: FastAPI):
    await pool.open()
    async with pool.connection() as conn:
        await conn.execute(SCHEMA)
    yield
    await pool.close()


app = FastAPI(title="GST Billing Sync", lifespan=lifespan)


def current_user(authorization: str = Header(default="")) -> str:
    """Checks the Firebase login token sent by the app and returns the user id."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "missing token")
    try:
        decoded = fb_auth.verify_id_token(authorization.removeprefix("Bearer ").strip())
    except Exception as exc:  # expired / invalid token
        raise HTTPException(401, "invalid token") from exc
    return decoded["uid"]


class Record(BaseModel):
    tbl: str
    id: str = Field(min_length=1, max_length=64)
    updated_at: str = Field(min_length=10, max_length=40)
    data: dict[str, Any]


class PushBody(BaseModel):
    records: list[Record] = Field(max_length=MAX_RECORDS_PER_PUSH)


@app.get("/health")
async def health():
    return {"ok": True}


@app.post("/sync/push")
async def push(body: PushBody, uid: str = Depends(current_user)):
    """Saves changed records. An older copy never overwrites a newer one."""
    rows = [r for r in body.records if r.tbl in TABLES]
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            for r in rows:
                await cur.execute(
                    """
                    insert into sync_records (user_id, tbl, id, data, updated_at)
                    values (%s, %s, %s, %s, %s)
                    on conflict (user_id, tbl, id) do update
                      set data = excluded.data,
                          updated_at = excluded.updated_at,
                          server_seq = nextval(pg_get_serial_sequence('sync_records', 'server_seq')),
                          received = now()
                      where sync_records.updated_at <= excluded.updated_at
                    """,
                    (uid, r.tbl, r.id, Jsonb(r.data), r.updated_at),
                )
    return {"saved": len(rows)}


@app.get("/sync/pull")
async def pull(since: int = Query(0, ge=0), uid: str = Depends(current_user)):
    """Everything received after `since` (a cursor returned by the previous pull)."""
    async with pool.connection() as conn:
        cur = await conn.execute(
            """
            select tbl, id, data, updated_at, server_seq from sync_records
            where user_id = %s and server_seq > %s
            order by server_seq limit %s
            """,
            (uid, since, MAX_PULL + 1),
        )
        rows = await cur.fetchall()
    more = len(rows) > MAX_PULL
    rows = rows[:MAX_PULL]
    return {
        "records": [{"tbl": r[0], "id": r[1], "data": r[2], "updated_at": r[3]} for r in rows],
        "cursor": rows[-1][4] if rows else since,
        "more": more,
    }


@app.get("/sync/status")
async def status(uid: str = Depends(current_user)):
    """Does this account have data in the cloud? (used right after login)"""
    async with pool.connection() as conn:
        cur = await conn.execute(
            """
            select count(*),
                   count(*) filter (where tbl = 'businesses' and (data->>'deleted_at') is null),
                   max(received)
            from sync_records where user_id = %s
            """,
            (uid,),
        )
        total, businesses, last = await cur.fetchone()
    return {"records": total, "businesses": businesses, "last": last.isoformat() if last else None}


@app.delete("/sync/account")
async def delete_account(uid: str = Depends(current_user)):
    """Deletes all cloud data of this account (for the Play Store data-deletion rule)."""
    async with pool.connection() as conn:
        await conn.execute("delete from sync_records where user_id = %s", (uid,))
    return {"deleted": True}


if __name__ == "__main__":  # local run: python main.py
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
