(async function () {
  // ---- GitHub 저장소 설정 ----
  const GITHUB_OWNER = 'xowonim';
  const GITHUB_REPO = 'oc';
  const GITHUB_BRANCH = 'main';
  const CHARACTERS_DIR = 'data/characters';

  const PERSON_ICON = `
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 12c2.76 0 5-2.46 5-5.5S14.76 1 12 1 7 3.46 7 6.5 9.24 12 12 12zm0 2.5c-3.86 0-11 2-11 6v2.5h22V20.5c0-4-7.14-6-11-6z"/>
    </svg>`;

  const navListEl = document.getElementById('navList');
  const galleryEl = document.getElementById('gallery');
  const logoHomeEl = document.getElementById('logoHome');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalBody = document.getElementById('modalBody');
  const modalClose = document.getElementById('modalClose');

  let worlds = [];
  let characters = [];
  let activeWorld = 'all';
  let activeSubcategory = null;

  function worldById(id) {
    return worlds.find((w) => w.id === id);
  }

  function nameCompare(a, b) {
    return (a.name || '').localeCompare(b.name || '', 'ko');
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

  // ---------- 정렬 ----------
  function sortForWorld(list, world) {
    if (!world) {
      return [...list].sort(nameCompare);
    }

    if (world.fixedOrderList) {
      const order = world.fixedOrderList;
      return [...list].sort((a, b) => {
        const ia = order.indexOf(a.name);
        const ib = order.indexOf(b.name);
        const sa = ia === -1 ? Infinity : ia;
        const sb = ib === -1 ? Infinity : ib;
        if (sa !== sb) return sa - sb;
        return nameCompare(a, b);
      });
    }

    if (world.subcategories) {
      return [...list].sort((a, b) => {
        const ia = world.subcategories.indexOf(a.subcategory);
        const ib = world.subcategories.indexOf(b.subcategory);
        const sa = ia === -1 ? Infinity : ia;
        const sb = ib === -1 ? Infinity : ib;
        if (sa !== sb) return sa - sb;
        if (world.useGradeClass) {
          const gc = gradeClassCompare(a, b);
          if (gc !== 0) return gc;
        }
        return nameCompare(a, b);
      });
    }

    if (world.useGradeClass) {
      return [...list].sort((a, b) => {
        const gc = gradeClassCompare(a, b);
        if (gc !== 0) return gc;
        return nameCompare(a, b);
      });
    }

    return [...list].sort(nameCompare);
  }

  function gradeClassCompare(a, b) {
    const ga = a.grade == null ? Infinity : a.grade;
    const gb = b.grade == null ? Infinity : b.grade;
    if (ga !== gb) return ga - gb;
    const ca = a.class == null ? '' : String(a.class);
    const cb = b.class == null ? '' : String(b.class);
    return ca.localeCompare(cb, 'ko');
  }

  function getFilteredSorted() {
    let list = characters;

    if (activeWorld !== 'all') {
      list = list.filter((c) => c.world === activeWorld);
      if (activeSubcategory) {
        list = list.filter((c) => c.subcategory === activeSubcategory);
      }
    }

    const world = activeWorld === 'all' ? null : worldById(activeWorld);
    return sortForWorld(list, world);
  }

  // ---------- 사이드바 렌더링 ----------
  function renderSidebar() {
    navListEl.innerHTML = '';

    const entries = [{ id: 'all', name: 'All', shortName: 'All' }, ...worlds];

    entries.forEach((entry) => {
      const item = document.createElement('div');
      item.className = 'nav-item';

      const btn = document.createElement('button');
      btn.className = 'nav-btn' + (activeWorld === entry.id ? ' is-active' : '');
      btn.textContent = entry.shortName || entry.name;
      if (entry.color) btn.style.setProperty('--nav-color', entry.color);
      btn.addEventListener('click', () => {
        activeWorld = entry.id;
        activeSubcategory = null;
        renderSidebar();
        renderGallery();
      });
      item.appendChild(btn);

      if (entry.subcategories && activeWorld === entry.id) {
        const subList = document.createElement('ul');
        subList.className = 'sub-list';

        const allSub = document.createElement('li');
        allSub.className = 'sub-item';
        const allSubBtn = document.createElement('button');
        allSubBtn.className = 'sub-item-btn' + (!activeSubcategory ? ' is-active' : '');
        allSubBtn.textContent = '전체';
        allSubBtn.addEventListener('click', () => {
          activeSubcategory = null;
          renderSidebar();
          renderGallery();
        });
        allSub.appendChild(allSubBtn);
        subList.appendChild(allSub);

        entry.subcategories.forEach((sub) => {
          const li = document.createElement('li');
          li.className = 'sub-item';
          const subBtn = document.createElement('button');
          subBtn.className = 'sub-item-btn' + (activeSubcategory === sub ? ' is-active' : '');
          subBtn.textContent = sub;
          subBtn.addEventListener('click', () => {
            activeSubcategory = sub;
            renderSidebar();
            renderGallery();
          });
          li.appendChild(subBtn);
          subList.appendChild(li);
        });

        item.appendChild(subList);
      }

      navListEl.appendChild(item);
    });
  }

  // ---------- 갤러리 렌더링 ----------
  function renderGallery() {
    galleryEl.innerHTML = '';
    const list = getFilteredSorted();

    if (list.length === 0) {
      galleryEl.innerHTML = '<p class="empty-msg">아직 등록된 캐릭터가 없어요.</p>';
      galleryEl.appendChild(buildAddCard());
      return;
    }

    list.forEach((c) => {
      const world = worldById(c.world);
      const card = document.createElement('div');
      card.className = 'char-card';

      const imgWrap = document.createElement('div');
      imgWrap.className = 'char-card-image-wrap';
      if (c.image) {
        const img = document.createElement('img');
        img.className = 'char-card-image';
        img.src = c.image;
        img.alt = c.name;
        img.onerror = () => {
          imgWrap.innerHTML = PERSON_ICON;
          imgWrap.querySelector('svg').classList.add('char-card-placeholder-icon');
        };
        imgWrap.appendChild(img);
      } else {
        imgWrap.innerHTML = PERSON_ICON;
        imgWrap.querySelector('svg').classList.add('char-card-placeholder-icon');
      }
      card.appendChild(imgWrap);

      const info = document.createElement('div');
      info.className = 'char-card-info';
      info.innerHTML = `<p class="char-card-name">${c.name}</p>`;
      card.appendChild(info);

      card.addEventListener('click', () => openModal(c));
      galleryEl.appendChild(card);
    });

    galleryEl.appendChild(buildAddCard());
  }

  // 현재 보고 있는 세계관/카테고리에 맞춰 GitHub "새 파일 만들기" 페이지로 바로 연결되는 타일
  function buildAddCard() {
    const world = activeWorld === 'all' ? null : worldById(activeWorld);
    const template = buildTemplateJson(world);
    const filename = `${CHARACTERS_DIR}/새캐릭터.json`;
    const url =
      `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/new/${GITHUB_BRANCH}` +
      `?filename=${encodeURIComponent(filename)}` +
      `&value=${encodeURIComponent(template)}`;

    const a = document.createElement('a');
    a.className = 'add-card';
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.innerHTML = `<span class="add-card-plus">+</span><span>캐릭터 생성</span>`;
    return a;
  }

  function buildTemplateJson(world) {
    const obj = {
      id: 'character-id',
      world: world ? world.id : 'sinsekai',
      name: '캐릭터 이름',
      age: 0,
      affiliation: '소속',
      image: null,
    };
    if (world && world.subcategories) {
      obj.subcategory = activeSubcategory || world.subcategories[0];
    }
    if (world && world.useGradeClass) {
      obj.grade = null;
      obj.class = null;
    }
    if (world && world.fields) {
      obj.fields = {};
      world.fields.forEach((f) => {
        obj.fields[f.key] = '-';
      });
    }
    obj.bio = '캐릭터 소개';
    return JSON.stringify(obj, null, 2);
  }

  // ---------- 모달 ----------
  function openModal(c) {
    const world = worldById(c.world);
    const worldColor = world ? world.color : '#999';

    const rows = [];
    rows.push(['나이', c.age ?? '-']);
    rows.push(['소속', c.affiliation ?? '-']);
    if (c.subcategory) rows.push(['세부 분류', c.subcategory]);
    if (world && world.useGradeClass) {
      rows.push(['학년', c.grade ?? '-']);
      rows.push(['학급', c.class ?? '-']);
    }
    if (world && world.fields) {
      world.fields.forEach((f) => {
        const val = (c.fields && c.fields[f.key]) ?? '-';
        rows.push([f.label, val]);
      });
    }

    const rowsHtml = rows
      .map(
        ([label, value]) => `
          <div class="modal-field-row">
            <div class="modal-field-label">${label}</div>
            <div class="modal-field-value">${value}</div>
          </div>
        `
      )
      .join('');

    modalBody.innerHTML = `
      <div class="modal-image-wrap" id="modalImageWrap"></div>
      <p class="modal-name">${c.name}</p>
      <span class="modal-world-tag" style="background:${worldColor}">${world ? world.name : ''}</span>
      <div class="modal-fields">${rowsHtml}</div>
      ${c.bio ? `<p class="modal-bio">${c.bio}</p>` : ''}
    `;

    const imageWrap = document.getElementById('modalImageWrap');
    if (c.image) {
      const img = document.createElement('img');
      img.className = 'modal-image';
      img.src = c.image;
      img.alt = c.name;
      img.onerror = () => {
        imageWrap.innerHTML = `<div class="modal-image-placeholder">${PERSON_ICON}</div>`;
      };
      imageWrap.appendChild(img);
    } else {
      imageWrap.innerHTML = `<div class="modal-image-placeholder">${PERSON_ICON}</div>`;
    }

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

  logoHomeEl.addEventListener('click', () => {
    activeWorld = 'all';
    activeSubcategory = null;
    renderSidebar();
    renderGallery();
  });

  [worlds, characters] = await Promise.all([loadWorlds(), loadCharacters()]);

  renderSidebar();
  renderGallery();
})();
