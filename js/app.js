(async function () {
  // ---- GitHub 저장소 설정 ----
  const GITHUB_OWNER = 'xowonim';
  const GITHUB_REPO = 'oc';
  const GITHUB_BRANCH = 'main';
  const CHARACTERS_DIR = 'data/characters';
  const WORLDS_PATH = 'data/worlds.json';
  const ASSETS_DIR = 'assets';
  const TOKEN_KEY = 'oc_gh_token';

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
    const res = await fetch('data/worlds.json?t=' + Date.now());
    return res.json();
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
      const listRes = await fetch(apiUrl, { headers });
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
    list.forEach((c) => grid.appendChild(buildCard(c)));
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
      items.forEach((c) => row.appendChild(buildCard(c)));
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
      others.forEach((c) => row.appendChild(buildCard(c)));
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

  function buildCard(c) {
    const card = document.createElement('div');
    card.className = 'char-card';
    const imgWrap = document.createElement('div');
    imgWrap.className = 'char-card-image-wrap';
    if (c.image) {
      const img = document.createElement('img');
      img.className = 'char-card-image';
      img.src = c.image;
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
    info.innerHTML = `<p class="char-card-name">${c.name}</p>`;
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
    const worldColor = world ? world.color : '#999';

    const rows = [];
    if (world && world.useGradeClass) {
      rows.push(['학년', c.grade ?? '-']);
      rows.push(['학급', c.class ?? '-']);
    }

    const shortFields = world && world.fields ? world.fields.filter((f) => f.key !== 'name' && f.type !== 'textarea') : [];
    shortFields.forEach((f) => {
      const raw = fieldValue(c, f.key);
      const val = f.type === 'tags' || Array.isArray(raw) ? renderTagPills(raw) : raw || '-';
      rows.push([f.label, val]);
    });

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

    const longFields = world && world.fields ? world.fields.filter((f) => f.type === 'textarea') : [];
    const extraSections = longFields
      .map((f) => [f.label, fieldValue(c, f.key)])
      .filter(([, v]) => v)
      .map(([label, v]) => `<h3 class="modal-section-title">${label}</h3><p class="modal-bio">${v}</p>`)
      .join('');

    const profileImg = c.profileImage || c.image;

    modalBody.innerHTML = `
      <div class="modal-image-wrap" id="modalImageWrap"></div>
      <p class="modal-name">${c.name}</p>
      <span class="modal-world-tag" style="background:${worldColor}">${world ? world.name : ''}</span>
      <div class="modal-fields">${rowsHtml}</div>
      ${extraSections}
      <button class="modal-edit-btn" id="modalEditBtn">수정하기</button>
      <div class="modal-delete-row">
        <button class="modal-delete-btn" id="modalDeleteBtn">캐릭터 삭제</button>
      </div>
    `;

    const imageWrap = document.getElementById('modalImageWrap');
    if (profileImg) {
      const img = document.createElement('img');
      img.className = 'modal-image';
      img.src = profileImg;
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

  function escapeAttr(str) {
    return String(str == null ? '' : str).replace(/"/g, '&quot;');
  }

  let currentFieldWidgets = {};

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

      const label = document.createElement('label');
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
      }
      label.appendChild(labelEditRow);

      if (f.type === 'tags') {
        const tagContainer = document.createElement('div');
        label.appendChild(tagContainer);
        currentFieldWidgets[f.key] = mountTagInput(tagContainer, rawVal);
      } else if (f.type === 'textarea') {
        const ta = document.createElement('textarea');
        ta.className = 'form-input form-textarea';
        ta.setAttribute('data-field-key', f.key);
        ta.value = rawVal || '';
        label.appendChild(ta);
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
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${WORLDS_PATH}?ref=${GITHUB_BRANCH}`,
      { headers: { Accept: 'application/vnd.github+json' } }
    );
    if (!res.ok) throw new Error(`세계관 파일을 불러오지 못했어요 (${res.status})`);
    const data = await res.json();
    const decoded = b64DecodeUnicode(data.content);
    return { data: JSON.parse(decoded), sha: data.sha };
  }

  // mutateFn(freshWorlds)는 방금 깃허브에서 받아온 "가장 최신" worlds 배열을 직접 바꾸는
  // 함수다. 저장이 sha 충돌로 실패하면, 최신 내용을 다시 받아서 mutateFn을 한 번 더
  // 적용해보는 식으로 최대 세 번까지 재시도한다.
  async function applyWorldsChange(mutateFn) {
    const token = getToken();
    if (!token) {
      window.alert('세계관/항목 구조를 저장하려면 먼저 "⚙ 저장 설정"에서 토큰을 등록해주세요.');
      return false;
    }
    for (let attempt = 0; attempt < 3; attempt++) {
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
        if (!isConflict || attempt === 2) {
          console.error(err);
          window.alert('세계관 저장에 실패했어요: ' + err.message);
          return false;
        }
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
      } else if (f.type === 'textarea') {
        const ta = document.querySelector(`textarea[data-field-key="${f.key}"]`);
        snap.fields[f.key] = ta ? ta.value : '';
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
        else if (f.type === 'textarea') obj.fields[f.key] = '';
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
        { headers: { Accept: 'application/vnd.github+json' } }
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
      } else if (f.type === 'textarea') {
        const ta = document.querySelector(`textarea[data-field-key="${f.key}"]`);
        obj.fields[f.key] = ta ? ta.value.trim() : '';
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
      if (imageFile) {
        const ext = imageFile.name.split('.').pop();
        const imagePath = `${ASSETS_DIR}/${obj.id}.${ext}`;
        const base64 = await fileToBase64(imageFile);
        const existingImageSha = await getFileSha(imagePath);
        await githubPutFile(imagePath, base64, `Add image for ${name}`, existingImageSha);
        obj.image = imagePath;
      }
      const profileImageFile = document.getElementById('fProfileImage').files[0];
      if (profileImageFile) {
        const ext = profileImageFile.name.split('.').pop();
        const imagePath = `${ASSETS_DIR}/${obj.id}-profile.${ext}`;
        const base64 = await fileToBase64(profileImageFile);
        const existingProfileSha = await getFileSha(imagePath);
        await githubPutFile(imagePath, base64, `Add profile image for ${name}`, existingProfileSha);
        obj.profileImage = imagePath;
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
