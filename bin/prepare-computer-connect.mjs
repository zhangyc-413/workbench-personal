import {mkdir,rename,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {runtimeFiles} from '../src/computer-link-bundle.mjs';

// Operator setup, separate from Home: fixed official releases, verified before publishing the cache.
const target=process.argv[2];
if(!target)throw Error('Usage: node bin/prepare-computer-connect.mjs /absolute/private/runtime-cache');
const directory=resolve(target);await mkdir(directory,{recursive:true,mode:0o700});
async function valid(path,digest){try{const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex')===digest;}catch{return false;}}
for(const arch of ['arm64','x64'])for(const asset of runtimeFiles(arch)){
  const path=join(directory,asset.name);if(await valid(path,asset.sha256)){console.log('Verified '+asset.name);continue;}
  const temporary=path+'.'+process.pid+'.download';
  try{
    console.log('Preparing '+asset.name);
    await new Promise((ok,fail)=>{const child=spawn('curl',['-fL','--proto','=https','--tlsv1.2','--retry','2','--connect-timeout','15','--max-time','240','--speed-limit','1024','--speed-time','30',asset.url,'-o',temporary],{stdio:'inherit'});child.once('error',fail);child.once('exit',code=>code===0?ok():fail(Error('Download failed: '+asset.name)));});
    if(!await valid(temporary,asset.sha256))throw Error('Checksum mismatch: '+asset.name);
    await rename(temporary,path);console.log('Verified '+asset.name);
  }finally{await rm(temporary,{force:true});}
}
