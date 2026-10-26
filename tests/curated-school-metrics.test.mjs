import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { extraMetricOptions, getSchoolMetric } from '../lib/curated-school-metrics.ts';

const metric = value => ({ value, label:'Subject', year:'2024–25', unit:'percent', source:'https://data.nysed.gov/downloads.php', note:'Published subject result.', lowerIsBetter:false });

test('combined academics require both subjects with matching units, years, and sources', () => {
  const school={metrics:{'ela-middle':metric(0),'math-middle':metric(80)}};
  assert.equal(getSchoolMetric(school,'academic-average').value,40);
  for (const mismatch of [{year:'2023–24'}, {unit:'index'}, {source:'https://other.gov'}]) {
    assert.equal(getSchoolMetric({metrics:{...school.metrics,'math-middle':{...metric(80),...mismatch}}},'academic-average'),undefined);
  }
  assert.equal(getSchoolMetric({metrics:{'ela-middle':metric(80)}},'academic-average'),undefined);
});

test('subject exam results stay available in details but never fill the color menu', () => {
  const school={metrics:{'regents-geometry':metric(70),'ela-middle':metric(60),'math-middle':metric(80),spending:{...metric(20000),unit:'currency'}}};
  assert.deepEqual(extraMetricOptions([school]).map(([key])=>key),['academic-average','spending']);
  assert.deepEqual(extraMetricOptions([school],false).map(([key])=>key),['spending']);
  assert.equal(school.metrics['regents-geometry'].value,70);
});

test('every region and level keeps at most ten useful color choices', () => {
  for (const name of readdirSync(new URL('../public/',import.meta.url)).filter(name=>name.endsWith('schools.json'))) {
    const schools=JSON.parse(readFileSync(new URL('../public/'+name,import.meta.url),'utf8'));
    const hasBaseline=name==='schools.json' || name==='westchester-schools.json' || name==='middle-nyc-schools.json' || (!name.startsWith('middle-') && !name.startsWith('high-'));
    const options=extraMetricOptions(schools,!hasBaseline);
    const total=options.length + 1 + Number(hasBaseline);
    assert.ok(total<=10, `${name} has ${total} options`);
    assert.ok(options.every(([key])=>!key.startsWith('regents-regents-') && !key.startsWith('ela-') && !key.startsWith('math-')));
  }
});
