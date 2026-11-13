"""HTTP checks for personal storage, migration, isolation and stale writes."""
import copy, importlib.util, pathlib, subprocess, sys, tempfile, socket, time

root=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('base_tests',root/'tests/server.test.py')
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
with tempfile.TemporaryDirectory() as tmp:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    base.BASE='http://127.0.0.1:'+str(port)
    proc=subprocess.Popen([sys.executable,str(root/'server.py'),'--host','127.0.0.1','--port',str(port),'--db',str(pathlib.Path(tmp)/'test.sqlite3')],stdout=subprocess.DEVNULL)
    try:
        for _ in range(100):
            try:base.Client().request('/api/workspace');break
            except OSError:time.sleep(.05)
        user=base.Client();legacy=user.login('user','Teacher#2026')['state']
        admin=base.Client();admin.login('admin','SatbayevAdmin#2026')
        assert base.Client().request('/api/workspace')[0]==401
        status,data=user.request('/api/workspace');assert status==200
        ws=data['workspace'];assert ws['documents'][0]['state']==legacy
        ws['documents'][0]['state']['meta']['university']='Personal university'
        ws['documents'][0]['state']['sections'][12]['title']='Editable title'
        ws['documents'][0]['versions'].append({'name':'Before edit','created':'2026-11-13','state':copy.deepcopy(legacy)})
        second=copy.deepcopy(ws['documents'][0]);second.update(id='second',name='Second',versions=[])
        second['state']['sections'][0]['text']='Independent document';ws['documents'].append(second)
        body={'workspace':ws,'revision':0}
        assert user.request('/api/workspace',body,'PUT',csrf=False)[0]==403
        status,result=user.request('/api/workspace',body,'PUT');assert status==200,result
        assert user.request('/api/workspace',body,'PUT')[0]==409
        loaded=user.request('/api/workspace')[1];assert loaded['workspace']==ws
        assert user.request('/api/document')[1]['state']==legacy
        assert len(admin.request('/api/workspace')[1]['workspace']['documents'])==1
        assert admin.request('/api/workspace')[1]['workspace']['documents'][0]['state']['meta']['university']!='Personal university'
        bad=copy.deepcopy(ws);bad['documents'][1]['id']='original'
        assert user.request('/api/workspace',{'workspace':bad,'revision':1},'PUT')[0]==400
        ws['documents'][0]['state']=copy.deepcopy(ws['documents'][0]['versions'][0]['state'])
        assert user.request('/api/workspace',{'workspace':ws,'revision':1},'PUT')[0]==200
        assert user.request('/api/workspace')[1]['workspace']['documents'][0]['state']==legacy
        assert user.request('/api/workspace')[1]['workspace']['documents'][1]['state']['sections'][0]['text']=='Independent document'
        print('PASS: legacy migration preserved, personal fields, independent documents, persistent versions/restore, CSRF, ownership, conflicts and malformed IDs.')
    finally:proc.terminate();proc.wait(timeout=5)
