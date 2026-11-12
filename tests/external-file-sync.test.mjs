import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ExternalFileSync} from '../src/external-file-sync.mjs';
import {runWithLanguage} from '../src/i18n.mjs';

async function fixture(fn){
  const dir=await mkdtemp(join(tmpdir(),'external-sync-'));
  try{
    const configPath=join(dir,'config.xml'),configFile=join(dir,'external.json');
    await writeFile(configPath,'<configuration><gui><apikey>test-secret</apikey></gui></configuration>');
    await writeFile(configFile,JSON.stringify({projects:{p:{url:'http://127.0.0.1:1234',configPath,folderId:'test-folder',peerId:'peer'}}}));
    const data={settings:{id:'test-folder',type:'sendreceive',devices:[{deviceID:'peer'}]},status:{state:'idle',localFiles:10,needTotalItems:0},
      connections:{connections:{peer:{connected:true}}},completion:{remoteState:'valid',completion:100,needItems:0,needDeletes:0}};
    let time=100000,calls=0,fail=false;
    const observer=await new ExternalFileSync({configFile,now:()=>time,fetchImpl:async(url,options)=>{
      calls++;assert.equal(options.method,undefined);assert.equal(options.headers['X-API-Key'],'test-secret');assert.equal(options.redirect,'error');
      if(fail)throw Error('private observer error with test-secret');
      const value=url.pathname.includes('/config/')?data.settings:url.pathname.endsWith('/status')?data.status:url.pathname.endsWith('/connections')?data.connections:data.completion;
      return {ok:true,json:async()=>structuredClone(value)};
    }}).load();
    await fn({observer,data,advance:(n=10001)=>time+=n,calls:()=>calls,fail:()=>fail=true});
  }finally{await rm(dir,{recursive:true,force:true});}
}
test('read-only observer reports both ends, coalesces reads, expires evidence and keeps secrets private',()=>fixture(async e=>{
  assert.equal(e.observer.view('unconfigured'),null);
  assert.equal(e.observer.view('p').status,'unknown');
  await Promise.all([e.observer.refresh(['p']),e.observer.refresh(['p'])]);
  assert.equal(e.calls(),4);assert.equal(e.observer.view('p').status,'synced');
  await e.observer.refresh(['p']);assert.equal(e.calls(),4);
  const out=JSON.stringify(e.observer.view('p'));assert.ok(!out.includes('test-secret'));assert.ok(!out.includes('config.xml'));assert.ok(!out.includes('1234'));
  e.advance(21000);assert.equal(e.observer.view('p').status,'unknown');
  e.fail();await e.observer.refresh(['p']);assert.equal(e.observer.view('p').status,'unknown');
}));
test('disconnected, paused, failed, transferring and incomplete peer evidence never appear synchronized',()=>fixture(async e=>{
  async function check(status){e.advance();await e.observer.refresh(['p']);assert.equal(e.observer.view('p').status,status);}
  e.data.connections.connections.peer.connected=false;await check('offline');
  e.data.connections.connections.peer.connected=true;e.data.settings.paused=true;await check('paused');
  e.data.settings.paused=false;e.data.status.pullErrors=1;await check('error');
  e.data.status.pullErrors=0;e.data.completion.needItems=2;await check('syncing');
  e.data.completion.needItems=0;e.data.completion.needDeletes=1;await check('syncing');
  e.data.completion.needDeletes=0;e.data.status.state='scanning';await check('syncing');
  e.data.status.state='idle';e.data.completion.remoteState='unknown';await check('unknown');
  e.data.completion.remoteState='valid';delete e.data.status.needTotalItems;await check('unknown');
}));
test('observer rejects non-loopback targets, changed folder bindings and displays the requested language',()=>fixture(async e=>{
  e.observer.configs.p.url='http://example.com';await e.observer.refresh(['p']);assert.equal(e.calls(),0);assert.equal(e.observer.view('p').status,'unknown');
  e.observer.configs.p.url='http://127.0.0.1:1234';e.advance();e.data.settings.devices=[];await e.observer.refresh(['p']);assert.equal(e.observer.view('p').status,'unknown');
  e.data.settings.devices=[{deviceID:'peer'}];e.advance();await e.observer.refresh(['p']);
  assert.match(runWithLanguage('zh',()=>e.observer.view('p').indicator.title),/已同步/);
  assert.match(runWithLanguage('en',()=>e.observer.view('p').indicator.title),/In sync/);
}));
