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
  const modalOverlay = document.getElementById('modalOverlay');
  const modalBody = document.getElementById('modalBody');
  const modalClose = document.getElementById('modalClose');

  let worlds = [];
  let worldsSha = null;
  let characters = [];
  let activeWorld = 'all';
  let activeSubFilter = null;

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
    const res = await fetch('data/worlds.json');
    return res.json();
  }

  async function loadCharacters() {
    const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CHARACTERS_DIR}?ref=${GITHUB_BRANCH}`;
    try {
      const listRes = await fetch(apiUrl, { headers: { Accept: 'application/vnd.github+json' } });
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

  function subFilterField(world) {
    if (!world) return null;
    if (world.parts) return 'part';
    if (world.subcategories) return 'subcategory';
    return null;
  }

  function getFiltered() {
    let list = characters;
    if (activeWorld !== 'all') {
      list = list.filter((c) => c.world === activeWorld);
      const world = worldById(activeWorld);
      const field = subFilterField(world);
      if (activeSubFilter && field) {
        list = list.filter((c) => c[field] === activeSubFilter);
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

      const subSource = entry.parts || entry.subcategories;
      if (subSource && activeWorld === entry.id) {
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
    const world = activeWorld === 'all' ? null : worldById(activeWorld);
    const filtered = getFiltered();

    if (world && world.groupInGallery) {
      renderGroupedGallery(filtered, world);
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
    grid.appendChild(buildAddCard(world, null));
    galleryEl.appendChild(grid);
  }

  function renderGroupedGallery(list, world) {
    world.subcategories.forEach((subName) => {
      const items = list.filter((c) => c.subcategory === subName).sort(nameCompare);
      const section = document.createElement('section');
      section.className = 'gallery-section';
      const header = document.createElement('h2');
      header.className = 'gallery-section-title';
      header.textContent = subName;
      section.appendChild(header);
      const row = document.createElement('div');
      row.className = 'card-row';
      items.forEach((c) => row.appendChild(buildCard(c)));
      row.appendChild(buildAddCard(world, subName));
      section.appendChild(row);
      galleryEl.appendChild(section);
    });

    const known = new Set(world.subcategories);
    const others = list.filter((c) => !known.has(c.subcategory)).sort(nameCompare);
    if (others.length > 0) {
      const section = document.createElement('section');
      section.className = 'gallery-section';
      const header = document.createElement('h2');
      header.className = 'gallery-section-title';
      header.textContent = '기타';
      section.appendChild(header);
      const row = document.createElement('div');
      row.className = 'card-row';
      others.forEach((c) => row.appendChild(buildCard(c)));
      section.appendChild(row);
      galleryEl.appendChild(section);
    }
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

  function buildAddCard(world, presetSubcategory) {
    const a = document.createElement('div');
    a.className = 'add-card';
    a.innerHTML = `<span class="add-card-plus">+</span><span>캐릭터 생성</span>`;
    a.addEventListener('click', () => openEditForm(null, world, presetSubcategory));
    return a;
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
    rows.push(['나이', c.age ?? '-']);
    rows.push(['소속', c.affiliation ?? '-']);
    if (world && world.parts && c.part) rows.push(['분류', c.part]);
    if (c.subcategory) rows.push(['세부 분류', c.subcategory]);
    if (world && world.useGradeClass) {
      rows.push(['학년', c.grade ?? '-']);
      rows.push(['학급', c.class ?? '-']);
    }
    if (world && world.fields) {
      world.fields.forEach((f) => {
        const raw = c.fields ? c.fields[f.key] : null;
        const val = f.type === 'tags' ? renderTagPills(raw) : raw ?? '-';
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

    const extraSections = [
      ['소개', c.bio],
      ['성격', c.personality],
      world && world.hasHistory ? ['작중행적', c.history] : null,
      ['여담', c.trivia],
    ]
      .filter(Boolean)
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
    `;

    const imageWrap = document.getElementById('modalImageWrap');
    if (profileImg) {
      const img = document.createElement('img');
      img.className = 'modal-image';
      img.src = profileImg;
      img.alt = c.name;
      img.onerror = () => {
        imageWrap.innerHTML = `<div class="modal-image-placeholder">${PERSON_ICON}</div>`;
      };
      imageWrap.appendChild(img);
    } else {
      imageWrap.innerHTML = `<div class="modal-image-placeholder">${PERSON_ICON}</div>`;
    }

    document.getElementById('modalEditBtn').addEventListener('click', () => {
      closeModal();
      openEditForm(c, world, c.subcategory || null);
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

    if (w.parts) {
      const wrapDiv = document.createElement('label');
      wrapDiv.className = 'form-label';
      wrapDiv.innerHTML = `분류(부)
        <select class="form-input" id="fPart">
          ${w.parts.map((p) => `<option value="${p}" ${((existing && existing.part) || presetSubcategory) === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>`;
      container.appendChild(wrapDiv);
    }

    if (w.subcategories) {
      const wrapDiv = document.createElement('label');
      wrapDiv.className = 'form-label';
      wrapDiv.innerHTML = `세부 분류
        <select class="form-input" id="fSubcategory">
          ${w.subcategories.map((s) => `<option value="${s}" ${(existing ? existing.subcategory : presetSubcategory) === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>`;
      container.appendChild(wrapDiv);
    }

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

    // ---- 커스텀 항목 관리 ----
    const fieldMgr = document.createElement('div');
    fieldMgr.className = 'field-manager';

    (w.fields || []).forEach((f) => {
      const row = document.createElement('div');
      row.className = 'field-manager-row';

      const label = document.createElement('label');
      label.className = 'form-label field-manager-label';
      const rawVal = existing && existing.fields ? existing.fields[f.key] : null;

      if (f.type === 'tags') {
        label.innerHTML = `${f.label} <span class="field-type-tag">태그</span>`;
        const tagContainer = document.createElement('div');
        label.appendChild(tagContainer);
        currentFieldWidgets[f.key] = mountTagInput(tagContainer, rawVal);
      } else {
        label.innerHTML = `${f.label}
          <input type="text" class="form-input" data-field-key="${f.key}" value="${escapeAttr(rawVal || '')}">`;
      }
      row.appendChild(label);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'field-manager-del';
      delBtn.textContent = '항목 삭제';
      delBtn.addEventListener('click', () => removeFieldFromWorld(w, f.key));
      row.appendChild(delBtn);

      fieldMgr.appendChild(row);
    });

    const addRow = document.createElement('div');
    addRow.className = 'field-manager-add';
    addRow.innerHTML = `
      <input type="text" class="form-input" id="newFieldLabel" placeholder="새 항목 이름 (예: 취미)">
      <select class="form-input" id="newFieldType">
        <option value="text">텍스트 입력</option>
        <option value="tags">태그 입력</option>
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

  async function getWorldsSha() {
    if (worldsSha) return worldsSha;
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${WORLDS_PATH}?ref=${GITHUB_BRANCH}`,
      { headers: { Accept: 'application/vnd.github+json' } }
    );
    if (res.ok) {
      const data = await res.json();
      worldsSha = data.sha;
    }
    return worldsSha;
  }

  async function saveWorlds() {
    const token = getToken();
    if (!token) {
      window.alert('세계관/항목 구조를 저장하려면 먼저 "⚙ 저장 설정"에서 토큰을 등록해주세요.');
      return false;
    }
    try {
      const sha = await getWorldsSha();
      const content = b64EncodeUnicode(JSON.stringify(worlds, null, 2));
      const result = await githubPutFile(WORLDS_PATH, content, 'Update worlds.json (field template)', sha);
      worldsSha = result.content ? result.content.sha : worldsSha;
      return true;
    } catch (err) {
      console.error(err);
      window.alert('세계관 저장에 실패했어요: ' + err.message);
      return false;
    }
  }

  async function addFieldToWorld(world, label, type) {
    const key = 'f_' + Date.now();
    world.fields = world.fields || [];
    world.fields.push({ key, label, type });
    const ok = await saveWorlds();
    if (ok) renderDynamicSection(world, null, null);
  }

  async function removeFieldFromWorld(world, key) {
    if (!window.confirm('이 항목을 삭제할까요? (기존 캐릭터의 값은 남아있지만 화면에 더 이상 보이지 않아요)')) return;
    world.fields = (world.fields || []).filter((f) => f.key !== key);
    const ok = await saveWorlds();
    if (ok) renderDynamicSection(world, null, null);
  }

  function openEditForm(existing, world, presetSubcategory) {
    const isEdit = !!existing;
    const w = world || (existing ? worldById(existing.world) : worlds[0]);

    formBody.innerHTML = `
      <h2 class="form-title">${isEdit ? '캐릭터 수정' : '캐릭터 생성'}</h2>

      <label class="form-label">템플릿(세계관)
        <select class="form-input" id="fWorld">
          ${worlds.map((wo) => `<option value="${wo.id}" ${wo.id === w.id ? 'selected' : ''}>${wo.name}</option>`).join('')}
        </select>
      </label>

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

      <label class="form-label">이름
        <input type="text" class="form-input" id="fName" value="${escapeAttr(isEdit ? existing.name : '')}">
      </label>
      <label class="form-label">나이
        <input type="number" class="form-input" id="fAge" value="${isEdit && existing.age != null ? existing.age : ''}">
      </label>
      <label class="form-label">소속
        <input type="text" class="form-input" id="fAffiliation" value="${escapeAttr(isEdit ? existing.affiliation || '' : '')}">
      </label>

      <div id="dynamicFieldsContainer"></div>

      <label class="form-label">소개
        <textarea class="form-input form-textarea" id="fBio">${isEdit ? existing.bio || '' : ''}</textarea>
      </label>
      <label class="form-label">성격
        <textarea class="form-input form-textarea" id="fPersonality">${isEdit ? existing.personality || '' : ''}</textarea>
      </label>
      <label class="form-label" id="fHistoryWrap" style="${w.hasHistory ? '' : 'display:none'}">작중행적
        <textarea class="form-input form-textarea" id="fHistory">${isEdit ? existing.history || '' : ''}</textarea>
      </label>
      <label class="form-label">여담
        <textarea class="form-input form-textarea" id="fTrivia">${isEdit ? existing.trivia || '' : ''}</textarea>
      </label>

      <p class="form-error" id="formError"></p>
      <button class="form-submit" id="formSubmit">${isEdit ? '저장하기' : '만들기'}</button>
      <p class="form-hint">
        토큰이 없거나 저장이 안 되면
        <a href="#" id="formFallbackLink">깃허브에서 직접 만들기</a>로 대신하세요.
      </p>
    `;

    renderDynamicSection(w, existing, presetSubcategory);

    let selectedWorldId = w.id;
    document.getElementById('fWorld').addEventListener('change', (e) => {
      selectedWorldId = e.target.value;
      const newWorld = worldById(selectedWorldId);
      document.getElementById('fHistoryWrap').style.display = newWorld.hasHistory ? '' : 'none';
      renderDynamicSection(newWorld, isEdit ? existing : null, null);
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
    const obj = existing ? { ...existing } : { id: 'character-id', world: world.id, name: '캐릭터 이름', age: 0, affiliation: '소속', image: null };
    delete obj._path;
    delete obj._sha;
    if (world.parts) obj.part = obj.part || world.parts[0];
    if (world.subcategories) obj.subcategory = obj.subcategory || presetSubcategory || world.subcategories[0];
    if (world.useGradeClass) {
      obj.grade = obj.grade ?? null;
      obj.class = obj.class ?? null;
    }
    if (world.fields && !obj.fields) {
      obj.fields = {};
      world.fields.forEach((f) => (obj.fields[f.key] = f.type === 'tags' ? [] : '-'));
    }
    obj.bio = obj.bio || '소개';
    obj.personality = obj.personality || '성격';
    if (world.hasHistory) obj.history = obj.history || '작중행적';
    obj.trivia = obj.trivia || '여담';

    const path = existing ? existing._path : `${CHARACTERS_DIR}/새캐릭터.json`;
    const value = JSON.stringify(obj, null, 2);
    return existing
      ? `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/edit/${GITHUB_BRANCH}/${path}`
      : `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/new/${GITHUB_BRANCH}?filename=${encodeURIComponent(path)}&value=${encodeURIComponent(value)}`;
  }

  function b64EncodeUnicode(str) {
    return btoa(String.fromCharCode(...new TextEncoder().encode(str)));
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.substring(reader.result.indexOf(',') + 1));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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

  async function submitForm(isEdit, existing, world) {
    const errorEl = document.getElementById('formError');
    errorEl.textContent = '';

    const name = document.getElementById('fName').value.trim();
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

    const ageVal = document.getElementById('fAge').value;
    const obj = {
      id: isEdit ? existing.id : `char-${Date.now()}`,
      world: world.id,
      name,
      age: ageVal === '' ? null : Number(ageVal),
      affiliation: document.getElementById('fAffiliation').value.trim(),
      image: isEdit ? existing.image || null : null,
      profileImage: isEdit ? existing.profileImage || null : null,
    };

    const partEl = document.getElementById('fPart');
    if (partEl) obj.part = partEl.value;
    const subEl = document.getElementById('fSubcategory');
    if (subEl) obj.subcategory = subEl.value;

    if (world.useGradeClass) {
      const gradeVal = document.getElementById('fGrade').value;
      obj.grade = gradeVal === '' ? null : Number(gradeVal);
      obj.class = document.getElementById('fClass').value.trim() || null;
    }

    if (world.fields && world.fields.length > 0) {
      obj.fields = {};
      world.fields.forEach((f) => {
        if (f.type === 'tags') {
          obj.fields[f.key] = currentFieldWidgets[f.key] ? currentFieldWidgets[f.key].getValues() : [];
        } else {
          const input = document.querySelector(`[data-field-key="${f.key}"]`);
          obj.fields[f.key] = input ? input.value.trim() || '-' : '-';
        }
      });
    }

    obj.bio = document.getElementById('fBio').value.trim();
    obj.personality = document.getElementById('fPersonality').value.trim();
    if (world.hasHistory) obj.history = document.getElementById('fHistory').value.trim();
    obj.trivia = document.getElementById('fTrivia').value.trim();

    const submitBtn = document.getElementById('formSubmit');
    submitBtn.disabled = true;
    submitBtn.textContent = '저장 중...';

    try {
      const imageFile = document.getElementById('fImage').files[0];
      if (imageFile) {
        const ext = imageFile.name.split('.').pop();
        const imagePath = `${ASSETS_DIR}/${obj.id}.${ext}`;
        const base64 = await fileToBase64(imageFile);
        await githubPutFile(imagePath, base64, `Add image for ${name}`);
        obj.image = imagePath;
      }
      const profileImageFile = document.getElementById('fProfileImage').files[0];
      if (profileImageFile) {
        const ext = profileImageFile.name.split('.').pop();
        const imagePath = `${ASSETS_DIR}/${obj.id}-profile.${ext}`;
        const base64 = await fileToBase64(profileImageFile);
        await githubPutFile(imagePath, base64, `Add profile image for ${name}`);
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

  [worlds, characters] = await Promise.all([loadWorlds(), loadCharacters()]);

  renderSidebar();
  renderGallery();
})();
