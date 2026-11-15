/** Explicit Mac pairing; no polling or downloads until the connection dialog is opened. */
export function computerLinkUI({api}){
  const dialog=document.createElement('dialog');dialog.className='settings-edit-dialog computer-link-dialog';
  dialog.innerHTML=`<div class="dialog-heading"><h2>连接我的电脑</h2><button type="button" class="icon-button" aria-label="关闭">×</button></div>
    <p>让本机文件夹与服务器双向同步。首次打开连接助手并选择文件夹，之后登录 Mac 时会自动连接。</p>
    <ol><li>下载完整连接包并解压，所需组件已包含在内。</li><li>双击「连接我的电脑.command」，选择专用文件夹。</li><li>自动配置 SSH 和同步，完成后回到网页。</li></ol>
    <label class="computer-link-option">Mac 类型 <select name="arch" aria-label="Mac 类型"><option value="arm64">Apple 芯片（M 系列）</option><option value="x64">Intel 芯片</option></select></label>
    <label class="computer-link-option"><input type="checkbox" name="maintenance">允许本机维护工作台</label>
    <p class="workspace-note">同时提供独立源码目录及服务器维护 SSH 权限，方便本地 Codex 等助手修改功能。修改后测试、发布才会更新线上。</p>
    <div class="computer-link-actions"><button type="button" class="primary" data-action="download">下载完整连接包</button><button type="button" class="secondary" data-action="cancel-download" hidden>取消下载</button><button type="button" class="secondary" data-action="refresh">刷新连接状态</button></div>
    <progress aria-label="连接包下载进度" hidden style="width:100%"></progress>
    <p role="status" class="form-feedback"></p><div class="computer-link-devices"></div>
    <p class="workspace-note">下载包 30 分钟有效，仅用于自己的电脑。关机期间暂停同步，登录后续传；修改和删除都会同步，冲突保留副本。首次可能需要在 Finder 中右键选择“打开”。</p>`;
  document.body.append(dialog);const feedback=dialog.querySelector('[role=status]'),download=dialog.querySelector('[data-action=download]'),list=dialog.querySelector('.computer-link-devices'),maintenance=dialog.querySelector('input'),arch=dialog.querySelector('select'),progress=dialog.querySelector('progress'),cancel=dialog.querySelector('[data-action=cancel-download]');
  dialog.querySelector('[aria-label=关闭]').onclick=()=>dialog.close();
  let reading=false,timer=null,downloading=false,controller=null;
  cancel.onclick=()=>controller?.abort();
  const labels={pending:'等待打开连接助手',pairing:'正在配对',paired:'已配对',connecting:'正在确认同步',synced:'已同步',syncing:'正在同步',offline:'电脑离线或通道未连接',unknown:'暂时无法读取状态',error:'同步遇到问题',revoking:'解除尚未完成，请重试'};
  async function refresh(){
    if(reading)return;reading=true;
    try{const result=await api('/api/computer-link');download.disabled=downloading||!result.available;maintenance.disabled=downloading||!result.maintenanceAvailable;
      if(!result.available)feedback.textContent='管理员尚未启用连接助手。';
      list.replaceChildren();
      for(const d of result.devices){const row=document.createElement('section');row.className='computer-link-device';const title=document.createElement('strong'),state=document.createElement('p'),path=document.createElement('code'),remove=document.createElement('button');title.textContent=d.name;state.textContent=(labels[d.status]||d.status)+(d.maintenance?' · 可维护工作台':'');path.textContent=d.folder||'';remove.type='button';remove.className='secondary compact';remove.textContent=d.status==='pending'?'取消':'解除连接';
        remove.onclick=async()=>{if(!confirm('解除这台电脑的连接？同步和维护密钥将撤销，两边的文件都会保留。已打开的维护终端需要自行退出。'))return;remove.disabled=true;try{await api('/api/computer-link/'+d.id,{method:'DELETE'});feedback.textContent='已解除，文件已保留。';await refresh();}catch(e){feedback.textContent=e.message;remove.disabled=false;}};
        row.append(title,state);if(d.folder){const note=document.createElement('p');note.textContent='服务器共享文件夹（新建项目时可选择此目录）：';row.append(note,path);}row.append(remove);list.append(row);
      }
    }catch(e){feedback.textContent=e.message;}finally{reading=false;}
  }
  download.onclick=async()=>{if(downloading)return;downloading=true;controller=new AbortController();download.disabled=true;arch.disabled=true;maintenance.disabled=true;progress.hidden=false;progress.removeAttribute('value');cancel.hidden=false;feedback.textContent='正在准备完整连接包…';let enrollment;
    // Stop a stalled transfer promptly, retaining an explicit retry instead of an invisible long wait.
    let timeout;const renew=()=>{clearTimeout(timeout);timeout=setTimeout(()=>controller?.abort('stalled'),30000);};renew();
    try{
      enrollment=await api('/api/computer-link',{method:'POST',json:{maintenance:maintenance.checked,arch:arch.value},signal:controller.signal});
      const blob=await api('/api/computer-link/'+enrollment.id+'/download',{method:'POST',json:{token:enrollment.downloadToken},blob:true,signal:controller.signal,onDownloadProgress:(done,total)=>{renew();if(total){progress.max=total;progress.value=done;}feedback.textContent=`正在下载完整包：${(done/1048576).toFixed(1)}${total?' / '+(total/1048576).toFixed(1):''} MB。打开后不再下载组件。`;}});
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Workbench-Connect-${enrollment.arch}-${enrollment.id.slice(0,6)}.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
      feedback.textContent='下载完成。解压后打开「连接我的电脑.command」，选择文件夹即可。';
    }catch(e){feedback.textContent=controller.signal.aborted?(controller.signal.reason==='stalled'?'下载暂时没有响应，请重试。':'已取消下载。'):'下载未完成：'+e.message;if(enrollment)await api('/api/computer-link/'+enrollment.id,{method:'DELETE'}).catch(()=>{});}
    finally{clearTimeout(timeout);downloading=false;controller=null;arch.disabled=false;progress.hidden=true;cancel.hidden=true;download.disabled=false;await refresh();}
  };
  dialog.querySelector('[data-action=refresh]').onclick=()=>void refresh();
  function open(){if(!dialog.open)dialog.showModal();void refresh();clearInterval(timer);timer=setInterval(()=>{if(!document.hidden)void refresh();},10000);}
  dialog.addEventListener('close',()=>{clearInterval(timer);timer=null;});
  for(const id of ['connect-my-computer','settings-connect-computer'])document.getElementById(id)?.addEventListener('click',open);
  return {open};
}
