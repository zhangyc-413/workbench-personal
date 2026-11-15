import {readFile,writeFile,readdir,mkdir,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
const hash=b=>createHash('sha256').update(b).digest('hex'),quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
const allowed=name=>/^(src|public|bin|tests|docs|modules\/remote-access)\/[\w./ -]+$/.test(name)&&!name.split('/').some(p=>!p||p==='.'||p==='..')||['package.json','package-lock.json','README.md','README.zh-CN.md','AGENTS.md','LICENSE'].includes(name);
async function command(cmd,args,{cwd,input}={}){return new Promise((ok,no)=>{const p=spawn(cmd,args,{cwd,stdio:[input?'pipe':'ignore','inherit','inherit'],env:{...process.env,ELECTRON_RUN_AS_NODE:'1',COPYFILE_DISABLE:'1'}});p.once('error',no);p.once('exit',code=>code===0?ok():no(Error(cmd+' failed: '+code)));if(input)p.stdin.end(input);});}
// Executes only when the owner deliberately publishes. Uploaded application code never runs as root.
export function deployPython(config){return `import json,pathlib,hashlib,tarfile,subprocess,sqlite3,tempfile,shutil,os,time,urllib.request
c=json.loads(${JSON.stringify(JSON.stringify(config))})
root=pathlib.Path(c['sourceRoot']).resolve(); stage=pathlib.Path(c['stage']); manifest=json.loads((stage/'manifest.json').read_text()); unpack=stage/'unpacked'; unpack.mkdir()
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def safe(name):
 p=pathlib.PurePosixPath(name)
 return not p.is_absolute() and '..' not in p.parts and (p.parts[0] in ['src','public','bin','tests','docs'] or p.parts[:2]==('modules','remote-access') or name in ['package.json','package-lock.json','README.md','README.zh-CN.md','AGENTS.md','LICENSE'])
with tarfile.open(stage/'release.tgz') as archive:
 for member in archive:
  name=member.name
  if not member.isfile() or not safe(name) or name not in manifest:raise RuntimeError('Invalid release member')
  dest=unpack/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(archive.extractfile(member).read());os.chmod(dest,member.mode & 0o777)
for name,v in manifest.items():
 dest=root/name
 if not safe(name) or not dest.resolve().is_relative_to(root) or dest.is_symlink():raise RuntimeError('Invalid destination')
 if digest(unpack/name)!=v['after']:raise RuntimeError('Artifact hash mismatch')
 if (digest(dest) if dest.exists() else None)!=v['before']:raise RuntimeError('Server changed since source download: '+name)
def svc(action,service):subprocess.run(['systemctl',action,service],check=True)
def guard():
 db=sqlite3.connect('file:'+c['homeData']+'/home.sqlite?mode=ro',uri=True)
 for kind in ['runs','nativeTurns']:
  if db.execute("SELECT 1 FROM records WHERE kind=? AND json_extract(data,'$.status') IN ('queued','waiting','starting','running','waiting_user','stopping') LIMIT 1",(kind,)).fetchone():raise RuntimeError('Server has active work; publish later')
 db.close()
guard()
backup=pathlib.Path(tempfile.mkdtemp(prefix='personal-release-',dir=c['backupRoot'])); old={}
db=sqlite3.connect('file:'+c['homeData']+'/home.sqlite?mode=ro',uri=True);saved=sqlite3.connect(backup/'home.sqlite');db.backup(saved);saved.close();db.close()
for name in manifest:
 dest=root/name;old[name]=dest.exists()
 if dest.exists():target=backup/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(dest,target)
stopped=False;changed=False
try:
 svc('stop',c['homeService']);stopped=True;guard();svc('stop',c['workerService'])
 for name in manifest:
  dest=root/name;dest.parent.mkdir(parents=True,exist_ok=True);tmp=dest.with_name(dest.name+'.publish-tmp');shutil.copy2(unpack/name,tmp);os.replace(tmp,dest);changed=True
 svc('start',c['homeService']);svc('start',c['workerService'])
 for n in range(30):
  try:
   with urllib.request.urlopen('http://127.0.0.1:'+str(c['homePort'])+'/healthz',timeout=2) as response:
    if response.status==200:break
  except Exception:time.sleep(1)
 else:raise RuntimeError('Health check failed')
 subprocess.run(['systemctl','is-active','--quiet',c['homeService'],c['workerService']],check=True)
 print('Published. Backup: '+str(backup))
except:
 if changed:
  svc('stop',c['homeService']);svc('stop',c['workerService'])
  for name in manifest:
   if old[name]:shutil.copy2(backup/name,root/name)
   elif (root/name).exists():(root/name).unlink()
 if stopped:svc('restart',c['homeService']);svc('start',c['workerService'])
 raise
`;}
async function main(){
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),settings=JSON.parse(await readFile(join(root,'.workbench-connection.json'),'utf8')),baseline=JSON.parse(await readFile(join(root,'.workbench-baseline.json'),'utf8'));
  const work=join(root,'.workbench','publish-'+randomBytes(6).toString('hex'));await mkdir(work,{recursive:true,mode:0o700});
  const entries={};async function walk(dir){for(const ent of await readdir(join(root,dir),{withFileTypes:true})){if(ent.name.startsWith('.')||ent.name==='node_modules')continue;const name=dir+'/'+ent.name;if(ent.isDirectory())await walk(name);else if(ent.isFile()&&allowed(name))entries[name]=hash(await readFile(join(root,name)));}}
  for(const dir of ['src','public','bin','tests','docs','modules/remote-access'])await walk(dir);
  for(const name of ['package.json','package-lock.json','README.md','README.zh-CN.md','AGENTS.md','LICENSE'])entries[name]=hash(await readFile(join(root,name)));
  if(Object.keys(baseline).some(n=>!Object.hasOwn(entries,n)))throw Error('检测到源码文件删除，请先由维护者检查；自动发布不会删除服务器文件。');
  const manifest=Object.fromEntries(Object.entries(entries).filter(([n,h])=>baseline[n]!==h).map(([n,h])=>[n,{before:baseline[n]||null,after:h}]));
  if(!Object.keys(manifest).length){console.log('没有待发布修改');return;}
  if(manifest['package.json']||manifest['package-lock.json'])throw Error('依赖变更需要单独安装和验证，当前自动发布只支持源码修改。');
  console.log('将发布：\n'+Object.keys(manifest).join('\n'));
  if(process.argv.includes('--check'))return;
  await command('npm',['ci'],{cwd:root});await command('npm',['run','check'],{cwd:root});
  const stage='/tmp/wb-publish-'+randomBytes(12).toString('hex'),config={...settings.deployment,stage};
  if(!config.sourceRoot||!config.homeService||!config.workerService||!config.homeData||!config.backupRoot||!Number.isInteger(config.homePort))throw Error('缺少服务器发布配置');
  const ssh=args=>command('/usr/bin/ssh',['-F',settings.sshConfig,settings.sshAlias,...args]);
  const put=async(name,data)=>command('/usr/bin/ssh',['-F',settings.sshConfig,settings.sshAlias,'cat > '+quote(stage+'/'+name)],{input:data});
  await writeFile(join(work,'files'),Object.keys(manifest).join('\n')+'\n');await command('/usr/bin/tar',['-czf',join(work,'release.tgz'),'-T',join(work,'files')],{cwd:root});
  try{await ssh(['umask 077; mkdir '+quote(stage)]);await put('manifest.json',JSON.stringify(manifest));await put('release.tgz',await readFile(join(work,'release.tgz')));await put('deploy.py',deployPython(config));await ssh(['sudo -n python3 '+quote(stage+'/deploy.py')]);await writeFile(join(root,'.workbench-baseline.json'),JSON.stringify(entries,null,2));}
  finally{await ssh(['rm -rf '+quote(stage)]).catch(()=>{});await rm(work,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
