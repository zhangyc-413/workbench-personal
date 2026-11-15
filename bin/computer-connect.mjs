import {readFile,writeFile,mkdir,copyFile,cp,rm,realpath,readdir,stat} from 'node:fs/promises';
import {join,dirname,resolve,sep} from 'node:path';
import {homedir,hostname} from 'node:os';
import {createHash,randomBytes} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';

const exec=promisify(execFile),sleep=ms=>new Promise(r=>setTimeout(r,ms)),self=fileURLToPath(import.meta.url);
const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const sha=b=>createHash('sha256').update(b).digest('hex');
const run=async(cmd,args,options={})=>(await exec(cmd,args,{timeout:30000,maxBuffer:1024*1024,...options})).stdout.trim();
async function save(path,value){await writeFile(path,JSON.stringify(value,null,2),{mode:0o600});}
export async function freePort(){const s=createServer();await new Promise((r,j)=>{s.once('error',j);s.listen(0,'127.0.0.1',r);});const port=s.address().port;await new Promise(r=>s.close(r));return port;}
export async function syncApi(c,path,method='GET',body){const r=await fetch(`http://127.0.0.1:${c.guiPort}/rest/${path}`,{method,headers:{'X-API-Key':c.apiKey,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(5000),redirect:'error'});if(!r.ok)throw Error('本机同步服务尚未就绪');const t=await r.text();return t?JSON.parse(t):{};}
async function waitSync(c){for(let n=0;n<60;n++){try{return await syncApi(c,'system/status');}catch{await sleep(500);}}throw Error('本机同步服务启动超时');}
async function key(dir,name){const path=join(dir,name);try{await stat(path);}catch(e){if(e.code!=='ENOENT')throw e;await run('/usr/bin/ssh-keygen',['-q','-t','ed25519','-N','','-f',path]);}return (await run('/usr/bin/ssh-keygen',['-y','-f',path])).split(/\s+/).slice(0,2).join(' ');}
export async function validateFolder(folder,base){
  const path=await realpath(folder),home=await realpath(homedir());
  if(path==='/'||path===home||path.startsWith('/System')||path.startsWith('/Library')||path.startsWith('/Applications')||path.split(sep).some(p=>['.ssh','.codex','.claude','.workbench','.git'].includes(p))||path.startsWith(join(home,'Library'))||path===base||base.startsWith(path+sep))throw Error('请选择一个专用项目文件夹，不能选择系统、账号或整个用户目录。');
  for(const entry of await readdir(base,{withFileTypes:true})){if(!entry.isDirectory()||!/^\w{24}$/.test(entry.name))continue;try{const old=JSON.parse(await readFile(join(base,entry.name,'connection.json'),'utf8'));if(old.folder&&(path===old.folder||path.startsWith(old.folder+sep)||old.folder.startsWith(path+sep)))throw Error('这个目录已经由连接助手同步，请选择其他文件夹。');}catch(e){if(e.code!=='ENOENT')throw e;}}
  return path;
}
export async function prepareLocal(c){
  const env={...process.env,STNOUPGRADE:'1',STNODEFAULTFOLDER:'1',STNORESTART:'1'};
  await run(c.syncthing,['generate','--home='+c.syncHome],{env});
  const path=join(c.syncHome,'config.xml');let text=await readFile(path,'utf8');
  text=text.replace(/<folder\b[\s\S]*?<\/folder>/g,'');
  text=text.replace(/<gui\b[\s\S]*?<\/gui>/,`<gui enabled="true" tls="false"><address>127.0.0.1:${c.guiPort}</address><apikey>${c.apiKey}</apikey></gui>`);
  for(const [tag,value] of Object.entries({listenAddress:`tcp://127.0.0.1:${c.listenPort}`,globalAnnounceEnabled:'false',localAnnounceEnabled:'false',relaysEnabled:'false',natEnabled:'false',startBrowser:'false',urAccepted:'-1',autoUpgradeIntervalH:'0'})){
    const re=new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`,'g');let first=true;text=text.replace(re,()=>{if(!first)return '';first=false;return `<${tag}>${value}</${tag}>`;});if(first)throw Error('同步配置版本不兼容：'+tag);
  }
  await writeFile(path,text,{mode:0o600});
}
export function startSync(c){return spawn(c.syncthing,['serve','--home='+c.syncHome,'--no-browser','--no-restart','--no-upgrade','--logfile='+join(c.dir,'sync.log'),'--log-max-size=1048576','--log-max-old-files=2'],{stdio:'ignore',env:{...process.env,STNORESTART:'1',STNOUPGRADE:'1',STNODEFAULTFOLDER:'1'}});}
export async function stop(child){if(!child?.pid||child.exitCode!==null||child.signalCode)return;await new Promise(r=>{child.once('exit',r);child.kill('SIGTERM');});}
export async function configurePair(c,pair){
  const [defaults,device,status]=await Promise.all([syncApi(c,'config/defaults/folder'),syncApi(c,'config/defaults/device'),syncApi(c,'system/status')]);
  await syncApi(c,'config/devices','POST',{...device,deviceID:pair.serverId,name:'Workbench server',addresses:[`tcp://127.0.0.1:${c.tunnelPort}`],autoAcceptFolders:false,introducer:false});
  await syncApi(c,'config/folders','POST',{...defaults,id:pair.folderId,label:'Workbench',path:c.folder,type:'sendreceive',devices:[{deviceID:status.myID},{deviceID:pair.serverId}],maxConflicts:-1,fsWatcherEnabled:true,versioning:{type:'simple',params:{keep:'20'},cleanupIntervalS:3600}});
  await syncApi(c,'db/ignores?folder='+pair.folderId,'POST',{ignore:pair.ignores});
}
export async function sshConfig(c,pair){
  // An explicit config avoids modifying ~/.ssh/config or reusing another connection's master/proxy.
  const keyHost=`[${pair.sshHost}]:${pair.sshPort}`,known=join(c.dir,'known_hosts');
  await writeFile(known,`${pair.sshPort===22?pair.sshHost:keyHost} ${pair.hostKey}\n`,{mode:0o600});
  const block=(alias,user,key)=>`Host ${alias}\n  HostName ${pair.sshHost}\n  User ${user}\n  Port ${pair.sshPort}\n  IdentityFile "${join(c.dir,key)}"\n  IdentitiesOnly yes\n  UserKnownHostsFile "${known}"\n  StrictHostKeyChecking yes\n  BatchMode yes\n  ControlMaster no\n  ControlPath none\n  ServerAliveInterval 30\n  ServerAliveCountMax 3\n  ConnectTimeout 10\n`;
  await writeFile(join(c.dir,'ssh_config'),block('workbench-sync',pair.sshUser,'sync_ed25519')+(pair.maintenanceUser?block('workbench-dev',pair.maintenanceUser,'dev_ed25519'):''),{mode:0o600});
}
export async function supervise(c){
  let closing=false;const children=[];
  const finish=async()=>{if(closing)return;closing=true;await Promise.all(children.map(stop));process.exit(1);};
  const sync=startSync(c),ssh=spawn('/usr/bin/ssh',['-F',join(c.dir,'ssh_config'),'-NT','-o','ExitOnForwardFailure=yes','-L',`127.0.0.1:${c.tunnelPort}:127.0.0.1:${c.pair.syncPort}`,'workbench-sync'],{stdio:'ignore'});children.push(sync,ssh);
  for(const child of children){child.once('exit',()=>void finish());child.once('error',()=>void finish());}
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>void finish());
}
export async function install(ticketPath,{chooseFolder=()=>run('/usr/bin/osascript',['-e','activate','-e','POSIX path of (choose folder with prompt "选择要与 Workbench 同步的专用文件夹")'],{timeout:300000}),openWebsite=url=>run('/usr/bin/open',[url])}={}){
  if(process.platform!=='darwin')throw Error('此安装助手仅支持 Mac');
  const ticket=JSON.parse(await readFile(ticketPath,'utf8'));
  if(!/^[a-f0-9]{24}$/.test(ticket.id)||new URL(ticket.origin).protocol!=='https:')throw Error('无效的连接包');
  const base=join(homedir(),'Library','Application Support','Workbench Connect'),dir=join(base,ticket.id);
  await mkdir(dir,{recursive:true,mode:0o700});
  const label='net.workbench.connect.'+ticket.id,plist=join(homedir(),'Library','LaunchAgents',label+'.plist');
  let c;try{c=JSON.parse(await readFile(join(dir,'connection.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(c?.installed){console.log('这台电脑已经配置好。正在检查连接…');await run('/bin/launchctl',['kickstart',`gui/${process.getuid()}/${label}`]);await openWebsite(ticket.origin);return;}
  if(ticket.expiresAt<Date.now())throw Error('下载包已过期，请回网页重新下载');
  const lock=join(dir,'install.lock');await mkdir(lock).catch(()=>{throw Error('安装正在进行。如上次异常退出，请关闭其终端后删除此目录中的 install.lock 再重试：'+dir);});
  let child;
  try{
    if(!c){
      console.log('[2/3] 请选择要同步的专用文件夹；请勿选择已经由其他同步软件管理的目录。');
      const chosen=await chooseFolder();
      const folder=await validateFolder(chosen,base);
      c={id:ticket.id,origin:ticket.origin,dir,folder,syncHome:join(dir,'syncthing'),syncthing:join(dir,'syncthing-bin'),guiPort:await freePort(),listenPort:await freePort(),tunnelPort:await freePort(),apiKey:randomBytes(32).toString('hex')};
      if(new Set([c.guiPort,c.listenPort,c.tunnelPort]).size!==3)throw Error('端口分配冲突，请重新打开助手');
      await save(join(dir,'connection.json'),c);
    }
    try{await stat(c.syncthing);}catch(e){
      if(e.code!=='ENOENT')throw e;console.log('正在校验连接包中的同步组件…');
      const arch=process.arch==='arm64'?'arm64':'amd64',archive=join(dirname(ticketPath),'components','syncthing.zip');
      if(sha(await readFile(archive))!==ticket.assets[process.arch].sync)throw Error('同步组件校验失败');
      await run('/usr/bin/ditto',['-x','-k',archive,join(dir,'download')]);
      await copyFile(join(dir,'download',`syncthing-macos-${arch}-v1.30.0`,'syncthing'),c.syncthing);
      await (await import('node:fs/promises')).chmod(c.syncthing,0o700);
      await rm(join(dir,'download'),{recursive:true,force:true});
    }
    console.log('[3/3] 正在建立 SSH 连接并配置自动同步…');
    const publicKey=await key(dir,'sync_ed25519'),maintenanceKey=ticket.maintenance?await key(dir,'dev_ed25519'):undefined;
    try{await stat(join(c.syncHome,'config.xml'));}catch(e){if(e.code!=='ENOENT')throw e;await prepareLocal(c);}
    child=startSync(c);child.on('error',()=>{});const status=await waitSync(c);
    const response=await fetch(ticket.origin+'/api/computer-link/claim',{method:'POST',headers:{Authorization:'Bearer '+ticket.token,'Content-Type':'application/json'},body:JSON.stringify({publicKey,maintenanceKey,peerId:status.myID,name:hostname()}),signal:AbortSignal.timeout(60000),redirect:'error'});
    const pair=await response.json();if(!response.ok)throw Error(pair.error||'连接失败');
    c.pair=pair;await sshConfig(c,pair);await configurePair(c,pair);
    await stop(child);child=null;
    await copyFile(self,join(dir,'connect.mjs'));
    // Runtime is in the user-scoped stable cache, independent of Downloads and the synchronization folder.
    c.node=process.execPath;await save(join(dir,'connection.json'),c);
    if(ticket.maintenance){
      const dev=join(homedir(),'Workbench Development',ticket.id);await mkdir(dev,{recursive:true,mode:0o700});
      // Never overwrite local edits on an interrupted installation retry.
      await cp(join(dirname(resolve(ticketPath)),'source'),dev,{recursive:true,force:false,errorOnExist:false});
      const config=join(dir,'ssh_config');
      await save(join(dev,'.workbench-connection.json'),{sshConfig:config,sshAlias:'workbench-dev',origin:ticket.origin,deployment:pair.deployment});
      await writeFile(join(dev,'LOCAL-SETUP.md'),`# 本机工作台开发\n\n这是此服务器当前源码的独立副本。可在 Codex 或其他本地 Agent 中打开本目录。\n\n- 本机 Node：\`${c.node}\`。将其 bin 目录加入 PATH 后执行 npm ci、npm run check。\n- 维护连接：ssh -F '${config.replaceAll("'","'\\''")}' workbench-dev\n- 发布：node bin/deploy-personal.mjs（先检查差异、测试；脚本会检查服务器空闲、备份、发布并验证，忙时拒绝）。\n- 配置文件 .workbench-connection.json 仅留本机，勿提交 Git。\n- 服务器账号凭证和聊天数据库不在此源码目录中。只改源码，不删除状态目录。\n- 首次可 git init -b personal，创建自己的版本记录；不要把本机连接资料提交到公开仓库。\n- 修改本地源码不会自动更新线上；确认测试通过后再发布。\n`,{mode:0o600});
      await writeFile(join(dev,'.gitignore'),'node_modules/\n.data/\n.local/\n.workbench/\n.worktrees/\n.workbench-connection.json\n.workbench-baseline.json\nLOCAL-SETUP.md\nsoftware-build.json\n.env\n.env.*\n*.pem\n*.key\n.DS_Store\n',{mode:0o600});
      c.development=dev;console.log('本地开发目录：'+dev);
    }
    await mkdir(dirname(plist),{recursive:true});
    const args=[c.node,join(dir,'connect.mjs'),'run',join(dir,'connection.json')];
    await writeFile(plist,`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${args.map(a=>'<string>'+xml(a)+'</string>').join('')}</array><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>15</integer><key>ProcessType</key><string>Background</string><key>EnvironmentVariables</key><dict><key>ELECTRON_RUN_AS_NODE</key><string>1</string></dict></dict></plist>`,{mode:0o600});
    await run('/bin/launchctl',['bootout',`gui/${process.getuid()}`,plist]).catch(()=>{});
    await run('/bin/launchctl',['bootstrap',`gui/${process.getuid()}`,plist]);
    c.installed=true;await save(join(dir,'connection.json'),c);
    await writeFile(join(dir,'停止同步.command'),`#!/bin/bash\n/bin/launchctl bootout gui/$(id -u) '${plist.replaceAll("'","'\\''")}'\nrm -f '${plist.replaceAll("'","'\\''")}'\necho '已停止本机自动同步；文件保留。如需撤销服务器访问，请在网页解除连接。'\n`,{mode:0o700});
    await save(ticketPath,{id:ticket.id,origin:ticket.origin}); // Retain the launch identity, never the consumed enrollment secret.
    console.log('已配置开机登录后自动连接。正在确认同步通道…');
    try{await waitSync(c);let connected=false;for(let i=0;i<30;i++){if((await syncApi(c,'system/connections')).connections?.[pair.serverId]?.connected){connected=true;break;}await sleep(1000);}console.log(connected?'连接成功，文件正在双向同步。':'后台助手已安装，服务器通道暂未接通，将自动重试。');}catch{console.log('后台助手已安装，请在网页刷新查看连接状态。');}
    console.log('本机文件夹：'+c.folder+'\n服务器文件夹：'+pair.folder+'\n停止同步：'+join(dir,'停止同步.command'));
    await openWebsite(ticket.origin);
  }finally{await stop(child);await rm(lock,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===self){
  try{if(process.argv[2]==='install')await install(resolve(process.argv[3]));else if(process.argv[2]==='run')await supervise(JSON.parse(await readFile(process.argv[3],'utf8')));else throw Error('Unknown command');}
  catch(e){console.error(e.message);process.exitCode=1;}
}
