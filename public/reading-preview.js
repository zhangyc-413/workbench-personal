import {t} from './i18n.js';

// Read-only text, never Home state, permissions, credentials, commands or DOM markup. Per-tab storage also survives a
// discarded tab/reload. The real UI still waits for authoritative state before offering any action.
const STORAGE='agent-workbench.reading-preview.v1',MAX_AGE=7*86400000,MAX_CHARS=120000,KEEP=6;
let panel=null,visibleKey=null,blocked=false;
const ready=new Set();
const identity=(mode,key)=>JSON.stringify([mode,key]);
export const groupReadingKey=(projectId,conversationId=projectId)=>JSON.stringify([projectId,conversationId||projectId]);
function entries(){try{const rows=JSON.parse(sessionStorage.getItem(STORAGE));return Array.isArray(rows)?rows.filter(row=>row?.version===1&&['groups','sessions'].includes(row.mode)&&typeof row.key==='string'&&Array.isArray(row.rows)&&Number.isFinite(row.savedAt)&&Date.now()-row.savedAt<MAX_AGE):[];}catch{return [];}}
function write(rows){try{sessionStorage.setItem(STORAGE,JSON.stringify(rows));}catch{/* Storage is optional; normal live loading remains available. */}}

/** A bounded recent excerpt, with an explicit marker when a long message is cropped. */
export function readingExcerpt(rows){
  const result=[];let remaining=MAX_CHARS;
  for(const row of (Array.isArray(rows)?rows:[]).slice(-40).reverse()){
    if(typeof row?.text!=='string'||!row.text.trim())continue;
    const limit=Math.min(remaining,30000);if(limit<=0)break;
    const text=row.text.length>limit?row.text.slice(0,limit)+'\n…':row.text;
    result.unshift({speaker:String(row.speaker||'').slice(0,120),role:row.role==='user'?'user':'assistant',text,at:typeof row.at==='string'?row.at.slice(0,40):''});remaining-=text.length;
  }
  return result;
}
export function saveReadingPreview({mode,key,title,rows}){
  if(blocked||!key)return;
  const excerpt=readingExcerpt(rows),all=entries(),id=identity(mode,key),previous=all.find(row=>identity(row.mode,row.key)===id);
  const value={version:1,mode,key,title:String(title||'').slice(0,200),rows:excerpt};
  if(previous?.title===value.title&&JSON.stringify(previous.rows)===JSON.stringify(excerpt))return;
  write([...all.filter(row=>identity(row.mode,row.key)!==id),{...value,savedAt:Date.now()}].slice(-KEEP));
}
export function hideReadingPreview(){panel?.remove();panel=null;visibleKey=null;delete document.body.dataset.readingPreview;}
export function readingPreviewReady(mode,key){const id=identity(mode,key);ready.add(id);if(visibleKey===id)hideReadingPreview();}
export function clearReadingPreviews(){blocked=true;ready.clear();hideReadingPreview();try{sessionStorage.removeItem(STORAGE);}catch{}}
export function allowReadingPreviews(){blocked=false;}

/** Show only the selected conversation's last text; no actions or clickable content can be revived from this copy. */
export function showReadingPreview(mode,key){
  const id=identity(mode,key);
  if(visibleKey===id)return;
  hideReadingPreview();
  if(blocked||!key||ready.has(id)||document.body.dataset.workspaceView==='settings')return;
  const saved=entries().find(row=>identity(row.mode,row.key)===id);if(!saved?.rows.length)return;
  const host=document.querySelector('.workspace');if(!host)return;
  const node=(tag,cls,text)=>{const el=document.createElement(tag);el.className=cls;if(text!=null)el.textContent=text;return el;};
  panel=node('section','reading-preview');panel.id='reading-preview';panel.setAttribute('aria-label',t('Last viewed messages'));
  const header=node('header','reading-preview-heading');header.append(node('strong','',saved.title));
  const note=node('p','reading-preview-note',t('Saved messages · checking for updates. Sending becomes available after connecting.'));
  note.title=new Date(saved.savedAt).toLocaleString();header.append(note);
  const close=node('button','secondary compact',t('Dismiss'));close.type='button';close.addEventListener('click',hideReadingPreview);header.append(close);
  const feed=node('div','reading-preview-scroll');
  for(const row of readingExcerpt(saved.rows)){
    const card=node('article',`reading-preview-row ${row.role==='user'?'is-user':''}`);
    card.append(node('strong','reading-preview-speaker',row.speaker||(row.role==='user'?t('You'):t('Assistant'))),node('div','reading-preview-text',row.text));feed.append(card);
  }
  panel.append(header,feed);host.append(panel);visibleKey=id;document.body.dataset.readingPreview=mode;
  feed.scrollTop=feed.scrollHeight;
}
export function showLastReadingPreview(){try{
  const mode=sessionStorage.getItem('agent-workbench.navigation-mode')||'sessions';
  const project=sessionStorage.getItem('agent-workbench.project'),conversation=sessionStorage.getItem('agent-workbench.conversation')||project;
  const key=mode==='groups'?project&&groupReadingKey(project,conversation):sessionStorage.getItem('agent-workbench.native-session');
  showReadingPreview(mode,key);
}catch{/* Unavailable storage must not delay the live UI. */}}
