import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.mjs';
import { nativeSessionProjectIds, nativeTerminalProject, projectTerminalLock } from '../src/terminal-resume.mjs';

const identity={nodeId:'node-a',runtime:'codex',sessionId:'session-xxxxx'};
function store(t){const db=new Store(':memory:');t.after(()=>db.close());return db;}

test('ownership remains scoped to device and runtime, including historical runs and original role devices',t=>{
  const db=store(t);
  db.put('roleSessions',{id:'original',projectId:'p1',nodeId:'node-a'});
  db.put('roleSessions',{id:'other',projectId:'p2',nodeId:'node-b',runtime:'codex',nativeSessionId:identity.sessionId});
  db.put('runs',{id:'legacy',projectId:'p1',roleSessionId:'original',nativeSession:{runtime:'codex',id:identity.sessionId},status:'succeeded'});
  db.put('runs',{id:'different-runtime',projectId:'p3',nodeId:'node-a',nativeSession:{runtime:'claude',id:identity.sessionId}});
  assert.deepEqual(nativeSessionProjectIds(db,identity),['p1']);
  assert.deepEqual(nativeSessionProjectIds(db,{...identity,nodeId:'node-b'}),['p2']);
  assert.throws(()=>nativeTerminalProject(db,{...identity,folderProjectIds:['p2']}),/different group chats/);
  db.put('runs',{id:'second-owner',projectId:'p4',nodeId:'node-a',nativeSession:{runtime:'codex',id:identity.sessionId}});
  assert.throws(()=>nativeTerminalProject(db,identity),/ambiguous/);
});

test('missing devices still block ownership; a role from another project cannot resolve them',t=>{
  const db=store(t);
  db.put('roleSessions',{id:'unrelated',projectId:'p2',nodeId:'node-a'});
  db.put('runs',{id:'unknown',projectId:'p1',roleSessionId:'unrelated',nativeSession:{runtime:'codex',id:identity.sessionId}});
  db.put('terminalSessions',{id:'lease',...identity,kind:'native',status:'active'});
  assert.throws(()=>nativeSessionProjectIds(db,identity),/ownership is unknown/);
  assert.equal(projectTerminalLock(db,'p1','node-a').id,'lease');
  db.put('terminalSessions',{id:'lease',...identity,kind:'native',status:'released'});
  assert.equal(projectTerminalLock(db,'p1','node-a'),null);
});

test('scheduler ownership checks avoid history scans and immediately reflect updated identity',t=>{
  const db=store(t),payload='x'.repeat(65536);
  db.transaction(()=>{for(let n=0;n<200;n++)db.put('runs',{id:`old-${n}`,projectId:'p1',nodeId:'node-a',nativeSession:{runtime:'codex',id:`unrelated-${n}`},result:payload});});
  db.put('terminalSessions',{id:'lease',...identity,kind:'native-turn',status:'active'});
  const list=db.list.bind(db);
  db.list=kind=>{assert.ok(!['runs','roleSessions'].includes(kind),'must not materialize complete history');return list(kind);};
  assert.equal(projectTerminalLock(db,'p1','node-a'),null);
  db.put('roleSessions',{id:'owner',projectId:'p1',...identity,nativeSessionId:identity.sessionId});
  assert.equal(projectTerminalLock(db,'p1','node-a').id,'lease');
  db.put('roleSessions',{id:'owner',projectId:'p1',nodeId:'node-b',runtime:'codex',nativeSessionId:identity.sessionId});
  assert.equal(projectTerminalLock(db,'p1','node-a'),null);
});
