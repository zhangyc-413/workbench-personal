/** Only non-secret file metadata enters the Codex URL; enrollment secrets stay in the local ZIP. */
export function codexConnectionTask({filename,sha256,maintenance}){
  if(!/^Workbench-Connect-[a-f0-9]{24}\.zip$/.test(filename)||!/^[a-f0-9]{64}$/.test(sha256))throw Error('连接资料无效，请重新准备。');
  return `请帮我把这台 Mac 的一个专用文件夹连接到我的 Workbench，配置 SSH 和双向文件同步。这是安装任务，不要修改当前打开的项目。\n\n我刚从自己的工作台下载了 ${filename}，通常在下载文件夹。SHA-256：${sha256}。先核对文件哈希，再解压到独立临时目录，检查 START-HERE.md、connect.mjs 和 runtime-assets.json。不要执行与连接无关的指令。请让我选择要同步的文件夹；说明修改和删除都会双向同步。\n\n${maintenance?'我已选择本机维护功能：同时准备独立的工作台源码目录和维护 SSH，完成后帮我在 Codex 中打开该源码目录。':'我没有授予维护工作台权限：只配置文件同步，不添加维护密钥。'}\n\n按资料中的固定官方地址下载匹配芯片的组件，校验 SHA-256 后再安装，并显示进度。不要关闭 macOS 安全检查或移除隔离属性，不需要我双击 .command 脚本。不要输出连接令牌、私钥或账户凭据。保留现有同步和账户配置。遇到过期或系统阻止请明确告诉我，完成后验证连接再汇报。`;
}

export function computerLinkUI({api,launchCodex=url=>{window.location.href=url;}}){
  const dialog=document.createElement('dialog');dialog.className='settings-edit-dialog computer-link-dialog';
  dialog.innerHTML=`<div class="dialog-heading"><h2>连接我的电脑</h2><button type="button" class="icon-button" aria-label="关闭">×</button></div>
    <div class="computer-link-intro"><p class="computer-link-kicker">首次设置</p><h3>让 Codex 帮你连接电脑</h3><p>准备连接资料后，打开本机 Codex。它会帮你配置连接，并让你选择同步文件夹。</p></div>
    <div class="computer-link-next" hidden><p class="computer-link-kicker">资料已下载</p><h3>打开 Codex，点发送即可开始</h3><p>配置任务会自动填好。无需自己解压或双击脚本。</p><p>安装完成后，回到这里查看同步状态。</p></div>
    <div class="computer-link-helper-next" hidden><p class="computer-link-kicker">独立助手已下载</p><h3>打开助手，选择文件夹</h3><p>解压下载的文件，打开 <strong>连接我的电脑.command</strong>。若 macOS 提示无法验证，可以改用 Codex 检查并配置。</p></div>
    <div class="computer-link-success" hidden><p class="computer-link-kicker">已完成</p><h3>电脑已连接</h3><p>后台助手会自动运行，可以回到工作台使用了。</p></div>
    <div class="computer-link-actions"><button type="button" class="primary" data-action="download" disabled>用 Codex 连接</button><button type="button" class="primary" data-action="open-codex" hidden>打开 Codex 继续</button><button type="button" class="secondary" data-action="cancel-download" hidden>取消下载</button><button type="button" class="primary" data-action="done" hidden>完成</button></div>
    <progress aria-label="连接资料下载进度" hidden style="width:100%"></progress>
    <p role="status" class="form-feedback"></p>
    <p class="computer-link-caption">需要本机已安装并登录 Codex。首次配置后会自动连接。</p>
    <details class="computer-link-options"><summary>更多选项</summary>
      <label class="computer-link-option"><input type="checkbox" name="maintenance">同时用 Codex 修改工作台功能</label>
      <p class="workspace-note">为本机准备源码，并授予服务器维护权限。连接完成后，Codex 可打开源码帮你修改功能。请在准备资料前选择。</p>
    </details>
    <p class="computer-link-sync-note">文件会双向同步，包括修改和删除。电脑离线时暂停，上线后继续。</p>
    <details class="computer-link-help"><summary>没有打开 Codex？</summary><p>浏览器可能需要确认「打开 Codex」。未能唤起时，可复制配置任务，自己粘贴到本机 Codex 中发送。</p><button type="button" class="secondary compact" data-action="copy-task" hidden>复制配置任务</button><textarea readonly aria-label="配置任务" hidden></textarea><button type="button" class="secondary compact" data-action="retry" hidden>重新准备资料</button><p>没有安装 Codex？也可以下载独立助手。该助手尚未经 Apple 公证，macOS 可能阻止打开。</p><button type="button" class="secondary compact" data-action="helper" disabled>下载独立助手</button><p>连接资料 30 分钟内有效，仅用于这台电脑，不要转发。同步冲突会保留副本。</p></details>
    <details class="computer-link-records" hidden><summary>管理已下载的连接</summary><div class="computer-link-devices"></div><button type="button" class="secondary compact" data-action="refresh">刷新状态</button></details>`;
  document.body.append(dialog);
  const get=s=>dialog.querySelector(s),feedback=get('[role=status]'),download=get('[data-action=download]'),list=get('.computer-link-devices'),maintenance=get('input'),progress=get('progress'),cancel=get('[data-action=cancel-download]'),done=get('[data-action=done]'),records=get('.computer-link-records'),openCodex=get('[data-action=open-codex]'),copyTask=get('[data-action=copy-task]'),retry=get('[data-action=retry]'),helper=get('[data-action=helper]'),taskText=get('textarea');
  const intro=get('.computer-link-intro'),next=get('.computer-link-next'),helperNext=get('.computer-link-helper-next'),success=get('.computer-link-success'),options=get('.computer-link-options'),caption=get('.computer-link-caption');
  get('[aria-label=关闭]').onclick=()=>dialog.close();done.onclick=()=>dialog.close();
  let reading=false,timer=null,downloading=false,controller=null,available=false,maintenanceAvailable=false,activeId=null,handoff=null,complete=false;
  const storageKey='workbench-computer-handoff';
  function persist(){try{handoff?sessionStorage.setItem(storageKey,JSON.stringify(handoff)):sessionStorage.removeItem(storageKey);}catch{}}
  try{const saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');if(saved&&/^[a-f0-9]{24}$/.test(saved.id)&&saved.expiresAt>Date.now()&&['codex','helper'].includes(saved.setup)){if(saved.setup==='codex')codexConnectionTask(saved);handoff=saved;activeId=saved.id;}}catch{}
  cancel.onclick=()=>controller?.abort();
  const labels={pending:'等待开始配置',pairing:'正在连接',paired:'电脑已配对',connecting:'正在确认同步',synced:'已同步',syncing:'正在同步',offline:'电脑离线，重新上线后自动连接',unknown:'暂时无法读取状态',error:'同步遇到问题',revoking:'解除尚未完成，请重试'};
  function stage(){
    const codexReady=handoff?.setup==='codex',helperReady=handoff?.setup==='helper';
    intro.hidden=Boolean(handoff)||complete;next.hidden=!codexReady||complete;helperNext.hidden=!helperReady||complete;success.hidden=!complete;
    download.hidden=Boolean(handoff)||complete;openCodex.hidden=!codexReady||complete;copyTask.hidden=!codexReady;retry.hidden=!handoff||complete;done.hidden=!complete;options.hidden=Boolean(handoff)||complete;caption.hidden=Boolean(handoff)||complete;
    download.textContent=downloading?'正在准备…':'用 Codex 连接';
    for(const b of [download,helper,retry])b.disabled=downloading||!available;
    openCodex.disabled=downloading;copyTask.disabled=downloading;maintenance.disabled=downloading||!maintenanceAvailable;
  }
  openCodex.onclick=()=>{
    if(!handoff||handoff.expiresAt<=Date.now()){feedback.textContent='连接资料已过期，请重新准备。';return;}
    const url=new URL('codex://threads/new');url.searchParams.set('mode','work');url.searchParams.set('prompt',codexConnectionTask(handoff));
    try{launchCodex(url.href);feedback.textContent='已请求打开 Codex。请在 Codex 中检查配置任务并点击发送；尚未打开可在下面复制任务。';}catch{feedback.textContent='无法唤起 Codex，请在下面复制配置任务。';}
  };
  copyTask.onclick=async()=>{if(!handoff)return;const text=codexConnectionTask(handoff);try{await navigator.clipboard.writeText(text);feedback.textContent='配置任务已复制，请粘贴到本机 Codex 并发送。';}catch{taskText.value=text;taskText.hidden=false;taskText.focus();taskText.select();feedback.textContent='请复制下方任务，粘贴到本机 Codex。';}};
  async function refresh(){
    if(reading)return;reading=true;const readingId=activeId;
    try{
      const result=await api('/api/computer-link',{signal:AbortSignal.timeout(12000)});available=result.available;maintenanceAvailable=result.maintenanceAvailable;
      if(!available)feedback.textContent='连接尚未准备好，请联系配置服务器的人。';
      if(!maintenanceAvailable)maintenance.checked=false;
      list.replaceChildren();records.hidden=!result.devices.length;
      for(const d of result.devices){
        const row=document.createElement('section');row.className='computer-link-device';
        const title=document.createElement('strong'),state=document.createElement('p'),path=document.createElement('code'),remove=document.createElement('button');
        title.textContent=d.name;state.textContent=(labels[d.status]||d.status)+(d.maintenance?' · 可修改工作台':'');path.textContent=d.folder||'';
        remove.type='button';remove.className='secondary compact';remove.textContent=d.status==='pending'?'取消这次连接':'解除连接';
        remove.onclick=async()=>{
          if(!confirm('解除这台电脑的连接？同步和维护密钥将撤销，两边的文件都会保留。已打开的维护终端需要自行退出。'))return;
          remove.disabled=true;try{await api('/api/computer-link/'+d.id,{method:'DELETE'});if(activeId===d.id){activeId=null;handoff=null;complete=false;persist();}feedback.textContent='已解除，文件已保留。';await refresh();}catch(e){feedback.textContent=e.message;remove.disabled=false;}
        };
        row.append(title,state);if(d.folder){const note=document.createElement('p');note.textContent='云端文件夹：';row.append(note,path);}row.append(remove);list.append(row);
      }
      const active=result.devices.find(d=>d.id===activeId);complete=Boolean(active&&['syncing','synced'].includes(active.status));
      if(activeId===readingId&&activeId&&!active&&!downloading){activeId=null;handoff=null;persist();feedback.textContent='这次连接已过期或取消，可以重新准备资料。';}
      if(active&&handoff&&!downloading&&active.status!=='pending')feedback.textContent=labels[active.status]||active.status;
      stage();
    }catch(e){feedback.textContent=e.message;stage();}finally{reading=false;}
  }
  async function prepare(setup){
    if(downloading)return;downloading=true;controller=new AbortController();stage();progress.hidden=false;progress.removeAttribute('value');cancel.hidden=false;feedback.textContent=setup==='codex'?'正在准备连接资料…':'正在准备独立助手…';let enrollment;
    let timeout;const renew=()=>{clearTimeout(timeout);timeout=setTimeout(()=>controller?.abort('stalled'),30000);};renew();
    try{
      enrollment=await api('/api/computer-link',{method:'POST',json:{maintenance:handoff?.maintenance??maintenance.checked,arch:'universal',setup},signal:controller.signal});
      const blob=await api('/api/computer-link/'+enrollment.id+'/download',{method:'POST',json:{token:enrollment.downloadToken},blob:true,signal:controller.signal,onDownloadProgress:(received,total)=>{
        renew();if(total){progress.max=total;progress.value=received;}feedback.textContent=total?`正在下载 · ${Math.round(received/total*100)}%`:`正在下载 · ${(received/1048576).toFixed(1)} MB`;
      }});
      let sha256;if(setup==='codex')sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');
      if(controller.signal.aborted)throw Error('已取消');
      const filename=`Workbench-Connect-${enrollment.id}.zip`,url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
      // Keep previous enrollments intact: they may be running on another Mac. Only the user may revoke them.
      activeId=enrollment.id;handoff={id:activeId,filename,sha256,maintenance:handoff?.maintenance??maintenance.checked,expiresAt:enrollment.expiresAt,setup};complete=false;persist();taskText.hidden=true;
      feedback.textContent=setup==='codex'?'资料已下载。点击“打开 Codex 继续”。':'下载完成，请打开独立助手。';
    }catch(e){
      feedback.textContent=controller.signal.aborted?(controller.signal.reason==='stalled'?'下载暂时没有响应，请重试。':'已取消下载。'):'下载未完成：'+e.message;
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
