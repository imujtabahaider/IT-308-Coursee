// Search filter (Programs and Practice pages)
const themeOptions = [
  { value: 'classic', label: 'Classic' },
  { value: 'midnight', label: 'Midnight' },
  { value: 'sand', label: 'Sand' },
];
const themeStorageKey = 'it308-theme';
const savedTheme = localStorage.getItem(themeStorageKey);
const activeTheme = themeOptions.some(({ value }) => value === savedTheme)
  ? savedTheme
  : 'classic';

document.documentElement.dataset.theme = activeTheme;

const nav = document.querySelector('nav');
if (nav) {
  const themeControl = document.createElement('div');
  themeControl.className = 'theme-control';

  const themeLabel = document.createElement('label');
  themeLabel.htmlFor = 'theme-select';
  themeLabel.textContent = 'Theme';

  const themeSelect = document.createElement('select');
  themeSelect.id = 'theme-select';
  themeSelect.setAttribute('aria-label', 'Choose color theme');

  themeOptions.forEach(({ value, label }) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    themeSelect.append(option);
  });

  themeSelect.value = activeTheme;
  themeSelect.addEventListener('change', () => {
    document.documentElement.dataset.theme = themeSelect.value;
    localStorage.setItem(themeStorageKey, themeSelect.value);
  });

  themeControl.append(themeLabel, themeSelect);
  nav.append(themeControl);

  const quoteSection = document.createElement('section');
  quoteSection.className = 'quote-banner';
  quoteSection.setAttribute('aria-label', 'Course quote');

  const quote = document.createElement('blockquote');
  quote.textContent = 'مَنْ كُنْتُ مَوْلَاهُ فَهَذَا عَلِيٌّ مَوْلَاهُ';

  quoteSection.append(quote);
  nav.insertAdjacentElement('afterend', quoteSection);
}

const search = document.getElementById('search');

if (search) {
  search.addEventListener('input', () => {
    const q = search.value.toLowerCase();

    document.querySelectorAll('[data-item]').forEach((el) => {
      el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}

const programSections = document.querySelectorAll('.program-section');

if (programSections.length > 0) {
  const showSelectedProgram = () => {
    const selectedProgram = document.getElementById(
      window.location.hash.slice(1),
    );
    const hasValidSelection = Array.from(programSections).includes(selectedProgram);

    programSections.forEach((section) => {
      section.hidden = hasValidSelection && section !== selectedProgram;
    });
  };

  showSelectedProgram();
  window.addEventListener('hashchange', showSelectedProgram);
}

// Copy buttons: put class="copy" on a button placed right before a <pre>
document.querySelectorAll('.copy').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const code = btn.nextElementSibling.innerText;

    try {
      await navigator.clipboard.writeText(code);
      btn.textContent = 'Copied';
    } catch {
      btn.textContent = 'Press Ctrl+C';
    }

    setTimeout(() => {
      btn.textContent = 'Copy code';
    }, 1500);
  });
});
