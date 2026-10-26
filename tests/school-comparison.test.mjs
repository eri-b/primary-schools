import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterAndSortSchools } from '../lib/school-comparison.ts';

const schools = [{name:'Zero',value:0}, {name:'Missing',value:null}, {name:'Higher',value:90}, {name:'Lower',value:20}];
const get = school => school.value;
const range = {min:null,max:null,onlyAvailable:false};
test('numeric sorting keeps missing values last in both directions and retains zero', () => {
  assert.deepEqual(filterAndSortSchools(schools,get,range,'ascending').sorted.map(s=>s.name), ['Zero','Lower','Higher','Missing']);
  assert.deepEqual(filterAndSortSchools(schools,get,range,'descending').sorted.map(s=>s.name), ['Higher','Lower','Zero','Missing']);
});
test('range bounds are inclusive and never treat missing results as zero', () => {
  assert.deepEqual(filterAndSortSchools(schools,get,{...range,min:0,max:20},'ascending').schools.map(s=>s.name), ['Zero','Lower']);
  assert.deepEqual(filterAndSortSchools(schools,get,{...range,max:0},'ascending').schools.map(s=>s.name), ['Zero']);
  assert.equal(filterAndSortSchools(schools,get,{...range,min:50,max:20},'ascending').schools.length,0);
});
test('availability and name sorting work independently; source order is preserved', () => {
  const result=filterAndSortSchools(schools,get,{...range,onlyAvailable:true},'name');
  assert.deepEqual(result.sorted.map(s=>s.name), ['Higher','Lower','Zero']);
  assert.equal(schools[0].name,'Zero');
  assert.equal(filterAndSortSchools(schools,get,range,'name').sorted[2].name,'Missing');
});

const {metricColor, metricText, METRIC_COLORS, MISSING_COLOR} = await import('../lib/map-metrics.ts');
test('lower-is-better rates keep zero green when quartiles coincide', () => {
  assert.equal(metricColor(0,[0,0,2],true),METRIC_COLORS[3]);
  assert.equal(metricColor(20,[0,0,2],true),METRIC_COLORS[0]);
  assert.equal(metricColor(null,[0,0,2],true),MISSING_COLOR);
  assert.equal(metricText(12345,'currency'),'$12,345');
});
