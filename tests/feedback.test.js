import { test, expect, describe } from 'vitest';
import { issueUrl, tidy, REPO, MAX_CHARS, MAX_URL } from '../src/core/feedback.js';

const parts = (url) => { const u = new URL(url); return { u, title: u.searchParams.get('title'), body: u.searchParams.get('body') }; };

describe('feedback: the text a player typed becomes a GitHub new-issue link', () => {
  test('nothing to say gives no link', () => {
    for (const t of ['', '   ', '\n\n\t', null, undefined, 5, {}]) expect(issueUrl(t)).toBeNull();
  });
  test('the link opens a new issue on the game\'s own repository', () => {
    const { u } = parts(issueUrl('The gate is stuck'));
    expect(REPO).toBe('TheScootAI/littlerun');
    expect(u.origin).toBe('https://github.com');
    expect(u.pathname).toBe(`/${REPO}/issues/new`);
    expect([...u.searchParams.keys()].sort()).toEqual(['body', 'title']);
  });
  test('the title is the first line, marked as feedback and kept short', () => {
    expect(parts(issueUrl('The gate is stuck\nIt will not open for two of us')).title).toBe('Feedback: The gate is stuck');
    const long = parts(issueUrl('x'.repeat(200))).title;
    expect(long.startsWith('Feedback: ')).toBe(true);
    expect([...long].length).toBeLessThanOrEqual(10 + 60);
    expect(long.endsWith('…')).toBe(true);
  });
  test('the body is what they wrote, line breaks kept, with the note about where it came from', () => {
    const { body } = parts(issueUrl('First line\nSecond line', 'puzzles solved: 3'));
    expect(body.startsWith('First line\nSecond line')).toBe(true);
    expect(body).toContain('Sent from inside the game');
    expect(body).toContain('puzzles solved: 3');
    expect(parts(issueUrl('hello')).body).toContain('Sent from inside the game');
  });
  test('tidy: control characters go, CRLF becomes a line break, long gaps close up, ends are trimmed', () => {
    expect(tidy('  a\u0000b‮c  ')).toBe('a b c');
    expect(tidy('one\r\ntwo\rthree')).toBe('one\ntwo\nthree');
    expect(tidy('one\n\n\n\n\ntwo')).toBe('one\n\ntwo');
    expect(tidy('a \t  b')).toBe('a b');
    expect(tidy(7)).toBe('');
  });
  test('a very long note is cut to MAX_CHARS characters', () => {
    expect(MAX_CHARS).toBe(1500);
    const { body } = parts(issueUrl('y'.repeat(4000)));
    expect(body.split('\n')[0]).toBe('y'.repeat(1500));
  });
  test('the link never grows past what GitHub will take, and a cut never breaks a character', () => {
    for (const ch of ['😀', '字', '%', '&', ' x']) {
      const url = issueUrl(ch.repeat(4000), 'puzzles solved: 11');
      expect(url.length).toBeLessThanOrEqual(MAX_URL);
      const { body } = parts(url);            // parses: no broken escape
      expect(body).not.toContain('�');   // no half of a surrogate pair
      expect(body).toContain('Sent from inside the game');
    }
  });
  test('nothing in the note can add parameters to the link', () => {
    const { u, body } = parts(issueUrl('a&labels=spam&assignees=someone#frag?x=1'));
    expect([...u.searchParams.keys()].sort()).toEqual(['body', 'title']);
    expect(u.hash).toBe('');
    expect(body.startsWith('a&labels=spam&assignees=someone#frag?x=1')).toBe(true);
  });
});
