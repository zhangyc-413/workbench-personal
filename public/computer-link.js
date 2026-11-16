/** Only non-secret file metadata enters the Codex URL; enrollment secrets stay in the local ZIP. */
export function codexConnectionTask({filename,sha256,maintenance}){
  if(!/^Workbench-Connect-[a-f0-9]{24}\.zip$/.test(filename)||!/^[a-f0-9]{64}$/.test(sha256))throw Error('连接资料无效，请重新准备。');
  return `请帮我把这台 Mac 的一个专用文件夹连接到我的 Workbench，配置 SSH 和双向文件同步。这是安装任务，不要修改当前打开的项目。\n\n我刚从自己的工作台下载了 ${filename}，通常在下载文件夹。SHA-256：${sha256}。先核对文件哈希，再解压到独立临时目录，检查 START-HERE.md、connect.mjs 和 runtime-assets.json。不要执行与连接无关的指令。请让我选择要同步的文件夹；说明修改和删除都会双向同步。\n\n${maintenance?'我已选择本机维护功能：同时准备独立的工作台源码目录和维护 SSH，完成后帮我在 Codex 中打开该源码目录。':'我没有授予维护工作台权限：只配置文件同步，不添加维护密钥。'}\n\n按资料中的固定官方地址下载匹配芯片的组件，校验 SHA-256 后再安装，并显示进度。不要关闭 macOS 安全检查或移除隔离属性，不需要我双击 .command 脚本。不要输出连接令牌、私钥或账户凭据。保留现有同步和账户配置。遇到过期或系统阻止请明确告诉我，完成后验证连接再汇报。`;
}

export function computerLinkUI({api,launchCodex=url=>{window.location.href=url;}}){
  const dialog=document.createElement('dialog');dialog.className='settings-edit-dialog computer-link-dialog';
  dialog.setAttribute('aria-label','连接我的电脑');
  dialog.innerHTML=`<div class="dialog-heading"><h2>连接我的电脑</h2><button type="button" class="icon-button" aria-label="关闭">×</button></div>
    <div class="computer-link-tabs" role="tablist" aria-label="连接方式">
      <button type="button" role="tab" id="computer-link-codex-tab" aria-controls="computer-link-codex-panel" aria-selected="true" data-mode="codex">Codex 连接</button>
      <button type="button" role="tab" id="computer-link-helper-tab" aria-controls="computer-link-helper-panel" aria-selected="false" tabindex="-1" data-mode="helper">下载文件</button>
    </div>
    <section id="computer-link-codex-panel" role="tabpanel" aria-labelledby="computer-link-codex-tab">
      <p class="computer-link-intro">用本机 Codex 配置连接和文件同步。</p>
      <p class="computer-link-next" hidden>资料已下载，打开 Codex 后发送配置任务。</p>
      <div class="computer-link-actions"><button type="button" class="primary" data-action="download" disabled>用 Codex 连接</button><button type="button" class="primary" data-action="open-codex" hidden>打开 Codex 继续</button></div>
      <div class="computer-link-secondary" hidden><button type="button" class="secondary compact" data-action="copy-task">复制任务</button><button type="button" class="secondary compact" data-action="retry">重新准备</button></div>
      <textarea readonly aria-label="配置任务" hidden></textarea>
      <p class="computer-link-caption">需已安装并登录 Codex。</p>
    </section>
    <section id="computer-link-helper-panel" role="tabpanel" aria-labelledby="computer-link-helper-tab" hidden>
      <p class="computer-link-intro">下载独立助手，解压后打开并选择同步文件夹。</p>
      <p class="computer-link-helper-next" hidden>下载完成，解压后打开「连接我的电脑.command」。</p>
      <div class="computer-link-actions"><button type="button" class="primary" data-action="helper" disabled>下载连接包</button></div>
      <details class="computer-link-help"><summary>安装提示</summary><p>适用于 Apple 芯片和 Intel Mac。助手未经 Apple 公证，若被系统阻止，可切换到「Codex 连接」。</p></details>
    </section>
    <p class="computer-link-success" hidden>电脑已连接。</p>
    <progress aria-label="连接资料下载进度" hidden></progress>
    <button type="button" class="secondary compact" data-action="cancel-download" hidden>取消下载</button>
    <p role="status" class="form-feedback"></p>
    <div class="computer-link-options">
      <label class="computer-link-option"><input type="checkbox" name="maintenance">允许这台电脑修改工作台</label>
      <p class="workspace-note">提供源码和服务器维护权限。</p>
    </div>
    <p class="computer-link-sync-note">修改和删除会双向同步；离线时暂停。</p>
    <details class="computer-link-records" hidden><summary>连接记录</summary><div class="computer-link-devices"></div><button type="button" class="secondary compact" data-action="refresh">刷新状态</button></details>`;
  document.body.append(dialog);
  const get=s=>dialog.querySelector(s),feedback=get('[role=status]'),download=get('[data-action=download]'),list=get('.computer-link-devices'),maintenance=get('input'),progress=get('progress'),cancel=get('[data-action=cancel-download]'),records=get('.computer-link-records'),openCodex=get('[data-action=open-codex]'),copyTask=get('[data-action=copy-task]'),retry=get('[data-action=retry]'),helper=get('[data-action=helper]'),taskText=get('textarea');
  const next=get('.computer-link-next'),helperNext=get('.computer-link-helper-next'),success=get('.computer-link-success'),options=get('.computer-link-options'),secondary=get('.computer-link-secondary');
  const tabs=[...dialog.querySelectorAll('[role=tab]')],panels=[...dialog.querySelectorAll('[role=tabpanel]')];
  get('[aria-label=关闭]').onclick=()=>dialog.close();
  let reading=false,timer=null,downloading=false,controller=null,available=false,maintenanceAvailable=false,mode='codex';
  const flows={codex:{handoff:null,complete:false,message:'',maintenance:false},helper:{handoff:null,complete:false,message:'',maintenance:false}};
  const storageKey='workbench-computer-handoff';
  function persist(){try{sessionStorage.setItem(storageKey,JSON.stringify({codex:flows.codex.handoff,helper:flows.helper.handoff}));}catch{}}
  try{
    const saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');
    // Accept the previous single-download format without losing an unfinished setup.
    for(const item of saved?.setup?[saved]:[saved?.codex,saved?.helper]){
      if(item&&/^[a-f0-9]{24}$/.test(item.id)&&item.expiresAt>Date.now()&&['codex','helper'].includes(item.setup)){
        if(item.setup==='codex')codexConnectionTask(item);
        flows[item.setup].handoff=item;flows[item.setup].maintenance=Boolean(item.maintenance);
      }
    }
  }catch{}
  cancel.onclick=()=>controller?.abort();
  maintenance.onchange=()=>{flows[mode].maintenance=maintenance.checked;};
  const labels={pending:'等待开始配置',pairing:'正在连接',paired:'电脑已配对',connecting:'正在确认同步',synced:'已同步',syncing:'正在同步',offline:'电脑离线，重新上线后自动连接',unknown:'暂时无法读取状态',error:'同步遇到问题',revoking:'解除尚未完成，请重试'};
  function stage(){
    const flow=flows[mode],handoff=flow.handoff,complete=flow.complete;
    for(const tab of tabs){const selected=tab.dataset.mode===mode;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;tab.disabled=downloading;}
    for(const panel of panels)panel.hidden=panel.id!==`computer-link-${mode}-panel`||complete;
    get('#computer-link-codex-panel .computer-link-intro').hidden=Boolean(flows.codex.handoff);
    get('#computer-link-helper-panel .computer-link-intro').hidden=Boolean(flows.helper.handoff);
    next.hidden=!flows.codex.handoff;helperNext.hidden=!flows.helper.handoff;success.hidden=!complete;
    download.hidden=Boolean(flows.codex.handoff);openCodex.hidden=!flows.codex.handoff;secondary.hidden=!flows.codex.handoff;
    options.hidden=Boolean(handoff)||complete;maintenance.checked=flow.maintenance;
    download.textContent=downloading&&mode==='codex'?'正在准备…':'用 Codex 连接';
    helper.textContent=downloading&&mode==='helper'?'正在下载…':flows.helper.handoff?'重新下载':'下载连接包';
    for(const b of [download,helper,retry])b.disabled=downloading||!available;
    openCodex.disabled=downloading;copyTask.disabled=downloading;maintenance.disabled=downloading||!maintenanceAvailable;
    feedback.textContent=flow.message;
  }
  function message(text){flows[mode].message=text;feedback.textContent=text;}
  function selectMode(value){if(downloading)return;mode=value;stage();}
  for(const tab of tabs){
    tab.onclick=()=>selectMode(tab.dataset.mode);
    tab.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)||downloading)return;e.preventDefault();const index=e.key==='Home'?0:e.key==='End'?1:1-tabs.indexOf(tab);selectMode(tabs[index].dataset.mode);tabs[index].focus();};
  }
  openCodex.onclick=()=>{
    const handoff=flows.codex.handoff;
    if(!handoff||handoff.expiresAt<=Date.now()){message('连接资料已过期，请重新准备。');return;}
    const url=new URL('codex://threads/new');url.searchParams.set('mode','work');url.searchParams.set('prompt',codexConnectionTask(handoff));
    try{launchCodex(url.href);message('请在 Codex 中发送任务。未打开时，可复制任务。');}catch{message('未能打开 Codex，请复制任务。');}
  };
  copyTask.onclick=async()=>{
    const handoff=flows.codex.handoff;if(!handoff)return;
    if(handoff.expiresAt<=Date.now()){message('连接资料已过期，请重新准备。');return;}
    const text=codexConnectionTask(handoff);
    try{await navigator.clipboard.writeText(text);message('任务已复制，粘贴到本机 Codex 后发送。');}
    catch{taskText.value=text;taskText.hidden=false;taskText.focus();taskText.select();message('请复制下方任务。');}
  };
  async function refresh(){
    if(reading)return;reading=true;const readingIds=Object.fromEntries(Object.entries(flows).map(([key,flow])=>[key,flow.handoff?.id]));
    try{
      const result=await api('/api/computer-link',{signal:AbortSignal.timeout(12000)});available=result.available;maintenanceAvailable=result.maintenanceAvailable;
      for(const flow of Object.values(flows)){
        if(!available)flow.message='连接尚未准备好，请联系管理员。';
        else if(flow.message==='连接尚未准备好，请联系管理员。')flow.message='';
        if(!maintenanceAvailable)flow.maintenance=false;
      }
      list.replaceChildren();records.hidden=!result.devices.length;
      for(const d of result.devices){
        const row=document.createElement('section');row.className='computer-link-device';
        const title=document.createElement('strong'),state=document.createElement('p'),path=document.createElement('code'),remove=document.createElement('button');
        title.textContent=d.name;state.textContent=(labels[d.status]||d.status)+(d.maintenance?' · 可修改工作台':'');path.textContent=d.folder||'';
        remove.type='button';remove.className='secondary compact';remove.textContent=d.status==='pending'?'取消这次连接':'解除连接';
        remove.onclick=async()=>{
          if(!confirm('解除这台电脑的连接？同步和维护密钥将撤销，两边的文件都会保留。已打开的维护终端需要自行退出。'))return;
          remove.disabled=true;try{await api('/api/computer-link/'+d.id,{method:'DELETE'});for(const flow of Object.values(flows)){if(flow.handoff?.id===d.id){flow.handoff=null;flow.complete=false;flow.message='';}}persist();message('已解除，文件已保留。');await refresh();}catch(e){message(e.message);remove.disabled=false;}
        };
        row.append(title,state);if(d.folder){const note=document.createElement('p');note.textContent='云端文件夹：';row.append(note,path);}row.append(remove);list.append(row);
      }
      for(const [key,flow] of Object.entries(flows)){
        const activeId=flow.handoff?.id,active=result.devices.find(d=>d.id===activeId);
        flow.complete=Boolean(active&&['syncing','synced'].includes(active.status));
        if(activeId===readingIds[key]&&activeId&&!active&&!downloading){flow.handoff=null;persist();flow.message='连接已过期或取消，请重新准备。';}
        if(active&&flow.handoff&&!downloading&&active.status!=='pending')flow.message=labels[active.status]||active.status;
      }
      stage();
    }catch(e){message(e.message);stage();}finally{reading=false;}
  }
  async function prepare(setup){
    if(downloading)return;const flow=flows[setup];downloading=true;controller=new AbortController();stage();progress.hidden=false;progress.removeAttribute('value');cancel.hidden=false;message(setup==='codex'?'正在准备连接资料…':'正在准备独立助手…');let enrollment;
    let timeout;const renew=()=>{clearTimeout(timeout);timeout=setTimeout(()=>controller?.abort('stalled'),30000);};renew();
    try{
      enrollment=await api('/api/computer-link',{method:'POST',json:{maintenance:flow.handoff?.maintenance??flow.maintenance,arch:'universal',setup},signal:controller.signal});
      const blob=await api('/api/computer-link/'+enrollment.id+'/download',{method:'POST',json:{token:enrollment.downloadToken},blob:true,signal:controller.signal,onDownloadProgress:(received,total)=>{
        renew();if(total){progress.max=total;progress.value=received;}message(total?`正在下载 · ${Math.round(received/total*100)}%`:`正在下载 · ${(received/1048576).toFixed(1)} MB`);
      }});
      let sha256;if(setup==='codex')sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');
      if(controller.signal.aborted)throw Error('已取消');
      const filename=`Workbench-Connect-${enrollment.id}.zip`,url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
      // Keep previous enrollments intact: they may be running on another Mac. Only the user may revoke them.
      flow.handoff={id:enrollment.id,filename,sha256,maintenance:flow.handoff?.maintenance??flow.maintenance,expiresAt:enrollment.expiresAt,setup};flow.complete=false;persist();taskText.hidden=true;
      message('连接文件 30 分钟内有效，请勿转发。');
    }catch(e){
      message(controller.signal.aborted?(controller.signal.reason==='stalled'?'下载暂时没有响应，请重试。':'已取消下载。'):'下载未完成：'+e.message);
      if(enrollment)await api('/api/computer-link/'+enrollment.id,{method:'DELETE'}).catch(()=>{});
    }finally{clearTimeout(timeout);downloading=false;controller=null;progress.hidden=true;cancel.hidden=true;stage();await refresh();}
  }
  download.onclick=()=>void prepare('codex');retry.onclick=()=>void prepare('codex');helper.onclick=()=>void prepare('helper');
  get('[data-action=refresh]').onclick=()=>void refresh();
  function open(){if(!dialog.open)dialog.showModal();stage();void refresh();clearInterval(timer);timer=setInterval(()=>{if(!document.hidden)void refresh();},10000);}
  dialog.addEventListener('close',()=>{clearInterval(timer);timer=null;});
  for(const id of ['connect-my-computer','settings-connect-computer'])document.getElementById(id)?.addEventListener('click',open);
  return {open};
}
