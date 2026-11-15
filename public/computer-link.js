/** Explicit Mac pairing; no polling or downloads until the connection dialog is opened. */
export function computerLinkUI({api}){
  const dialog=document.createElement('dialog');dialog.className='settings-edit-dialog computer-link-dialog';
  dialog.innerHTML=`<div class="dialog-heading"><h2>连接我的电脑</h2><button type="button" class="icon-button" aria-label="关闭">×</button></div>
    <p>让本机文件夹与服务器双向同步。首次打开连接助手并选择文件夹，之后登录 Mac 时会自动连接。</p>
    <ol><li>下载并解压连接助手（Mac，Apple 芯片 / Intel）。</li><li>双击「连接我的电脑.command」，按提示选择专用文件夹。</li><li>回到这里查看连接状态。无需填写 SSH 参数或重新登录 Claude。</li></ol>
    <label class="computer-link-option"><input type="checkbox" name="maintenance">允许本机维护工作台</label>
    <p class="workspace-note">同时提供独立源码目录及服务器维护 SSH 权限，方便本地 Codex 等助手修改功能。修改后测试、发布才会更新线上。</p>
    <div class="computer-link-actions"><button type="button" class="primary" data-action="download">下载连接助手</button><button type="button" class="secondary" data-action="refresh">刷新连接状态</button></div>
    <p role="status" class="form-feedback"></p><div class="computer-link-devices"></div>
    <p class="workspace-note">下载包 30 分钟有效，仅用于自己的电脑。关机期间暂停同步，登录后续传；修改和删除都会同步，冲突保留副本。首次可能需要在 Finder 中右键选择“打开”。</p>`;
  document.body.append(dialog);const feedback=dialog.querySelector('[role=status]'),download=dialog.querySelector('[data-action=download]'),list=dialog.querySelector('.computer-link-devices'),maintenance=dialog.querySelector('input');
  dialog.querySelector('[aria-label=关闭]').onclick=()=>dialog.close();
  let reading=false,timer=null;
  const labels={pending:'等待打开连接助手',pairing:'正在配对',paired:'已配对',connecting:'正在确认同步',synced:'已同步',syncing:'正在同步',offline:'电脑离线或通道未连接',unknown:'暂时无法读取状态',error:'同步遇到问题',revoking:'解除尚未完成，请重试'};
  async function refresh(){
    if(reading)return;reading=true;
    try{const result=await api('/api/computer-link');download.disabled=!result.available;maintenance.disabled=!result.maintenanceAvailable;
      if(!result.available)feedback.textContent='管理员尚未启用连接助手。';
      list.replaceChildren();
      for(const d of result.devices){const row=document.createElement('section');row.className='computer-link-device';const title=document.createElement('strong'),state=document.createElement('p'),path=document.createElement('code'),remove=document.createElement('button');title.textContent=d.name;state.textContent=(labels[d.status]||d.status)+(d.maintenance?' · 可维护工作台':'');path.textContent=d.folder||'';remove.type='button';remove.className='secondary compact';remove.textContent=d.status==='pending'?'取消':'解除连接';
        remove.onclick=async()=>{if(!confirm('解除这台电脑的连接？同步和维护密钥将撤销，两边的文件都会保留。已打开的维护终端需要自行退出。'))return;remove.disabled=true;try{await api('/api/computer-link/'+d.id,{method:'DELETE'});feedback.textContent='已解除，文件已保留。';await refresh();}catch(e){feedback.textContent=e.message;remove.disabled=false;}};
        row.append(title,state);if(d.folder){const note=document.createElement('p');note.textContent='服务器共享文件夹（新建项目时可选择此目录）：';row.append(note,path);}row.append(remove);list.append(row);
      }
    }catch(e){feedback.textContent=e.message;}finally{reading=false;}
  }
  download.onclick=async()=>{download.disabled=true;feedback.textContent='正在生成这台电脑的专用连接包…';try{
    const result=await api('/api/computer-link',{method:'POST',json:{maintenance:maintenance.checked}}),bytes=Uint8Array.from(atob(result.archive),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:'application/zip'})),a=document.createElement('a');a.href=url;a.download='Workbench-Connect.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
    feedback.textContent='已下载。解压后打开连接助手，选择要同步的文件夹。';await refresh();
  }catch(e){feedback.textContent=e.message;}finally{download.disabled=false;}};
  dialog.querySelector('[data-action=refresh]').onclick=()=>void refresh();
  function open(){if(!dialog.open)dialog.showModal();void refresh();clearInterval(timer);timer=setInterval(()=>{if(!document.hidden)void refresh();},10000);}
  dialog.addEventListener('close',()=>{clearInterval(timer);timer=null;});
  for(const id of ['connect-my-computer','settings-connect-computer'])document.getElementById(id)?.addEventListener('click',open);
  return {open};
}
