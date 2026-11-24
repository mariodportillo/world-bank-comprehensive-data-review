import test from 'node:test';
import assert from 'node:assert/strict';
import {latestRows, csvFor, readSelection} from '../web/data-utils.mjs';

test('latest selection keeps actual dates, zero, and separate source identities', () => {
  const common = {indicatorId:'X',iso3:'MEX',country:'Mexico'};
  const rows = [{...common,sourceId:'2',year:2023,value:5}, {...common,sourceId:'2',year:2024,value:0},
    {...common,sourceId:'2',year:2025,value:null}, {...common,sourceId:'12',year:2022,value:7}];
  assert.deepEqual(latestRows(rows).map(r => [r.sourceId,r.year,r.value]), [['2',2024,0],['12',2022,7]]);
});

test('CSV preserves missingness, zero, provenance and quoted country names', () => {
  const csv = csvFor([{country:'Country, "Example"',year:2024,value:0}, {country:'Other',year:2023,value:null}],
    {retrievedAt:'2026-11-24',meta:{lastupdated:'2026-10-08'}});
  assert.ok(csv.includes('"Country, ""Example"""'));
  assert.ok(csv.includes('"2024","0"'));
  assert.ok(csv.includes('"2023",""'));
  assert.ok(csv.includes('"2026-11-24","2026-10-08"'));
});

test('bookmark query validation rejects invalid years and missing countries', () => {
  const sources = new Set(['2','12']), countries = new Set(['MEX','CAN']);
  assert.deepEqual(readSelection(new URLSearchParams(),sources,countries),
    {source:'2',indicator:'SE.PRM.CMPT.ZS',countries:['MEX','CAN'],start:2010,end:2025});
  assert.throws(() => readSelection(new URLSearchParams('start=2025&end=2020'),sources,countries));
  assert.throws(() => readSelection(new URLSearchParams('countries='),sources,countries));
  assert.throws(() => readSelection(new URLSearchParams('countries=XXX'),sources,countries));
  assert.throws(() => readSelection(new URLSearchParams('source=99'),sources,countries));
});
