'use strict';

// -------------------------------------------------------------------- başlangıç
buildTracks();
offerRestore().then(() => {
  let seen = false;
  try { seen = !!localStorage.getItem('harman.welcomed'); } catch { /* özel pencere */ }
  window.harman.takePendingOpen().then((file) => { if (file) openProjectPath(file); });
  if (!seen && !state.clips.length && !project.path) startTour();
});
[el.insGain, el.insFadeIn, el.insFadeOut].forEach(paintSlider);
layoutAll();
setZoom(state.pps);
