import {readFile,writeFile,mkdir,rename,realpath,stat} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {computerLinkAssets,streamComputerLinkBundle} from './computer-link-bundle.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const ignores=['.git','.ssh','.claude','.codex','.workbench','.env','.env.*','*.pem','*.key','.npmrc','.netrc','node_modules','.DS_Store'];
async function atomic(file,value){await mkdir(resolve(file,'..'),{recursive:true,mode:0o700});const tmp=file+'.tmp';await writeFile(tmp,value,{mode:0o600});await rename(tmp,file);}
async function input(req){let size=0;const parts=[];for await(const part of req){size+=part.length;if(size>8192)throw fail('请求过大',413);parts.push(part);}return JSON.parse(Buffer.concat(parts).toString()||'{}');}
const send=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};

/** Explicit, single-operator enrollment. No provider credentials or Worker grants cross this boundary. */
export class ComputerLink {
  constructor({data,fetchImpl=fetch,now=Date.now}){Object.assign(this,{data,fetchImpl,now});this.dir=join(data,'computer-link');this.rows=[];this.config=null;this.queue=Promise.resolve();}
  async load(){
    try{this.config=JSON.parse(await readFile(join(this.data,'computer-link.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return this;}
    const c=this.config,u=new URL(c.publicOrigin),s=new URL(c.syncthingUrl);
    if(u.protocol!=='https:'||u.origin!==c.publicOrigin||s.protocol!=='http:'||s.hostname!=='127.0.0.1'||s.pathname!=='/'||s.username||s.password||s.search||s.hash)throw Error('Invalid computer link endpoints');
    if(!/^[a-zA-Z0-9.-]+$/.test(c.sshHost)||!Number.isInteger(c.sshPort)||c.sshPort<1||c.sshPort>65535||!Number.isInteger(c.syncPort)||c.syncPort<1||c.syncPort>65535||!/^\w[\w-]*$/.test(c.sshUser)||!/^ssh-ed25519 [A-Za-z0-9+/=]+$/.test(c.hostKey))throw Error('Invalid computer link SSH configuration');
    for(const key of ['folderRoot','authorizedKeys','syncthingConfig'])if(!c[key]?.startsWith('/'))throw Error('Computer link paths must be absolute');
    if(c.runtimeCache&&!c.runtimeCache.startsWith('/'))throw Error('Runtime cache path must be absolute');
    if(c.maintenanceUser&&(!/^\w[\w-]*$/.test(c.maintenanceUser)||!c.maintenanceAuthorizedKeys?.startsWith('/')))throw Error('Invalid maintenance configuration');
    await mkdir(this.dir,{recursive:true,mode:0o700});
    try{this.rows=JSON.parse(await readFile(join(this.dir,'devices.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    return this;
  }
  serial(fn){const task=this.queue.then(fn);this.queue=task.catch(()=>{});return task;}
  save(){return atomic(join(this.dir,'devices.json'),JSON.stringify(this.rows));}
  async sync(path,method='GET',body){
    const xml=await readFile(this.config.syncthingConfig,'utf8'),key=xml.match(/<gui\b[^>]*>[\s\S]*?<apikey>([A-Za-z0-9_-]+)<\/apikey>/)?.[1];
    if(!key)throw Error('Sync credential unavailable');
    const r=await this.fetchImpl(new URL('/rest/'+path,this.config.syncthingUrl),{method,headers:{'X-API-Key':key,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(5000),redirect:'error'});
    if(!r.ok){const e=Error('Sync service unavailable');e.status=r.status;throw e;}const text=await r.text();return text?JSON.parse(text):{};
  }
  async keys(){
    // This is a dedicated AuthorizedKeysFile configured for a forwarding-only account, never a user's normal key file.
    const lines=this.rows.filter(r=>r.publicKey&&!['revoked','revoking'].includes(r.status)).map(r=>`restrict,port-forwarding,permitopen="127.0.0.1:${this.config.syncPort}" ${r.publicKey} wb-link-${r.id}`);
    await atomic(this.config.authorizedKeys,lines.join('\n')+'\n');
    if(this.config.maintenanceAuthorizedKeys){
      const dev=this.rows.filter(r=>r.maintenanceKey&&!['revoked','revoking'].includes(r.status)).map(r=>`${r.maintenanceKey} wb-link-dev-${r.id}`);
      await atomic(this.config.maintenanceAuthorizedKeys,dev.join('\n')+'\n');
    }
  }
  async create({maintenance=false,arch='universal',setup='helper'}={}){
    if(!this.config)throw fail('管理员尚未配置连接助手',503);
    if(!['arm64','x64','universal'].includes(arch))throw fail('不支持的连接包类型');
    if(!['helper','codex'].includes(setup))throw fail('不支持的连接方式');
    if(setup==='helper')await computerLinkAssets(this.config.runtimeCache,arch).catch(()=>{throw fail('服务器尚未备好完整连接包，请联系管理员准备组件',503);});
    if(this.rows.filter(r=>r.status==='pending'&&r.expiresAt>this.now()).length>=5)throw fail('已有多个待连接下载包，请先取消不用的连接');
    if(this.rows.filter(r=>r.status!=='revoked'&&r.status!=='pending').length>=32)throw fail('连接数量已达到上限');
    const id=randomBytes(12).toString('hex'),token=randomBytes(32).toString('base64url');
    if(maintenance&&(!this.config.maintenanceAuthorizedKeys||!this.config.maintenanceUser))throw fail('本机维护尚未配置');
    const row={id,tokenHash:hash(token),createdAt:this.now(),expiresAt:this.now()+30*60*1000,status:'pending',folderId:'wb-link-'+id,maintenance:maintenance===true,arch,setup};
    this.rows=this.rows.filter(r=>r.status!=='pending'||r.expiresAt>this.now());this.rows.push(row);await this.save();
    return {id,expiresAt:row.expiresAt,downloadToken:token,arch,setup};
  }
  async download(id,token,res){
    const r=this.rows.find(row=>row.id===id&&row.tokenHash===hash(token));
    if(!r||r.status!=='pending'||r.expiresAt<this.now())throw fail('连接包已失效，请重新下载',401);
    const runtimes=r.setup==='codex'?[]:await computerLinkAssets(this.config.runtimeCache,r.arch);
    // Revocation may run during async asset validation. Recheck before releasing the package.
    if(r.status!=='pending'||r.expiresAt<this.now())throw fail('连接包已失效，请重新下载',401);
    await streamComputerLinkBundle({id:r.id,token,origin:this.config.publicOrigin,expiresAt:r.expiresAt,ignores,maintenance:r.maintenance,arch:r.arch,setup:r.setup||'helper'},runtimes,res);
  }
  async claim(token,b){
    const r=this.rows.find(r=>r.tokenHash===hash(token));
    if(!r||['revoked','revoking'].includes(r.status)||r.expiresAt<this.now())throw fail('连接包已失效，请在网页重新下载',401);
    if(typeof b.publicKey!=='string'||!/^ssh-ed25519 [A-Za-z0-9+/]{68}$/.test(b.publicKey)||typeof b.peerId!=='string'||!/^([A-Z2-7]{7}-){7}[A-Z2-7]{7}$/.test(b.peerId))throw fail('设备身份无效');
    // Validate the SSH wire key, not just its spelling.
    const key=Buffer.from(b.publicKey.split(' ')[1],'base64');
    if(key.length!==51||key.readUInt32BE(0)!==11||key.subarray(4,15).toString()!=='ssh-ed25519'||key.readUInt32BE(15)!==32)throw fail('SSH 公钥无效');
    if(r.publicKey&&(r.publicKey!==b.publicKey||r.peerId!==b.peerId))throw fail('连接包已被另一台电脑使用',409);
    if(r.maintenance){
      if(!/^ssh-ed25519 [A-Za-z0-9+/]{68}$/.test(b.maintenanceKey||'')||b.maintenanceKey===b.publicKey)throw fail('维护密钥无效');
      const mk=Buffer.from(b.maintenanceKey.split(' ')[1],'base64');
      if(mk.length!==51||mk.readUInt32BE(0)!==11||mk.subarray(4,15).toString()!=='ssh-ed25519'||mk.readUInt32BE(15)!==32)throw fail('维护公钥无效');
      if(r.maintenanceKey&&r.maintenanceKey!==b.maintenanceKey)throw fail('维护密钥不匹配',409);
    }
    if(this.rows.some(other=>other.id!==r.id&&other.status!=='revoked'&&(other.publicKey===b.publicKey||other.peerId===b.peerId)))throw fail('此设备身份已被使用',409);
    const root=await realpath(this.config.folderRoot),folder=join(root,r.id);
    await mkdir(folder,{recursive:true,mode:0o750});
    if(await realpath(folder)!==folder||!(await stat(folder)).isDirectory()||!folder.startsWith(root+sep))throw fail('共享目录不可用');
    // Persist identity before effects: retry after a lost response resumes only the same device.
    Object.assign(r,{publicKey:b.publicKey,maintenanceKey:r.maintenance?b.maintenanceKey:undefined,peerId:b.peerId,name:String(b.name||'Mac').replace(/[\x00-\x1f]/g,'').slice(0,80),folder,status:'pairing'});await this.save();
    await writeFile(join(folder,'.stignore'),ignores.join('\n')+'\n',{flag:'wx',mode:0o600}).catch(e=>{if(e.code!=='EEXIST')throw e;});
    const [server,defaults,device]=await Promise.all([this.sync('system/status'),this.sync('config/defaults/folder'),this.sync('config/defaults/device')]);
    await this.sync('config/devices','POST',{...device,deviceID:r.peerId,name:r.name,addresses:['dynamic'],autoAcceptFolders:false,introducer:false});
    await this.sync('config/folders','POST',{...defaults,id:r.folderId,label:'Workbench '+r.name,path:folder,type:'sendreceive',paused:false,devices:[{deviceID:server.myID},{deviceID:r.peerId}],maxConflicts:-1,fsWatcherEnabled:true,versioning:{type:'simple',params:{keep:'20'},cleanupIntervalS:3600}});
    await this.keys();r.status='paired';await this.save();
    return {id:r.id,folderId:r.folderId,serverId:server.myID,folder,sshHost:this.config.sshHost,sshPort:this.config.sshPort,sshUser:this.config.sshUser,hostKey:this.config.hostKey,syncPort:this.config.syncPort,ignores,maintenanceUser:r.maintenance?this.config.maintenanceUser:null,deployment:r.maintenance?this.config.deployment:null};
  }
  async revoke(id){
    const r=this.rows.find(r=>r.id===id);if(!r)throw fail('连接不存在',404);
    r.status='revoking';await this.save();await this.keys();
    // Remove only enrollment-owned shares; retain all disk contents and version backups.
    if(r.peerId){for(const path of ['config/folders/'+r.folderId,'config/devices/'+r.peerId])await this.sync(path,'DELETE').catch(e=>{if(e.status!==404)throw e;});}
    r.status='revoked';await this.save();return {ok:true};
  }
  async status(){
    if(!this.config)return {available:false,devices:[]};
    let connections=null;try{connections=(await this.sync('system/connections')).connections;}catch{}
    const devices=await Promise.all(this.rows.filter(r=>r.status!=='revoked'&&(r.status!=='pending'||r.expiresAt>this.now())).map(async r=>{
      let state=r.status,files=null,pendingItems=null;
      if(r.status==='paired'){
        state=connections?(connections[r.peerId]?.connected?'connecting':'offline'):'unknown';
        if(state==='connecting')try{const [s,c]=await Promise.all([this.sync('db/status?folder='+r.folderId),this.sync('db/completion?folder='+r.folderId+'&device='+r.peerId)]);files=s.localFiles;pendingItems=Number.isFinite(s.needTotalItems)&&Number.isFinite(c.needItems)?s.needTotalItems+c.needItems:null;state=s.error||s.errors>0||s.pullErrors>0?'error':s.state==='idle'&&c.remoteState==='valid'&&pendingItems===0&&c.completion===100?'synced':'syncing';}catch{state='unknown';}
      }
      return {id:r.id,name:r.name||'等待连接的 Mac',status:state,folder:r.folder||null,createdAt:r.createdAt,files,pendingItems,maintenance:r.maintenance};
    }));return {available:true,maintenanceAvailable:Boolean(this.config.maintenanceUser&&this.config.maintenanceAuthorizedKeys),devices};
  }
  async handle(req,res,path,{client=false}={}){
    if(client&&path!=='/api/computer-link/claim')return false;
    if(!client&&!path.startsWith('/api/computer-link'))return false;
    try{
      if(client){
        if(req.method!=='POST')throw fail('请求方式不支持',405);
        if(!this.config)throw fail('连接助手未配置',503);
        const token=String(req.headers.authorization||'').match(/^Bearer ([\w-]{43})$/)?.[1];
        // Reject invalid tokens before reading bodies or queuing any filesystem/API work.
        if(!token||!this.rows.some(r=>r.tokenHash===hash(token)&&!['revoked','revoking'].includes(r.status)&&r.expiresAt>=this.now()))throw fail('连接包无效或已过期',401);
        const b=await input(req);send(res,await this.serial(()=>this.claim(token,b)));return true;
      }
      if(path==='/api/computer-link'&&req.method==='GET')send(res,await this.status());
      else if(path==='/api/computer-link'&&req.method==='POST'){const b=await input(req);send(res,await this.serial(()=>this.create(b)));}
      else if(/^\/api\/computer-link\/[a-f0-9]{24}\/download$/.test(path)&&req.method==='POST'){const b=await input(req);if(typeof b.token!=='string')throw fail('下载令牌无效',401);await this.download(path.split('/')[3],b.token,res);}
      else if(/^\/api\/computer-link\/[a-f0-9]{24}$/.test(path)&&req.method==='DELETE')send(res,await this.serial(()=>this.revoke(path.split('/').at(-1))));
      else send(res,{error:'接口不存在'},404);
    }catch(e){if(res.headersSent)res.destroy();else send(res,{error:e.status?e.message:'连接服务暂不可用，请稍后重试'},e.status||503);}return true;
  }
}
