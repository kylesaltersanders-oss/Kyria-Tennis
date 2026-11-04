#!/usr/bin/env python3
"""Build data.json for the public page from raw dashboard exports.
Only the fields below are published. Titles are rebuilt from venue and court, every
outside partner becomes "Partner", and people are shown under their aliases.
The alias map is passed in by the private refresh task and never stored in this repo.
Usage: build_data.py --bookings F --sessions F --weather F --partners DIR --matches DIR
       --confirmations DIR --yields DIR --out data.json --alias Real=Alias [--alias ...]
The first --alias is the person, a second is that person's other account."""
import argparse, datetime, glob, json, os, re

def docs(path):
    out = []
    for f in sorted(glob.glob(os.path.join(path, '*.json'))):
        d = json.load(open(f))
        out.append((os.path.basename(f)[:-5], d.get('data', d)))
    return out

def main():
    p = argparse.ArgumentParser()
    for a in 'bookings sessions weather partners matches confirmations yields out'.split():
        p.add_argument('--' + a, required=True)
    p.add_argument('--alias', action='append', required=True)
    a = p.parse_args()
    pairs = [x.split('=', 1) for x in a.alias]
    alias = {k.lower(): v for k, v in pairs}
    real, main_alias = pairs[0]
    other = pairs[1] if len(pairs) > 1 else None

    def pid(s):
        s = str(s)
        pre = real.lower() + '-'
        return main_alias.lower() + '-' + s[len(pre):] if s.startswith(pre) else s

    def who(s):
        return alias.get(str(s).strip().lower(), s)

    def partner(s):
        s = str(s or '').strip()
        if not s:
            return ''
        low = s.lower()
        if low in ('kyle', 'giga'):
            return s.title()
        return alias.get(low, 'Partner')

    def title(r):
        src = str(r.get('title') or '')
        m = re.search(r'\bc(?:ourt)?\s*(\d)(?![\d:\-])', src, re.I)
        t = str(r.get('venue') or 'Other') + (' court ' + m.group(1) if m else '')
        if other and re.search(r'\(' + re.escape(other[0]) + r' account\)', src, re.I):
            t += ' (' + other[1] + ')'
        return t

    def rows(f):
        out = []
        for r in json.load(open(f)):
            out.append({'id': pid(r.get('id')), 'who': who(r.get('who')), 'date': r.get('date'),
                        'start': r.get('start'), 'end': r.get('end'), 'title': title(r),
                        'venue': r.get('venue'), 'type': r.get('type'), 'status': r.get('status'),
                        'partner': partner(r.get('partner'))})
        return out

    data = {
        'updated': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'bookings': rows(a.bookings),
        'sessions': rows(a.sessions),
        'weather': [{k: w.get(k) for k in ('date', 'max_c', 'min_c', 'summary')} for w in json.load(open(a.weather))],
        'partners': {pid(i): partner(d.get('partner')) for i, d in docs(a.partners)},
        'matches': [dict({k: d.get(k) for k in ('date', 'start', 'end', 'court', 'who', 'booked')},
                         partner=partner(d.get('partner')), id=i) for i, d in docs(a.matches)],
        'confirmations': {pid(i): {'sent': True, 'confirmed': bool(d.get('confirmed_at'))}
                          for i, d in docs(a.confirmations) if d.get('sent_at')},
        'yields': [{'date': d.get('date'), 'note': 'Heads-up for this day'} for _, d in docs(a.yields)],
    }
    json.dump(data, open(a.out, 'w'), ensure_ascii=False, separators=(',', ':'))

if __name__ == '__main__':
    main()
