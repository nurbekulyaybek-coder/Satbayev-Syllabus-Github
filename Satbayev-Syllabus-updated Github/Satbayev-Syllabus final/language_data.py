"""Prepared trilingual syllabus content. Canonical identifiers never change language."""
from pathlib import Path
import json,re,copy,hashlib
ROOT=Path(__file__).resolve().parent
PACKS=json.loads((ROOT/'data/languages.json').read_text(encoding='utf-8'))
TERMS=json.loads((ROOT/'data/terms.json').read_text(encoding='utf-8'))
GROUPS=[]
for i in range(13):
 for key in ['title','text']:GROUPS.append({lang:PACKS[lang]['sections'][i][key] for lang in PACKS})
for k,rows in PACKS['kk']['tables'].items():
 for i,row in enumerate(rows):
  for j,_ in enumerate(row):GROUPS.append({lang:PACKS[lang]['tables'][k][i][j] for lang in PACKS})
GROUPS+=TERMS['terms'];LOOKUP={};CANON={}
def norm(text):return re.sub(r'\s+',' ',str(text)).strip()
for group in GROUPS:
 for val in [group.get(x,'') for x in ['kk','ru','en']]+group.get('aliases',[]):
  if norm(val):LOOKUP.setdefault(norm(val),group);CANON.setdefault(norm(val),norm(group['kk']))
def canonical(text,con=None):
 key=norm(text)
 if key in CANON:return CANON[key]
 if con:
  row=con.execute('SELECT canonical FROM translations WHERE translated=? OR source=? LIMIT 1',(str(text),str(text))).fetchone()
  if row:return row[0]
 return key

def known(text,lang,con=None):
 raw=str(text);key=norm(raw)
 if not key or re.fullmatch(r'[\d\s.,+*/%()\[\]:;№–—→×\-]+',key):return raw
 group=LOOKUP.get(key)
 # Keep paragraph breaks and spacing when the text is already in the target language.
 if group:return raw if norm(group[lang])==key else group[lang]
 code=re.match(r'^([678][A-Za-zА-Яа-я]\d{5})\s+(.+)$',key)
 if code and norm(code[2]) in LOOKUP:return code[1]+' '+LOOKUP[norm(code[2])][lang]
 if con:
  row=con.execute('SELECT translated FROM translations WHERE source=? AND target=? LIMIT 1',(raw,lang)).fetchone()
  if row:return row[0]
  row=con.execute('SELECT source FROM translations WHERE translated=? AND source_language=? LIMIT 1',(raw,lang)).fetchone()
  if row:return row[0]
 return None

def equivalent(a,b,con=None):
 if type(a)!=type(b):return False
 if isinstance(a,str):return canonical(a,con)==canonical(b,con)
 if isinstance(a,list):return len(a)==len(b) and all(equivalent(x,y,con) for x,y in zip(a,b))
 if isinstance(a,dict):return a.keys()==b.keys() and all(equivalent(a[k],b[k],con) for k in a)
 return a==b

def localize(state,lang,con=None):
 result=copy.deepcopy(state);unknown=[];result['lang']=lang;result['schemaVersion']=4
 def tr(text,path):
  value=known(text,lang,con)
  if value is None:
   if str(text).strip():unknown.append((path,str(text)))
   return text
  return value
 for i,sec in enumerate(result['sections']):
  sec['title']=PACKS[lang]['sections'][i]['title'];sec['text']=tr(sec['text'],('sections',i,'text'))
 for k,rows in result['tables'].items():
  rows[0]=copy.deepcopy(PACKS[lang]['tables'][k][0])
  for i,row in enumerate(rows[1:],1):
   for j,text in enumerate(row):
    if k=='6' or k=='8' and j!=1:continue
    row[j]=tr(text,('tables',k,i,j))
 result.setdefault('displayTranslations',{})
 for key in ['institute','department','program','course','cycle','city','officeHours']:
  value=result['meta'].get(key,'')
  if not value.strip():continue
  result['displayTranslations'].setdefault(value,{})
  result['displayTranslations'][value][lang]=tr(value,('displayTranslations',value,lang))
 return result,unknown

def set_path(obj,path,value):
 for key in path[:-1]:obj=obj[key]
 obj[path[-1]]=value
