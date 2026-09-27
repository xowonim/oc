(async function () {
  // ---- GitHub 저장소 설정 ----
  const GITHUB_OWNER = 'xowonim';
  const GITHUB_REPO = 'oc';
  const GITHUB_BRANCH = 'main';
  const CHARACTERS_DIR = 'data/characters';
  const WORLDS_PATH = 'data/worlds.json';
  const ASSETS_DIR = 'assets';
  const TOKEN_KEY = 'oc_gh_token';

  // 이미지가 방금 막 저장된 직후에는 깃허브 페이지(배포된 사이트)가 다시 빌드될 때까지
  // (몇십 초~1~2분) 그 이미지 파일 자체가 아직 안 떠서, 사진이 깨진 것처럼(물음표 아이콘)
  // 보일 수 있다. 반면 raw.githubusercontent.com은 저장소에 커밋된 내용을 거의 바로
  // 그대로 보여주기 때문에, 이미지는 전부 이 주소를 통해 불러와서 그 지연을 없앤다.
  function assetUrl(path) {
    if (!path) return path;
    if (/^([a-z]+:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) return path;
    return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${path}`;
  }

  const PERSON_ICON = `
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 12c2.76 0 5-2.46 5-5.5S14.76 1 12 1 7 3.46 7 6.5 9.24 12 12 12zm0 2.5c-3.86 0-11 2-11 6v2.5h22V20.5c0-4-7.14-6-11-6z"/>
    </svg>`;

  const navListEl = document.getElementById('navList');
  const galleryEl = document.getElementById('gallery');
  const logoHomeEl = document.getElementById('logoHome');
  const settingsBtnEl = document.getElementById('settingsBtn');
  const createTopBtnEl = document.getElementById('createTopBtn');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalBody = document.getElementById('modalBody');
  const modalClose = document.getElementById('modalClose');

  let worlds = [];
  let worldsSha = null;
  let characters = [];
  let activeWorld = 'all';
  let activeSubFilter = null;
  let charactersLoadFailed = false;
  let charactersLoadError = '';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }
  function setToken(t) {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }

  function worldById(id) {
    return worlds.find((w) => w.id === id);
  }

  function nameCompare(a, b) {
    return (a.name || '').localeCompare(b.name || '', 'ko');
  }

  async function loadWorlds() {
    // 사이트에 같이 배포된 data/worlds.json 파일은 깃허브 페이지가 새로 빌드될 때까지
    // (보통 몇십 초~1~2분) 방금 저장한 내용을 못 담고 있을 수 있다. 그래서 페이지를
    // 열 때도 배포된 파일 대신 깃허브에서 지금 이 순간의 진짜 최신 내용을 바로 받아온다.
    // ("저장하고 새로고침했는데 안 바뀌어 있다가, 한 번 더 새로고침해야 바뀌어 있는" 현상이 이것 때문)
    try {
      const { data, sha } = await fetchLiveWorlds();
      worldsSha = sha;
      return data;
    } catch (err) {
      console.warn('깃허브 API로 세계관 정보를 불러오지 못했어요. 배포된 파일로 대체합니다.', err);
      const res = await fetch('data/worlds.json?t=' + Date.now());
      return res.json();
    }
  }

  async function loadCharacters() {
    const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CHARACTERS_DIR}?ref=${GITHUB_BRANCH}`;
    // 목록을 불러올 때도 토큰이 있으면 같이 보낸다. 인증 없이 GitHub API를 부르면 시간당
    // 요청 한도가 훨씬 낮아서(60회/시간), 새로고침을 자주 하면 쉽게 한도를 넘겨 "목록을
    // 못 가져오는" 상태가 되고, 그걸 아무 표시 없이 빈 목록으로 보여주고 있었다.
    const token = getToken();
    const headers = { Accept: 'application/vnd.github+json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      const listRes = await fetch(apiUrl, { headers, cache: 'no-store' });
      if (!listRes.ok) {
        const errBody = await listRes.json().catch(() => ({}));
        throw new Error(errBody.message || `GitHub API 응답 오류 (${listRes.status})`);
      }
      const entries = await listRes.json();
      if (!Array.isArray(entries)) throw new Error('폴더 목록 형식 오류');

      const jsonFiles = entries.filter(
        (e) => e.type === 'file' && e.name.endsWith('.json') && !e.name.startsWith('_')
      );

      const results = await Promise.all(
        jsonFiles.map(async (f) => {
          try {
            const raw = await fetch(f.download_url);
            const data = await raw.json();
            data._path = f.path;
            data._sha = f.sha;
            return data;
          } catch (err) {
            console.warn('캐릭터 파일을 불러오지 못했어요:', f.name, err);
            return null;
          }
        })
      );
      charactersLoadFailed = false;
      charactersLoadError = '';
      return results.filter(Boolean);
    } catch (err) {
      console.warn('GitHub API로 캐릭터 목록을 불러오지 못했어요. 로컬 데이터로 대체합니다.', err);
      charactersLoadFailed = true;
      charactersLoadError = err.message || String(err);
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
    if (!world) return [...list].sort(nameCompare);

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

  // ---- "분류(category)" 타입 항목: 사이드바 필터로 쓸지 / 갤러리 구역으로 쓸지는
  // 항목 자체에 붙은 sidebarFilter / galleryGroup 표시로 정해진다 (세계관마다 자유롭게 다르게 설정 가능).
  function sidebarCategoryField(world) {
    if (!world || !world.fields) return null;
    return world.fields.find((f) => f.type === 'category' && f.sidebarFilter) || null;
  }

  function galleryCategoryField(world) {
    if (!world || !world.fields) return null;
    return world.fields.find((f) => f.type === 'category' && f.galleryGroup) || null;
  }

  function fieldValue(c, key) {
    return c.fields ? c.fields[key] : null;
  }

  // 세계관 태그(캐릭터 이름 밑에 뜨는 알약 모양) 색상: 특정 세계관은 worlds.json에 저장된
  // world.color 대신 이 값을 우선 쓴다. 목록에 없는 세계관(OC 등)은 기존 world.color 그대로.
  const WORLD_TAG_COLOR_OVERRIDES = {
    sinsekai: '#a3ccb2',
    '神世界': '#a3ccb2',
    YMKB: '#9786aa',
  };
  function worldTagColor(world) {
    if (!world) return '#999';
    return (
      WORLD_TAG_COLOR_OVERRIDES[world.id] ||
      WORLD_TAG_COLOR_OVERRIDES[world.name] ||
      WORLD_TAG_COLOR_OVERRIDES[world.shortName] ||
      world.color
    );
  }

  // 오행 기호별 색(갤러리 카드에 배지로 표시할 때 배경/글자색)
  const ELEMENT_COLORS = {
    '木': { bg: '#3d7dd1', text: '#ffffff' },
    '火': { bg: '#d64545', text: '#ffffff' },
    '土': { bg: '#d9b400', text: '#3a2f00' },
    '金': { bg: '#c7c7c7', text: '#333333' },
    '水': { bg: '#736f64', text: '#ffffff' },
    '?': { bg: '#9a9a9a', text: '#ffffff' },
    '+': { bg: '#ffffff', text: '#333333', border: '#cccccc' },
    '-': { bg: '#111111', text: '#ffffff' },
  };

  // 갤러리 카드 오른쪽에 보여줄 항목을 라벨 이름으로 찾는다(항목 키가 세계관마다 달라도,
  // 라벨이 "소속"/"주 오행"인 항목을 그때그때 찾아서 쓰기 때문에 템플릿을 다시 만들어도 안 깨진다).
  function findFieldByLabel(world, label) {
    if (!world || !world.fields) return null;
    return world.fields.find((f) => f.label === label) || null;
  }

  function isSinsekaiWorld(world) {
    return !!world && (world.id === 'sinsekai' || world.name === '神世界');
  }

  function galleryAuxField(world) {
    if (!world) return null;
    return isSinsekaiWorld(world) ? findFieldByLabel(world, '주 오행') : findFieldByLabel(world, '소속');
  }

  // 카드 오른쪽에 보여줄 내용의 HTML을 만든다.
  // - "All" 탭(world가 null)일 때는 그 캐릭터가 속한 세계관 이름을 보여준다.
  // - 특정 세계관 탭일 때는 그 세계관의 "소속"(또는 神世界는 "주 오행") 항목 값을 보여준다.
  function cardAuxHtml(c, world) {
    if (!world) {
      const cw = worldById(c.world);
      if (!cw) return '';
      return `<span class="char-card-aux">${cw.shortName || cw.name}</span>`;
    }
    const field = galleryAuxField(world);
    if (!field) return '';
    const raw = fieldValue(c, field.key);
    if (isSinsekaiWorld(world)) {
      const symbol = Array.isArray(raw) ? raw[0] : raw;
      if (!symbol) return '';
      const style = ELEMENT_COLORS[symbol] || { bg: '#9a9a9a', text: '#ffffff' };
      const borderStyle = style.border ? `border:1px solid ${style.border};` : '';
      return `<span class="char-card-element" style="background:${style.bg};color:${style.text};${borderStyle}">${symbol}</span>`;
    }
    const values = fieldValuesAsList(raw);
    if (values.length === 0) return '';
    return `<span class="char-card-aux">${values.join(', ')}</span>`;
  }

  // 캐릭터 데이터에서 실제로 쓰이고 있는 값만 뽑아 하위 분류 목록을 만든다.
  // (미리 정해둔 목록이 아니라, 그 값을 쓰는 캐릭터가 하나라도 생겨야 나타난다)
  // 한 캐릭터가 여러 값을 동시에 가질 수도 있으므로(예: 1부~5부 내내 등장) 배열/단일값을 모두 처리한다.
  function fieldValuesAsList(v) {
    if (Array.isArray(v)) return v.filter(Boolean);
    return v ? [v] : [];
  }

  function fieldMatches(v, target) {
    return Array.isArray(v) ? v.includes(target) : v === target;
  }

  function distinctFieldValues(worldId, key) {
    const values = [];
    characters
      .filter((c) => c.world === worldId)
      .forEach((c) => fieldValuesAsList(fieldValue(c, key)).forEach((v) => values.push(v)));
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
  }

  function getFiltered() {
    let list = characters;
    if (activeWorld !== 'all') {
      list = list.filter((c) => c.world === activeWorld);
      const world = worldById(activeWorld);
      const field = sidebarCategoryField(world);
      if (activeSubFilter && field) {
        list = list.filter((c) => fieldMatches(fieldValue(c, field.key), activeSubFilter));
      }
    }
    return list;
  }

  // ---------- 사이드바 ----------
  function renderSidebar() {
    navListEl.innerHTML = '';
    const entries = [{ id: 'all', name: 'All', shortName: 'All' }, ...worlds];

    entries.forEach((entry) => {
      const item = document.createElement('div');
      item.className = 'nav-item';

      const btn = document.createElement('button');
      btn.className = 'nav-btn' + (activeWorld === entry.id ? ' is-active' : '');
      btn.textContent = entry.shortName || entry.name;
      btn.addEventListener('click', () => {
        activeWorld = entry.id;
        activeSubFilter = null;
        renderSidebar();
        renderGallery();
      });
      item.appendChild(btn);

      const subField = sidebarCategoryField(entry);
      const subSource = subField ? distinctFieldValues(entry.id, subField.key) : null;
      if (subSource && subSource.length > 0 && activeWorld === entry.id) {
        const subList = document.createElement('ul');
        subList.className = 'sub-list';

        const allSub = document.createElement('li');
        allSub.className = 'sub-item';
        const allSubBtn = document.createElement('button');
        allSubBtn.className = 'sub-item-btn' + (!activeSubFilter ? ' is-active' : '');
        allSubBtn.textContent = '전체';
        allSubBtn.addEventListener('click', () => {
          activeSubFilter = null;
          renderSidebar();
          renderGallery();
        });
        allSub.appendChild(allSubBtn);
        subList.appendChild(allSub);

        subSource.forEach((sub) => {
          const li = document.createElement('li');
          li.className = 'sub-item';
          const subBtn = document.createElement('button');
          subBtn.className = 'sub-item-btn' + (activeSubFilter === sub ? ' is-active' : '');
          subBtn.textContent = sub;
          subBtn.addEventListener('click', () => {
            activeSubFilter = sub;
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

  // ---------- 갤러리 ----------
  function renderGallery() {
    galleryEl.innerHTML = '';

    // 캐릭터 목록 자체를 못 불러온 상태라면, "아직 등록된 캐릭터가 없어요"처럼
    // 실제로 비어있는 것과 헷갈릴 수 있는 문구 대신 진짜 원인을 보여준다.
    if (charactersLoadFailed) {
      const warn = document.createElement('p');
      warn.className = 'empty-msg';
      warn.textContent = `캐릭터 목록을 불러오지 못했어요 (${charactersLoadError || '알 수 없는 오류'}). 잠시 후 새로고침해주세요.`;
      galleryEl.appendChild(warn);
      return;
    }

    const world = activeWorld === 'all' ? null : worldById(activeWorld);
    const filtered = getFiltered();
    const groupField = world ? galleryCategoryField(world) : null;

    if (world && groupField) {
      renderGroupedGallery(filtered, world, groupField);
    } else {
      renderFlatGallery(sortForWorld(filtered, world), world);
    }
  }

  function renderFlatGallery(list, world) {
    if (list.length === 0) {
      const msg = document.createElement('p');
      msg.className = 'empty-msg';
      msg.textContent = '아직 등록된 캐릭터가 없어요.';
      galleryEl.appendChild(msg);
    }
    const grid = document.createElement('div');
    grid.className = 'card-row';
    list.forEach((c) => grid.appendChild(buildCard(c, world)));
    galleryEl.appendChild(grid);
  }

  function renderGroupedGallery(list, world, groupField) {
    // 미리 정해둔 목록이 아니라, 지금 이 세계관에 실제로 존재하는 캐릭터들의
    // 값만 모아서(자모/숫자 순 정렬) 구역을 만든다.
    const known = [];
    list.forEach((c) => fieldValuesAsList(fieldValue(c, groupField.key)).forEach((v) => known.push(v)));
    const groupNames = Array.from(new Set(known)).sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));

    groupNames.forEach((groupName) => {
      const items = list.filter((c) => fieldMatches(fieldValue(c, groupField.key), groupName)).sort(nameCompare);
      const section = document.createElement('section');
      section.className = 'gallery-section';
      const header = document.createElement('h2');
      header.className = 'gallery-section-title';
      header.textContent = groupName;
      section.appendChild(header);
      const row = document.createElement('div');
      row.className = 'card-row';
      items.forEach((c) => row.appendChild(buildCard(c, world)));
      section.appendChild(row);
      galleryEl.appendChild(section);
    });

    const others = list.filter((c) => fieldValuesAsList(fieldValue(c, groupField.key)).length === 0).sort(nameCompare);
    if (others.length > 0) {
      const section = document.createElement('section');
      section.className = 'gallery-section';
      const header = document.createElement('h2');
      header.className = 'gallery-section-title';
      header.textContent = '미분류';
      section.appendChild(header);
      const row = document.createElement('div');
      row.className = 'card-row';
      others.forEach((c) => row.appendChild(buildCard(c, world)));
      section.appendChild(row);
      galleryEl.appendChild(section);
    }
  }

  // 이미지 무단 저장 방지: 우클릭(데스크탑) / 길게 누르기(아이폰·아이패드)로 저장되지 않도록 막는다.
  // (완벽히 막을 수는 없지만 - 스크린샷까지는 못 막음 - 기본적인 저장 시도는 차단된다)
  function protectImage(img) {
    img.setAttribute('draggable', 'false');
    img.classList.add('no-save-image');
    img.addEventListener('contextmenu', (e) => e.preventDefault());
    img.addEventListener('dragstart', (e) => e.preventDefault());
  }

  function buildCard(c, world) {
    const card = document.createElement('div');
    card.className = 'char-card';
    const imgWrap = document.createElement('div');
    imgWrap.className = 'char-card-image-wrap';
    if (c.image) {
      const img = document.createElement('img');
      img.className = 'char-card-image';
      img.src = assetUrl(c.image);
      img.alt = c.name;
      protectImage(img);
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
    info.innerHTML = `<span class="char-card-name">${c.name}</span>${cardAuxHtml(c, world)}`;
    card.appendChild(info);
    card.addEventListener('click', () => openModal(c));
    return card;
  }

  // ---------- 태그 표시(읽기 전용) ----------
  function renderTagPills(values) {
    if (!Array.isArray(values) || values.length === 0) return '-';
    return `<span class="pill-group">${values
      .map((v) => `<span class="pill">${v}</span>`)
      .join('')}</span>`;
  }

  // ---------- 상세 모달 ----------
  function openModal(c) {
    const world = worldById(c.world);
    const worldColor = worldTagColor(world);

    // 항목을 그녀가 정렬해둔 순서 그대로 위에서부터 배치한다(텍스트 항목 - 긴 글 - 텍스트 항목
    // 순서로 섞여 있어도 그 순서 그대로 보이도록, 짧은 항목들을 모았다가 긴 글/접은글 항목을
    // 만나면 그때까지 모은 걸 먼저 내보내고 이어서 긴 글/접은글을 넣는 식으로 처리한다).
    let pendingRows = [];
    if (world && world.useGradeClass) {
      pendingRows.push({ type: 'text', label: '학년', value: c.grade ?? '-' });
      pendingRows.push({ type: 'text', label: '학급', value: c.class ?? '-' });
    }

    // 레이팅(별점) 항목은 연속으로 나오면 한 줄에 하나씩이 아니라 2열로 묶어서 보여준다.
    // 그리고 어느 쪽이든 그 줄 블록의 "맨 마지막"에는 밑줄을 안 그어서, 바로 다음에
    // 오는 접은글/긴글 섹션의 윗줄과 겹쳐서 줄이 두 개로 보이는 문제를 없앤다.
    function rowsBlockHtml(rows) {
      if (rows.length === 0) return '';
      let html = '<div class="modal-fields">';
      let i = 0;
      while (i < rows.length) {
        if (rows[i].type === 'rating') {
          const group = [];
          while (i < rows.length && rows[i].type === 'rating') {
            group.push(rows[i]);
            i += 1;
          }
          const isGroupAtEnd = i === rows.length;
          const totalGridRows = Math.ceil(group.length / 2);
          html += '<div class="modal-rating-grid">';
          group.forEach((r, idx) => {
            const gridRowIdx = Math.floor(idx / 2);
            const noBorder = isGroupAtEnd && gridRowIdx === totalGridRows - 1;
            html += `
              <div class="modal-rating-row${noBorder ? ' no-border' : ''}">
                <div class="modal-field-label">${r.label}</div>
                <div class="modal-field-value">${r.value}</div>
              </div>
            `;
          });
          html += '</div>';
        } else {
          const isLast = i === rows.length - 1;
          html += `
            <div class="modal-field-row${isLast ? ' no-border' : ''}">
              <div class="modal-field-label">${rows[i].label}</div>
              <div class="modal-field-value">${rows[i].value}</div>
            </div>
          `;
          i += 1;
        }
      }
      html += '</div>';
      return html;
    }

    const orderedFields = world && world.fields ? world.fields.filter((f) => f.key !== 'name') : [];
    let sectionsHtml = '';
    let collapseCounter = 0;

    orderedFields.forEach((f) => {
      const raw = fieldValue(c, f.key);
      if (f.type === 'textarea') {
        sectionsHtml += rowsBlockHtml(pendingRows);
        pendingRows = [];
        if (raw) {
          sectionsHtml += `<h3 class="modal-section-title">${f.label}</h3><div class="modal-bio">${raw}</div>`;
        }
      } else if (f.type === 'collapse') {
        sectionsHtml += rowsBlockHtml(pendingRows);
        pendingRows = [];
        collapseCounter += 1;
        const cid = 'modalCollapse' + collapseCounter;
        sectionsHtml += `
          <div class="modal-collapse">
            <button type="button" class="modal-collapse-toggle" data-target="${cid}">
              <span>${f.label}</span><span class="modal-collapse-arrow">▾ 펼치기</span>
            </button>
            <div class="modal-collapse-body" id="${cid}" hidden>${raw || '-'}</div>
          </div>
        `;
      } else if (f.type === 'rating') {
        const n = Math.max(0, Math.min(5, Number(raw) || 0));
        const stars = '★'.repeat(n) + '☆'.repeat(5 - n);
        pendingRows.push({ type: 'rating', label: f.label, value: `<span class="modal-rating">${stars}</span>` });
      } else if (f.type === 'entries') {
        sectionsHtml += rowsBlockHtml(pendingRows);
        pendingRows = [];
        const list = Array.isArray(raw) ? raw : [];
        if (list.length > 0) {
          const itemsHtml = list
            .map(
              (entry) => `
                <div class="modal-entry-row">
                  <div class="modal-entry-image-wrap">
                    ${
                      entry.image
                        ? `<img src="${assetUrl(entry.image)}" class="modal-entry-image" alt="${entry.name || ''}">`
                        : `<div class="modal-entry-image-placeholder">${PERSON_ICON}</div>`
                    }
                  </div>
                  <div class="modal-entry-text">
                    <p class="modal-entry-name">${entry.name || '-'}</p>
                    ${entry.desc ? `<p class="modal-entry-desc">${entry.desc}</p>` : ''}
                  </div>
                </div>
              `
            )
            .join('');
          sectionsHtml += `<h3 class="modal-section-title">${f.label}</h3><div class="modal-entry-list">${itemsHtml}</div>`;
        }
      } else {
        const val = f.type === 'tags' || Array.isArray(raw) ? renderTagPills(raw) : raw || '-';
        pendingRows.push({ type: 'text', label: f.label, value: val });
      }
    });
    sectionsHtml += rowsBlockHtml(pendingRows);

    const profileImg = c.profileImage || c.image;

    modalBody.innerHTML = `
      <div class="modal-image-wrap" id="modalImageWrap"></div>
      <p class="modal-name">${c.name}</p>
      <span class="modal-world-tag" style="background:${worldColor}">${world ? world.name : ''}</span>
      ${sectionsHtml}
      <button class="modal-edit-btn" id="modalEditBtn">수정하기</button>
      <div class="modal-delete-row">
        <button class="modal-delete-btn" id="modalDeleteBtn">캐릭터 삭제</button>
      </div>
    `;

    modalBody.querySelectorAll('.modal-collapse-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.getAttribute('data-target'));
        const wasHidden = target.hasAttribute('hidden');
        if (wasHidden) target.removeAttribute('hidden');
        else target.setAttribute('hidden', '');
        const arrow = btn.querySelector('.modal-collapse-arrow');
        if (arrow) arrow.textContent = wasHidden ? '▴ 접기' : '▾ 펼치기';
      });
    });

    modalBody.querySelectorAll('.modal-entry-image').forEach((img) => protectImage(img));

    const imageWrap = document.getElementById('modalImageWrap');
    if (profileImg) {
      const img = document.createElement('img');
      img.className = 'modal-image';
      img.src = assetUrl(profileImg);
      img.alt = c.name;
      protectImage(img);
      img.onerror = () => {
        imageWrap.innerHTML = `<div class="modal-image-placeholder">${PERSON_ICON}</div>`;
      };
      imageWrap.appendChild(img);
    } else {
      imageWrap.innerHTML = `<div class="modal-image-placeholder">${PERSON_ICON}</div>`;
    }

    const groupField = world ? galleryCategoryField(world) : null;
    document.getElementById('modalEditBtn').addEventListener('click', () => {
      closeModal();
      openEditForm(c, world, groupField ? fieldValue(c, groupField.key) : null);
    });
    document.getElementById('modalDeleteBtn').addEventListener('click', () => {
      deleteCharacter(c);
    });

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
    if (e.key === 'Escape') {
      closeModal();
      closeFormModal();
      closeSettingsModal();
    }
  });

  logoHomeEl.addEventListener('click', () => {
    activeWorld = 'all';
    activeSubFilter = null;
    renderSidebar();
    renderGallery();
  });

  // ---------- 생성/수정 폼 ----------
  const formOverlay = document.getElementById('formOverlay');
  const formBody = document.getElementById('formBody');
  const formClose = document.getElementById('formClose');

  function closeFormModal() {
    formOverlay.classList.remove('is-open');
  }
  formClose.addEventListener('click', closeFormModal);
  formOverlay.addEventListener('click', (e) => {
    if (e.target === formOverlay) closeFormModal();
  });

  // 태그 입력 위젯: container 안에 렌더링하고 현재 값 배열을 반환하는 getValues()를 붙인다.
  function mountTagInput(container, initialTags) {
    let tags = Array.isArray(initialTags) ? [...initialTags] : [];

    const wrap = document.createElement('div');
    wrap.className = 'tag-input-wrap';

    function redraw() {
      wrap.innerHTML = '';
      tags.forEach((t, idx) => {
        const chip = document.createElement('span');
        chip.className = 'tag-chip';
        chip.innerHTML = `${t} <button type="button" class="tag-chip-remove">×</button>`;
        chip.querySelector('.tag-chip-remove').addEventListener('click', () => {
          tags.splice(idx, 1);
          redraw();
        });
        wrap.appendChild(chip);
      });
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'tag-input-box';
      input.placeholder = '입력 후 Enter';
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          const v = input.value.trim();
          if (v) {
            tags.push(v);
            input.value = '';
            redraw();
          }
        }
      });
      wrap.appendChild(input);
    }

    redraw();
    container.appendChild(wrap);
    return { getValues: () => tags };
  }

  // 별점 입력 위젯: 0~5점, 별을 클릭해서 점수를 정한다(같은 별을 다시 누르면 0점으로 초기화).
  function mountRatingInput(container, initialValue) {
    let value = Math.max(0, Math.min(5, Number(initialValue) || 0));
    const wrap = document.createElement('div');
    wrap.className = 'rating-input-wrap';

    function redraw() {
      wrap.innerHTML = '';
      for (let i = 1; i <= 5; i++) {
        const star = document.createElement('button');
        star.type = 'button';
        star.className = 'rating-star-btn';
        star.textContent = i <= value ? '★' : '☆';
        star.addEventListener('click', () => {
          value = value === i ? 0 : i;
          redraw();
        });
        wrap.appendChild(star);
      }
    }

    redraw();
    container.appendChild(wrap);
    return { getValue: () => value };
  }

  // "엔트리 목록" 입력 위젯: 이미지 + 이름 + 간단한 설명을 한 세트로 하는 항목을 여러 개
  // 추가/삭제할 수 있다(예: 포켓몬 기반 캐릭터의 파티원 목록). 이미지 파일은 저장(submitForm)
  // 시점에 업로드되므로, 여기서는 아직 업로드 안 된 파일을 entry.id별로 따로 들고 있는다.
  function mountEntryListInput(container, initialEntries) {
    let entries = Array.isArray(initialEntries) ? initialEntries.map((e) => ({ ...e })) : [];
    const pendingFiles = {};

    const listWrap = document.createElement('div');
    listWrap.className = 'entry-list-wrap';

    function newEntryId() {
      return 'en_' + Date.now() + Math.random().toString(36).slice(2, 6);
    }

    function redraw() {
      listWrap.innerHTML = '';
      entries.forEach((entry, idx) => {
        const row = document.createElement('div');
        row.className = 'entry-row';

        const imgLabel = document.createElement('label');
        imgLabel.className = 'entry-image-wrap';
        const previewSrc = pendingFiles[entry.id] ? URL.createObjectURL(pendingFiles[entry.id]) : assetUrl(entry.image);
        if (previewSrc) {
          imgLabel.innerHTML = `<img src="${previewSrc}" class="entry-image-preview" alt="">`;
        } else {
          imgLabel.innerHTML = `<span class="entry-image-placeholder">사진</span>`;
        }
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.className = 'entry-image-input';
        fileInput.addEventListener('change', () => {
          const file = fileInput.files[0];
          if (file) {
            pendingFiles[entry.id] = file;
            redraw();
          }
        });
        imgLabel.appendChild(fileInput);
        row.appendChild(imgLabel);

        const textCol = document.createElement('div');
        textCol.className = 'entry-text-col';
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'form-input entry-name-input';
        nameInput.placeholder = '이름(예: 포켓몬 이름)';
        nameInput.value = entry.name || '';
        nameInput.addEventListener('input', () => {
          entry.name = nameInput.value;
        });
        const descInput = document.createElement('textarea');
        descInput.className = 'form-input entry-desc-input';
        descInput.placeholder = '간략한 설명';
        descInput.value = entry.desc || '';
        descInput.addEventListener('input', () => {
          entry.desc = descInput.value;
        });
        textCol.appendChild(nameInput);
        textCol.appendChild(descInput);
        row.appendChild(textCol);

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'entry-del-btn';
        delBtn.textContent = '삭제';
        delBtn.addEventListener('click', () => {
          entries.splice(idx, 1);
          delete pendingFiles[entry.id];
          redraw();
        });
        row.appendChild(delBtn);

        listWrap.appendChild(row);
      });

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'entry-add-btn';
      addBtn.textContent = '+ 엔트리 추가';
      addBtn.addEventListener('click', () => {
        entries.push({ id: newEntryId(), name: '', desc: '', image: null });
        redraw();
      });
      listWrap.appendChild(addBtn);
    }

    redraw();
    container.appendChild(listWrap);
    return {
      getEntries: () => entries,
      getPendingFiles: () => pendingFiles,
    };
  }

  // 굵게/기울임/밑줄 서식을 쓸 수 있는 입력 위젯(긴 글, 접은 글 항목에 사용).
  // contenteditable div를 입력창으로 쓰고, 값은 innerHTML(HTML 형식의 서식 있는 텍스트)로 주고받는다.
  function mountRichText(container, key, initialHtml) {
    const wrap = document.createElement('div');
    wrap.className = 'richtext-wrap';

    const toolbar = document.createElement('div');
    toolbar.className = 'richtext-toolbar';
    toolbar.innerHTML = `
      <button type="button" class="richtext-btn" data-cmd="bold" title="굵게"><b>B</b></button>
      <button type="button" class="richtext-btn" data-cmd="italic" title="기울임"><i>I</i></button>
      <button type="button" class="richtext-btn" data-cmd="underline" title="밑줄"><u>U</u></button>
    `;

    const editable = document.createElement('div');
    editable.className = 'richtext-editable';
    editable.contentEditable = 'true';
    editable.setAttribute('data-field-key', key);
    editable.setAttribute('data-placeholder', '내용을 입력해주세요');
    editable.innerHTML = initialHtml || '';

    // Cmd(맥/아이패드) 또는 Ctrl(윈도우) + B/I/U 단축키로도 서식이 바로 적용되게 한다.
    editable.addEventListener('keydown', (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'b') { e.preventDefault(); document.execCommand('bold'); }
      else if (k === 'i') { e.preventDefault(); document.execCommand('italic'); }
      else if (k === 'u') { e.preventDefault(); document.execCommand('underline'); }
    });

    toolbar.querySelectorAll('.richtext-btn').forEach((btn) => {
      // mousedown에서 기본 동작을 막아야 클릭해도 편집 중이던 선택 영역이 풀리지 않는다.
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => {
        editable.focus();
        document.execCommand(btn.getAttribute('data-cmd'));
      });
    });

    wrap.appendChild(toolbar);
    wrap.appendChild(editable);
    container.appendChild(wrap);
  }

  // ---------- 이미지 확대/자르기 모달 ----------
  const cropOverlayEl = document.getElementById('cropOverlay');
  const cropImageEl = document.getElementById('cropImage');
  const cropCloseEl = document.getElementById('cropClose');
  let activeCropper = null;

  function closeCropModal() {
    cropOverlayEl.classList.remove('is-open');
    if (activeCropper) {
      activeCropper.destroy();
      activeCropper = null;
    }
  }
  cropCloseEl.addEventListener('click', closeCropModal);
  cropOverlayEl.addEventListener('click', (e) => {
    if (e.target === cropOverlayEl) closeCropModal();
  });

  // 버튼에 리스너를 계속 새로 붙이면(이미지 슬롯 두 개, 여러 번 열기) 예전 리스너가 쌓이므로,
  // 버튼을 복제해서 바꿔치기하는 방식으로 매번 깨끗하게 새 리스너만 남긴다.
  function freshButton(id) {
    const el = document.getElementById(id);
    const clone = el.cloneNode(true);
    el.parentNode.replaceChild(clone, el);
    return clone;
  }

  // file: 사용자가 고른 원본 이미지 파일. onApply(blob): "적용" 눌렀을 때 잘라낸 결과(jpeg blob)를 받는 콜백.
  function openCropModal(file, onApply) {
    const reader = new FileReader();
    reader.onload = () => {
      cropOverlayEl.classList.add('is-open');
      cropImageEl.onload = () => {
        if (activeCropper) {
          activeCropper.destroy();
          activeCropper = null;
        }
        activeCropper = new Cropper(cropImageEl, {
          viewMode: 1,
          autoCropArea: 1,
          background: false,
          responsive: true,
        });
      };
      cropImageEl.src = reader.result;
    };
    reader.readAsDataURL(file);

    const applyBtn = freshButton('cropApply');
    const skipBtn = freshButton('cropSkip');
    const zoomInBtn = freshButton('cropZoomIn');
    const zoomOutBtn = freshButton('cropZoomOut');
    const rotateBtn = freshButton('cropRotate');
    const resetBtn = freshButton('cropReset');

    zoomInBtn.addEventListener('click', () => activeCropper && activeCropper.zoom(0.1));
    zoomOutBtn.addEventListener('click', () => activeCropper && activeCropper.zoom(-0.1));
    rotateBtn.addEventListener('click', () => activeCropper && activeCropper.rotate(90));
    resetBtn.addEventListener('click', () => activeCropper && activeCropper.reset());

    applyBtn.addEventListener('click', () => {
      if (!activeCropper) return;
      activeCropper.getCroppedCanvas({ imageSmoothingQuality: 'high' }).toBlob(
        (blob) => {
          onApply(blob);
          closeCropModal();
        },
        'image/jpeg',
        0.92
      );
    });

    skipBtn.addEventListener('click', () => {
      closeCropModal();
    });
  }

  // 이미지 파일 입력창에 파일을 고르면 곧바로 자르기 모달을 띄운다. "적용"을 누르면
  // 잘라낸 결과가 pendingCroppedFiles[slotKey]에 저장되고, 저장 시 원본 파일 대신 이걸 쓴다.
  // "자르지 않고 원본 그대로"를 누르면 아무 것도 저장하지 않고, 원본 파일 입력값이 그대로 쓰인다.
  function wireImageCropInput(inputEl, slotKey) {
    inputEl.addEventListener('change', () => {
      const file = inputEl.files[0];
      delete pendingCroppedFiles[slotKey];
      if (!file) return;
      // 자르기 도구(cdnjs)를 못 불러온 상태라면(네트워크 문제 등) 자르기 단계 없이
      // 원본 파일을 그대로 쓴다 — 저장 자체가 막히면 안 되니까.
      if (typeof Cropper === 'undefined') return;
      openCropModal(file, (blob) => {
        pendingCroppedFiles[slotKey] = { blob, ext: 'jpg' };
      });
    });
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.substring(reader.result.indexOf(',') + 1));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function escapeAttr(str) {
    return String(str == null ? '' : str).replace(/"/g, '&quot;');
  }

  let currentFieldWidgets = {};
  // 이미지 자르기 모달에서 만들어진 결과(잘라낸 blob)를 여기에 담아둔다.
  // { image: {blob, ext}, profileImage: {blob, ext} } 형태. 자르지 않고 원본 그대로
  // 쓰기로 하면 여기에 값이 안 채워지고, 그럴 때는 파일 입력창의 원본 파일을 그대로 쓴다.
  let pendingCroppedFiles = {};

  function renderDynamicSection(w, existing, presetSubcategory) {
    const container = document.getElementById('dynamicFieldsContainer');
    container.innerHTML = '';
    currentFieldWidgets = {};

    if (w.useGradeClass) {
      const gradeLabel = document.createElement('label');
      gradeLabel.className = 'form-label';
      gradeLabel.innerHTML = `학년
        <input type="number" class="form-input" id="fGrade" value="${existing && existing.grade != null ? existing.grade : ''}">`;
      container.appendChild(gradeLabel);

      const classLabel = document.createElement('label');
      classLabel.className = 'form-label';
      classLabel.innerHTML = `학급
        <input type="text" class="form-input" id="fClass" value="${escapeAttr(existing && existing.class != null ? existing.class : '')}">`;
      container.appendChild(classLabel);
    }

    // ---- 모든 항목(이름 포함)을 하나의 목록으로 관리: 추가·삭제·이름 변경 ----
    const fieldMgr = document.createElement('div');
    fieldMgr.className = 'field-manager';

    (w.fields || []).forEach((f, idx, arr) => {
      const row = document.createElement('div');
      row.className = 'field-manager-row';

      const moveWrap = document.createElement('div');
      moveWrap.className = 'field-manager-move';
      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'field-manager-move-btn';
      upBtn.textContent = '▲';
      upBtn.disabled = idx === 0;
      upBtn.addEventListener('click', () => moveFieldInWorld(w, f.key, -1));
      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'field-manager-move-btn';
      downBtn.textContent = '▼';
      downBtn.disabled = idx === arr.length - 1;
      downBtn.addEventListener('click', () => moveFieldInWorld(w, f.key, 1));
      moveWrap.appendChild(upBtn);
      moveWrap.appendChild(downBtn);
      row.appendChild(moveWrap);

      // 참고: 이 한 줄(row) 안에는 "항목 이름 바꾸기" 입력창과 "실제 값" 입력창이 같이 들어있는데,
      // 이걸 <label> 태그로 감싸면 값 칸(특히 서식 있는 글 편집창)을 눌러도 브라우저가 클릭을
      // 첫 번째 입력창(이름 바꾸기 칸) 쪽으로 넘겨버려서 값 칸에 타이핑이 안 먹는 문제가 있었다.
      // 그래서 <label> 대신 그냥 <div>로 감싼다(스타일은 동일하게 유지됨).
      const label = document.createElement('div');
      label.className = 'form-label field-manager-label';
      const rawVal = f.key === 'name'
        ? (existing ? existing.name : '')
        : f.type === 'category'
          ? (existing ? fieldValue(existing, f.key) : presetSubcategory)
          : existing && existing.fields ? existing.fields[f.key] : null;

      const labelEditRow = document.createElement('div');
      labelEditRow.className = 'field-manager-label-edit-row';
      const labelInput = document.createElement('input');
      labelInput.type = 'text';
      labelInput.className = 'field-manager-label-edit';
      labelInput.value = f.label;
      labelInput.addEventListener('change', () => {
        const v = labelInput.value.trim();
        if (v) renameFieldInWorld(w, f.key, v);
        else labelInput.value = f.label;
      });
      labelEditRow.appendChild(labelInput);
      if (f.type === 'tags') {
        const tagBadge = document.createElement('span');
        tagBadge.className = 'field-type-tag';
        tagBadge.textContent = '태그';
        labelEditRow.appendChild(tagBadge);
      } else if (f.type === 'category') {
        const catBadge = document.createElement('span');
        catBadge.className = 'field-type-tag';
        catBadge.textContent = '분류';
        labelEditRow.appendChild(catBadge);
      } else if (f.type === 'textarea') {
        const taBadge = document.createElement('span');
        taBadge.className = 'field-type-tag';
        taBadge.textContent = '긴 글';
        labelEditRow.appendChild(taBadge);
      } else if (f.type === 'collapse') {
        const clBadge = document.createElement('span');
        clBadge.className = 'field-type-tag';
        clBadge.textContent = '접은 글';
        labelEditRow.appendChild(clBadge);
      } else if (f.type === 'rating') {
        const rtBadge = document.createElement('span');
        rtBadge.className = 'field-type-tag';
        rtBadge.textContent = '레이팅';
        labelEditRow.appendChild(rtBadge);
      } else if (f.type === 'entries') {
        const enBadge = document.createElement('span');
        enBadge.className = 'field-type-tag';
        enBadge.textContent = '엔트리';
        labelEditRow.appendChild(enBadge);
      }
      label.appendChild(labelEditRow);

      if (f.type === 'tags') {
        const tagContainer = document.createElement('div');
        label.appendChild(tagContainer);
        currentFieldWidgets[f.key] = mountTagInput(tagContainer, rawVal);
      } else if (f.type === 'textarea' || f.type === 'collapse') {
        mountRichText(label, f.key, rawVal);
      } else if (f.type === 'rating') {
        const ratingContainer = document.createElement('div');
        label.appendChild(ratingContainer);
        currentFieldWidgets[f.key] = mountRatingInput(ratingContainer, rawVal);
      } else if (f.type === 'entries') {
        const entryContainer = document.createElement('div');
        label.appendChild(entryContainer);
        currentFieldWidgets[f.key] = mountEntryListInput(entryContainer, Array.isArray(rawVal) ? rawVal : []);
      } else if (f.type === 'category' && f.multi) {
        const tagContainer = document.createElement('div');
        label.appendChild(tagContainer);
        const initial = Array.isArray(rawVal) ? rawVal : rawVal ? [rawVal] : [];
        currentFieldWidgets[f.key] = mountTagInput(tagContainer, initial);

        const roleRow = document.createElement('div');
        roleRow.className = 'field-category-roles';
        const sideChk = document.createElement('label');
        sideChk.className = 'field-category-role-chk';
        sideChk.innerHTML = `<input type="checkbox" ${f.sidebarFilter ? 'checked' : ''}> 사이드바 필터로 쓰기`;
        sideChk.querySelector('input').addEventListener('change', (e) => toggleFieldRole(w, f.key, 'sidebarFilter', e.target.checked));
        const galChk = document.createElement('label');
        galChk.className = 'field-category-role-chk';
        galChk.innerHTML = `<input type="checkbox" ${f.galleryGroup ? 'checked' : ''}> 갤러리 구역으로 묶기`;
        galChk.querySelector('input').addEventListener('change', (e) => toggleFieldRole(w, f.key, 'galleryGroup', e.target.checked));
        const multiChk = document.createElement('label');
        multiChk.className = 'field-category-role-chk';
        multiChk.innerHTML = `<input type="checkbox" checked> 여러 개 선택 가능 (예: 1부~5부에 걸쳐 등장)`;
        multiChk.querySelector('input').addEventListener('change', (e) => toggleFieldRole(w, f.key, 'multi', e.target.checked));
        roleRow.appendChild(sideChk);
        roleRow.appendChild(galChk);
        roleRow.appendChild(multiChk);
        label.appendChild(roleRow);
      } else if (f.type === 'category') {
        const datalistId = 'dl_' + f.key;
        const suggestions = distinctFieldValues(w.id, f.key);
        const valInput = document.createElement('input');
        valInput.type = 'text';
        valInput.className = 'form-input';
        valInput.setAttribute('data-field-key', f.key);
        valInput.setAttribute('list', datalistId);
        valInput.placeholder = '자유롭게 입력 (예: 1부, 오토리 일행 등)';
        valInput.value = rawVal || '';
        label.appendChild(valInput);
        const datalist = document.createElement('datalist');
        datalist.id = datalistId;
        datalist.innerHTML = suggestions.map((v) => `<option value="${escapeAttr(v)}">`).join('');
        label.appendChild(datalist);

        const roleRow = document.createElement('div');
        roleRow.className = 'field-category-roles';
        const sideChk = document.createElement('label');
        sideChk.className = 'field-category-role-chk';
        sideChk.innerHTML = `<input type="checkbox" ${f.sidebarFilter ? 'checked' : ''}> 사이드바 필터로 쓰기`;
        sideChk.querySelector('input').addEventListener('change', (e) => toggleFieldRole(w, f.key, 'sidebarFilter', e.target.checked));
        const galChk = document.createElement('label');
        galChk.className = 'field-category-role-chk';
        galChk.innerHTML = `<input type="checkbox" ${f.galleryGroup ? 'checked' : ''}> 갤러리 구역으로 묶기`;
        galChk.querySelector('input').addEventListener('change', (e) => toggleFieldRole(w, f.key, 'galleryGroup', e.target.checked));
        const multiChk = document.createElement('label');
        multiChk.className = 'field-category-role-chk';
        multiChk.innerHTML = `<input type="checkbox"> 여러 개 선택 가능 (예: 1부~5부에 걸쳐 등장)`;
        multiChk.querySelector('input').addEventListener('change', (e) => toggleFieldRole(w, f.key, 'multi', e.target.checked));
        roleRow.appendChild(sideChk);
        roleRow.appendChild(galChk);
        roleRow.appendChild(multiChk);
        label.appendChild(roleRow);
      } else {
        const valInput = document.createElement('input');
        valInput.type = 'text';
        valInput.className = 'form-input';
        valInput.setAttribute('data-field-key', f.key);
        valInput.value = rawVal || '';
        label.appendChild(valInput);
      }
      row.appendChild(label);

      if (f.core) {
        const badge = document.createElement('span');
        badge.className = 'field-manager-core-badge';
        badge.textContent = '필수 항목';
        row.appendChild(badge);
      } else {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'field-manager-del';
        delBtn.textContent = '항목 삭제';
        delBtn.addEventListener('click', () => removeFieldFromWorld(w, f.key));
        row.appendChild(delBtn);
      }

      fieldMgr.appendChild(row);
    });

    const addRow = document.createElement('div');
    addRow.className = 'field-manager-add';
    addRow.innerHTML = `
      <input type="text" class="form-input" id="newFieldLabel" placeholder="새 항목 이름 (예: 취미)">
      <select class="form-input" id="newFieldType">
        <option value="text">텍스트 입력</option>
        <option value="tags">태그 입력</option>
        <option value="textarea">긴 글(소개·성격 등)</option>
        <option value="collapse">접은 글(눌러야 펼쳐짐)</option>
        <option value="rating">레이팅(별점)</option>
        <option value="entries">엔트리 목록(이미지+이름+설명)</option>
        <option value="category">분류(사이드바·갤러리 구역)</option>
      </select>
      <button type="button" class="field-manager-add-btn" id="newFieldBtn">+ 항목 추가</button>
    `;
    fieldMgr.appendChild(addRow);

    container.appendChild(fieldMgr);

    document.getElementById('newFieldBtn').addEventListener('click', () => {
      const labelVal = document.getElementById('newFieldLabel').value.trim();
      const typeVal = document.getElementById('newFieldType').value;
      if (!labelVal) return;
      addFieldToWorld(w, labelVal, typeVal);
    });
  }

  // 다른 탭/다른 기기에서 이 사이트를 동시에 열어놓고 있을 수 있으므로, worlds.json은
  // 절대 "내가 기억하는 예전 버전 전체"를 그대로 덮어쓰지 않는다. 대신 저장할 때마다
  // 깃허브에 실제로 올라가 있는 최신 내용을 다시 받아와서, 그 위에 "이번에 하려던 변경 하나"만
  // 다시 적용한 다음 저장한다. 이러면 다른 곳에서 그 사이에 만들어둔 변경이 있어도
  // 서로 덮어쓰지 않고 같이 남는다.
  async function fetchLiveWorlds() {
    // cache: 'no-store'가 중요하다 — 브라우저가 이 GET 응답을 잠깐이라도 캐시해버리면,
    // "최신 sha를 다시 받아서 재시도"를 해도 실제로는 캐시된 옛날 sha를 또 받아오게 되고,
    // 그러면 재시도를 몇 번을 해도 계속 같은 "does not match" 충돌이 반복된다.
    const token = getToken();
    const headers = { Accept: 'application/vnd.github+json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${WORLDS_PATH}?ref=${GITHUB_BRANCH}`,
      { headers, cache: 'no-store' }
    );
    if (!res.ok) throw new Error(`세계관 파일을 불러오지 못했어요 (${res.status})`);
    const data = await res.json();
    const decoded = b64DecodeUnicode(data.content);
    return { data: JSON.parse(decoded), sha: data.sha };
  }

  // mutateFn(freshWorlds)는 방금 깃허브에서 받아온 "가장 최신" worlds 배열을 직접 바꾸는
  // 함수다. 저장이 sha 충돌로 실패하면, 최신 내용을 다시 받아서 mutateFn을 한 번 더
  // 적용해보는 식으로 최대 다섯 번까지 재시도한다(재시도 사이에 짧게 무작위 지연을 둬서
  // 다른 탭/기기와 동시에 계속 부딪히는 걸 줄인다).
  async function applyWorldsChange(mutateFn) {
    const token = getToken();
    if (!token) {
      window.alert('세계관/항목 구조를 저장하려면 먼저 "⚙ 저장 설정"에서 토큰을 등록해주세요.');
      return false;
    }
    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const { data: freshWorlds, sha } = await fetchLiveWorlds();
        mutateFn(freshWorlds);
        const content = b64EncodeUnicode(JSON.stringify(freshWorlds, null, 2));
        const result = await githubPutFile(WORLDS_PATH, content, 'Update worlds.json (field template)', sha);
        worlds = freshWorlds;
        worldsSha = result.content ? result.content.sha : undefined;
        return true;
      } catch (err) {
        const isConflict = /sha|does not match|expected/i.test(err.message || '');
        if (!isConflict || attempt === maxAttempts - 1) {
          console.error(err);
          window.alert('세계관 저장에 실패했어요: ' + err.message);
          return false;
        }
        await new Promise((r) => setTimeout(r, 150 + Math.random() * 250));
        // 충돌이면 루프를 다시 돌면서 최신 내용을 받아 다시 시도한다.
      }
    }
    return false;
  }

  // 항목을 빠르게 여러 번 연달아 바꾸면(체크박스 연속 클릭 등) 저장 요청이 동시에 여러 번
  // 실행될 수 있으므로, 한 번에 하나씩 순서대로만 실행되도록 줄을 세운다.
  let worldsSaveQueue = Promise.resolve(true);
  function saveWorldsWithMutation(mutateFn) {
    const run = worldsSaveQueue.then(() => applyWorldsChange(mutateFn));
    worldsSaveQueue = run.catch(() => false);
    return run;
  }

  // 항목을 추가/삭제/순서변경 하면서 다시 그릴 때, 이미 폼에 입력해둔 값을 잃지 않도록
  // 현재 화면에 있는 값을 먼저 스냅샷으로 떠 둔다.
  function snapshotFormValues(world) {
    const nameInput = document.querySelector('[data-field-key="name"]');
    const snap = { name: nameInput ? nameInput.value : '', fields: {} };
    if (world.useGradeClass) {
      const g = document.getElementById('fGrade');
      const c = document.getElementById('fClass');
      snap.grade = g && g.value !== '' ? Number(g.value) : null;
      snap.class = c ? c.value : null;
    }
    (world.fields || []).forEach((f) => {
      if (f.key === 'name') return;
      if (f.type === 'tags' || (f.type === 'category' && f.multi)) {
        snap.fields[f.key] = currentFieldWidgets[f.key] ? currentFieldWidgets[f.key].getValues() : [];
      } else if (f.type === 'rating') {
        snap.fields[f.key] = currentFieldWidgets[f.key] ? currentFieldWidgets[f.key].getValue() : 0;
      } else if (f.type === 'entries') {
        // 참고: 엔트리 안에서 새로 고른(아직 저장 안 된) 이미지 파일은 스냅샷에 담을 수 없어서
        // 항목을 추가/삭제하는 등 폼이 다시 그려지면 그 이미지 선택은 다시 해야 한다
        // (캐릭터 이미지(1)/(2) 칸도 원래 같은 제약이 있다).
        snap.fields[f.key] = currentFieldWidgets[f.key] ? currentFieldWidgets[f.key].getEntries() : [];
      } else if (f.type === 'textarea' || f.type === 'collapse') {
        const rt = document.querySelector(`.richtext-editable[data-field-key="${f.key}"]`);
        snap.fields[f.key] = rt ? rt.innerHTML : '';
      } else {
        const inp = document.querySelector(`[data-field-key="${f.key}"]`);
        snap.fields[f.key] = inp ? inp.value : '';
      }
    });
    return snap;
  }

  async function addFieldToWorld(world, label, type) {
    const snap = snapshotFormValues(world);
    const key = 'f_' + Date.now();
    const ok = await saveWorldsWithMutation((freshWorlds) => {
      const w = freshWorlds.find((x) => x.id === world.id);
      if (w) {
        w.fields = w.fields || [];
        w.fields.push({ key, label, type });
      }
    });
    const freshWorld = worldById(world.id) || world;
    if (ok) renderDynamicSection(freshWorld, snap, null);
  }

  async function removeFieldFromWorld(world, key) {
    if (!window.confirm('이 항목을 삭제할까요? (기존 캐릭터의 값은 남아있지만 화면에 더 이상 보이지 않아요)')) return;
    const snap = snapshotFormValues(world);
    const ok = await saveWorldsWithMutation((freshWorlds) => {
      const w = freshWorlds.find((x) => x.id === world.id);
      if (w) w.fields = (w.fields || []).filter((f) => f.key !== key);
    });
    const freshWorld = worldById(world.id) || world;
    if (ok) renderDynamicSection(freshWorld, snap, null);
  }

  async function moveFieldInWorld(world, key, direction) {
    const snap = snapshotFormValues(world);
    const ok = await saveWorldsWithMutation((freshWorlds) => {
      const w = freshWorlds.find((x) => x.id === world.id);
      if (!w) return;
      const arr = w.fields || [];
      const idx = arr.findIndex((f) => f.key === key);
      const newIdx = idx + direction;
      if (idx === -1 || newIdx < 0 || newIdx >= arr.length) return;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    });
    if (ok) {
      const freshWorld = worldById(world.id) || world;
      renderDynamicSection(freshWorld, snap, null);
    }
  }

  async function renameFieldInWorld(world, key, newLabel) {
    const f = (world.fields || []).find((f) => f.key === key);
    if (!f || f.label === newLabel) return;
    const prevLabel = f.label;
    const ok = await saveWorldsWithMutation((freshWorlds) => {
      const w = freshWorlds.find((x) => x.id === world.id);
      const target = w && (w.fields || []).find((ff) => ff.key === key);
      if (target) target.label = newLabel;
    });
    if (!ok) {
      // 저장 실패: 입력창을 원래 라벨로 되돌린다
      document.querySelectorAll('.field-manager-label-edit').forEach((inp) => {
        if (inp.value === newLabel) inp.value = prevLabel;
      });
    }
  }

  async function toggleFieldRole(world, key, roleKey, checked) {
    // 실패하든, multi(여러 개 선택) 전환처럼 입력 위젯 자체가 바뀌든, 다시 그려야 할 수 있으니
    // 미리 지금 폼에 입력해둔 값을 스냅샷해둔다.
    const snap = snapshotFormValues(world);
    const ok = await saveWorldsWithMutation((freshWorlds) => {
      const w = freshWorlds.find((x) => x.id === world.id);
      const f = w && (w.fields || []).find((ff) => ff.key === key);
      if (f) f[roleKey] = checked;
    });
    const freshWorld = worldById(world.id) || world;
    if (!ok || roleKey === 'multi') {
      renderDynamicSection(freshWorld, snap, null);
    }
  }

  // ---- 템플릿(세계관) 자체 생성/삭제 ----
  function slugify() {
    return 'w_' + Date.now();
  }

  async function addTemplate() {
    const name = window.prompt('새 템플릿(세계관) 이름을 입력해주세요.');
    if (!name || !name.trim()) return;
    const newWorld = {
      id: slugify(),
      name: name.trim(),
      shortName: name.trim(),
      description: '',
      color: '#9a9a9a',
      fields: [{ key: 'name', label: '이름', type: 'text', core: true }],
    };
    const ok = await saveWorldsWithMutation((freshWorlds) => {
      freshWorlds.push(newWorld);
    });
    if (!ok) return;
    renderSidebar();
    return worldById(newWorld.id);
  }

  async function renameTemplate(world) {
    const newName = window.prompt('템플릿 이름을 바꿔주세요.', world.name);
    if (!newName || !newName.trim() || newName.trim() === world.name) return null;
    const trimmed = newName.trim();
    const ok = await saveWorldsWithMutation((freshWorlds) => {
      const w = freshWorlds.find((x) => x.id === world.id);
      if (w) {
        w.name = trimmed;
        w.shortName = trimmed;
      }
    });
    if (!ok) return null;
    renderSidebar();
    return worldById(world.id);
  }

  async function removeTemplate(world) {
    if (worlds.length <= 1) {
      window.alert('템플릿이 하나뿐이라 삭제할 수 없어요.');
      return null;
    }
    if (!window.confirm(`"${world.name}" 템플릿을 삭제할까요? (이 템플릿으로 만든 기존 캐릭터의 데이터는 남지만, 화면에서 이 템플릿 자체는 사라져요)`)) {
      return null;
    }
    const ok = await saveWorldsWithMutation((freshWorlds) => {
      const idx = freshWorlds.findIndex((w) => w.id === world.id);
      if (idx !== -1) freshWorlds.splice(idx, 1);
    });
    if (!ok) return null;
    if (activeWorld === world.id) {
      activeWorld = 'all';
      activeSubFilter = null;
      renderGallery();
    }
    renderSidebar();
    return worlds[0];
  }

  function openEditForm(existing, world, presetSubcategory) {
    const isEdit = !!existing;
    const w = world || (existing ? worldById(existing.world) : worlds[0]);

    formBody.innerHTML = `
      <h2 class="form-title">${isEdit ? '캐릭터 수정' : '캐릭터 생성'}</h2>

      <div class="image-area">
        <div class="template-select-row">
          <select class="template-select" id="fWorld">
            ${worlds.map((wo) => `<option value="${wo.id}" ${wo.id === w.id ? 'selected' : ''}>${wo.name}</option>`).join('')}
          </select>
          <button type="button" class="template-mini-btn" id="templateAddBtn">+ 새 템플릿</button>
          <button type="button" class="template-mini-btn" id="templateRenameBtn">이름 변경</button>
          <button type="button" class="template-mini-btn danger" id="templateDelBtn">템플릿 삭제</button>
        </div>
        <div class="image-slot-row">
          <label class="form-label">이미지 삽입(1) — 갤러리 카드용
            <input type="file" accept="image/*" class="form-input" id="fImage">
          </label>
          <label class="form-label">이미지 삽입(2) — 상세 프로필용
            <input type="file" accept="image/*" class="form-input" id="fProfileImage">
          </label>
        </div>
        ${isEdit && existing.image ? `<p class="form-hint">현재 이미지(1): ${existing.image}</p>` : ''}
        ${isEdit && existing.profileImage ? `<p class="form-hint">현재 이미지(2): ${existing.profileImage}</p>` : ''}
      </div>

      <div id="dynamicFieldsContainer"></div>

      <p class="form-error" id="formError"></p>
      <button class="form-submit" id="formSubmit">${isEdit ? '저장하기' : '만들기'}</button>
      <p class="form-hint">
        토큰이 없거나 저장이 안 되면
        <a href="#" id="formFallbackLink">깃허브에서 직접 만들기</a>로 대신하세요.
      </p>
    `;

    renderDynamicSection(w, existing, presetSubcategory);

    pendingCroppedFiles = {};
    wireImageCropInput(document.getElementById('fImage'), 'image');
    wireImageCropInput(document.getElementById('fProfileImage'), 'profileImage');

    let selectedWorldId = w.id;

    function refreshWorldSelect(selectId) {
      const sel = document.getElementById('fWorld');
      sel.innerHTML = worlds.map((wo) => `<option value="${wo.id}" ${wo.id === selectId ? 'selected' : ''}>${wo.name}</option>`).join('');
    }

    function switchToWorld(newWorld) {
      selectedWorldId = newWorld.id;
      refreshWorldSelect(newWorld.id);
      renderDynamicSection(newWorld, isEdit ? existing : null, null);
    }

    document.getElementById('fWorld').addEventListener('change', (e) => {
      selectedWorldId = e.target.value;
      switchToWorld(worldById(selectedWorldId));
    });

    document.getElementById('templateAddBtn').addEventListener('click', async () => {
      const newWorld = await addTemplate();
      if (newWorld) switchToWorld(newWorld);
    });

    document.getElementById('templateDelBtn').addEventListener('click', async () => {
      const current = worldById(selectedWorldId);
      const fallback = await removeTemplate(current);
      if (fallback) switchToWorld(fallback);
    });

    document.getElementById('templateRenameBtn').addEventListener('click', async () => {
      const current = worldById(selectedWorldId);
      const renamed = await renameTemplate(current);
      if (renamed) switchToWorld(renamed);
    });

    document.getElementById('formFallbackLink').addEventListener('click', (e) => {
      e.preventDefault();
      window.open(buildGithubNewFileUrl(worldById(selectedWorldId), presetSubcategory, isEdit ? existing : null), '_blank');
    });

    document.getElementById('formSubmit').addEventListener('click', () => {
      submitForm(isEdit, existing, worldById(selectedWorldId));
    });

    formOverlay.classList.add('is-open');
  }

  function buildGithubNewFileUrl(world, presetSubcategory, existing) {
    const obj = existing ? { ...existing } : { id: 'character-id', world: world.id, name: '캐릭터 이름', image: null };
    delete obj._path;
    delete obj._sha;
    if (world.useGradeClass) {
      obj.grade = obj.grade ?? null;
      obj.class = obj.class ?? null;
    }
    obj.fields = obj.fields || {};
    (world.fields || [])
      .filter((f) => f.key !== 'name')
      .forEach((f) => {
        if (obj.fields[f.key] !== undefined) return;
        if (f.type === 'tags' || (f.type === 'category' && f.multi)) {
          obj.fields[f.key] = presetSubcategory ? [presetSubcategory] : [];
        } else if (f.type === 'category') obj.fields[f.key] = presetSubcategory || '';
        else if (f.type === 'rating') obj.fields[f.key] = 0;
        else if (f.type === 'entries') obj.fields[f.key] = [];
        else if (f.type === 'textarea' || f.type === 'collapse') obj.fields[f.key] = '';
        else obj.fields[f.key] = '-';
      });

    const path = existing ? existing._path : `${CHARACTERS_DIR}/새캐릭터.json`;
    const value = JSON.stringify(obj, null, 2);
    return existing
      ? `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/edit/${GITHUB_BRANCH}/${path}`
      : `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/new/${GITHUB_BRANCH}?filename=${encodeURIComponent(path)}&value=${encodeURIComponent(value)}`;
  }

  function b64EncodeUnicode(str) {
    return btoa(String.fromCharCode(...new TextEncoder().encode(str)));
  }

  function b64DecodeUnicode(str) {
    return new TextDecoder().decode(Uint8Array.from(atob(str.replace(/\n/g, '')), (c) => c.charCodeAt(0)));
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.substring(reader.result.indexOf(',') + 1));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // 해당 경로에 이미 파일이 있으면 그 sha를 가져온다(깃허브는 기존 파일을 덮어쓸 때 sha가 꼭 필요함).
  // 없으면(새 파일이면) undefined를 반환한다.
  async function getFileSha(path) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}?ref=${GITHUB_BRANCH}`,
        { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' }
      );
      if (res.ok) {
        const data = await res.json();
        return data.sha;
      }
    } catch (err) {
      // 조회 실패는 "새 파일"로 간주하고 넘어간다.
    }
    return undefined;
  }

  async function githubPutFile(path, base64Content, message, sha) {
    const token = getToken();
    if (!token) throw new Error('NO_TOKEN');
    const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      body: JSON.stringify({ message, content: base64Content, branch: GITHUB_BRANCH, ...(sha ? { sha } : {}) }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.message || `GitHub 저장 실패 (${res.status})`);
    }
    return res.json();
  }

  async function githubDeleteFile(path, message) {
    const token = getToken();
    if (!token) throw new Error('NO_TOKEN');
    const sha = await getFileSha(path);
    if (!sha) return; // 이미 없는 파일이면 조용히 넘어간다.
    const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      body: JSON.stringify({ message, sha, branch: GITHUB_BRANCH }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.message || `GitHub 삭제 실패 (${res.status})`);
    }
    return res.json();
  }

  async function deleteCharacter(c) {
    if (!window.confirm(`"${c.name}" 캐릭터를 정말 삭제할까요?\n이 작업은 되돌릴 수 없어요.`)) return;

    if (!getToken()) {
      const t = window.prompt(
        '삭제하려면 먼저 깃허브 개인 토큰(Contents: Read and write 권한)을 붙여넣어주세요.'
      );
      if (!t) return;
      setToken(t.trim());
    }

    try {
      await githubDeleteFile(c._path, `Delete character: ${c.name}`);
      // 이미지 파일도 함께 정리한다(실패해도 캐릭터 삭제 자체는 이미 끝난 상태라 무시하고 진행).
      if (c.image) {
        try { await githubDeleteFile(c.image, `Delete image for ${c.name}`); } catch (e) { console.warn(e); }
      }
      if (c.profileImage) {
        try { await githubDeleteFile(c.profileImage, `Delete profile image for ${c.name}`); } catch (e) { console.warn(e); }
      }
      characters = characters.filter((x) => x._path !== c._path);
      closeModal();
      renderSidebar();
      renderGallery();
    } catch (err) {
      console.error(err);
      window.alert('삭제에 실패했어요: ' + err.message);
    }
  }

  async function submitForm(isEdit, existing, world) {
    const errorEl = document.getElementById('formError');
    errorEl.textContent = '';

    const nameInput = document.querySelector('[data-field-key="name"]');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) {
      errorEl.textContent = '이름을 입력해주세요.';
      return;
    }
    if (!getToken()) {
      const t = window.prompt(
        '깃허브 저장을 위한 개인 토큰(fine-grained PAT, Contents: Read and write 권한)을 붙여넣어주세요.\n한 번 저장하면 이 기기에서는 다시 묻지 않아요.'
      );
      if (!t) {
        errorEl.textContent = '토큰이 없으면 저장할 수 없어요. 아래 "깃허브에서 직접 만들기"를 이용해주세요.';
        return;
      }
      setToken(t.trim());
    }

    const obj = {
      id: isEdit ? existing.id : `char-${Date.now()}`,
      world: world.id,
      name,
      image: isEdit ? existing.image || null : null,
      profileImage: isEdit ? existing.profileImage || null : null,
    };

    if (world.useGradeClass) {
      const gradeVal = document.getElementById('fGrade').value;
      obj.grade = gradeVal === '' ? null : Number(gradeVal);
      obj.class = document.getElementById('fClass').value.trim() || null;
    }

    obj.fields = {};
    (world.fields || []).forEach((f) => {
      if (f.key === 'name') return; // 이름은 obj.name(최상위)에 이미 저장됨
      if (f.type === 'tags' || (f.type === 'category' && f.multi)) {
        obj.fields[f.key] = currentFieldWidgets[f.key] ? currentFieldWidgets[f.key].getValues() : [];
      } else if (f.type === 'rating') {
        obj.fields[f.key] = currentFieldWidgets[f.key] ? currentFieldWidgets[f.key].getValue() : 0;
      } else if (f.type === 'entries') {
        const list = currentFieldWidgets[f.key] ? currentFieldWidgets[f.key].getEntries() : [];
        obj.fields[f.key] = list.map((e) => ({ id: e.id, name: e.name || '', desc: e.desc || '', image: e.image || null }));
      } else if (f.type === 'textarea' || f.type === 'collapse') {
        const rt = document.querySelector(`.richtext-editable[data-field-key="${f.key}"]`);
        obj.fields[f.key] = rt ? rt.innerHTML.trim() : '';
      } else if (f.type === 'category') {
        const input = document.querySelector(`[data-field-key="${f.key}"]`);
        obj.fields[f.key] = input ? input.value.trim() : '';
      } else {
        const input = document.querySelector(`[data-field-key="${f.key}"]`);
        obj.fields[f.key] = input ? input.value.trim() || '-' : '-';
      }
    });

    const submitBtn = document.getElementById('formSubmit');
    submitBtn.disabled = true;
    submitBtn.textContent = '저장 중...';

    try {
      const imageFile = document.getElementById('fImage').files[0];
      const croppedImage = pendingCroppedFiles.image;
      if (croppedImage || imageFile) {
        const ext = croppedImage ? croppedImage.ext : imageFile.name.split('.').pop();
        const imagePath = `${ASSETS_DIR}/${obj.id}.${ext}`;
        const base64 = croppedImage ? await blobToBase64(croppedImage.blob) : await fileToBase64(imageFile);
        const existingImageSha = await getFileSha(imagePath);
        await githubPutFile(imagePath, base64, `Add image for ${name}`, existingImageSha);
        obj.image = imagePath;
      }
      const profileImageFile = document.getElementById('fProfileImage').files[0];
      const croppedProfileImage = pendingCroppedFiles.profileImage;
      if (croppedProfileImage || profileImageFile) {
        const ext = croppedProfileImage ? croppedProfileImage.ext : profileImageFile.name.split('.').pop();
        const imagePath = `${ASSETS_DIR}/${obj.id}-profile.${ext}`;
        const base64 = croppedProfileImage
          ? await blobToBase64(croppedProfileImage.blob)
          : await fileToBase64(profileImageFile);
        const existingProfileSha = await getFileSha(imagePath);
        await githubPutFile(imagePath, base64, `Add profile image for ${name}`, existingProfileSha);
        obj.profileImage = imagePath;
      }

      // 엔트리 목록 항목들 안에 새로 고른 이미지가 있으면 각각 업로드하고, 그 경로를
      // 해당 엔트리의 image 값으로 채워 넣는다.
      for (const f of world.fields || []) {
        if (f.type !== 'entries') continue;
        const widget = currentFieldWidgets[f.key];
        if (!widget) continue;
        const pending = widget.getPendingFiles();
        const list = obj.fields[f.key] || [];
        for (const entry of list) {
          const file = pending[entry.id];
          if (!file) continue;
          const ext = file.name.split('.').pop() || 'png';
          const entryImagePath = `${ASSETS_DIR}/${obj.id}-${f.key}-${entry.id}.${ext}`;
          const base64 = await fileToBase64(file);
          const existingEntrySha = await getFileSha(entryImagePath);
          await githubPutFile(entryImagePath, base64, `Add entry image for ${name}`, existingEntrySha);
          entry.image = entryImagePath;
        }
      }

      const path = isEdit ? existing._path : `${CHARACTERS_DIR}/${obj.id}.json`;
      const content = b64EncodeUnicode(JSON.stringify(obj, null, 2));
      const result = await githubPutFile(
        path, content,
        isEdit ? `Update character: ${name}` : `Add character: ${name}`,
        isEdit ? existing._sha : undefined
      );

      obj._path = path;
      obj._sha = result.content ? result.content.sha : undefined;

      if (isEdit) {
        const idx = characters.findIndex((c) => c._path === existing._path);
        if (idx !== -1) characters[idx] = obj;
      } else {
        characters.push(obj);
      }

      closeFormModal();
      renderSidebar();
      renderGallery();
    } catch (err) {
      console.error(err);
      errorEl.textContent = err.message === 'NO_TOKEN'
        ? '토큰이 없어서 저장할 수 없어요.'
        : '저장에 실패했어요: ' + err.message + ' (토큰 권한을 확인해주세요)';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? '저장하기' : '만들기';
    }
  }

  // ---------- 설정(토큰) 모달 ----------
  const settingsOverlay = document.getElementById('settingsOverlay');
  const settingsBody = document.getElementById('settingsBody');
  const settingsClose = document.getElementById('settingsClose');

  function closeSettingsModal() {
    settingsOverlay.classList.remove('is-open');
  }
  settingsClose.addEventListener('click', closeSettingsModal);
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) closeSettingsModal();
  });

  settingsBtnEl.addEventListener('click', () => {
    settingsBody.innerHTML = `
      <h2 class="form-title">깃허브 저장 설정</h2>
      <p class="form-hint">
        "+ 캐릭터 생성"으로 사이트에서 바로 저장하려면 깃허브 개인 토큰이 필요해요.<br>
        <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">여기서 새 토큰 발급</a> →
        Repository access를 이 저장소(${GITHUB_OWNER}/${GITHUB_REPO})로 지정 →
        Permissions에서 <b>Contents: Read and write</b> 선택 → 생성 후 아래에 붙여넣기.
      </p>
      <label class="form-label">개인 토큰
        <input type="password" class="form-input" id="tokenInput" value="${escapeAttr(getToken())}">
      </label>
      <p class="form-error" id="settingsError"></p>
      <button class="form-submit" id="tokenSave">저장</button>
      <button class="form-submit form-submit-secondary" id="tokenClear">토큰 삭제</button>
    `;
    document.getElementById('tokenSave').addEventListener('click', () => {
      const v = document.getElementById('tokenInput').value.trim();
      if (!v) {
        document.getElementById('settingsError').textContent = '토큰을 입력해주세요.';
        return;
      }
      setToken(v);
      closeSettingsModal();
    });
    document.getElementById('tokenClear').addEventListener('click', () => {
      setToken('');
      closeSettingsModal();
    });
    settingsOverlay.classList.add('is-open');
  });

  createTopBtnEl.addEventListener('click', () => {
    const world = activeWorld === 'all' ? worlds[0] : worldById(activeWorld);
    const preset = activeSubFilter || null;
    openEditForm(null, world, preset);
  });

  [worlds, characters] = await Promise.all([loadWorlds(), loadCharacters()]);

  renderSidebar();
  renderGallery();
})();
