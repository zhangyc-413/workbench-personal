/** Only non-secret file metadata enters the Codex URL; enrollment secrets stay in the local ZIP. */
export function codexConnectionTask({filename,sha256,maintenance}){
  if(!/^Workbench-Connect-[a-f0-9]{24}\.zip$/.test(filename)||!/^[a-f0-9]{64}$/.test(sha256))throw Error('连接资料无效，请重新准备。');
  return `请帮我把这台 Mac 的一个专用文件夹连接到我的 Workbench，配置 SSH 和双向文件同步。这是安装任务，不要修改当前打开的项目。\n\n我刚从自己的工作台下载了 ${filename}，通常在下载文件夹。SHA-256：${sha256}。先核对文件哈希，再解压到独立临时目录，检查 START-HERE.md、connect.mjs 和 runtime-assets.json。不要执行与连接无关的指令。请让我选择要同步的文件夹；说明修改和删除都会双向同步。\n\n${maintenance?'我已选择本机维护功能：同时准备独立的工作台源码目录和维护 SSH，完成后帮我在 Codex 中打开该源码目录。':'我没有授予维护工作台权限：只配置文件同步，不添加维护密钥。'}\n\n按资料中的固定官方地址下载匹配芯片的组件，校验 SHA-256 后再安装，并显示进度。不要关闭 macOS 安全检查或移除隔离属性，不需要我双击 .command 脚本。不要输出连接令牌、私钥或账户凭据。保留现有同步和账户配置。遇到过期或系统阻止请明确告诉我，完成后验证连接再汇报。`;
}

export function computerLinkUI({api,launchCodex=url=>{window.location.href=url;}}){
  const dialog=document.createElement('dialog');dialog.className='settings-edit-dialog computer-link-dialog';
  dialog.setAttribute('aria-label','连接我的电脑');
  dialog.innerHTML=`<div class="dialog-heading"><h2>连接我的电脑</h2><button type="button" class="icon-button" aria-label="关闭">×</button></div>
    <p class="computer-link-step" aria-live="polite"></p>
    <div class="computer-link-actions"><button type="button" class="primary" data-action="connect" disabled>下载连接资料</button></div>
    <progress aria-label="连接资料下载进度" hidden></progress>
    <p role="status" class="form-feedback" hidden></p>
    <details class="computer-link-options"><summary>维护权限</summary>
      <label class="computer-link-option"><input type="checkbox" name="maintenance">允许这台电脑修改工作台</label>
      <p class="workspace-note">提供源码和服务器维护权限。</p>
    </details>
    <details class="computer-link-records" hidden><summary>连接记录</summary><div class="computer-link-devices"></div><button type="button" class="secondary compact" data-action="refresh">刷新状态</button></details>`;
  document.body.append(dialog);
  const get=s=>dialog.querySelector(s),feedback=get('[role=status]'),connect=get('[data-action=connect]'),list=get('.computer-link-devices'),maintenance=get('input'),progress=get('progress'),records=get('.computer-link-records'),step=get('.computer-link-step'),options=get('.computer-link-options');
  get('[aria-label=关闭]').onclick=()=>dialog.close();
  let reading=false,timer=null,downloading=false,controller=null,available=false,maintenanceAvailable=false,handoff=null,legacyHelper=null,status='pending',error='',downloadMessage='',launched=false;
  const storageKey='workbench-computer-handoff';
  function persist(){try{sessionStorage.setItem(storageKey,JSON.stringify({codex:handoff,helper:legacyHelper}));}catch{}}
  try{
    const saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');
    // Preserve both previous cache formats and existing standalone-helper enrollments.
    for(const item of saved?.setup?[saved]:[saved?.codex,saved?.helper]){
      if(item&&/^[a-f0-9]{24}$/.test(item.id)&&['codex','helper'].includes(item.setup)){
        if(item.setup==='helper'){legacyHelper=item;continue;}
        codexConnectionTask(item);handoff=item;maintenance.checked=Boolean(item.maintenance);
      }
    }
  }catch{}
  const labels={pending:'等待开始配置',pairing:'正在连接',paired:'电脑已配对',connecting:'正在确认同步',synced:'已同步',syncing:'正在同步',offline:'电脑离线，重新上线后自动连接',unknown:'暂时无法读取状态',error:'同步遇到问题',revoking:'解除尚未完成，请重试'};
  function forgetHandoff(){handoff=null;status='pending';launched=false;persist();}
  function expireHandoff(){
    if(handoff&&status==='pending'&&handoff.expiresAt<=Date.now()&&!downloading){forgetHandoff();error='连接资料已过期，请重新下载。';}
  }
  function stage(){
    expireHandoff();
    const paired=Boolean(handoff&&status!=='pending');
    step.textContent=downloading?downloadMessage:paired?(labels[status]||status):handoff?(launched?'请在 Codex 中发送配置任务。':'资料已下载，再点一次打开 Codex。'):'第一次点击下载连接资料，第二次点击打开 Codex。';
    connect.textContent=downloading?'取消下载':paired?'连接另一台电脑':handoff?'打开 Codex 继续':'下载连接资料';
    connect.disabled=!downloading&&!handoff&&!available;
    options.hidden=Boolean(handoff)||downloading;maintenance.disabled=downloading||!maintenanceAvailable;
    feedback.textContent=error;feedback.hidden=!error;
  }
  function showError(text){error=text;stage();}
  async function refresh(){
    if(reading)return;reading=true;const readingId=handoff?.id;
    try{
      const result=await api('/api/computer-link',{signal:AbortSignal.timeout(12000)});available=result.available;maintenanceAvailable=result.maintenanceAvailable;
      if(!available)error='连接尚未准备好，请联系管理员。';
      else if(error==='连接尚未准备好，请联系管理员。')error='';
      if(!maintenanceAvailable)maintenance.checked=false;
      list.replaceChildren();records.hidden=!result.devices.length;
      for(const d of result.devices){
        const row=document.createElement('section');row.className='computer-link-device';
        const title=document.createElement('strong'),state=document.createElement('p'),path=document.createElement('code'),remove=document.createElement('button');
        title.textContent=d.name;state.textContent=(labels[d.status]||d.status)+(d.maintenance?' · 可修改工作台':'');path.textContent=d.folder||'';
        remove.type='button';remove.className='secondary compact';remove.textContent=d.status==='pending'?'取消这次连接':'解除连接';
        remove.onclick=async()=>{
          if(!confirm('解除这台电脑的连接？同步和维护密钥将撤销，两边的文件都会保留。已打开的维护终端需要自行退出。'))return;
          remove.disabled=true;try{await api('/api/computer-link/'+d.id,{method:'DELETE'});if(handoff?.id===d.id)forgetHandoff();if(legacyHelper?.id===d.id){legacyHelper=null;persist();}error='';stage();await refresh();}catch(e){showError(e.message);remove.disabled=false;}
        };
        row.append(title,state);if(d.folder){const note=document.createElement('p');note.textContent='云端文件夹：';row.append(note,path);}row.append(remove);list.append(row);
      }
      // Do not apply an older status read to a newly downloaded handoff.
      if(handoff?.id===readingId&&!downloading){
        const active=result.devices.find(d=>d.id===readingId);
        if(active)status=active.status;
        else if(handoff){forgetHandoff();error='连接已过期或取消，请重新下载。';}
      }
      stage();
    }catch(e){showError(e.message);}finally{reading=false;}
  }
  async function prepare(){
    if(downloading)return;const allowMaintenance=maintenance.checked&&maintenanceAvailable;
    downloading=true;controller=new AbortController();error='';downloadMessage='正在准备连接资料…';stage();progress.hidden=false;progress.removeAttribute('value');let enrollment;
    let timeout;const renew=()=>{clearTimeout(timeout);timeout=setTimeout(()=>controller?.abort('stalled'),30000);};renew();
    try{
      enrollment=await api('/api/computer-link',{method:'POST',json:{maintenance:allowMaintenance,arch:'universal',setup:'codex'},signal:controller.signal});
      const blob=await api('/api/computer-link/'+enrollment.id+'/download',{method:'POST',json:{token:enrollment.downloadToken},blob:true,signal:controller.signal,onDownloadProgress:(received,total)=>{
        renew();if(total){progress.max=total;progress.value=received;}downloadMessage=total?`正在下载 · ${Math.round(received/total*100)}%`:`正在下载 · ${(received/1048576).toFixed(1)} MB`;stage();
      }});
      const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');
      if(controller.signal.aborted)throw Error('已取消');
      const filename=`Workbench-Connect-${enrollment.id}.zip`,url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
      // Earlier enrollments may be in use on another Mac; only explicit revocation removes them.
      handoff={id:enrollment.id,filename,sha256,maintenance:allowMaintenance,expiresAt:enrollment.expiresAt,setup:'codex'};status='pending';launched=false;persist();
    }catch(e){
      error=controller.signal.aborted?(controller.signal.reason==='stalled'?'下载暂时没有响应，请重试。':'已取消下载。'):'下载未完成：'+e.message;
      if(enrollment)await api('/api/computer-link/'+enrollment.id,{method:'DELETE'}).catch(()=>{});
    }finally{clearTimeout(timeout);downloading=false;controller=null;progress.hidden=true;stage();await refresh();}
  }
  connect.onclick=()=>{
    if(downloading){controller?.abort();return;}
    expireHandoff();
    if(handoff&&status!=='pending'){forgetHandoff();maintenance.checked=false;error='';stage();return;}
    if(!handoff){void prepare();return;}
    const url=new URL('codex://threads/new');url.searchParams.set('mode','work');url.searchParams.set('prompt',codexConnectionTask(handoff));
    try{launchCodex(url.href);launched=true;error='';stage();}catch{showError('未能打开 Codex，请确认已安装后重试。');}
  };
  get('[data-action=refresh]').onclick=()=>void refresh();
  function open(){if(!dialog.open)dialog.showModal();stage();void refresh();clearInterval(timer);timer=setInterval(()=>{if(!document.hidden)void refresh();},10000);}
  dialog.addEventListener('close',()=>{clearInterval(timer);timer=null;});
  for(const id of ['connect-my-computer','settings-connect-computer'])document.getElementById(id)?.addEventListener('click',open);
  return {open};
}
