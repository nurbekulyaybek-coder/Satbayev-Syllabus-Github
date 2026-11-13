"""Personal multi-document workspaces; legacy documents remain untouched."""
import copy
import json
import math
import re
from decimal import Decimal


def initialize(con):
    con.execute('CREATE TABLE IF NOT EXISTS workspaces(user_id INTEGER PRIMARY KEY REFERENCES users(id), payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0)')


def validate_state(state, seed):
    if not isinstance(state, dict):
        raise ValueError('Некорректный силлабус')
    meta = state.get('meta')
    if not isinstance(meta, dict) or set(meta) != set(seed['meta']) or any(not isinstance(v, str) or len(v) > 6000 for v in meta.values()):
        raise ValueError('Некорректные поля силлабуса')
    if state.get('lang') not in ('kk', 'ru', 'en'):
        raise ValueError('Неизвестный язык')
    sections = state.get('sections')
    if not isinstance(sections, list) or len(sections) != 13 or any(not isinstance(s, dict) or any(not isinstance(s.get(k), str) or len(s[k]) > 100000 for k in ('title', 'text')) for s in sections):
        raise ValueError('Некорректные разделы')
    tables = state.get('tables')
    if not isinstance(tables, dict) or set(tables) != set(seed['tables']):
        raise ValueError('Некорректные таблицы')
    for key, rows in tables.items():
        if not isinstance(rows, list) or not 1 <= len(rows) <= 300 or any(not isinstance(r, list) or len(r) != len(seed['tables'][key][0]) or any(not isinstance(v, str) or len(v) > 10000 for v in r) for r in rows):
            raise ValueError('Некорректная таблица')
    for i, row in enumerate(tables['8'][1:],1):
        for value in row[2:-1]:
            if not re.fullmatch(r'\d{1,4}(?:[.,]\d{1,2})?',value) or not 0 <= Decimal(value.replace(',','.')) <= 100:
                raise ValueError('Баллы: от 0 до 100')
        row[0]=str(i)
        total=sum((Decimal(v.replace(',','.')) for v in row[3:-1]),Decimal(0))
        row[-1]=str(int(total)) if total==int(total) else format(total.normalize(),'f')
    fmt = state.get('format', {})
    if not isinstance(fmt,dict):
        raise ValueError('Некорректное оформление')
    for key, low, high in [('font', 9, 16), ('line', 1, 2), *[(k, 5, 40) for k in ('top','bottom','left','right')]]:
        v = fmt.get(key)
        if not isinstance(v, (int, float)) or not math.isfinite(v) or not low <= v <= high:
            raise ValueError('Некорректное оформление')
    # Catalogues are personal copies, never written to shared configuration.
    for key in ('catalog', 'relations', 'courses', 'programDirectory', 'universities'):
        if not isinstance(state.get(key), list) or len(state[key]) > 5000:
            raise ValueError('Некорректный справочник')
    for inst in state['relations']:
        if not isinstance(inst, dict) or not isinstance(inst.get('name'), str) or not isinstance(inst.get('departments'), list):
            raise ValueError('Некорректный институт')
        for dep in inst['departments']:
            if not isinstance(dep, dict) or not isinstance(dep.get('name'), str) or not isinstance(dep.get('programs'), list) or any(not isinstance(p,str) for p in dep['programs']):
                raise ValueError('Некорректная кафедра')
    for course in state['courses']:
        if not isinstance(course, dict) or not all(isinstance(course.get(k),str) for k in ('code','title')) or not isinstance(course.get('programs',[]),list):
            raise ValueError('Некорректная дисциплина')
    if not isinstance(state.get('active'), int) or not 0 <= state['active'] <= 15:
        raise ValueError('Некорректный раздел')


def validate(payload, seed):
    if not isinstance(payload, dict) or not isinstance(payload.get('documents'), list) or not 1 <= len(payload['documents']) <= 20:
        raise ValueError('Допустимо от 1 до 20 силлабусов')
    ids = set()
    for doc in payload['documents']:
        if not isinstance(doc, dict) or not isinstance(doc.get('id'), str) or not 1 <= len(doc['id']) <= 80 or doc['id'] in ids:
            raise ValueError('Некорректная вкладка')
        ids.add(doc['id'])
        if not isinstance(doc.get('name'), str) or not 1 <= len(doc['name']) <= 120:
            raise ValueError('Название: от 1 до 120 символов')
        validate_state(doc.get('state'), seed)
        versions = doc.get('versions')
        if not isinstance(versions, list) or len(versions) > 30:
            raise ValueError('Не более 30 версий на силлабус')
        for version in versions:
            if not isinstance(version, dict) or not isinstance(version.get('name'),str) or not 1 <= len(version['name']) <= 120 or not isinstance(version.get('created'),str):
                raise ValueError('Некорректная версия')
            validate_state(version.get('state'), seed)
    if payload.get('activeId') not in ids:
        raise ValueError('Активная вкладка не найдена')


def load(con, uid, legacy):
    row = con.execute('SELECT payload,revision FROM workspaces WHERE user_id=?', (uid,)).fetchone()
    if row:
        return json.loads(row['payload']), row['revision']
    state = legacy()
    payload = {'activeId':'original', 'documents':[{'id':'original', 'name':state['meta'].get('course') or 'Мой силлабус', 'state':copy.deepcopy(state), 'versions':[]}]}
    return payload, 0


def save(con, uid, payload, revision, seed):
    validate(payload, seed)
    con.execute('BEGIN IMMEDIATE')
    row = con.execute('SELECT revision FROM workspaces WHERE user_id=?', (uid,)).fetchone()
    current = row['revision'] if row else 0
    if revision != current:
        return None
    con.execute('INSERT OR REPLACE INTO workspaces VALUES(?,?,?)', (uid, json.dumps(payload, ensure_ascii=False), current+1))
    return current+1
