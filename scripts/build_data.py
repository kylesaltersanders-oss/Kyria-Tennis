#!/usr/bin/env python3
"""Build data.json for the public page from raw dashboard exports.
Only the fields below are published. Titles keep only known tennis and place words, with
names swapped for aliases. A partner with an alias shows under it; any other name
becomes "Partner". People are shown under their aliases.
The alias map is passed in by the private refresh task and never stored in this repo.
Usage: build_data.py --bookings F --sessions F --weather F --partners DIR --matches DIR
       --confirmations DIR --yields DIR --out data.json --alias Real=Alias [--alias ...]
The first --alias is the person, a second is that person's other account, and any
further ones are partners."""
import argparse, datetime, glob, json, os, re

# Words a title may keep: places and tennis terms only. Anything else is dropped.
SAFE = set('''
unsw heffron moore park centennial mutch david phillips bondi beach woolloomooloo rally4ever
tennis court courts hard grass clay coaching coach with adult comp competition class clinic ladies
mens mixed doubles singles social low intermediate advanced beginner beginners use ball machine
lesson hit hitting rally squad match practice the and at
'''.split())

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

    keep_partner = {'ball machine': 'Ball machine'}

    def one(n):
        n = n.strip()
        low = n.lower()
        if low in ('kyle', 'giga'):
            return n.title()
        if low in keep_partner:
            return keep_partner[low]
        return alias.get(low, 'Partner')

    def partner(s):
        s = str(s or '').strip()
        if not s:
            return ''
        s = re.sub(r'\s*\([^)]*\)', '', s)
        names = [one(n) for n in re.split(r'\s*(?:,|&|/|\band\b)\s*', s, flags=re.I) if n.strip()]
        out = []
        for n in names:
            if n not in out:
                out.append(n)
        return ', '.join(out)

    def title(r):
        src = str(r.get('title') or '')
        acct = other and re.search(r'\(' + re.escape(other[0]) + r' account\)', src, re.I)
        src = re.sub(r'\([^)]*account\)', '', src, flags=re.I)
        out = []
        for tok in re.findall(r"[A-Za-z0-9][A-Za-z0-9:&'\-]*", src):
            low = tok.lower()
            if low in SAFE or re.fullmatch(r'[0-9:&\-]+(?:am|pm)?(?:-[0-9:]+(?:am|pm)?)?|c[0-9]', low):
                out.append(tok)
            elif low in alias:
                out.append(alias[low])
            elif low in ('kyle', 'giga'):
                out.append(tok.title())
        t = ' '.join(out).strip(' :-')
        if not t:
            t = str(r.get('venue') or 'Other')
        if acct:
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
