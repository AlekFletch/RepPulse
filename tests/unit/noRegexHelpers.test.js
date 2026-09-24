/**
 * The watch has no RegExp (install error 34), so these helpers were rewritten with loops.
 * Here they are checked against the original regex implementations (Node has RegExp).
 */
import { fill } from '../../entry/src/main/js/MainAbility/common/util/format.js';
import { toAsciiJson } from '../../entry/src/main/js/MainAbility/common/util/json.js';
import { toUri } from '../../entry/src/main/js/MainAbility/common/storage/paths.js';

function fillRegex(template, params) {
  return String(template).replace(/\{(\w+)\}/g, function (match, key) {
    return params && Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match;
  });
}

function toAsciiJsonRegex(value) {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, function (ch) {
    return '\\u' + ('0000' + ch.charCodeAt(0).toString(16)).slice(-4);
  });
}

describe('regex-free helpers match the regex versions', () => {
  test('fill', () => {
    const params = { current: 2, total: 5, a_1: 'x', empty: '' };
    const templates = [
      'Подход {current} из {total}', '{current}{total}', '{unknown} {current}', '{a{current}}',
      '{ current}', '{}', '{', '}', 'no placeholders', '{a_1}{empty}|', '{{current}}', 'tail {current'
    ];
    for (const t of templates) {
      expect(fill(t, params)).toBe(fillRegex(t, params));
    }
    expect(fill('{current}', null)).toBe(fillRegex('{current}', null));
    expect(fill(42, params)).toBe('42');
  });

  test('toAsciiJson', () => {
    const values = [{ name: 'Отжимания', note: 'tab\t"q"', del: '\u007f', high: '\uffff', emoji: '💪' }, [1, 'a'], 'plain', 3];
    for (const v of values) {
      expect(toAsciiJson(v)).toBe(toAsciiJsonRegex(v));
      expect(JSON.parse(toAsciiJson(v))).toEqual(v);
    }
  });

  test('toUri rejects every forbidden character', () => {
    const forbidden = /[*+,:;<=>?[\]|"\\]/;
    const chars = '*+,:;<=>?[]|"\\abc-_.0/';
    for (let i = 0; i < chars.length; i++) {
      const path = 'workouts/a' + chars.charAt(i) + 'b.json';
      expect(toUri(path) === null).toBe(forbidden.test(path));
    }
    expect(toUri('workouts/abc.json')).toBe('internal://app/workouts/abc.json');
  });
});
