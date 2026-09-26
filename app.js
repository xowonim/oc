(async function () {
  // ---- GitHub 저장소 설정 (worlds.json은 고정 파일, characters는 자동 목록) ----
  const GITHUB_OWNER = 'xowonim';
  const GITHUB_REPO = 'oc';
  const GITHUB_BRANCH = 'main';
  const CHARACTERS_DIR = 'data/characters';

  const galleryEl = document.getElementById('gallery');
  const filterEl = document.getElementById('worldFilter');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalBody = document.getElementById('modalBody');
  const modalClose = document.getElementById('modalClose');

  let worlds = [];
  let characters = [];
  let activeWorld = 'all';

  function worldById(id) {
    return worlds.find((w) => w.id === id);
  }

  function initials(name) {
    if (!name || name === '-') return '?';
    return name.trim().charAt(0);
  }

  async function loadWorlds() {
    const res = await fetch('data/worlds.json');
    return res.json();
  }

  // data/characters 폴더 안의 .json 파일들을 GitHub API로 자동 목록화해서 불러온다.
  // "_"로 시작하는 파일(예: _template.json)은 목록에서 제외한다.
  async function loadCharacters() {
    const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CHARACTERS_DIR}?ref=${GITHUB_BRANCH}`;

    try {
      const listRes = await fetch(apiUrl, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!listRes.ok) throw new Error('GitHub API 응답 오류: ' + listRes.status);
      const entries = await listRes.json();
      if (!Array.isArray(entries)) throw new Error('폴더 목록 형식 오류');

      const jsonFiles = entries.filter(
        (e) => e.type === 'file' && e.name.endsWith('.json') && !e.name.startsWith('_')
      );

      const results = await Promise.all(
        jsonFiles.map(async (f) => {
          try {
            const raw = await fetch(f.download_url);
            return await raw.json();
          } catch (err) {
            console.warn('캐릭터 파일을 불러오지 못했어요:', f.name, err);
            return null;
          }
        })
      );

      return results.filter(Boolean);
    } catch (err) {
      console.warn('GitHub API로 캐릭터 목록을 불러오지 못했어요. 로컬 데이터로 대체합니다.', err);
      try {
        const res = await fetch('data/characters.fallback.json');
        if (!res.ok) return [];
        return await res.json();
      } catch (fallbackErr) {
        return [];
      }
    }
  }

  function renderFilters() {
    worlds.forEach((world) => {
      const btn = document.createElement('button');
      btn.className = 'filter-pill';
      btn.dataset.world = world.id;
      btn.style.setProperty('--world-color', world.color);
      btn.textContent = world.shortName || world.name;
      filterEl.appendChild(btn);
    });
  }

  function renderGallery() {
    galleryEl.innerHTML = '';

    if (characters.length === 0) {
      galleryEl.innerHTML = '<p class="empty-msg">아직 등록된 캐릭터가 없어요.</p>';
      return;
    }

    const list = characters.filter(
      (c) => activeWorld === 'all' || c.world === activeWorld
    );

    list.forEach((c) => {
      const world = worldById(c.world);
      const card = document.createElement('div');
      card.className = 'char-card';
      card.style.setProperty('--world-color', world ? world.color : '#ccc');

      if (c.image) {
        const img = document.createElement('img');
        img.className = 'char-card-image';
        img.src = c.image;
        img.alt = c.name;
        img.onerror = () => {
          img.replaceWith(buildPlaceholder(c.name));
        };
        card.appendChild(img);
      } else {
        card.appendChild(buildPlaceholder(c.name));
      }

      const info = document.createElement('div');
      info.className = 'char-card-info';
      info.innerHTML = `
        <p class="char-card-name">${c.name}</p>
        <span class="char-card-world-tag" style="background:${world ? world.color : '#999'}">${world ? world.shortName : ''}</span>
      `;
      card.appendChild(info);

      card.addEventListener('click', () => openModal(c));
      galleryEl.appendChild(card);
    });
  }

  function buildPlaceholder(name) {
    const div = document.createElement('div');
    div.className = 'char-card-placeholder';
    div.textContent = initials(name);
    return div;
  }

  function openModal(c) {
    const world = worldById(c.world);
    const worldColor = world ? world.color : '#999';

    let imageHtml = '';
    if (c.image) {
      imageHtml = `<img class="modal-image" src="${c.image}" alt="${c.name}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'modal-image-placeholder',style:'background:${worldColor}',textContent:'${initials(c.name)}'}))">`;
    } else {
      imageHtml = `<div class="modal-image-placeholder" style="background:${worldColor}">${initials(c.name)}</div>`;
    }

    const fieldDefs = world ? world.fields : [];
    const baseRows = `
      <div class="modal-field-row">
        <div class="modal-field-label">나이</div>
        <div class="modal-field-value">${c.age ?? '-'}</div>
      </div>
      <div class="modal-field-row">
        <div class="modal-field-label">소속</div>
        <div class="modal-field-value">${c.affiliation ?? '-'}</div>
      </div>
    `;

    const extraRows = fieldDefs
      .map((f) => {
        const val = (c.fields && c.fields[f.key]) ?? '-';
        return `
          <div class="modal-field-row">
            <div class="modal-field-label">${f.label}</div>
            <div class="modal-field-value">${val}</div>
          </div>
        `;
      })
      .join('');

    modalBody.innerHTML = `
      <div class="modal-image-wrap">${imageHtml}</div>
      <p class="modal-name">${c.name}</p>
      <span class="modal-world-tag" style="background:${worldColor}">${world ? world.name : ''}</span>
      <div class="modal-fields">
        ${baseRows}
        ${extraRows}
      </div>
      ${c.bio ? `<p class="modal-bio">${c.bio}</p>` : ''}
    `;

    modalOverlay.classList.add('is-open');
  }

  function closeModal() {
    modalOverlay.classList.remove('is-open');
  }

  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  filterEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-pill');
    if (!btn) return;
    activeWorld = btn.dataset.world;
    filterEl.querySelectorAll('.filter-pill').forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    renderGallery();
  });

  [worlds, characters] = await Promise.all([loadWorlds(), loadCharacters()]);

  renderFilters();
  renderGallery();
})();
