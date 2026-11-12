import {readFile} from 'node:fs/promises';
import {tr} from './i18n.mjs';

/** Observe an existing Syncthing pair. Never start, pause or modify either sync engine. */
export class ExternalFileSync {
  constructor({configFile,fetchImpl=fetch,now=Date.now,ttl=10000}) {
    Object.assign(this,{configFile,fetchImpl,now,ttl});this.configs={};this.cache=new Map();this.pending=new Map();
  }
  async load() {
    try {this.configs=JSON.parse(await readFile(this.configFile,'utf8')).projects||{};}
    catch(error){if(error.code!=='ENOENT')throw Error('Cannot read external file sync configuration');}
    return this;
  }
  configured(id){return Object.hasOwn(this.configs,id);}
  view(id) {
    if(!this.configured(id))return null;
    const cached=this.cache.get(id),fresh=cached&&this.now()-cached.time<=this.ttl*2;
    const record=fresh?cached.value:{status:'unknown'};
    const color={synced:'green',syncing:'orange',offline:'orange',paused:'orange',error:'red',unknown:'off'}[record.status];
    return {provider:'Syncthing',...record,checkedAt:cached?new Date(cached.time).toISOString():null,
      indicator:{state:color,title:tr(`externalSync.${record.status}`),open:true}};
  }
  async refresh(ids) {
    await Promise.all(ids.filter(id=>this.configured(id)).map(id=>this.refreshProject(id)));
  }
  async refreshProject(id) {
    if(this.pending.has(id))return this.pending.get(id);
    const cached=this.cache.get(id);if(cached&&this.now()-cached.time<this.ttl)return;
    const promise=this.observe(this.configs[id]).catch(()=>({status:'unknown'})).then(value=>{
      this.cache.set(id,{time:this.now(),value});this.pending.delete(id);
    });
    this.pending.set(id,promise);return promise;
  }
  async observe(config) {
    const {url,configPath,folderId,peerId}=config;
    const base=new URL(url);
    if(base.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(base.hostname)||base.username||base.password||base.pathname!=='/'||base.search||base.hash||!folderId||!peerId)throw Error('Invalid observer configuration');
    const xml=await readFile(configPath,'utf8');
    const apiKey=xml.match(/<gui\b[^>]*>[\s\S]*?<apikey>([A-Za-z0-9_-]+)<\/apikey>/)?.[1];
    if(!apiKey)throw Error('Observer credential unavailable');
    const get=async path=>{
      const response=await this.fetchImpl(new URL('/rest/'+path,base),{headers:{'X-API-Key':apiKey},signal:AbortSignal.timeout(2000),redirect:'error'});
      if(!response.ok)throw Error('Observer unavailable');return response.json();
    };
    const folder=encodeURIComponent(folderId),peer=encodeURIComponent(peerId);
    const [settings,status,connections,completion]=await Promise.all([
      get('config/folders/'+folder),get('db/status?folder='+folder),get('system/connections'),get(`db/completion?folder=${folder}&device=${peer}`)
    ]);
    if(settings.id!==folderId||settings.type!=='sendreceive'||!settings.devices?.some(d=>d.deviceID===peerId))throw Error('Observer folder changed');
    const stats={localFiles:status.localFiles,pendingItems:Number.isFinite(status.needTotalItems)&&Number.isFinite(completion.needItems)?status.needTotalItems+completion.needItems:null};
    if(settings.paused)return {status:'paused',...stats};
    if(status.invalid||status.error||status.errors>0||status.pullErrors>0||status.state==='error')return {status:'error',...stats};
    if(!connections.connections?.[peerId]?.connected)return {status:'offline',...stats};
    // A connected peer alone is not evidence that it received this folder's latest index.
    if(completion.remoteState!=='valid'||!Number.isFinite(stats.pendingItems)||!Number.isFinite(completion.completion)||!Number.isFinite(status.localFiles)||typeof status.state!=='string')return {status:'unknown',...stats};
    const busy=status.state!=='idle'||stats.pendingItems>0||completion.needDeletes>0||completion.completion<100;
    return {status:busy?'syncing':'synced',...stats};
  }
}
