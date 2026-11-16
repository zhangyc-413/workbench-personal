// Remove excerpts saved by older versions. Startup now uses the regular workspace loading state.
export function clearReadingPreviews(){
  document.getElementById('reading-preview')?.remove();
  delete document.body.dataset.readingPreview;
  try{sessionStorage.removeItem('agent-workbench.reading-preview.v1');}catch{/* Storage is optional. */}
}
