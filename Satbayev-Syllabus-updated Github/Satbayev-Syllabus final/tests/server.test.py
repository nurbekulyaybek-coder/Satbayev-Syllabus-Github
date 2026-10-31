"""Real HTTP integration tests. Start a disposable server on port 8765 before running."""
import urllib.request,urllib.error,http.cookiejar,json,copy,unittest,io,zipfile,tempfile,subprocess,socket,sys,time
from pathlib import Path
BASE='http://127.0.0.1:8765'
class Client:
 def __init__(self):self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.csrf=''
 def request(self,path,body=None,method=None,csrf=True):
  h={'Content-Type':'application/json'}
  if self.csrf and csrf:h['X-CSRF-Token']=self.csrf
  req=urllib.request.Request(BASE+path,data=None if body is None else json.dumps(body).encode(),headers=h,method=method)
  try:
   with self.opener.open(req) as r:
    b=r.read();return r.status,b if 'zip' in r.headers.get('Content-Type','') else json.loads(b)
  except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
 def login(self,name,password):
  status,_=self.request('/api/login',{'username':name,'password':password});assert status==200
  status,d=self.request('/api/document');assert status==200;self.csrf=d['user']['csrf'];return d
 def save(self,d,state=None):return self.request('/api/document',{'state':state or d['state'],'version':d['version'],'configVersion':d['configVersion']},'PUT')
class Permissions(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.u=Client();cls.a=Client();cls.u.login('user','Teacher#2026');cls.a.login('admin','SatbayevAdmin#2026')
 def fresh(self,c=None):return (c or self.u).request('/api/document')[1]
 def test_01_anonymous_and_source(self):
  self.assertEqual(Client().request('/api/document')[0],401)
  self.assertEqual(self.u.request('/server.py')[0],404)
  self.assertEqual(self.u.request('/api/admin/users')[0],403)
  self.assertEqual(self.u.request('/api/admin/project')[0],403)
 def test_02_protected_fields_server_side(self):
  for change in [lambda s:s['meta'].__setitem__('director','HACK'),lambda s:s['meta'].__setitem__('university','Other'),lambda s:s['sections'][0].__setitem__('title','Other'),lambda s:s['sections'][12].__setitem__('text','Other'),lambda s:s['relations'][0].__setitem__('director','HACK')]:
   d=self.fresh();s=copy.deepcopy(d['state']);change(s);self.assertEqual(self.u.save(d,s)[0],403)
 def test_03_csrf(self):
  d=self.fresh();self.assertEqual(self.u.request('/api/document',d,'PUT',csrf=False)[0],403)
 def test_04_numbers_calculated_not_trusted(self):
  d=self.fresh();s=d['state'];s['tables']['8'][1][3]='1.25';s['tables']['8'][1][-1]='99999';status,_=self.u.save(d,s);self.assertEqual(status,200)
  row=self.fresh()['state']['tables']['8'][1];self.assertEqual(row[-1],'5.25')
  for value in ['abc','-1','1e3','101','1.234']:
   d=self.fresh();d['state']['tables']['8'][1][3]=value;self.assertEqual(self.u.save(d)[0],400)
 def test_05_dates_and_year_limits(self):
  for value,expected in [('2027-02-29',400),('2028-02-29',200),('2101-01-01',400),('2100-12-31',200)]:
   d=self.fresh();d['state']['meta']['approvalDate']=value;self.assertEqual(self.u.save(d)[0],expected)
  d=self.fresh();self.assertEqual(d['state']['meta']['date'],'2100')
  d['state']['meta']['year']='2099–2100';self.assertEqual(self.u.save(d)[0],200)
 def test_06_dependent_lists_enforced(self):
  d=self.fresh();d['state']['meta']['department']='Тау-кен ісі';self.assertEqual(self.u.save(d)[0],400)
  d=self.fresh();d['state']['meta']['program']='6B07101 Энергетика';self.assertEqual(self.u.save(d)[0],400)
  d=self.fresh();d['state']['meta']['course']='HACK';self.assertEqual(self.u.save(d)[0],400)
 def test_07_global_admin_names_and_conflicts(self):
  old=self.fresh();d=self.fresh(self.a);d['state']['meta']['director']='Сынақ Директор';self.assertEqual(self.a.save(d)[0],200)
  self.assertEqual(self.fresh()['state']['meta']['director'],'Сынақ Директор')
  self.assertEqual(self.u.save(old)[0],409)
  # Teachers' private sections are not replaced by administrator's own document.
  d=self.fresh();d['state']['meta']['lecturer']='Өз оқытушысы';self.assertEqual(self.u.save(d)[0],200)
  self.assertNotEqual(self.fresh(self.a)['state']['meta']['lecturer'],'Өз оқытушысы')
 def test_08_accounts_and_session_revocation(self):
  self.assertEqual(self.u.request('/api/admin/users',{'action':'create','username':'evil','name':'E','password':'TestPassword1'})[0],403)
  self.assertEqual(self.a.request('/api/admin/users',{'action':'create','username':'teacher2','name':'Second Teacher','password':'AnotherPass#2026','role':'user'})[0],200)
  c=Client();c.login('teacher2','AnotherPass#2026');users=self.a.request('/api/admin/users')[1]['users'];uid=next(x['id'] for x in users if x['username']=='teacher2');self.assertEqual(self.a.request('/api/admin/users',{'action':'disable','id':uid})[0],200);self.assertEqual(c.request('/api/document')[0],401)
  self.assertEqual(self.a.request('/api/admin/users',{'action':'enable','id':uid})[0],200)
  c.login('teacher2','AnotherPass#2026');self.assertEqual(self.a.request('/api/admin/users',{'action':'role','id':uid,'role':'admin'})[0],200)
  self.assertEqual(c.request('/api/document')[0],401);c.login('teacher2','AnotherPass#2026');self.assertEqual(c.request('/api/admin/users')[0],200)
 def test_09_source_archive(self):
  status,b=self.a.request('/api/admin/project');self.assertEqual(status,200)
  with zipfile.ZipFile(io.BytesIO(b)) as z:
   self.assertTrue(any(n.endswith('server.py') for n in z.namelist()));self.assertFalse(any('runtime/' in n or n.endswith('.sqlite3') for n in z.namelist()));self.assertIsNone(z.testzip())
 def test_10_stale_document(self):
  d=self.fresh();self.assertEqual(self.u.save(d)[0],200);self.assertEqual(self.u.save(d)[0],409)
 def test_11_blank_paragraphs_survive_reload(self):
  d=self.fresh();original=d['state']['sections'][2]['text']
  for text in [original+'\n\n', '', 'First paragraph\n\nThird paragraph']:
   d=self.fresh();d['state']['sections'][2]['text']=text
   status,result=self.u.save(d)
   self.assertEqual(status,200,result)
   self.assertEqual(self.fresh()['state']['sections'][2]['text'],text)

if __name__=='__main__':
 with tempfile.TemporaryDirectory() as tmp:
  with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
  BASE='http://127.0.0.1:'+str(port)
  proc=subprocess.Popen([sys.executable,str(Path(__file__).resolve().parents[1]/'server.py'),'--host','127.0.0.1','--port',str(port),'--db',str(Path(tmp)/'test.sqlite3')],stdout=subprocess.DEVNULL)
  try:
   for _ in range(100):
    try:Client().request('/api/document');break
    except urllib.error.URLError:time.sleep(.05)
   result=unittest.main(verbosity=2,exit=False).result
  finally:proc.terminate();proc.wait(timeout=5)
  sys.exit(0 if result.wasSuccessful() else 1)
