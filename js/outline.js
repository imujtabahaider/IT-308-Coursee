(function () {
// Groups with no topics yet: show a short message and stop.
if (!document.querySelector('.topic-card')) {
  const t = document.getElementById('prog-text'); if (t) t.textContent = 'No topics yet';
  const p = document.getElementById('prog-pct'); if (p) p.textContent = '';
  return;
}
// Builds the sidebar from the topic cards and shows ONE topic at a time, starting from the top.
const cards = [...document.querySelectorAll('.topic-card')];
const side = document.getElementById('sidebar-list');
const main = document.querySelector('.layout main');
const KEY = 'it308-read';
let read = [];
try { read = JSON.parse(localStorage.getItem(KEY)) || []; } catch {}

// 1) sidebar: group cards by data-group (keeps your order)
const groups = {};
cards.forEach(c => (groups[c.dataset.group] ||= []).push(c));
Object.entries(groups).forEach(([name, list]) => {
  const d = document.createElement('details');
  d.open = true;
  d.innerHTML = `<summary>${name}</summary>` + list.map(c =>
    `<a href="#${c.id}" data-id="${c.id}"><span class="dot"></span>${c.querySelector('.banner h3').textContent}</a>`
  ).join('');
  side.appendChild(d);
});

// 2) bottom of every card: Previous / Mark as read / Next
cards.forEach((c, i) => {
  const foot = document.createElement('div');
  foot.className = 'foot';
  foot.innerHTML =
    (i > 0 ? `<a class="btn alt" href="#${cards[i - 1].id}">&larr; Previous</a>` : '') +
    '<button class="btn alt mark">Mark as read</button>' +
    (i < cards.length - 1 ? `<a class="btn" href="#${cards[i + 1].id}">Next &rarr;</a>` : '');
  foot.querySelector('.mark').addEventListener('click', () => {
    read = read.includes(c.id) ? read.filter(x => x !== c.id) : [...read, c.id];
    try { localStorage.setItem(KEY, JSON.stringify(read)); } catch {}
    paint();
  });
  c.appendChild(foot);
});

function paint() {
  cards.forEach(c => {
    const done = read.includes(c.id);
    side.querySelector(`a[data-id="${c.id}"]`).classList.toggle('done', done);
    c.querySelector('.mark').textContent = done ? 'Marked as read' : 'Mark as read';
  });
  const n = cards.filter(c => read.includes(c.id)).length;
  document.getElementById('prog-text').textContent = `Progress: ${n}/${cards.length}`;
  document.getElementById('prog-pct').textContent = Math.round(100 * n / cards.length) + '%';
  document.getElementById('prog-bar').style.width = (100 * n / cards.length) + '%';
}

// 3) show only the selected topic and start it from the top
function show(first) {
  const id = location.hash.slice(1);
  const current = cards.find(c => c.id === id) || cards[0];
  cards.forEach(c => (c.hidden = c !== current));
  side.querySelectorAll('a').forEach(a => a.classList.toggle('current', a.dataset.id === current.id));
  if (!first) window.scrollTo({ top: Math.max(0, main.offsetTop - 80), behavior: 'smooth' });
}
window.addEventListener('hashchange', () => show(false));
paint();
show(true);

// 4) sidebar search
document.getElementById('side-search').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  side.querySelectorAll('a').forEach(a => a.style.display = a.textContent.toLowerCase().includes(q) ? '' : 'none');
});

// 5) Remove image placeholders and figures whose image assets are unavailable
function removeImageSlot(element) {
  const figure = element.closest('figure');
  (figure || element).remove();
}

document.querySelectorAll('.image-placeholder').forEach(removeImageSlot);

document.querySelectorAll('figure').forEach(figure => {
  if (!figure.querySelector('img') && /<!--\s*<img\b/i.test(figure.innerHTML)) {
    figure.remove();
  }
});

document.querySelectorAll('figure img').forEach(img => {
  if (img.complete && !img.naturalWidth) removeImageSlot(img);
  else img.addEventListener('error', () => removeImageSlot(img));
});

})();
