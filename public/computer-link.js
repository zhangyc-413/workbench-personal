/** Explicit Mac pairing. Show only the current step; setup choices stay optional. */
export function computerLinkUI({api}){
  const dialog=document.createElement('dialog');dialog.className='settings-edit-dialog computer-link-dialog';
  dialog.innerHTML=`<div class="dialog-heading"><h2>连接我的电脑</h2><button type="button" class="icon-button" aria-label="关闭">×</button></div>
    <div class="computer-link-intro"><p class="computer-link-kicker">首次设置</p><h3>选一个文件夹，随时在网页里用。</h3><p>下载后打开助手，选择文件夹。设置一次，之后自动连接。</p></div>
    <div class="computer-link-next" hidden><p class="computer-link-kicker">接下来</p><h3>打开助手，选择文件夹</h3><p>在 Mac 的「下载」文件夹打开压缩包，再双击 <strong>连接我的电脑.command</strong>。</p><p>选好文件夹后，其余步骤自动完成。这个页面会显示连接结果。</p></div>
    <div class="computer-link-success" hidden><p class="computer-link-kicker">已完成</p><h3>电脑已连接</h3><p>后台助手会自动运行，可以回到工作台使用了。</p></div>
    <div class="computer-link-actions"><button type="button" class="primary" data-action="download" disabled>下载连接助手</button><button type="button" class="secondary" data-action="cancel-download" hidden>取消下载</button><button type="button" class="primary" data-action="done" hidden>完成</button></div>
    <progress aria-label="连接助手下载进度" hidden style="width:100%"></progress>
    <p role="status" class="form-feedback"></p>
    <p class="computer-link-caption">适用于 Apple 芯片和 Intel Mac，无需选择型号。</p>
    <details class="computer-link-options"><summary>更多选项</summary>
      <label class="computer-link-option"><input type="checkbox" name="maintenance">用本地 Codex 等助手修改工作台</label>
      <p class="workspace-note">勾选后会下载一份工作台源码，并授权这台电脑维护服务器。改动需测试、发布后才会更新线上。请在下载前选择。</p>
    </details>
    <p class="computer-link-sync-note">文件会双向同步，包括修改和删除。电脑离线时暂停，上线后继续。</p>
    <details class="computer-link-help"><summary>打开时遇到问题？</summary><p>首次打开如果出现系统确认，请在 Finder 中右键选择「打开」。</p><p>连接包 30 分钟内有效，请在要连接的 Mac 上下载并打开，不要转发。同步冲突会保留副本。</p></details>
    <details class="computer-link-records" hidden><summary>管理已下载的连接</summary><div class="computer-link-devices"></div><button type="button" class="secondary compact" data-action="refresh">刷新状态</button></details>`;
  document.body.append(dialog);
  const feedback=dialog.querySelector('[role=status]'),download=dialog.querySelector('[data-action=download]'),list=dialog.querySelector('.computer-link-devices'),maintenance=dialog.querySelector('input'),progress=dialog.querySelector('progress'),cancel=dialog.querySelector('[data-action=cancel-download]'),done=dialog.querySelector('[data-action=done]'),records=dialog.querySelector('.computer-link-records');
  const intro=dialog.querySelector('.computer-link-intro'),next=dialog.querySelector('.computer-link-next'),success=dialog.querySelector('.computer-link-success'),options=dialog.querySelector('.computer-link-options'),caption=dialog.querySelector('.computer-link-caption');
  dialog.querySelector('[aria-label=关闭]').onclick=()=>dialog.close();done.onclick=()=>dialog.close();
  let reading=false,timer=null,downloading=false,controller=null,available=false,maintenanceAvailable=false,activeId=null,downloaded=false;
  cancel.onclick=()=>controller?.abort();
  const labels={pending:'等待打开助手',pairing:'正在连接',paired:'电脑已配对',connecting:'正在确认同步',synced:'已同步',syncing:'正在同步',offline:'电脑离线，重新上线后自动连接',unknown:'暂时无法读取状态',error:'同步遇到问题',revoking:'解除尚未完成，请重试'};
  function stage(complete=false){
    intro.hidden=downloaded||complete;next.hidden=!downloaded||complete;success.hidden=!complete;
    download.hidden=complete;done.hidden=!complete;options.hidden=complete;caption.hidden=complete||downloaded;
    download.textContent=downloading?'正在下载…':downloaded?'重新下载':'下载连接助手';
    download.disabled=downloading||!available;maintenance.disabled=downloading||!maintenanceAvailable;
  }
  async function refresh(){
    if(reading)return;reading=true;const readingId=activeId;
    try{
      const result=await api('/api/computer-link',{signal:AbortSignal.timeout(12000)});available=result.available;maintenanceAvailable=result.maintenanceAvailable;
      if(!available)feedback.textContent='连接助手尚未准备好，请联系配置服务器的人。';
      if(!maintenanceAvailable)maintenance.checked=false;
      list.replaceChildren();records.hidden=!result.devices.length;
      for(const d of result.devices){
        const row=document.createElement('section');row.className='computer-link-device';
        const title=document.createElement('strong'),state=document.createElement('p'),path=document.createElement('code'),remove=document.createElement('button');
        title.textContent=d.name;state.textContent=(labels[d.status]||d.status)+(d.maintenance?' · 可修改工作台':'');path.textContent=d.folder||'';
        remove.type='button';remove.className='secondary compact';remove.textContent=d.status==='pending'?'取消这次连接':'解除连接';
        remove.onclick=async()=>{
          if(!confirm('解除这台电脑的连接？同步和维护密钥将撤销，两边的文件都会保留。已打开的维护终端需要自行退出。'))return;
          remove.disabled=true;try{await api('/api/computer-link/'+d.id,{method:'DELETE'});if(activeId===d.id){activeId=null;downloaded=false;}feedback.textContent='已解除，文件已保留。';await refresh();}catch(e){feedback.textContent=e.message;remove.disabled=false;}
        };
        row.append(title,state);if(d.folder){const note=document.createElement('p');note.textContent='云端文件夹：';row.append(note,path);}row.append(remove);list.append(row);
      }
      const active=result.devices.find(d=>d.id===activeId),complete=active&&['paired','connecting','syncing','synced'].includes(active.status);
      if(activeId===readingId&&activeId&&!active&&!downloading){activeId=null;downloaded=false;feedback.textContent='这次连接已过期或取消，可以重新下载。';}
      if(active&&downloaded&&!downloading&&active.status!=='pending')feedback.textContent=labels[active.status]||active.status;
      stage(complete);
    }catch(e){feedback.textContent=e.message;stage();}finally{reading=false;}
  }
  download.onclick=async()=>{
    if(downloading)return;downloading=true;controller=new AbortController();stage();progress.hidden=false;progress.removeAttribute('value');cancel.hidden=false;feedback.textContent='正在准备助手…';let enrollment;
    let timeout;const renew=()=>{clearTimeout(timeout);timeout=setTimeout(()=>controller?.abort('stalled'),30000);};renew();
    try{
      enrollment=await api('/api/computer-link',{method:'POST',json:{maintenance:maintenance.checked,arch:'universal'},signal:controller.signal});
      const blob=await api('/api/computer-link/'+enrollment.id+'/download',{method:'POST',json:{token:enrollment.downloadToken},blob:true,signal:controller.signal,onDownloadProgress:(received,total)=>{
        renew();if(total){progress.max=total;progress.value=received;}feedback.textContent=total?`正在下载 · ${Math.round(received/total*100)}%`:`正在下载 · ${(received/1048576).toFixed(1)} MB`;
      }});
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Workbench-Connect-${enrollment.id.slice(0,6)}.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
      activeId=enrollment.id;downloaded=true;feedback.textContent='下载完成，打开助手后会自动检测连接。';
    }catch(e){
      feedback.textContent=controller.signal.aborted?(controller.signal.reason==='stalled'?'下载暂时没有响应，请重试。':'已取消下载。'):'下载未完成：'+e.message;
      if(enrollment)await api('/api/computer-link/'+enrollment.id,{method:'DELETE'}).catch(()=>{});
    }finally{clearTimeout(timeout);downloading=false;controller=null;progress.hidden=true;cancel.hidden=true;stage();await refresh();}
  };
  dialog.querySelector('[data-action=refresh]').onclick=()=>void refresh();
  function open(){if(!dialog.open)dialog.showModal();void refresh();clearInterval(timer);timer=setInterval(()=>{if(!document.hidden)void refresh();},10000);}
  dialog.addEventListener('close',()=>{clearInterval(timer);timer=null;});
  for(const id of ['connect-my-computer','settings-connect-computer'])document.getElementById(id)?.addEventListener('click',open);
  return {open};
}
