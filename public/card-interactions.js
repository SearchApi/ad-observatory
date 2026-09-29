export function bindCreativeCards(root, groups, openAd) {
 const open = id => { const group = groups.find(g => g.id === id); if (group) openAd(group); };
 root.querySelectorAll('[data-open-group]').forEach(card => {
  card.onclick = event => {
   // Preserve playback, bookmarks, source links, and text selection.
   if (event.target.closest('button,a,input,select,textarea,video,summary') || window.getSelection()?.toString()) return;
   open(card.dataset.openGroup);
  };
  card.onkeydown = event => {
   if (event.target !== card || !['Enter', ' '].includes(event.key)) return;
   event.preventDefault();open(card.dataset.openGroup);
  };
 });
 root.querySelectorAll('[data-group]').forEach(button => button.onclick = () => open(button.dataset.group));
}
