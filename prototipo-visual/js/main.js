function show(name, btn) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('visible'));
  document.querySelectorAll('.prev-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('s-' + name).classList.add('visible');
  if(btn) btn.classList.add('active');
  window.scrollTo(0, 0);
}
