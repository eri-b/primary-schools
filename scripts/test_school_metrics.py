"""Regression checks for official school-outcome imports (no network)."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import add_school_metrics as m
from school_metric_io import write_schools


class SchoolMetricsTests(unittest.TestCase):
    def test_base_refresh_preserves_metrics_only_for_the_same_school(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'schools.json'
            path.write_text(json.dumps([{'id':'old', 'metrics':{'spending':{'value':100}}}]))
            write_schools(path, [{'id':'old', 'name':'Renamed'}, {'id':'new', 'name':'New school'}])
            records = json.loads(path.read_text())
            self.assertEqual(records[0]['metrics']['spending']['value'],100)
            self.assertNotIn('metrics',records[1])

    def test_suppression_and_zero(self):
        for value in ('*', 's', '-', '≤5', '<10', 'Fewer than 10 testers', -1, 'NaN', 'Infinity', None):
            self.assertIsNone(m.number(value))
        self.assertEqual(m.number('0%'), 0)
        self.assertEqual(m.number('$12,345'), 12345)
        result = {}
        m.metric(result, 'zero', 0, 'Dropout', m.NY_URL)
        m.metric(result, 'suppressed', '*', 'Dropout', m.NY_URL)
        self.assertEqual(result['zero']['value'], 0)
        self.assertNotIn('suppressed', result)

    def test_ny_aggregates_combined_math_without_double_counting(self):
        def row(name, tested, proficient):
            return dict(ENTITY_CD='school', INSTITUTION_ID='inst', ASSESSMENT_NAME=name, NUM_TESTED=tested, NUM_PROF=proficient)
        tables = {
            'Annual EM ELA': [row('ELA6', '100', '50'), row('ELA7', '10', '*')],
            'Annual EM MATH': [row('MATH6', '100', '60'), row('RegentsMath6', '20', '20'), row('Combined6Math', '120', '80')],
            'GRAD_RATE_AND_OUTCOMES_2025': [dict(AGGREGATION_TYPE='School', MEMBERSHIP_DESC='2021 Total Cohort - 4 Year Outcome - August 2025', AGGREGATION_CODE='school', INSTITUTION_ID='inst', ENROLL_CNT=100, GRAD_CNT='90', GRAD_PCT='90%', REG_ADV_CNT='30', REG_ADV_PCT='30%', REG_CNT='50', DROPOUT_CNT='5', DROPOUT_PCT='5%')],
        }
        with patch.object(m, 'access_rows', side_effect=lambda folder, archive, table: tables.get(table, [])):
            data, _ = m.ny_metrics(Path('/unused'))
        self.assertNotIn('ela-middle', data['school'])
        self.assertEqual(data['school']['math-middle']['value'], 66.7)
        self.assertEqual(data['school']['regents-diploma']['value'], 80)
        self.assertEqual(data['school']['advanced-regents']['value'], 30)
        self.assertTrue(data['school']['dropout']['lowerIsBetter'])

    def test_ct_fractions_are_converted_but_indices_are_not(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'ct.json'
            path.write_text(json.dumps([dict(schoolcode='1234567', ind1ela_all_rate='64.2', ind4rate='0.173', ind6rate='*')]))
            with patch.object(m, 'download', return_value=path), patch.object(m, 'ct_spending', return_value={'1234567':12345}), patch.object(m, 'ct_graduation', return_value={'1234567':91.5}):
                metrics=m.ct_metrics(Path(folder))['1234567']
            self.assertEqual(metrics['ela-index']['value'],64.2)
            self.assertEqual(metrics['absenteeism']['value'],17.3)
            self.assertEqual(metrics['graduation']['value'],91.5)
            self.assertEqual(metrics['spending']['unit'],'currency')
            self.assertNotIn('college-readiness',metrics)

    def test_checked_in_school_metrics_and_red_hook_grades(self):
        for path in m.PUBLIC.glob('*schools.json'):
            schools=json.loads(path.read_text())
            self.assertTrue(any(s.get('metrics') for s in schools), path.name)
            for school in schools:
                for metric in school.get('metrics',{}).values():
                    self.assertGreaterEqual(metric['value'],0)
                    if metric['unit']=='percent': self.assertLessEqual(metric['value'],100)
                    self.assertTrue(metric['source'].startswith('https://'))
                    self.assertIn(metric['year'], ('2023–24','2024–25'))
        middle=json.loads((m.PUBLIC/'middle-hudson-valley-schools.json').read_text())
        high=json.loads((m.PUBLIC/'high-hudson-valley-schools.json').read_text())
        linden=next(s for s in middle if s['id']=='362424003333')
        self.assertEqual(linden['grades'],'06-08')
        self.assertNotIn('362424003333',{s['id'] for s in high})
        self.assertEqual(linden['metrics']['math-middle']['value'],67.3)
        red_hook=next(s for s in high if s['id']=='362424003334')
        self.assertEqual(red_hook['metrics']['graduation']['value'],92.6)
        self.assertEqual(red_hook['metrics']['spending']['value'],37642)


if __name__=='__main__': unittest.main()
