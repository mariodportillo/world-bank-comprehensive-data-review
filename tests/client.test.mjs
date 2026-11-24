import test from "node:test";
import assert from "node:assert/strict";
import {createWorldBankClient, latestNonNull} from "../web/world-bank.mjs";

const json = body => new Response(JSON.stringify(body), {headers: {"Content-Type": "application/json"}});

test("follows all pages, accepts string pagination, preserves provenance and caches completed responses", async () => {
  let calls = 0;
  const client = createWorldBankClient({fetchImpl: async url => {
    calls++;
    const page = Number(new URL(url).searchParams.get("page"));
    return json([{page: String(page), pages: "2", total: "3"}, page === 1 ? [{id: 1}, {id: 2}] : [{id: 3}]]);
  }});
  const result = await client.getAll("indicator", {source: 12, per_page: 2});
  assert.deepEqual(result.rows.map(x => x.id), [1, 2, 3]);
  assert.equal(result.requests.length, 2);
  assert.ok(result.requests.every(url => new URL(url).searchParams.get("source") === "12"));
  result.rows[0].id = 99;
  const again = await client.getAll("indicator", {source: 12, per_page: 2});
  assert.equal(again.rows[0].id, 1);
  assert.equal(calls, 2);
});

test("detects API error envelopes delivered with HTTP 200", async () => {
  const client = createWorldBankClient({fetchImpl: async () => json([{message: [{id: "120", value: "Invalid value"}]}])});
  await assert.rejects(client.getAll("indicator"), /120.*Invalid value/);
});

test("preserves zero and null, flags nonannual periods, and adds explicit source", async () => {
  const rows = [null, 0, 2].map((value, i) => ({indicator: {id: "SE.TEST", value: "Observation label"},
    country: {id: "MX", value: "Mexico"}, countryiso3code: "MEX", date: ["2020", "2021", "2022Q1"][i], value}));
  const client = createWorldBankClient({fetchImpl: async () => json([{page: 1, pages: 1, total: 3}, rows])});
  const result = await client.observations({source: 12, indicators: "SE.TEST"});
  assert.deepEqual(result.rows.map(x => x.value), [null, 0, 2]);
  assert.deepEqual(result.rows.map(x => x.year), [2020, 2021, null]);
  assert.equal(result.rows[0].sourceId, "12");
});

test("rejects incomplete results and nested metadata envelopes", async () => {
  const incomplete = createWorldBankClient({fetchImpl: async () => json([{page: 1, pages: 1, total: 2}, [{id: 1}]])});
  await assert.rejects(incomplete.getAll("indicator"), /Incomplete result/);
  const nested = createWorldBankClient({fetchImpl: async () => json({page: 1, pages: 1, source: []})});
  await assert.rejects(nested.getAll("sources/12/series/SE.LPV.PRIM/metadata"), /Expected/);
  assert.deepEqual((await nested.request("sources/12/series/SE.LPV.PRIM/metadata")).payload.source, []);
});

test("rejects drifting pagination totals", async () => {
  const client = createWorldBankClient({fetchImpl: async url => {
    const page = Number(new URL(url).searchParams.get("page"));
    return json([{page, pages: 2, total: page === 1 ? 2 : 3}, [{}]]);
  }});
  await assert.rejects(client.getAll("indicator"), /changed during pagination/);
});

test("latest values preserve year, exclude nulls, retain zero, and keep sources separate", () => {
  const rows = [
    {sourceId: "12", iso3: "MEX", indicatorId: "X", year: 2020, value: 10},
    {sourceId: "12", iso3: "MEX", indicatorId: "X", year: 2021, value: 0},
    {sourceId: "12", iso3: "MEX", indicatorId: "X", year: 2022, value: null},
    {sourceId: "2", iso3: "MEX", indicatorId: "X", year: 2020, value: 12}
  ];
  assert.deepEqual(latestNonNull(rows).map(x => [x.sourceId, x.year, x.value]), [["12", 2021, 0], ["2", 2020, 12]]);
  assert.equal(latestNonNull(rows, {minYear: 2022}).length, 0);
});

test("retries transient HTTP errors a bounded number of times", async () => {
  let calls = 0;
  const client = createWorldBankClient({fetchImpl: async () => {
    calls++;
    return calls < 3 ? new Response("busy", {status: 503, headers: {"retry-after": "0"}})
      : json([{page: 1, pages: 1, total: 0}, null]);
  }});
  assert.equal((await client.getAll("indicator")).rows.length, 0);
  assert.equal(calls, 3);
});

test("propagates cancellation and rejects unsafe or oversized queries before fetching", async () => {
  const client = createWorldBankClient({fetchImpl: async () => {throw new Error("unexpected fetch");}});
  const controller = new AbortController(); controller.abort();
  await assert.rejects(client.getAll("indicator", {}, {signal: controller.signal}), {name: "AbortError"});
  await assert.rejects(client.observations({indicators: "SE.PRM.ENRR"}), /source/);
  await assert.rejects(client.observations({source: 12, indicators: Array(61).fill("X")}), /60/);
  assert.throws(() => client.urlFor("https://example.com"), /relative/);
  assert.throws(() => client.urlFor("indicator/" + "X".repeat(1501)), /limit/);
});

test('retries a request timeout and returns the next successful response', async () => {
  let calls = 0;
  const client = createWorldBankClient({timeoutMs: 10, retries: 1, fetchImpl: async (url, {signal}) => {
    calls++;
    if (calls === 1) return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), {once:true}));
    return json([{page:1,pages:1,total:0},null]);
  }});
  assert.equal((await client.getAll('indicator')).rows.length,0);
  assert.equal(calls,2);
});

test('user cancellation during a request is never retried', async () => {
  let calls = 0;
  const controller = new AbortController();
  const client = createWorldBankClient({timeoutMs:1000,retries:2,fetchImpl: async (url,{signal}) => {
    calls++;
    return new Promise((resolve,reject) => {
      signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
      queueMicrotask(()=>controller.abort());
    });
  }});
  await assert.rejects(client.getAll('indicator',{}, {signal:controller.signal}),{name:'AbortError'});
  assert.equal(calls,1);
});
