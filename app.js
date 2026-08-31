const quests = [
  { id: 'quickdraw', icon: '⚡', name: 'Quickdraw', tag: 'Fast response', detail: 'Open and close an issue or pull request within five minutes—use a real housekeeping task.' },
  { id: 'pull-shark', icon: '🦈', name: 'Pull Shark', tag: 'Collaboration', detail: 'Open pull requests that get merged. Keep each PR focused, reviewed, and useful.' },
  { id: 'pair', icon: '👥', name: 'Pair Extraordinaire', tag: 'Pairing', detail: 'Co-author commits with a real collaborator and credit both contributors.' },
  { id: 'galaxy-brain', icon: '🧠', name: 'Galaxy Brain', tag: 'Community', detail: 'Give helpful answers in GitHub Discussions that maintainers mark as accepted.' },
  { id: 'starstruck', icon: '⭐', name: 'Starstruck', tag: 'Impact', detail: 'Build a public repository useful enough that the community chooses to star it.' },
  { id: 'public-sponsor', icon: '💖', name: 'Public Sponsor', tag: 'Support', detail: 'Publicly sponsor open-source work you genuinely value through GitHub Sponsors.' }
];

const storageKey = 'achievement-quest-progress-v1';
const saved = new Set(JSON.parse(localStorage.getItem(storageKey) || '[]'));
const grid = document.querySelector('#questGrid');

function render() {
  grid.innerHTML = quests.map(({ id, icon, name, tag, detail }) => `
    <article class="card ${saved.has(id) ? 'done' : ''}">
      <header><span class="icon" aria-hidden="true">${icon}</span><span class="tag">${tag}</span></header>
      <h2>${name}</h2>
      <p>${detail}</p>
      <label class="check"><input type="checkbox" data-id="${id}" ${saved.has(id) ? 'checked' : ''}> Quest complete</label>
    </article>`).join('');

  const count = saved.size;
  document.querySelector('#doneCount').textContent = count;
  document.querySelector('#progressPercent').textContent = `${Math.round(count / quests.length * 100)}%`;
}

grid.addEventListener('change', event => {
  const id = event.target.dataset.id;
  if (!id) return;
  event.target.checked ? saved.add(id) : saved.delete(id);
  localStorage.setItem(storageKey, JSON.stringify([...saved]));
  render();
});

document.querySelector('#resetButton').addEventListener('click', () => {
  saved.clear();
  localStorage.removeItem(storageKey);
  render();
});

render();
