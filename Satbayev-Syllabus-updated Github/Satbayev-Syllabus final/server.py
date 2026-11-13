"""Satbayev Syllabus Studio: shared SQLite backend, Python 3.10+, no packages."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from http.cookies import SimpleCookie
from pathlib import Path
from datetime import date
from decimal import Decimal
import ai_service
import workspace_store
from language_data import PACKS,localize,known,canonical,equivalent,set_path
import argparse,copy,hashlib,hmac,json,os,re,secrets,sqlite3,time,io,zipfile,webbrowser,threading
ROOT=Path(__file__).resolve().parent
UNIVERSITY='«Қ.И. Сәтбаев атындағы Қазақ ұлттық техникалық зерттеу университеті» КЕАҚ'
CONFIG_KEYS=['catalog','programDirectory','relations','courses','format']
LOCKED_SECTIONS=[11,12]
LOCKED_TABLES=['9','10']
SEED=json.loads((ROOT/'data/initial-state.json').read_text(encoding='utf-8'))
DB=Path(os.environ.get('SYLLABUS_DB', str(ROOT/'runtime/syllabus.sqlite3')))
def connect():
 con=sqlite3.connect(DB,timeout=15);con.row_factory=sqlite3.Row;con.execute('PRAGMA foreign_keys=ON');return con
def digest(password,salt):return hashlib.scrypt(password.encode(),salt=bytes.fromhex(salt),n=16384,r=8,p=1).hex()
def set_password(con,user_id,password):
 if not isinstance(password,str) or not 10<=len(password)<=128:raise ValueError('Пароль: от 10 до 128 символов')
 salt=secrets.token_hex(16);con.execute('UPDATE users SET salt=?,password_hash=? WHERE id=?',(salt,digest(password,salt),user_id));con.execute('DELETE FROM sessions WHERE user_id=?',(user_id,))
def initialize():
 DB.parent.mkdir(parents=True,exist_ok=True)
 with connect() as con:
  con.executescript('''CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT UNIQUE NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','user')),salt TEXT,password_hash TEXT,active INTEGER NOT NULL DEFAULT 1);CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id),csrf TEXT,expires REAL);CREATE TABLE IF NOT EXISTS documents(user_id INTEGER PRIMARY KEY REFERENCES users(id),state TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0);CREATE TABLE IF NOT EXISTS config(id INTEGER PRIMARY KEY CHECK(id=1),state TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0);CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY,count INTEGER,started REAL);CREATE TABLE IF NOT EXISTS translations(source TEXT,target TEXT,translated TEXT,canonical TEXT,source_language TEXT,PRIMARY KEY(source,target));''')
  if not con.execute('SELECT 1 FROM users LIMIT 1').fetchone():
   for username,name,role,password in [('admin','Әкімші','admin',os.environ.get('SYLLABUS_ADMIN_PASSWORD','SatbayevAdmin#2026')),('user','Оқытушы','user',os.environ.get('SYLLABUS_USER_PASSWORD','Teacher#2026'))]:
    uid=con.execute('INSERT INTO users(username,name,role) VALUES(?,?,?)',(username,name,role)).lastrowid;set_password(con,uid,password)
  con.execute('INSERT OR IGNORE INTO config(id,state) VALUES(1,?)',(json.dumps(SEED,ensure_ascii=False),))
  workspace_store.initialize(con)
 try:os.chmod(DB,0o600)
 except OSError:pass

def selected(state):
 inst=next((x for x in state['relations'] if x['name']==state['meta']['institute']),None)
 dep=next((x for x in inst['departments'] if x['name']==state['meta']['department']),None) if inst else None
 return inst,dep

def normalize(state):
 m=state['meta'];m['university']=UNIVERSITY
 inst,dep=selected(state);m['director']=inst.get('director','') if inst else '';m['head']=dep.get('head','') if dep else ''
 if m.get('approvalDate'):m['date']=m['approvalDate'][:4]
 pd=m.get('protocolDate','');m['protocol']='№ '+(m.get('protocolNumber') or '___')+', '+('«'+pd[8:10]+'» '+pd[5:7]+'.'+pd[:4]+' ж.' if pd else '«___» __________ '+m['date']+' ж.')
 for i,row in enumerate(state['tables']['8'][1:],1):
  row[0]=str(i)
  total=sum((Decimal(x.replace(',','.')) for x in row[3:-1]),Decimal(0));row[-1]=str(int(total)) if total==int(total) else format(total.normalize(),'f')
 return state

def overlay(doc,cfg):
 state=copy.deepcopy(doc)
 for k in CONFIG_KEYS:state[k]=copy.deepcopy(cfg[k])
 state['meta']['agreement']=cfg['meta']['agreement']
 for n in LOCKED_SECTIONS:state['sections'][n]=copy.deepcopy(cfg['sections'][n])
 for n in LOCKED_TABLES:state['tables'][n]=copy.deepcopy(cfg['tables'][n])
 for i,s in enumerate(state['sections']):s['title']=SEED['sections'][i]['title']
 inst,dep=selected(state)
 if not inst:state['meta'].update(institute='',department='',program='',course='',code='')
 elif not dep:state['meta'].update(department='',program='',course='',code='')
 elif state['meta']['program'] and state['meta']['program'] not in dep['programs']:state['meta'].update(program='',course='',code='')
 return normalize(state)

def validate(state,current,role,con=None):
 if not isinstance(state,dict):raise ValueError('Некорректный документ')
 for key in ['meta','sections','tables']:
  if key not in state:raise ValueError('Не хватает разделов документа')
 lang=state.get('lang','kk')
 if lang not in PACKS:raise ValueError('Неизвестный язык')
 m=state['meta']
 if not isinstance(m,dict) or set(m)!=set(SEED['meta']) or not all(isinstance(v,str) and len(v)<6000 for v in m.values()):raise ValueError('Некорректные поля титула')
 if m['university']!=UNIVERSITY:raise PermissionError('Название университета закреплено')
 if not isinstance(state['sections'],list) or len(state['sections'])!=13:raise ValueError('Должно быть 13 разделов')
 for i,s in enumerate(state['sections']):
  if not isinstance(s,dict) or not isinstance(s.get('text'),str) or len(s['text'])>100000:raise ValueError('Некорректный текст раздела')
  if s.get('title')!=PACKS[lang]['sections'][i]['title']:raise PermissionError('Шаблонные заголовки не редактируются')
 if role!='admin':
  for key in CONFIG_KEYS:
   if state.get(key)!=current.get(key):raise PermissionError('Изменять справочники и оформление может только admin')
  if m['agreement']!=current['meta']['agreement']:raise PermissionError('Согласующие доступны только admin')
  for n in LOCKED_SECTIONS:
   if not equivalent(state['sections'][n],current['sections'][n],con):raise PermissionError('Шаблонная политика доступна только admin')
  for n in LOCKED_TABLES:
   if not equivalent(state['tables'].get(n),current['tables'][n],con):raise PermissionError('Шкала и критерии доступны только admin')
 translations=state.get('displayTranslations',{})
 if not isinstance(translations,dict) or len(translations)>1000:raise ValueError('Некорректные переводы реквизитов')
 for source,targets in translations.items():
  if not isinstance(source,str) or not isinstance(targets,dict):raise ValueError('Некорректные переводы реквизитов')
  for target,value in targets.items():
   if target not in PACKS or not isinstance(value,str):raise ValueError('Некорректный язык реквизита')
   expected=known(source,target,con)
   if expected is not None and value!=expected:raise PermissionError('Перевод реквизита не подтверждён')
   if expected is None and value!=source:raise PermissionError('Перевод реквизита не подтверждён')
 if not isinstance(state.get('relations'),list) or not 1<=len(state['relations'])<=100:raise ValueError('Некорректные связи справочника')
 titles={x['title'] for x in state.get('programDirectory',[]) if isinstance(x,dict) and isinstance(x.get('title'),str)}
 if not titles or len(titles)>5000:raise ValueError('Некорректный каталог программ')
 for inst in state['relations']:
  if not isinstance(inst,dict) or not isinstance(inst.get('name'),str) or not isinstance(inst.get('director'),str) or not isinstance(inst.get('departments'),list):raise ValueError('Некорректный институт')
  for dep in inst['departments']:
   if not isinstance(dep,dict) or not isinstance(dep.get('name'),str) or not isinstance(dep.get('head'),str) or not isinstance(dep.get('programs'),list) or any(p not in titles for p in dep['programs']):raise ValueError('Программы кафедры должны быть из общего каталога')
 if not isinstance(state.get('courses'),list) or len(state['courses'])>5000 or any(not isinstance(c,dict) or not all(isinstance(c.get(k),str) for k in ['title','code']) or not isinstance(c.get('programs',[]),list) or any(x not in titles for x in c.get('programs',[])) for c in state['courses']):raise ValueError('Некорректный справочник дисциплин')
 inst,dep=selected(state)
 if m['institute'] and not inst:raise ValueError('Институт не найден')
 if m['department'] and not dep:raise ValueError('Кафедра не относится к выбранному институту')
 if m['program'] and (not dep or m['program'] not in dep['programs']):raise ValueError('Программа не относится к выбранной кафедре')
 if m['course'] and not any(c['title']==m['course'] and c['code']==m['code'] and m['program'] in c.get('programs',[]) for c in state['courses']):raise ValueError('Дисциплина не связана с выбранной программой')
 if role=='admin':
  if inst:inst['director']=m['director']
  if dep:dep['head']=m['head']
 else:
  if m['director']!=(inst.get('director','') if inst else '') or m['head']!=(dep.get('head','') if dep else ''):raise PermissionError('Изменять ФИО руководителей может только admin')
 for k in ['approvalDate','protocolDate']:
  if m[k]:
   try:d=date.fromisoformat(m[k])
   except (ValueError,TypeError):raise ValueError('Дата должна существовать в календаре')
   if not 2020<=d.year<=2100:raise ValueError('Годы дат: 2020–2100')
 if not m['date'].isdigit() or not 2020<=int(m['date'])<=2100:raise ValueError('Год: 2020–2100')
 if not re.fullmatch(r'\d{4}–\d{4}',m['year']) or not 2020<=int(m['year'][:4])<=2099 or int(m['year'][5:])!=int(m['year'][:4])+1:raise ValueError('Некорректный учебный год')
 if m['credits'] and (not re.fullmatch(r'\d{1,2}',m['credits']) or not 1<=int(m['credits'])<=60):raise ValueError('Кредиты: 1–60')
 if not isinstance(state['tables'],dict) or set(state['tables'])!=set(SEED['tables']):raise ValueError('Некорректный набор таблиц')
 for key,rows in state['tables'].items():
  base=SEED['tables'][key]
  if not isinstance(rows,list) or not 1<=len(rows)<=300 or any(not isinstance(r,list) or len(r)!=len(base[0]) or any(not isinstance(v,str) or len(v)>10000 for v in r) for r in rows):raise ValueError('Некорректная таблица')
  if rows[0]!=PACKS[lang]['tables'][key][0]:raise PermissionError('Заголовки таблиц закреплены')
  if key=='8':
   for r in rows[1:]:
    for v in r[2:-1]:
     if not re.fullmatch(r'\d{1,4}(?:[.,]\d{1,2})?',v) or not 0<=Decimal(v.replace(',','.'))<=100:raise ValueError('В графике допустимы только числа от 0 до 100, не более двух знаков после запятой')
 if not isinstance(state.get('format'),dict) or any(not isinstance(state['format'].get(k),(int,float)) for k in ['font','line','top','bottom','left','right']):raise ValueError('Некорректное оформление')
 f=state['format']
 if not 9<=f['font']<=16 or not 1<=f['line']<=2 or any(not 5<=f[k]<=40 for k in ['top','bottom','left','right']):raise ValueError('Параметры оформления вне допустимого диапазона')
 return normalize(state)

class Handler(BaseHTTPRequestHandler):
 server_version='SyllabusStudio/4'
 def log_message(self,*args):pass
 def respond(self,status,obj=None,cookie=None):
  data=json.dumps(obj or {},ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Length',str(len(data)))
  if cookie:self.send_header('Set-Cookie',cookie)
  self.end_headers();self.wfile.write(data)
 def body(self):
  if self.headers.get('Content-Type','').split(';')[0]!='application/json':raise ValueError('Ожидается JSON')
  n=int(self.headers.get('Content-Length','0'))
  if not 0<n<=(32000000 if self.path=='/api/workspace' else 2000000):raise ValueError('Слишком большой запрос')
  origin=self.headers.get('Origin')
  if origin and origin.split('://')[-1]!=self.headers.get('Host'):raise PermissionError('Чужой источник запроса')
  return json.loads(self.rfile.read(n))
 def session(self,con,write=False):
  c=SimpleCookie();c.load(self.headers.get('Cookie',''));token=c['syllabus_session'].value if 'syllabus_session' in c else '';s=con.execute('SELECT s.*,u.username,u.name,u.role,u.active FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=? AND expires>? AND u.active=1',(hashlib.sha256(token.encode()).hexdigest(),time.time())).fetchone()
  if not s:raise LookupError('Войдите в аккаунт')
  if write and not hmac.compare_digest(self.headers.get('X-CSRF-Token',''),s['csrf']):raise PermissionError('Некорректный CSRF-токен')
  return s
 def user_info(self,s):return {k:s[k] for k in ['user_id','username','name','role','csrf']}
 def state(self,con,uid):
  row=con.execute('SELECT state,version FROM documents WHERE user_id=?',(uid,)).fetchone();cfg=con.execute('SELECT state,version FROM config WHERE id=1').fetchone();raw=overlay(json.loads(row['state']) if row else SEED,json.loads(cfg['state']));localized,_=localize(raw,raw.get('lang','kk'),con);return localized,row['version'] if row else 0,cfg['version']
 def do_GET(self):
  try:
   if self.path.split('?')[0] in ['/','/index.html','/Satbayev_Syllabus_Studio.html']:
    b=(ROOT/'index.html').read_bytes();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(b)));self.send_header('Cache-Control','no-store');self.send_header('X-Frame-Options','DENY');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(b);return
   with connect() as con:
    s=self.session(con)
    if self.path=='/api/workspace':
     payload,revision=workspace_store.load(con,s['user_id'],lambda:self.state(con,s['user_id'])[0]);return self.respond(200,{'workspace':payload,'revision':revision})
    if self.path=='/api/admin/project':
     if s['role']!='admin':raise PermissionError('Только admin')
     out=io.BytesIO()
     with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
      for p in ROOT.rglob('*'):
       if p.is_file() and not any(x in p.parts for x in ['runtime','__pycache__','.git','node_modules']) and p.suffix not in ['.sqlite3','.docx','.zip'] and p.name not in ['compiled-app.js','ai-config.json','.env']:z.write(p,'Satbayev-Syllabus/'+str(p.relative_to(ROOT)))
     b=out.getvalue();self.send_response(200);self.send_header('Content-Type','application/zip');self.send_header('Content-Length',str(len(b)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(b);return
    if self.path=='/api/ai/status':return self.respond(200,ai_service.status())
    if self.path=='/api/me':return self.respond(200,{'user':self.user_info(s)})
    if self.path=='/api/document':
     st,v,cv=self.state(con,s['user_id']);return self.respond(200,{'state':st,'version':v,'configVersion':cv,'user':self.user_info(s)})
    if self.path=='/api/admin/users':
     if s['role']!='admin':raise PermissionError('Только admin')
     users=[dict(x) for x in con.execute('SELECT id,username,name,role,active FROM users ORDER BY id')];return self.respond(200,{'users':users})
    return self.respond(404,{'error':'Не найдено'})
  except ai_service.AIError as e:self.respond(e.status,{'error':str(e)})
  except LookupError as e:self.respond(401,{'error':str(e)})
  except PermissionError as e:self.respond(403,{'error':str(e)})
 def do_POST(self):
  try:
   data=self.body()
   with connect() as con:
    if self.path=='/api/login':
     username=str(data.get('username',''))[:80];password=str(data.get('password',''))[:129];key=self.client_address[0]+':'+username;now=time.time();a=con.execute('SELECT * FROM attempts WHERE key=?',(key,)).fetchone()
     if a and now-a['started']<300 and a['count']>=8:return self.respond(429,{'error':'Слишком много попыток. Повторите через 5 минут.'})
     u=con.execute('SELECT * FROM users WHERE username=? AND active=1',(username,)).fetchone();salt=u['salt'] if u else '0'*32;ok=hmac.compare_digest(digest(password,salt),u['password_hash'] if u else '0'*128)
     if not u or not ok:
      count=a['count']+1 if a and now-a['started']<300 else 1;started=a['started'] if a and now-a['started']<300 else now;con.execute('INSERT OR REPLACE INTO attempts VALUES(?,?,?)',(key,count,started));return self.respond(401,{'error':'Неверный логин или пароль'})
     con.execute('DELETE FROM attempts WHERE key=?',(key,));token=secrets.token_urlsafe(32);csrf=secrets.token_urlsafe(24);con.execute('INSERT INTO sessions VALUES(?,?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),u['id'],csrf,now+28800));secure='; Secure' if os.environ.get('SYLLABUS_SECURE_COOKIE')=='1' else '';return self.respond(200,{'ok':True},'syllabus_session='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800'+secure)
    s=self.session(con,True)
    if self.path in ['/api/ai/chat','/api/translate']:
     key='ai:'+str(s['user_id']);now=time.time();a=con.execute('SELECT * FROM attempts WHERE key=?',(key,)).fetchone()
     if a and now-a['started']<60 and a['count']>=12:return self.respond(429,{'error':'Не более 12 запросов ИИ в минуту на аккаунт.'})
     count=a['count']+1 if a and now-a['started']<60 else 1;started=a['started'] if a and now-a['started']<60 else now;con.execute('INSERT OR REPLACE INTO attempts VALUES(?,?,?)',(key,count,started));con.commit()
     if self.path=='/api/ai/chat':return self.respond(200,ai_service.chat(data))
     target=data.get('target')
     if target not in PACKS:raise ValueError('Неизвестный язык')
     if data.get('personal'):
      source=data.get('state');workspace_store.validate_state(source,SEED)
     else:
      current,_,_=self.state(con,s['user_id']);source=validate(data.get('state'),current,s['role'],con)
     result,unknown=localize(source,target,con)
     if len(unknown)>500 or sum(len(text) for _,text in unknown)>180000:raise ValueError('Слишком большой объём перевода за один запрос')
     unique=list(dict.fromkeys(text for _,text in unknown));mapping={}
     for start in range(0,len(unique),15):
      batch=unique[start:start+15];translated=ai_service.translate(batch,source['lang'],target)
      for before,after in zip(batch,translated):
       mapping[before]=after;con.execute('INSERT OR REPLACE INTO translations VALUES(?,?,?,?,?)',(before,target,after,canonical(before,con),source['lang']))
     for path,text in unknown:set_path(result,path,mapping[text])
     return self.respond(200,{'state':result,'translated':len(unique)})
    if self.path=='/api/logout':con.execute('DELETE FROM sessions WHERE token_hash=?',(s['token_hash'],));return self.respond(200,{'ok':True},'syllabus_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0')
    if self.path=='/api/password':
     u=con.execute('SELECT * FROM users WHERE id=?',(s['user_id'],)).fetchone()
     if not hmac.compare_digest(digest(str(data.get('old','')),u['salt']),u['password_hash']):raise PermissionError('Неверный текущий пароль')
     set_password(con,s['user_id'],data.get('password'));return self.respond(200,{'ok':True})
    if self.path=='/api/admin/users':
     if s['role']!='admin':raise PermissionError('Только admin')
     action=data.get('action')
     if action=='create':
      username=str(data.get('username',''));name=str(data.get('name',''))[:200];role=data.get('role','user')
      if not re.fullmatch(r'[a-zA-Z0-9_.-]{3,40}',username) or role not in ['admin','user'] or not name.strip():raise ValueError('Проверьте имя, логин и роль')
      uid=con.execute('INSERT INTO users(username,name,role) VALUES(?,?,?)',(username,name,role)).lastrowid;set_password(con,uid,data.get('password'))
     elif action in ['disable','enable','password','role']:
      uid=int(data.get('id',0))
      if uid==s['user_id'] and action=='disable':raise ValueError('Нельзя отключить свой аккаунт')
      if not con.execute('SELECT id FROM users WHERE id=?',(uid,)).fetchone():raise ValueError('Аккаунт не найден')
      if action=='role':
       role=data.get('role')
       if role not in ['admin','user']:raise ValueError('Некорректная роль')
       if uid==s['user_id'] and role!='admin':raise ValueError('Нельзя понизить свою роль')
       con.execute('UPDATE users SET role=? WHERE id=?',(role,uid));con.execute('DELETE FROM sessions WHERE user_id=?',(uid,))
      elif action=='password':set_password(con,uid,data.get('password'))
      else:con.execute('UPDATE users SET active=? WHERE id=?',(int(action=='enable'),uid));con.execute('DELETE FROM sessions WHERE user_id=?',(uid,))
     else:raise ValueError('Неизвестное действие')
     return self.respond(200,{'ok':True})
    return self.respond(404,{'error':'Не найдено'})
  except ai_service.AIError as e:self.respond(e.status,{'error':str(e)})
  except LookupError as e:self.respond(401,{'error':str(e)})
  except PermissionError as e:self.respond(403,{'error':str(e)})
  except (ValueError,TypeError,KeyError,sqlite3.IntegrityError) as e:self.respond(400,{'error':str(e)})
 def do_PUT(self):
  try:
   data=self.body()
   with connect() as con:
    s=self.session(con,True)
    if self.path=='/api/workspace':
     revision=workspace_store.save(con,s['user_id'],data.get('workspace'),data.get('revision'),SEED)
     if revision is None:return self.respond(409,{'error':'Данные изменены в другом окне. Скачайте JSON-копию и обновите страницу.'})
     return self.respond(200,{'revision':revision})
    if self.path!='/api/document':return self.respond(404,{'error':'Не найдено'})
    con.execute('BEGIN IMMEDIATE');current,v,cv=self.state(con,s['user_id'])
    if data.get('version')!=v or data.get('configVersion')!=cv:return self.respond(409,{'error':'Документ или настройки изменились. Обновите данные перед сохранением.'})
    state=validate(data.get('state'),current,s['role'],con)
    if s['role']=='admin':
     cfg=json.loads(con.execute('SELECT state FROM config WHERE id=1').fetchone()[0]);old=copy.deepcopy(cfg)
     for k in CONFIG_KEYS:cfg[k]=copy.deepcopy(state[k])
     cfg['meta']['agreement']=state['meta']['agreement']
     for n in LOCKED_SECTIONS:cfg['sections'][n]=copy.deepcopy(state['sections'][n])
     for n in LOCKED_TABLES:cfg['tables'][n]=copy.deepcopy(state['tables'][n])
     if cfg!=old:cv+=1;con.execute('UPDATE config SET state=?,version=? WHERE id=1',(json.dumps(cfg,ensure_ascii=False),cv))
    con.execute('INSERT OR REPLACE INTO documents(user_id,state,version) VALUES(?,?,?)',(s['user_id'],json.dumps(state,ensure_ascii=False),v+1));return self.respond(200,{'version':v+1,'configVersion':cv,'savedAt':int(time.time())})
  except ai_service.AIError as e:self.respond(e.status,{'error':str(e)})
  except LookupError as e:self.respond(401,{'error':str(e)})
  except PermissionError as e:self.respond(403,{'error':str(e)})
  except (ValueError,TypeError,KeyError,ArithmeticError) as e:self.respond(400,{'error':str(e)})

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--host',default='0.0.0.0');parser.add_argument('--port',type=int,default=8000);parser.add_argument('--db');parser.add_argument('--open',action='store_true');args=parser.parse_args()
 if args.db:DB=Path(args.db).resolve()
 initialize();print(f'Satbayev Syllabus Studio: http://localhost:{args.port}  (Ctrl+C to stop)',flush=True)
 server=ThreadingHTTPServer((args.host,args.port),Handler)
 if args.open:threading.Timer(.4,lambda:webbrowser.open(f'http://localhost:{args.port}')).start()
 try:server.serve_forever()
 except KeyboardInterrupt:print('\nStopped')
