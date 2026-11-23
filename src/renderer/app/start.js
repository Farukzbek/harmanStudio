'use strict';

// -------------------------------------------------------------------- başlangıç
setTheme(settings.theme, { save: false });
window.harman.snapSet(settings.snap).catch(() => {});
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

// Yan panel bölümleri katlanabilir: başlığa tıkla. Durum hatırlanır.
(function setupCollapsibleSections() {
  const KEY = 'harman.collapsed';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* özel pencere */ }
  const defaults = { 'Uyumlu şarkılar': true };
  document.querySelectorAll('#inspector-body > section').forEach((section) => {
    const h = section.querySelector(':scope > h4');
    if (!h) return;
    const name = h.textContent.trim();
    h.classList.add('collapsible');
    h.tabIndex = 0;
    h.setAttribute('role', 'button');
    const apply = (collapsed) => { section.classList.toggle('collapsed', collapsed); h.setAttribute('aria-expanded', String(!collapsed)); };
    apply(saved[name] ?? defaults[name] ?? false);
    const toggle = () => {
      const collapsed = !section.classList.contains('collapsed');
      apply(collapsed);
      saved[name] = collapsed;
      try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* özel pencere */ }
    };
    h.addEventListener('click', toggle);
    h.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  });
}());
