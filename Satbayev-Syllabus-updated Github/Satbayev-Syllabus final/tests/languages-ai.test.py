"""HTTP language switching and AI integration against a local test-only Responses server."""
import sys,os,json,threading,tempfile,subprocess,socket,time,urllib.error,copy,unittest,importlib.util
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import language_data,ai_service
spec=importlib.util.spec_from_file_location('permissions',ROOT/'tests/server.test.py');p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
requests=[]
class Mock(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_POST(self):
  data=json.loads(self.rfile.read(int(self.headers['Content-Length'])));requests.append(data)
  if data.get('text'):
   texts=json.loads(data['input'][0]['content'])['texts'];text=json.dumps({'translations':['Translated '+s for s in texts]})
  else:text='1. Test assignment\nGoal: practise architecture.'
  body=json.dumps({'output':[{'type':'message','content':[{'type':'output_text','text':text}]}]}).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(body)
class Tests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.c=p.Client();cls.c.login('user','Teacher#2026')
 def test_01_full_language_roundtrip(self):
  for lang in ['ru','en','kk']:
   d=self.c.request('/api/document')[1];state,unknown=language_data.localize(d['state'],lang);self.assertEqual(unknown,[])
   status,r=self.c.save(d,state);self.assertEqual(status,200,r)
   got=self.c.request('/api/document')[1]['state'];self.assertEqual(got['lang'],lang);self.assertEqual(got['sections'][11]['text'],language_data.PACKS[lang]['sections'][11]['text'])
   bad=copy.deepcopy(got);bad['sections'][11]['text']='HACK';self.assertEqual(self.c.save(self.c.request('/api/document')[1],bad)[0],403)
 def test_02_authenticated_chat(self):
  self.assertEqual(p.Client().request('/api/ai/chat',{'prompt':'Hello'})[0],401)
  self.assertEqual(self.c.request('/api/ai/chat',{'prompt':'Hello'},csrf=False)[0],403)
  status,r=self.c.request('/api/ai/chat',{'prompt':'Generate a task','language':'en','context':{'course':'Architecture','excerpt':'Memory'}});self.assertEqual(status,200,r);self.assertIn('Test assignment',r['answer']);self.assertIn('English',requests[-1]['instructions']);self.assertFalse(requests[-1]['store']);self.assertIn('Memory',requests[-1]['input'][-1]['content'])
  status,r=self.c.request('/api/ai/status');self.assertEqual(status,200);self.assertNotIn('key',r)
 def test_03_custom_translation_and_cache(self):
  d=self.c.request('/api/document')[1];d['state']['sections'][2]['text']='Custom {{course}} material CSE5491';self.assertEqual(self.c.save(d)[0],200)
  d=self.c.request('/api/document')[1];status,r=self.c.request('/api/translate',{'state':d['state'],'target':'en'});self.assertEqual(status,200,r);self.assertIn('Translated Custom',r['state']['sections'][2]['text']);self.assertEqual(self.c.save(d,r['state'])[0],200)
  saved=self.c.request('/api/document')[1];self.assertEqual(saved['state']['sections'][2]['text'],r['state']['sections'][2]['text'])
  self.assertEqual(self.c.request('/api/translate',{'state':saved['state'],'target':'kk'})[1]['state']['sections'][2]['text'],'Custom {{course}} material CSE5491')
 def test_04_missing_key_explicit(self):
  previous=os.environ.pop('OPENAI_API_KEY',None);os.environ['SYLLABUS_AI_CONFIG']=str(Path(tmp)/'absent.json')
  try:
   with self.assertRaises(ai_service.AIError) as e:ai_service.chat({'prompt':'Generate','language':'ru'})
   self.assertEqual(e.exception.status,503)
  finally:
   if previous:os.environ['OPENAI_API_KEY']=previous
if __name__=='__main__':
 with tempfile.TemporaryDirectory() as tmp:
  mock=ThreadingHTTPServer(('127.0.0.1',0),Mock);threading.Thread(target=mock.serve_forever,daemon=True).start()
  with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
  p.BASE='http://127.0.0.1:'+str(port);env={**os.environ,'OPENAI_API_KEY':'test-only-placeholder','SYLLABUS_AI_URL':f'http://127.0.0.1:{mock.server_port}/v1/responses','SYLLABUS_AI_CONFIG':str(Path(tmp)/'absent.json')}
  proc=subprocess.Popen([sys.executable,str(ROOT/'server.py'),'--host','127.0.0.1','--port',str(port),'--db',str(Path(tmp)/'db.sqlite3')],env=env,stdout=subprocess.DEVNULL)
  try:
   for _ in range(100):
    try:p.Client().request('/api/document');break
    except urllib.error.URLError:time.sleep(.05)
   result=unittest.main(verbosity=2,exit=False).result
  finally:proc.terminate();proc.wait(timeout=5);mock.shutdown()
  sys.exit(0 if result.wasSuccessful() else 1)
