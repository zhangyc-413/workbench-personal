import {readFile,readdir,lstat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
import {createReadStream} from 'node:fs';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

// Fixed upstream release hashes. Downloads are verified before extracting or running either runtime.
export const assets={
  arm64:{node:'679ad4966339e4ef4900f57996714864e4211b898825bb840c3086c419fbcef2',sync:'dd42cc7a88d08779c305e5f6f2d8bc8dec2c97652c1380679c672d4febd63f8f'},
  x64:{node:'07b13722d558790fca20bb1ecf61bde24b7a4863111f7be77fc57251a407359a',sync:'eb375302c79b89b85f32f014e451430efe3a9723b37639698310344a9029799e'}
};
const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crcUpdate=(c,b)=>{for(const v of b)c=crcTable[(c^v)&255]^(c>>>8);return c;};
const crc32=b=>(crcUpdate(0xffffffff,b)^0xffffffff)>>>0;
export const runtimeFiles=arch=>{
  if(!assets[arch])throw Error('Unsupported Mac architecture');
  return [
    {name:`node-v22.22.1-darwin-${arch}.tar.gz`,bundleName:'node.tgz',sha256:assets[arch].node,url:`https://nodejs.org/dist/v22.22.1/node-v22.22.1-darwin-${arch}.tar.gz`},
    {name:`syncthing-macos-${arch==='x64'?'amd64':arch}-v1.30.0.zip`,bundleName:'syncthing.zip',sha256:assets[arch].sync,url:`https://github.com/syncthing/syncthing/releases/download/v1.30.0/syncthing-macos-${arch==='x64'?'amd64':arch}-v1.30.0.zip`}
  ];
};
const verifiedAssets=new Map();
/** Pre-staged, fixed-name releases only. Hash once per unchanged file; never fetch during a Home request. */
export async function computerLinkAssets(directory,arch){
  if(!directory)throw Error('Complete connection packages have not been prepared');
  return Promise.all(runtimeFiles(arch).map(async asset=>{
    const path=join(directory,asset.name),s=await lstat(path);
    if(!s.isFile()||s.size>150*1024*1024)throw Error('Invalid runtime asset');
    const stamp=[s.size,s.mtimeMs,s.ctimeMs,s.ino].join(':'),key=path+':'+stamp;
    if(!verifiedAssets.has(key)){
      const check=(async()=>{const h=createHash('sha256');let crc=0xffffffff;for await(const chunk of createReadStream(path)){h.update(chunk);crc=crcUpdate(crc,chunk);}if(h.digest('hex')!==asset.sha256)throw Error('Runtime checksum mismatch');return {name:'Workbench Connect/components/'+asset.bundleName,path,size:s.size,crc:(crc^0xffffffff)>>>0};})();
      verifiedAssets.set(key,check);check.catch(()=>verifiedAssets.delete(key));
    }
    return verifiedAssets.get(key);
  }));
}
/** Small standard ZIP writer, including Unix executable permissions; no shell command or secret in a URL. */
export function zip(files){
  const local=[],central=[];let offset=0;
  for(const f of files){const name=Buffer.from(f.name),bytes=Buffer.from(f.data),packed=deflateRawSync(bytes),crc=crc32(bytes),head=Buffer.alloc(30),dir=Buffer.alloc(46);
    head.writeUInt32LE(0x04034b50);head.writeUInt16LE(20,4);head.writeUInt16LE(0x800,6);head.writeUInt16LE(8,8);head.writeUInt32LE(crc,14);head.writeUInt32LE(packed.length,18);head.writeUInt32LE(bytes.length,22);head.writeUInt16LE(name.length,26);
    dir.writeUInt32LE(0x02014b50);dir.writeUInt16LE(0x314,4);dir.writeUInt16LE(20,6);dir.writeUInt16LE(0x800,8);dir.writeUInt16LE(8,10);dir.writeUInt32LE(crc,16);dir.writeUInt32LE(packed.length,20);dir.writeUInt32LE(bytes.length,24);dir.writeUInt16LE(name.length,28);dir.writeUInt32LE(((0o100000|(f.executable?0o700:0o600))<<16)>>>0,38);dir.writeUInt32LE(offset,42);
    local.push(head,name,packed);central.push(dir,name);offset+=head.length+name.length+packed.length;
  }
  const end=Buffer.alloc(22),directory=Buffer.concat(central);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,directory,end]);
}
const bootstrap=arch=>`#!/bin/bash
set -euo pipefail
umask 077
trap 'echo "安装未完成。请保留此窗口的错误提示，回网页检查连接；可重新打开助手重试。"; read -r -p "按回车关闭…"' ERR
cd "$(dirname "$0")"
if [ "$(uname -s)" != Darwin ]; then echo "这个连接助手适用于 Mac。"; exit 1; fi
case "$(uname -m)" in
 arm64) arch=arm64; digest=${assets.arm64.node} ;;
 x86_64) arch=x64; digest=${assets.x64.node} ;;
 *) echo "暂不支持这台电脑的架构"; exit 1 ;;
esac
if [ "$arch" != "${arch}" ]; then echo "这个包不适用于当前芯片，请回网页选择正确的 Mac 类型后重新下载。"; read -r -p "按回车关闭…"; exit 1; fi
echo "[1/3] 正在校验并准备本机组件（无需联网下载）…"
runtime="$HOME/Library/Application Support/Workbench Connect/runtime-v22.22.1-$arch"
if [ ! -x "$runtime/bin/node" ]; then
 stage=$(mktemp -d)
 trap 'rm -rf "$stage"' EXIT
 actual=$(/usr/bin/shasum -a 256 ./components/node.tgz | /usr/bin/awk '{print $1}')
 [ "$actual" = "$digest" ] || { echo "连接包校验失败，请重新下载完整包"; read -r -p "按回车关闭…"; exit 1; }
 /usr/bin/tar -xzf ./components/node.tgz -C "$stage"
 mkdir -p "$(dirname "$runtime")"
 [ -d "$runtime" ] || mv "$stage/node-v22.22.1-darwin-$arch" "$runtime"
fi
env -u ELECTRON_RUN_AS_NODE "$runtime/bin/node" ./connect.mjs install ./ticket.json
read -r -p "按回车关闭…"
`;

export async function computerLinkFiles(ticket){
  const root=fileURLToPath(new URL('../',import.meta.url)),prefix='Workbench Connect/';
  const files=[{name:prefix+'连接我的电脑.command',data:bootstrap(ticket.arch||'arm64'),executable:true},{name:prefix+'connect.mjs',data:await readFile(new URL('../bin/computer-connect.mjs',import.meta.url))},{name:prefix+'ticket.json',data:JSON.stringify({...ticket,assets})},
    {name:prefix+'使用说明.txt',data:'这是完整连接包，包含所需组件，打开后不再下载 Node 或 Syncthing。解压后双击「连接我的电脑.command」，按提示选择专用同步文件夹。首次打开如遇系统确认，请在 Finder 中右键选择「打开」。连接包 30 分钟有效，仅用于本机，请勿转发。\n同步为双向：修改和删除会传到另一端；关机期间暂停，开机并登录后继续。冲突保留副本，远端修改保留 20 版。常见密钥/账号目录不参与同步，但请自行检查共享文件内容。\n启用本机维护时会另外生成工作台源码目录及维护 SSH 密钥，源码不与项目文件混在一起，不自动发布改动。\n'}];
  if(ticket.maintenance){
    // Only reviewed source areas; never walk state, auth, .git, home directories or arbitrary configured paths.
    const walk=async rel=>{for(const item of await readdir(join(root,rel),{withFileTypes:true})){if(item.name.startsWith('.')||item.name==='node_modules')continue;const path=rel+'/'+item.name;if(item.isDirectory())await walk(path);else if(item.isFile()&&/\.(mjs|js|html|css|json|png|svg|webmanifest|md|sh|template)$/.test(item.name))files.push({name:prefix+'source/'+path,data:await readFile(join(root,path)),executable:(await lstat(join(root,path))).mode&0o111});}};
    for(const dir of ['src','public','bin','tests','modules/remote-access','docs'])await walk(dir);
    for(const name of ['package.json','package-lock.json','README.md','README.zh-CN.md','LICENSE','AGENTS.md'])files.push({name:prefix+'source/'+name,data:await readFile(join(root,name))});
  }
  if(ticket.maintenance){const baseline=Object.fromEntries(files.filter(f=>f.name.startsWith(prefix+'source/')).map(f=>[f.name.slice((prefix+'source/').length),createHash('sha256').update(f.data).digest('hex')]));files.push({name:prefix+'source/.workbench-baseline.json',data:JSON.stringify(baseline)});}
  return files;
}
export async function computerLinkBundle(ticket){return zip(await computerLinkFiles(ticket));}

/** Store already-compressed runtimes without buffering them or blocking Home on compression. */
export async function streamComputerLinkBundle(ticket,runtimes,res){
  const files=[...(await computerLinkFiles(ticket)).map(f=>{const data=Buffer.from(f.data);return {...f,data,size:data.length,crc:crc32(data)};}),...runtimes];
  const central=[];let offset=0;
  for(const f of files){
    const name=Buffer.from(f.name),head=Buffer.alloc(30),dir=Buffer.alloc(46);
    head.writeUInt32LE(0x04034b50);head.writeUInt16LE(20,4);head.writeUInt16LE(0x800,6);head.writeUInt32LE(f.crc,14);head.writeUInt32LE(f.size,18);head.writeUInt32LE(f.size,22);head.writeUInt16LE(name.length,26);
    dir.writeUInt32LE(0x02014b50);dir.writeUInt16LE(0x314,4);dir.writeUInt16LE(20,6);dir.writeUInt16LE(0x800,8);dir.writeUInt32LE(f.crc,16);dir.writeUInt32LE(f.size,20);dir.writeUInt32LE(f.size,24);dir.writeUInt16LE(name.length,28);dir.writeUInt32LE(((0o100000|(f.executable?0o700:0o600))<<16)>>>0,38);dir.writeUInt32LE(offset,42);
    f.header=Buffer.concat([head,name]);central.push(dir,name);offset+=f.header.length+f.size;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="Workbench-Connect-${ticket.arch}.zip"`,'Content-Length':offset+directory.length+end.length,'Cache-Control':'no-store'});
  await pipeline(Readable.from((async function*(){for(const f of files){yield f.header;if(f.path)yield* createReadStream(f.path);else yield f.data;}yield directory;yield end;})()),res);
}
