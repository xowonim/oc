(async function () {
  // ---- GitHub 저장소 설정 ----
  const GITHUB_OWNER = 'xowonim';
  const GITHUB_REPO = 'oc';
  const GITHUB_BRANCH = 'main';
  const CHARACTERS_DIR = 'data/characters';
  const WORLDS_PATH = 'data/worlds.json';
  const ASSETS_DIR = 'assets';
  const TOKEN_KEY = 'oc_gh_token';
  const SITE_PATH = 'data/site.json';
  const DARK_MODE_KEY = 'oc_dark_mode';
  const EDIT_MODE_KEY = 'oc_edit_mode';
  const SITE_CACHE_KEY = 'oc_site_cache';
  const DEFAULT_SITE_TITLE = 'Untitled';

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
  const subListWrapEl = document.getElementById('subListWrap');
  const galleryEl = document.getElementById('gallery');
  const logoHomeEl = document.getElementById('logoHome');
  const createTopBtnEl = document.getElementById('createTopBtn');
  const orderEditBtnEl = document.getElementById('orderEditBtn');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalBody = document.getElementById('modalBody');
  const modalClose = document.getElementById('modalClose');

  let worlds = [];
  let worldsSha = null;
  let characters = [];
  let activeWorld = 'all';
  // 공지가 켜져 있을 때, 지금 공지 화면(첫 화면)을 보고 있는지
  let showNotice = false;
  let activeSubFilter = null;
  // 神世界 전용 "순서 편집" 모드: 켜져 있는 동안은 카드를 눌러도 프로필이 안 열리고,
  // 대신 손가락/마우스로 끌어서 순서를 바꿀 수 있다.
  let editOrderMode = false;
  let sortableInstances = [];
  let charactersLoadFailed = false;
  let charactersLoadError = '';
  // 목록 요청은 성공했는데 일부 캐릭터 파일만 네트워크 문제로 못 불러온 경우의 이름들.
  // (전에는 그 캐릭터만 아무 표시 없이 목록에서 빠져서 "사라진 것"처럼 보였다.)
  let partiallyFailedCharacterNames = [];

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }
  function setToken(t) {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }

  // ---- 다크 모드 / 편집 모드 ----
  function isDarkModeOn() {
    try { return localStorage.getItem(DARK_MODE_KEY) === '1'; } catch (e) { return false; }
  }
  // 다크 모드 여부 + 사이트 색상(라이트/다크 각각)을 한 번에 화면에 반영한다.
  function applyDarkMode() {
    window.ocApplyTheme(siteConfig && siteConfig.colors);
  }
  function setDarkModeOn(on) {
    try { localStorage.setItem(DARK_MODE_KEY, on ? '1' : '0'); } catch (e) {}
    applyDarkMode();
  }
  // 편집 모드는 기본이 꺼짐. 토큰이 있을 때만 켤 수 있다.
  function isEditModeOn() {
    try { return localStorage.getItem(EDIT_MODE_KEY) === '1'; } catch (e) { return false; }
  }
  function setEditModeOn(on) {
    try { localStorage.setItem(EDIT_MODE_KEY, on ? '1' : '0'); } catch (e) {}
    if (!on) editOrderMode = false;
  }
  function canEditNow() {
    return !!getToken() && isEditModeOn();
  }

  // ---- 사이트 설정(제목/로고/파비콘): data/site.json ----
  let siteConfig = {};
  function readSiteCache() {
    try { return JSON.parse(localStorage.getItem(SITE_CACHE_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function writeSiteCache(d) {
    try { localStorage.setItem(SITE_CACHE_KEY, JSON.stringify(d)); } catch (e) {}
  }
  function applySiteConfig(d) {
    siteConfig = d || {};
    document.title = siteConfig.title || DEFAULT_SITE_TITLE;
    applyDarkMode();
    const logo = siteConfig.logo || {};
    if (logo.type === 'image' && logo.image) {
      logoHomeEl.textContent = '';
      const img = document.createElement('img');
      img.className = 'logo-img';
      img.alt = siteConfig.title || DEFAULT_SITE_TITLE;
      img.src = assetUrl(logo.image);
      logoHomeEl.appendChild(img);
    } else {
      logoHomeEl.textContent = logo.text || DEFAULT_SITE_TITLE;
    }
    let link = document.getElementById('siteFavicon');
    if (siteConfig.favicon) {
      if (!link) {
        link = document.createElement('link');
        link.id = 'siteFavicon';
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = assetUrl(siteConfig.favicon);
    } else if (link) {
      link.remove();
    }
  }
  async function loadSite() {
    applySiteConfig(readSiteCache());
    try {
      const res = await fetch(`https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${SITE_PATH}?t=${Date.now()}`, { cache: 'no-store' });
      if (res.status === 404) { writeSiteCache({}); applySiteConfig({}); return; }
      if (!res.ok) return;
      const d = await res.json();
      writeSiteCache(d);
      applySiteConfig(d);
    } catch (e) { /* 캐시된 값을 그대로 쓴다 */ }
  }

  function worldById(id) {
    return worlds.find((w) => w.id === id);
  }

  function nameCompare(a, b) {
    return (a.name || '').localeCompare(b.name || '', 'ko');
  }

  // 세계관의 항목 중 "정렬 기준으로 쓰기"가 켜진 항목이 있으면(예: 히라가나 읽기),
  // 이름 대신 그 항목 값으로 정렬한다. 일본어(히라가나/가타카나) 읽기 순서를 그대로
  // 지원하도록 'ja' 로케일로 비교한다.
  function sortKeyField(world) {
    if (!world || !world.fields) return null;
    return world.fields.find((f) => f.sortKey) || null;
  }

  // 이름을 한글로 적어도(일본어식 이름을 한글로 음차 표기한 경우) 아이우에오(あ행) 순서로
  // 자동 정렬하고 싶을 때 쓰는 표. 각 행은 히라가나 오십음도 순서를 그대로 따르고,
  // 탁음/반탁음 행은 사전에서처럼 해당 청음 행 바로 뒤에 둔다.
  const GOJUON_ROWS = [
    ['아', '이', '우', '에', '오'], // あ
    ['카', '키', '쿠', '케', '코'], // か
    ['가', '기', '구', '게', '고'], // が
    ['사', '시', '스', '세', '소'], // さ
    ['자', '지', '즈', '제', '조'], // ざ
    ['타', '치', '츠', '테', '토'], // た
    ['다', '디', '두', '데', '도'], // だ
    ['나', '니', '누', '네', '노'], // な
    ['하', '히', '후', '헤', '호'], // は
    ['바', '비', '부', '베', '보'], // ば
    ['파', '피', '푸', '페', '포'], // ぱ
    ['마', '미', '무', '메', '모'], // ま
    ['야', '유', '요'],             // や
    ['라', '리', '루', '레', '로'], // ら
    ['와', '워', '위', '왜', '웨', '웡'], // わ (근사치)
    ['응'], // ん
  ];
  const GOJUON_INDEX = new Map();
  GOJUON_ROWS.forEach((row, rowIdx) => {
    row.forEach((ch, colIdx) => {
      if (!GOJUON_INDEX.has(ch)) GOJUON_INDEX.set(ch, rowIdx * 10 + colIdx);
    });
  });

  // 받침(종성)이 있는 글자(신, 민 등)는 표에 그 글자 그대로는 없지만, 받침을 뗀 소리
  // (신→시, 민→미)는 표에 있는 경우가 많다. 그래서 받침을 뗀 글자로도 한 번 더 찾아본다 —
  // 그래야 "신"이 "시" 바로 다음(사행)이 아니라 엉뚱하게 맨 뒤로 밀려나지 않는다.
  function hangulBaseChar(ch) {
    const code = ch.codePointAt(0);
    if (code < 0xac00 || code > 0xd7a3) return null;
    const offset = code - 0xac00;
    const lead = Math.floor(offset / (21 * 28));
    const vowel = Math.floor((offset % (21 * 28)) / 28);
    return String.fromCodePoint(0xac00 + (lead * 21 + vowel) * 28);
  }

  function gojuonCharPriority(ch) {
    if (GOJUON_INDEX.has(ch)) return GOJUON_INDEX.get(ch);
    const base = hangulBaseChar(ch);
    // 받침 없는 같은 소리가 표에 있으면 그 자리 바로 뒤(+0.5)로 — 같은 행 안에서, 받침 없는
    // 글자보다는 뒤에 오도록.
    if (base && base !== ch && GOJUON_INDEX.has(base)) return GOJUON_INDEX.get(base) + 0.5;
    return 10000 + ch.charCodeAt(0);
  }

  function gojuonCompare(a, b) {
    const sa = String(a || '');
    const sb = String(b || '');
    const len = Math.max(sa.length, sb.length);
    for (let i = 0; i < len; i++) {
      if (i >= sa.length) return -1;
      if (i >= sb.length) return 1;
      const pa = gojuonCharPriority(sa[i]);
      const pb = gojuonCharPriority(sb[i]);
      if (pa !== pb) return pa - pb;
    }
    return 0;
  }

  // 신세계: 캐릭터 프로필을 만든 순서 그대로 보여준다. id가 "char-<생성시각>" 형태라서,
  // 그 안의 숫자(생성 시각)를 그대로 순서값으로 쓴다. (예전/수동으로 만든 id처럼 숫자가
  // 없는 경우는 알 수 없으니 맨 뒤로 보낸다.)
  function creationOrderValue(c) {
    const m = String(c.id || '').match(/(\d+)$/);
    return m ? parseInt(m[1], 10) : Infinity;
  }

  // ETC: "소속"이라고 이름 붙은 항목(태그 여러 개일 수 있음)의 첫 값 기준으로 가나다순 정렬.
  function affiliationFieldForWorld(world) {
    if (!world || !world.fields) return null;
    return world.fields.find((f) => f.label === '소속') || null;
  }
  function affiliationValue(c, field) {
    if (!field) return '';
    const raw = fieldValue(c, field.key);
    if (Array.isArray(raw)) return raw.length ? String(raw[0]) : '';
    return raw ? String(raw) : '';
  }

  function sortCompare(a, b, world) {
    if (world && world.id === 'sinsekai') {
      return creationOrderValue(a) - creationOrderValue(b);
    }
    if (world && world.id === 'etc') {
      const field = affiliationFieldForWorld(world);
      const r = affiliationValue(a, field).localeCompare(affiliationValue(b, field), 'ko', { numeric: true });
      if (r !== 0) return r;
      return nameCompare(a, b);
    }
    if (world && world.sortByGojuon) {
      const r = gojuonCompare(a.name, b.name);
      if (r !== 0) return r;
      return nameCompare(a, b);
    }
    const field = sortKeyField(world);
    if (field) {
      const va = fieldValue(a, field.key) || a.name || '';
      const vb = fieldValue(b, field.key) || b.name || '';
      const r = String(va).localeCompare(String(vb), 'ja');
      if (r !== 0) return r;
    }
    return nameCompare(a, b);
  }

  // 지금 사이드바에서 고른 하위 필터(神世界라면 "부")를 기준으로, 손으로 끌어서 정해둔
  // 순서를 찾을 때 쓸 키를 만든다. "이 하위 필터 보기에서만 쓰는 순서"를 먼저 찾아보고,
  // 없으면 "하위 필터 구분 없이 저장해둔 예전 순서"로 넘어간다 — 그래야 이 기능이 생기기
  // 전에 이미 끌어서 정해둔 순서가 갑자기 사라지지 않는다.
  function activeViewKey() {
    return activeSubFilter || '__all__';
  }

  // 갤러리 구역(그룹) 안에서는, 그 구역에 대해 손으로 직접 끌어서 정해둔 순서가 있으면
  // 그걸 최우선으로 쓴다. 그 순서 목록에 없는 캐릭터(새로 추가했거나 아직 안 옮긴 경우)는
  // 항상 맨 뒤로 보내되, 그들끼리는 sortCompare()의 기본 규칙(만든 순서 등)을 그대로 따른다.
  function groupOrderCompare(a, b, world, groupName) {
    const groupOrder = world && world.groupOrder;
    const order = groupOrder && (groupOrder[`${activeViewKey()}::${groupName}`] || groupOrder[groupName]);
    if (order && order.length) {
      const ia = order.indexOf(a.id);
      const ib = order.indexOf(b.id);
      const sa = ia === -1 ? Infinity : ia;
      const sb = ib === -1 ? Infinity : ib;
      if (sa !== sb) return sa - sb;
    }
    return sortCompare(a, b, world);
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

      async function fetchCharacterFile(f, attemptsLeft) {
        try {
          const raw = await fetch(f.download_url, { cache: 'no-store' });
          if (!raw.ok) throw new Error(`HTTP ${raw.status}`);
          const data = await raw.json();
          data._path = f.path;
          data._sha = f.sha;
          return data;
        } catch (err) {
          if (attemptsLeft > 0) {
            await new Promise((r) => setTimeout(r, 300));
            return fetchCharacterFile(f, attemptsLeft - 1);
          }
          console.warn('캐릭터 파일을 불러오지 못했어요:', f.name, err);
          return null;
        }
      }

      const results = await Promise.all(jsonFiles.map((f) => fetchCharacterFile(f, 2)));
      partiallyFailedCharacterNames = jsonFiles
        .filter((f, idx) => results[idx] === null)
        .map((f) => (f.name || '').replace(/\.json$/, ''));
      charactersLoadFailed = false;
      charactersLoadError = '';
      return results.filter(Boolean);
    } catch (err) {
      console.warn('GitHub API로 캐릭터 목록을 불러오지 못했어요. 로컬 데이터로 대체합니다.', err);
      charactersLoadFailed = true;
      charactersLoadError = err.message || String(err);
      partiallyFailedCharacterNames = [];
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

    // 신세계/ETC는 위 sortCompare()에 전용 규칙이 있으니, 아래의 예전 방식
    // (고유 순서 목록 / 학년·학급순)보다 그걸 그대로 우선 적용한다.
    if (world.id === 'sinsekai' || world.id === 'etc') {
      return [...list].sort((a, b) => sortCompare(a, b, world));
    }

    if (world.fixedOrderList) {
      const order = world.fixedOrderList;
      return [...list].sort((a, b) => {
        const ia = order.indexOf(a.name);
        const ib = order.indexOf(b.name);
        const sa = ia === -1 ? Infinity : ia;
        const sb = ib === -1 ? Infinity : ib;
        if (sa !== sb) return sa - sb;
        return sortCompare(a, b, world);
      });
    }

    if (world.useGradeClass) {
      return [...list].sort((a, b) => {
        const gc = gradeClassCompare(a, b);
        if (gc !== 0) return gc;
        return sortCompare(a, b, world);
      });
    }

    return [...list].sort((a, b) => sortCompare(a, b, world));
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
    return world.fields.find((f) => (f.type === 'category' || f.type === 'tags') && f.sidebarFilter) || null;
  }

  function galleryCategoryField(world) {
    if (!world || !world.fields) return null;
    return world.fields.find((f) => (f.type === 'category' || f.type === 'tags') && f.galleryGroup) || null;
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
    // 다른 세계관에서 손님으로 끼어 보여지는 캐릭터(예: OC 거주지 화면의 YMKB 캐릭터)는
    // 자기 원래 세계관 이름을 배지로 보여준다 — 소속/학교 같은 값은 당연히 없을 테니.
    if (c.world !== world.id) {
      const ownWorld = worldById(c.world);
      if (ownWorld) {
        return `<span class="char-card-aux">${ownWorld.shortName || ownWorld.name}</span>`;
      }
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

  // '기타'/'ETC'류 값은 가나다순/알파벳순으로 정렬하면 중간에 끼어버릴 수 있으니,
  // 항상 목록 맨 아래로 보낸다.
  function isMiscCategoryValue(v) {
    const t = String(v || '').trim();
    return t === '기타' || /^etc\.?$/i.test(t);
  }

  // 한글/영문/숫자로 시작하는 값보다, -, ?, +, * 같은 특수기호로 시작하는 값은
  // 항상 아래쪽에 배치되도록 정렬 그룹을 나눈다. ('기타'/'ETC'는 그보다도 더 아래)
  function categorySortGroup(v) {
    const t = String(v || '').trim();
    if (isMiscCategoryValue(t)) return 2;
    if (/^[0-9a-zA-Z가-힣ㄱ-ㅎㅏ-ㅣ]/.test(t)) return 0;
    return 1;
  }

  function distinctFieldValues(worldId, key) {
    const values = [];
    characters
      .filter((c) => c.world === worldId)
      .forEach((c) => fieldValuesAsList(fieldValue(c, key)).forEach((v) => values.push(v)));
    const unique = Array.from(new Set(values));

    // 세계관에 직접 정해둔 사이드바 순서(world.subFilterOrder)가 있으면 그 순서를
    // 그대로 따른다(예: YMKB는 "3학년, 2학년, 1학년, 중등부" 순으로 보고 싶어함).
    // 목록에 없는 새 값은 뒤에 가나다순으로 붙인다. 정해둔 순서가 없으면 예전 방식
    // (미분류류 뒤로, 그 외엔 가나다/숫자순) 그대로 쓴다.
    const world = worldById(worldId);
    if (world && Array.isArray(world.subFilterOrder) && world.subFilterOrder.length) {
      const order = world.subFilterOrder;
      return unique.sort((a, b) => {
        const ia = order.indexOf(a);
        const ib = order.indexOf(b);
        const sa = ia === -1 ? Infinity : ia;
        const sb = ib === -1 ? Infinity : ib;
        if (sa !== sb) return sa - sb;
        return a.localeCompare(b, 'ko', { numeric: true });
      });
    }

    return unique.sort((a, b) => {
      const ga = categorySortGroup(a);
      const gb = categorySortGroup(b);
      if (ga !== gb) return ga - gb;
      return a.localeCompare(b, 'ko', { numeric: true });
    });
  }

  // OC의 "거주지" 세부 화면에 한해서, YMKB 캐릭터 중 (자유 텍스트로 적어둔) "거주지"가
  // 그 값과 글자 그대로 똑같은 애들을 손님으로 같이 보여준다. OC "전체" 화면에는 안 뜨고,
  // 딱 그 거주지 화면에서만 끼워 넣는다 — OC 쪽 거주지 선택지 자체는 OC 캐릭터만 보고
  // 만들어지므로(distinctFieldValues), YMKB 쪽 입력 때문에 새 거주지 탭이 생기진 않는다.
  const OC_WORLD_ID = 'w_1790458917947';
  const YMKB_WORLD_ID = 'w_1790459708806';
  // YMKB(유메키보 고등학교) 자체가 아오소라 시에 있는 학교라서, "아오소라 시" 화면에
  // 거주지로 끼어든 YMKB 손님 캐릭터만 OC의 "학교" 구역에서 미분류 대신 이 이름으로
  // 묶어 보여준다. 다른 거주지(예: 요조라 시)로 끼어든 YMKB 손님은 유메키보 학생이
  // 아니므로 그냥 미분류로 둔다.
  const YMKB_SCHOOL_NAME_FOR_OC = '유메키보 고등학교';
  const YMKB_SCHOOL_CITY = '아오소라 시';
  function ocResidenceGuestCharacters(residenceValue) {
    if (!residenceValue) return [];
    const ymkbWorld = worldById(YMKB_WORLD_ID);
    const field = findFieldByLabel(ymkbWorld, '거주지');
    if (!ymkbWorld || !field) return [];
    const target = String(residenceValue).trim();
    return characters.filter(
      (c) => c.world === YMKB_WORLD_ID && String(fieldValue(c, field.key) || '').trim() === target
    );
  }

  function getFiltered() {
    let list = characters;
    if (activeWorld !== 'all') {
      list = list.filter((c) => c.world === activeWorld);
      const world = worldById(activeWorld);
      const field = sidebarCategoryField(world);
      if (activeSubFilter && field) {
        list = list.filter((c) => fieldMatches(fieldValue(c, field.key), activeSubFilter));
        if (activeWorld === OC_WORLD_ID && field.label === '거주지') {
          list = list.concat(ocResidenceGuestCharacters(activeSubFilter));
        }
      }
    }
    return list;
  }

  // ---------- 사이드바 ----------
  function renderSidebar() {
    navListEl.innerHTML = '';
    if (subListWrapEl) subListWrapEl.innerHTML = '';
    const entries = [{ id: 'all', name: 'All', shortName: 'All' }, ...worlds];

    entries.forEach((entry) => {
      const item = document.createElement('div');
      item.className = 'nav-item';

      const btn = document.createElement('button');
      btn.className = 'nav-btn' + (activeWorld === entry.id && !(showNotice && noticeEnabled()) ? ' is-active' : '');
      btn.textContent = entry.shortName || entry.name;
      btn.addEventListener('click', () => {
        activeWorld = entry.id;
        activeSubFilter = null;
        showNotice = false;
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

        // 모바일(가로로 넘기는 탭 줄)에서만 하위 카테고리를 탭 줄 바깥의 별도 영역에 둔다.
        // 그래야 하위 카테고리 개수에 따라 탭 줄 자체의 높이가 늘어나지 않는다.
        // 그 외(세로로 나열되는 넓은 화면)에서는 원래대로 선택된 탭 바로 아래에 붙인다.
        const isMobileNav = window.matchMedia('(max-width: 640px)').matches;
        if (isMobileNav && subListWrapEl) subListWrapEl.appendChild(subList);
        else item.appendChild(subList);
      }

      navListEl.appendChild(item);
    });
  }

  // ---------- 갤러리 ----------
  // "순서 편집" 버튼은 (전체 보기가 아닌) 세계관 하나를 보고 있고 + 토큰이 등록돼 있을
  // 때 보여준다. 다른 세계관으로 넘어가거나 "전체"로 가면 편집 모드도 자동으로 꺼서,
  // 안 보이는 채로 계속 켜져있지 않게 한다.
  function updateOrderEditButton() {
    if (!orderEditBtnEl) return;
    const canEdit = activeWorld !== 'all' && canEditNow();
    orderEditBtnEl.style.display = canEdit ? '' : 'none';
    if (!canEdit && editOrderMode) {
      editOrderMode = false;
    }
    orderEditBtnEl.classList.toggle('is-active', editOrderMode);
    orderEditBtnEl.textContent = editOrderMode ? '✓ 순서 편집 완료' : '↕ 순서 편집';
  }

  // 수동으로 끌어서 정해둔 순서(world.groupOrder[key])가 있으면 그 위치로 당겨오고,
  // 아직 순서를 안 정한 캐릭터들끼리는 원래 있던 상대 순서(자동 정렬 결과)를 그대로
  // 유지한다 — Array.sort는 안정 정렬이라 "순서 미지정 = 동점"이면 원래 순서가 보존된다.
  function applyManualOrderOverride(list, world, key) {
    const groupOrder = world && world.groupOrder;
    const order = groupOrder && (groupOrder[`${activeViewKey()}::${key}`] || groupOrder[key]);
    if (!order || !order.length) return list;
    return [...list].sort((a, b) => {
      const ia = order.indexOf(a.id);
      const ib = order.indexOf(b.id);
      const sa = ia === -1 ? Infinity : ia;
      const sb = ib === -1 ? Infinity : ib;
      return sa - sb;
    });
  }

  // 드래그로 순서를 바꾸는 SortableJS를 각 갤러리 구역(.card-row)에 걸어준다. 편집 모드가
  // 꺼져 있거나 지금 특정 세계관을 보고 있지 않으면, 기존에 걸려있던 것만 떼어내고 끝낸다.
  function refreshSortableInstances(world) {
    sortableInstances.forEach((s) => s.destroy());
    sortableInstances = [];
    galleryEl.classList.toggle('order-editing', editOrderMode);
    if (!editOrderMode || !world) return;
    if (typeof Sortable === 'undefined') {
      console.warn('Sortable 라이브러리를 못 불러와서 순서 편집을 쓸 수 없어요.');
      return;
    }
    // 지금 "구역별로 묶어서" 보여주는 중이면(= .gallery-section들이 있으면), 구역
    // 제목(.gallery-section-title)을 손잡이 삼아 구역 전체도 드래그로 순서를 바꿀 수
    // 있게 한다. 구역이 없는(미분류 없이 쭉 나열되는) 화면에서는 걸지 않는다.
    const isGrouped = !!galleryEl.querySelector(':scope > .gallery-section');
    if (isGrouped) {
      const sectionInstance = Sortable.create(galleryEl, {
        handle: '.gallery-section-title',
        animation: 150,
        delay: 150,
        delayOnTouchOnly: true,
        touchStartThreshold: 5,
        onEnd: () => {
          const order = Array.from(galleryEl.children)
            .map((section) => section.dataset.sectionGroupName)
            .filter(Boolean);
          persistSectionOrder(world.id, order);
        },
      });
      sortableInstances.push(sectionInstance);
    }

    galleryEl.querySelectorAll('.card-row').forEach((row) => {
      const groupName = row.dataset.groupName || '__others__';
      const instance = Sortable.create(row, {
        animation: 150,
        delay: 150, // 짧게 눌러서 바로 드래그가 시작되게 하되, 스크롤하려는 손짓과는 구분되게
        delayOnTouchOnly: true,
        touchStartThreshold: 5,
        onEnd: () => {
          const ids = Array.from(row.children)
            .map((el) => el.dataset.charId)
            .filter(Boolean);
          persistGroupOrder(world.id, groupName, ids);
        },
      });
      sortableInstances.push(instance);
    });
  }

  // 지금 보고 있는 하위 필터(神世界라면 "부") 화면에서, 구역들이 뜨는 순서를 저장한다.
  async function persistSectionOrder(worldId, order) {
    const key = activeViewKey();
    const ok = await saveWorldsWithMutation((freshWorlds) => {
      const w = freshWorlds.find((x) => x.id === worldId);
      if (!w) return;
      w.sectionOrder = w.sectionOrder || {};
      w.sectionOrder[key] = order;
    });
    if (!ok) {
      window.alert('구역 순서 저장에 실패했어요. 다시 시도해주세요 (새로고침하면 방금 바꾼 순서는 사라져요).');
    }
  }

  // 이 세계관(worldId)의 이 구역(groupName)에 대한 새 순서를, "지금 보고 있던 하위
  // 필터" 기준으로 저장한다(예: 신세계라면 지금 고른 "부"별로 따로). 다른 데서 먼저
  // 저장해서 버전이 어긋나 있어도 applyWorldsChange()가 최신 내용을 다시 받아 자동으로
  // 재시도한다.
  async function persistGroupOrder(worldId, groupName, ids) {
    const key = `${activeViewKey()}::${groupName}`;
    const ok = await saveWorldsWithMutation((freshWorlds) => {
      const w = freshWorlds.find((x) => x.id === worldId);
      if (!w) return;
      w.groupOrder = w.groupOrder || {};
      w.groupOrder[key] = ids;
    });
    if (!ok) {
      window.alert('순서 저장에 실패했어요. 다시 시도해주세요 (새로고침하면 방금 바꾼 순서는 사라져요).');
    }
  }

  function renderGallery() {
    updateOrderEditButton();
    refreshCreateButtonVisibility();
    galleryEl.innerHTML = '';

    if (showNotice && noticeEnabled()) {
      renderNoticeView();
      refreshSortableInstances(null);
      return;
    }

    // 캐릭터 목록 자체를 못 불러온 상태라면, "아직 등록된 캐릭터가 없어요"처럼
    // 실제로 비어있는 것과 헷갈릴 수 있는 문구 대신 진짜 원인을 보여준다.
    if (charactersLoadFailed) {
      const warn = document.createElement('p');
      warn.className = 'empty-msg';
      warn.textContent = `캐릭터 목록을 불러오지 못했어요 (${charactersLoadError || '알 수 없는 오류'}). 잠시 후 새로고침해주세요.`;
      galleryEl.appendChild(warn);
      refreshSortableInstances(null);
      return;
    }

    if (partiallyFailedCharacterNames.length > 0) {
      const warn = document.createElement('p');
      warn.className = 'empty-msg partial-load-warn';
      warn.textContent = `${partiallyFailedCharacterNames.join(', ')} 캐릭터를 불러오지 못했어요(네트워크 문제로 보여요 — 저장된 내용이 지워진 건 아니에요). 새로고침해보세요.`;
      galleryEl.appendChild(warn);
    }

    const world = activeWorld === 'all' ? null : worldById(activeWorld);
    const filtered = getFiltered();
    const groupField = world ? galleryCategoryField(world) : null;
    // 神世界(sinsekai)는 세부 카테고리를 고르지 않았을 때도 갤러리 구역 나누기를 유지하고,
    // 그 외 세계관은 "전체"를 눌렀을 때(하위 필터를 고르지 않았을 때)는 구역 나누기 없이
    // 그냥 이름순으로 쭉 보여준다.
    const keepGrouping = world && (world.id === 'sinsekai' || !!activeSubFilter);

    if (world && groupField && keepGrouping) {
      renderGroupedGallery(filtered, world, groupField);
    } else {
      renderFlatGallery(sortForWorld(filtered, world), world);
    }
    refreshSortableInstances(world);
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
    grid.dataset.groupName = '__flat__';
    const ordered = applyManualOrderOverride(list, world, '__flat__');
    ordered.forEach((c) => grid.appendChild(buildCard(c, world)));
    galleryEl.appendChild(grid);
  }

  // 보통은 그 캐릭터의 실제 항목 값(들)을 그대로 구역 이름으로 쓰지만, 두 가지 예외가 있다.
  // 1) OC의 "아오소라 시" 화면에 거주지로 끼어든 YMKB 손님 캐릭터는 "학교" 항목 값이 아예
  //    없다. YMKB(유메키보 고등학교) 자체가 아오소라 시에 있는 학교라는 설정이라, 미분류로
  //    두지 않고 이 이름으로 고정해서 묶어 보여준다. 다른 거주지(예: 요조라 시)로 끼어든
  //    YMKB 손님은 유메키보 학생이라고 할 수 없으니 그냥 미분류로 둔다.
  // 2) 神世界 캐릭터가 지금 보고 있는 "부"에 대해 소속을 따로 정해둔 경우(예: 평소엔 이원향
  //    소속이지만 3부에서만 오토리 일행으로 적어둔 캐릭터) — 그 부를 보고 있을 때는 기본
  //    소속 대신 그 부에 적어둔 소속으로 묶는다. 재정의가 없는 부(또는 "전체")에서는 그냥
  //    기본 소속 그대로 쓴다.
  function galleryGroupValuesFor(c, groupField, world) {
    if (world && world.id === OC_WORLD_ID && c.world === YMKB_WORLD_ID) {
      return activeSubFilter === YMKB_SCHOOL_CITY ? [YMKB_SCHOOL_NAME_FOR_OC] : [];
    }
    if (world && isSinsekaiWorld(world) && activeSubFilter) {
      const overrides = c.fields && c.fields.partOverrides;
      const overridden = overrides && overrides[activeSubFilter];
      if (Array.isArray(overridden) && overridden.length) return overridden;
    }
    return fieldValuesAsList(fieldValue(c, groupField.key));
  }

  function renderGroupedGallery(list, world, groupField) {
    // 미리 정해둔 목록이 아니라, 지금 이 세계관에 실제로 존재하는 캐릭터들의
    // 값만 모아서(자모/숫자 순 정렬) 구역을 만든다.
    const known = [];
    list.forEach((c) => galleryGroupValuesFor(c, groupField, world).forEach((v) => known.push(v)));
    const groupNames = Array.from(new Set(known)).sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));

    const sections = groupNames.map((groupName) => ({
      key: groupName,
      title: groupName,
      items: list
        .filter((c) => galleryGroupValuesFor(c, groupField, world).includes(groupName))
        .sort((a, b) => groupOrderCompare(a, b, world, groupName)),
    }));

    const others = list
      .filter((c) => galleryGroupValuesFor(c, groupField, world).length === 0)
      .sort((a, b) => groupOrderCompare(a, b, world, '__others__'));
    if (others.length > 0) {
      sections.push({ key: '__others__', title: '미분류', items: others });
    }

    // 구역(소속/학교 등) 자체가 뜨는 순서도 직접 끌어서 정해둘 수 있는데, 그 순서는
    // "지금 보고 있는 하위 필터(神世界라면 부)" 별로 따로 저장돼 있다. 저장된 순서가
    // 없으면 방금 만든 가나다순 그대로 쓴다.
    const savedSectionOrder = world && world.sectionOrder && world.sectionOrder[activeViewKey()];
    if (savedSectionOrder && savedSectionOrder.length) {
      sections.sort((a, b) => {
        const ia = savedSectionOrder.indexOf(a.key);
        const ib = savedSectionOrder.indexOf(b.key);
        const sa = ia === -1 ? Infinity : ia;
        const sb = ib === -1 ? Infinity : ib;
        return sa - sb;
      });
    }

    sections.forEach(({ key, title, items }) => {
      const section = document.createElement('section');
      section.className = 'gallery-section';
      section.dataset.sectionGroupName = key;
      const header = document.createElement('h2');
      header.className = 'gallery-section-title';
      header.textContent = title;
      section.appendChild(header);
      const row = document.createElement('div');
      row.className = 'card-row';
      row.dataset.groupName = key;
      items.forEach((c) => row.appendChild(buildCard(c, world)));
      section.appendChild(row);
      galleryEl.appendChild(section);
    });
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
    card.dataset.charId = c.id;
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
    card.addEventListener('click', () => {
      if (editOrderMode) return; // 순서 편집 중에는 눌러도 프로필이 안 열리고, 끌어서 옮기는 데만 쓰인다
      openModal(c);
    });
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
      // 일반 텍스트 항목도 레이팅 항목처럼 2열로 나란히 보여준다. 항목 개수가 홀수여서
      // 마지막 한 줄만 짝이 안 맞을 때는, 반 칸만 차지하고 비어있지 않도록 한 줄 전체를 차지하게 한다.
      const totalGridRows = Math.ceil(rows.length / 2);
      const isOddCount = rows.length % 2 === 1;
      let html = '<div class="modal-fields">';
      rows.forEach((r, idx) => {
        const gridRowIdx = Math.floor(idx / 2);
        const isLastRow = gridRowIdx === totalGridRows - 1;
        const isDanglingLast = isOddCount && idx === rows.length - 1;
        const classes = ['modal-field-row'];
        if (isLastRow) classes.push('no-border');
        if (isDanglingLast) classes.push('modal-field-row-full');
        html += `
          <div class="${classes.join(' ')}">
            <div class="modal-field-label">${r.label}</div>
            <div class="modal-field-value">${r.value}</div>
          </div>
        `;
      });
      html += '</div>';
      return html;
    }

    // 템플릿 공통 항목 뒤에, 이 캐릭터만 따로 가지고 있는 항목(customFields, ETC처럼
    // "캐릭터마다 다른 항목 추가 허용"이 켜진 템플릿에서 생긴 것)을 이어서 보여준다.
    const orderedFields = [
      ...(world && world.fields ? world.fields.filter((f) => f.key !== 'name') : []),
      ...(Array.isArray(c.customFields) ? c.customFields : []),
    ];
    let sectionsHtml = '';
    let collapseCounter = 0;
    let prevSectionType = null;

    // 접은 글 항목들이 전부 끝나는 지점(더 이상 접은 글이 이어지지 않는 마지막 접은 글)에
    // 가로선을 그어 마무리해준다. 접은 글끼리 바로 이어질 때 사이사이 선을 생략하는 것과는 별개.
    let lastCollapseIdx = -1;
    orderedFields.forEach((f, i) => {
      if (f.type === 'collapse') lastCollapseIdx = i;
    });

    orderedFields.forEach((f, fieldIdx) => {
      const raw = fieldValue(c, f.key);
      if (f.type === 'textarea') {
        sectionsHtml += rowsBlockHtml(pendingRows);
        pendingRows = [];
        prevSectionType = 'textarea';
        if (raw) {
          sectionsHtml += `<h3 class="modal-section-title">${f.label}</h3><div class="modal-bio">${raw}</div>`;
        }
      } else if (f.type === 'collapse') {
        // 접은글 항목이 바로 이어서 여러 개 나올 때는, 그 사이사이에 매번 구분선을
        // 그으면 선이 너무 자주 겹쳐 보이므로, 앞에도 접은글이 곧바로 있었을 때는
        // (그 사이에 다른 항목이 끼어있지 않았다면) 윗줄을 생략한다.
        const hadPending = pendingRows.length > 0;
        sectionsHtml += rowsBlockHtml(pendingRows);
        pendingRows = [];
        const noLine = prevSectionType === 'collapse' && !hadPending;
        const isLastCollapse = fieldIdx === lastCollapseIdx;
        collapseCounter += 1;
        const cid = 'modalCollapse' + collapseCounter;
        sectionsHtml += `
          <div class="modal-collapse${noLine ? ' modal-collapse-noline' : ''}${isLastCollapse ? ' modal-collapse-end' : ''}">
            <button type="button" class="modal-collapse-toggle" data-target="${cid}">
              <span class="modal-collapse-arrow">▶</span><span>${f.label}</span>
            </button>
            <div class="modal-collapse-body" id="${cid}" hidden>${raw || '-'}</div>
          </div>
        `;
        prevSectionType = 'collapse';
      } else if (f.type === 'rating') {
        const n = Math.max(0, Math.min(5, Number(raw) || 0));
        const stars = '★'.repeat(n) + '☆'.repeat(5 - n);
        pendingRows.push({ type: 'rating', label: f.label, value: `<span class="modal-rating">${stars}</span>` });
      } else if (f.type === 'entries') {
        sectionsHtml += rowsBlockHtml(pendingRows);
        pendingRows = [];
        prevSectionType = 'entries';
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
    // 수정하기/캐릭터 삭제는 저장용 개인 토큰을 등록해둔 사람(=실제 운영자)한테만 보이게 한다.
    // 그냥 구경하러 온 사람 화면에는 이 버튼들이 아예 나타나지 않는다.
    const canEdit = canEditNow();

    modalBody.innerHTML = `
      <div class="modal-image-wrap" id="modalImageWrap"></div>
      <p class="modal-name">${c.name}</p>
      <span class="modal-world-tag" style="background:${worldColor}">${world ? world.name : ''}</span>
      ${sectionsHtml}
      ${canEdit ? '<button class="modal-edit-btn" id="modalEditBtn">수정하기</button>' : ''}
      ${canEdit ? `<div class="modal-delete-row"><button class="modal-delete-btn" id="modalDeleteBtn">캐릭터 삭제</button></div>` : ''}
    `;

    modalBody.querySelectorAll('.modal-collapse-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.getAttribute('data-target'));
        const wasHidden = target.hasAttribute('hidden');
        if (wasHidden) target.removeAttribute('hidden');
        else target.setAttribute('hidden', '');
        btn.classList.toggle('is-expanded', wasHidden);
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
    if (canEdit) {
      document.getElementById('modalEditBtn').addEventListener('click', () => {
        closeModal();
        openEditForm(c, world, groupField ? fieldValue(c, groupField.key) : null);
      });
      document.getElementById('modalDeleteBtn').addEventListener('click', () => {
        deleteCharacter(c);
      });
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
  // 모바일에서는 프로필 창이 화면을 꽉 채워서 뒷배경(오버레이)을 누르기 어려우니,
  // 수정하기/삭제/접은글 펼치기 같은 버튼이 아닌 곳이면 카드 안쪽을 눌러도 그냥 닫히게 한다.
  const MODAL_TAP_CLOSE_EXCLUDE = '.modal-collapse-toggle, .modal-edit-btn, .modal-delete-btn, .modal-close, a';
  modalBody.addEventListener('click', (e) => {
    if (e.target.closest(MODAL_TAP_CLOSE_EXCLUDE)) return;
    closeModal();
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
    showNotice = noticeEnabled();
    renderSidebar();
    renderGallery();
  });

  // ---------- 생성/수정 폼 ----------
  const formOverlay = document.getElementById('formOverlay');
  const formBody = document.getElementById('formBody');
  const formClose = document.getElementById('formClose');

  // ---- 작성 중인 내용 임시저장(초안) ----
  // 캐릭터 생성/수정 창을 열어둔 동안 몇 초마다 입력값을 브라우저에 임시로 저장해뒀다가,
  // 실수로 창을 닫거나 다른 화면을 눌러서 나가도 다시 열면 그대로 돌아오게 한다.
  // 저장이 실제로 성공했을 때만 이 임시 저장본을 지운다(저장 전까지는 계속 남아있음).
  let formAutosaveTimer = null;
  function draftStorageKey(existing, world) {
    return existing ? `oc_draft_edit_${existing.id}` : `oc_draft_new_${world.id}`;
  }
  function loadDraft(existing, world) {
    try {
      const raw = localStorage.getItem(draftStorageKey(existing, world));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function saveDraftNow(existing, world) {
    try {
      localStorage.setItem(
        draftStorageKey(existing, world),
        JSON.stringify({ savedAt: Date.now(), sha: existing ? existing._sha : null, snap: snapshotFormValues(world) })
      );
    } catch (e) {
      // 저장 공간이 꽉 찼거나 브라우저가 막아둔 경우: 임시저장이 실패해도 작업 자체는
      // 막지 않고 조용히 넘어간다.
    }
  }
  function clearDraft(existing, world) {
    try {
      localStorage.removeItem(draftStorageKey(existing, world));
    } catch (e) {
      // ignore
    }
  }

  function closeFormModal() {
    if (formAutosaveTimer) {
      clearInterval(formAutosaveTimer);
      formAutosaveTimer = null;
    }
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

  // 神世界 캐릭터의 "부별 소속 재정의" 입력 위젯. 행마다 [부 이름(자유 입력)] + [그 부에서의
  // 소속(태그, 여러 개 가능)]을 쓸 수 있고, 비워둔 부는 그냥 기본 소속을 그대로 쓴다.
  // initialOverrides는 { "3부": ["오토리 일행"], ... } 형태의 객체.
  function mountPartOverrideInput(container, initialOverrides) {
    const rows = Object.entries(initialOverrides && typeof initialOverrides === 'object' ? initialOverrides : {}).map(
      ([part, tags]) => ({ part, tags: Array.isArray(tags) ? [...tags] : [], tagWidget: null })
    );

    const wrap = document.createElement('div');
    wrap.className = 'part-override-wrap';

    function redraw() {
      wrap.innerHTML = '';
      rows.forEach((row, idx) => {
        const rowEl = document.createElement('div');
        rowEl.className = 'part-override-row';

        const partInput = document.createElement('input');
        partInput.type = 'text';
        partInput.className = 'form-input part-override-part';
        partInput.placeholder = '부 (예: 3부)';
        partInput.value = row.part;
        partInput.addEventListener('change', () => {
          row.part = partInput.value.trim();
        });
        rowEl.appendChild(partInput);

        const tagContainer = document.createElement('div');
        tagContainer.className = 'part-override-tags';
        row.tagWidget = mountTagInput(tagContainer, row.tags);
        rowEl.appendChild(tagContainer);

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'field-manager-del';
        delBtn.textContent = '삭제';
        delBtn.addEventListener('click', () => {
          rows.splice(idx, 1);
          redraw();
        });
        rowEl.appendChild(delBtn);

        wrap.appendChild(rowEl);
      });

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'field-manager-add-btn';
      addBtn.textContent = '+ 재정의 추가';
      addBtn.addEventListener('click', () => {
        rows.push({ part: '', tags: [], tagWidget: null });
        redraw();
      });
      wrap.appendChild(addBtn);
    }

    redraw();
    container.appendChild(wrap);

    return {
      getValue: () => {
        const obj = {};
        rows.forEach((row) => {
          const part = (row.part || '').trim();
          const tags = row.tagWidget ? row.tagWidget.getValues() : row.tags;
          if (part && tags && tags.length) obj[part] = tags;
        });
        return obj;
      },
    };
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
          if (!file) return;
          if (typeof Cropper === 'undefined') {
            pendingFiles[entry.id] = file;
            redraw();
            return;
          }
          // 적용 전에 먼저 이미지 편집(자르기) 창을 띄운다.
          openCropModal(file, (blob) => {
            pendingFiles[entry.id] = new File([blob], 'entry.jpg', { type: 'image/jpeg' });
            redraw();
          }, {
            onSkip: () => {
              pendingFiles[entry.id] = file;
              redraw();
            },
          });
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

  // 지금 선택된 글자의 크기를 한 단계 키우거나 줄인다. 선택한 범위가 없으면 아무 일도 하지 않는다.
  function applyFontSizeStep(editable, step) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!editable.contains(range.commonAncestorContainer) || range.collapsed) return;

    let baseNode = range.startContainer;
    baseNode = baseNode.nodeType === 3 ? baseNode.parentElement : baseNode;
    const currentSize = parseFloat(getComputedStyle(baseNode).fontSize) || 15;
    const nextSize = Math.max(11, Math.min(32, Math.round(currentSize + step * 2)));

    const span = document.createElement('span');
    span.style.fontSize = nextSize + 'px';
    span.appendChild(range.extractContents());
    range.insertNode(span);

    sel.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    sel.addRange(newRange);
  }

  // 굵게/기울임/밑줄/글자 크기 서식을 쓸 수 있는 입력 위젯(긴 글, 접은 글, 일반 텍스트 항목에 사용).
  // contenteditable div를 입력창으로 쓰고, 값은 innerHTML(HTML 형식의 서식 있는 텍스트)로 주고받는다.
  // 줄바꿈은 contenteditable 기본 동작으로 이미 가능하다(Enter 키).
  // 서식 입력칸은 지웠다 다시 쓰면 끝에 <br>이 남을 수 있어서, 저장할 때 앞뒤의 빈 줄바꿈을 걷어낸다.
  function stripTrailingBr(html) {
    return String(html || '')
      .replace(/^(\s|&nbsp;|<br\s*\/?>)+/gi, '')
      .replace(/(\s|&nbsp;|<br\s*\/?>)+$/gi, '')
      .trim();
  }

  function mountRichText(container, key, initialHtml) {
    const wrap = document.createElement('div');
    wrap.className = 'richtext-wrap';

    const toolbar = document.createElement('div');
    toolbar.className = 'richtext-toolbar';
    toolbar.innerHTML = `
      <button type="button" class="richtext-btn" data-cmd="bold" title="굵게"><b>B</b></button>
      <button type="button" class="richtext-btn" data-cmd="italic" title="기울임"><i>I</i></button>
      <button type="button" class="richtext-btn" data-cmd="underline" title="밑줄"><u>U</u></button>
      <button type="button" class="richtext-btn" data-cmd="fontUp" title="글자 크게">A+</button>
      <button type="button" class="richtext-btn" data-cmd="fontDown" title="글자 작게">A-</button>
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
        const cmd = btn.getAttribute('data-cmd');
        if (cmd === 'fontUp') applyFontSizeStep(editable, 1);
        else if (cmd === 'fontDown') applyFontSizeStep(editable, -1);
        else document.execCommand(cmd);
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
  // opts: { aspectRatio(가로/세로, 없으면 자유), width(결과 가로 px), mime('image/png' 등), onSkip() }
  function openCropModal(file, onApply, opts) {
    opts = opts || {};
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
          aspectRatio: opts.aspectRatio || NaN,
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
      const canvasOpts = { imageSmoothingQuality: 'high' };
      if (opts.width) canvasOpts.width = opts.width;
      activeCropper.getCroppedCanvas(canvasOpts).toBlob(
        (blob) => {
          onApply(blob);
          closeCropModal();
        },
        opts.mime || 'image/jpeg',
        0.92
      );
    });

    skipBtn.addEventListener('click', () => {
      closeCropModal();
      if (opts.onSkip) opts.onSkip();
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
  // "캐릭터마다 다른 항목 추가 허용"이 켜진 템플릿(예: ETC)에서, 지금 열려 있는
  // 캐릭터 생성/수정 창에서만 쓰이는 이 캐릭터 전용 항목 정의 목록. 템플릿(worlds.json)에는
  // 저장되지 않고, 이 캐릭터의 JSON 파일에 customFields로 그대로 저장된다.
  let currentCustomFields = [];
  // 神世界 캐릭터의 "부별 소속 재정의" 위젯(있을 때만). snapshotFormValues/submitForm에서
  // 함께 읽어서 저장한다.
  let partOverrideWidget = null;

  function renderDynamicSection(w, existing, presetSubcategory) {
    const container = document.getElementById('dynamicFieldsContainer');
    container.innerHTML = '';
    currentFieldWidgets = {};
    partOverrideWidget = null;

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

    // ▲▼ 버튼을 계속 눌러야 하는 게 귀찮다는 요청으로, 왼쪽의 ▲▼ 묶음(.field-manager-move)을
    // 손잡이 삼아 행 전체를 드래그로도 옮길 수 있게 한다. 이 묶음만 "추가" 줄(addRow)과
    // 분리된 rowsWrap 안에 넣어야, SortableJS가 "+ 항목 추가" 줄까지 같이 끌고 다니지 않는다.
    const rowsWrap = document.createElement('div');
    rowsWrap.className = 'field-manager-rows';

    (w.fields || []).forEach((f, idx, arr) => {
      const row = document.createElement('div');
      row.className = 'field-manager-row';
      // 주의: "data-field-key"는 실제 값 입력칸(예: 이름 <input>)에 이미 쓰이고 있는
      // 속성이라, 행 전체에 똑같은 걸 붙이면 document.querySelector('[data-field-key=...]')가
      // (문서 순서상 먼저 나오는) 이 행 자체를 집어버려서 이름 저장이 깨진다 — 그래서
      // 드래그 순서 추적용은 별도 이름(data-row-field-key)을 쓴다.
      row.dataset.rowFieldKey = f.key;

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
        roleRow.appendChild(sideChk);
        roleRow.appendChild(galChk);
        label.appendChild(roleRow);
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
      } else if (f.core) {
        const valInput = document.createElement('input');
        valInput.type = 'text';
        valInput.className = 'form-input';
        valInput.setAttribute('data-field-key', f.key);
        valInput.value = rawVal || '';
        label.appendChild(valInput);

        // 이름(필수 항목) 자체에 바로 붙는 옵션들.
        // (예전엔 여기에 "아이우에오(히라가나) 순 정렬" 체크박스도 있었는데, 이제 캐릭터
        // 순서는 갤러리 화면의 "↕ 순서 편집"으로 직접 드래그해서 정하는 게 기본이라
        // 더는 필요 없어서 뺐다 — 세계관 데이터에 이미 저장돼 있던 sortByGojuon 값
        // 자체는 그대로 둬서, 아직 한 번도 드래그로 순서를 안 정해본 캐릭터들끼리는
        // 전처럼 자연스러운 순서로 보이게 한다.)
        const roleRow = document.createElement('div');
        roleRow.className = 'field-category-roles';

        // ETC처럼 세계관 하나에 출처가 다 제각각인 캐릭터들이 섞여 있을 때를 위한 옵션.
        // 켜두면, 이 템플릿의 공통 항목 말고 "이 캐릭터만의 항목"을 캐릭터마다 자유롭게
        // 추가할 수 있는 칸이 생성/수정 창 아래쪽에 따로 생긴다.
        const perCharChk = document.createElement('label');
        perCharChk.className = 'field-category-role-chk';
        perCharChk.innerHTML = `<input type="checkbox" ${w.perCharacterFields ? 'checked' : ''}> 캐릭터마다 다른 항목 추가 허용`;
        perCharChk.querySelector('input').addEventListener('change', async (e) => {
          const checked = e.target.checked;
          const updated = await toggleWorldFlag(w, 'perCharacterFields', checked);
          if (!updated) {
            e.target.checked = !checked;
          } else if (typeof window.__refreshCustomFieldsSection === 'function') {
            window.__refreshCustomFieldsSection(updated);
          }
        });
        roleRow.appendChild(perCharChk);
        label.appendChild(roleRow);
      } else {
        // 일반 텍스트 입력도 굵게/기울임/밑줄/글자 크기 서식과 줄바꿈을 쓸 수 있게 서식 있는 입력창으로.
        mountRichText(label, f.key, rawVal);
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

      rowsWrap.appendChild(row);
    });

    fieldMgr.appendChild(rowsWrap);

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
    wireFieldManagerDrag(rowsWrap, w);

    // 神世界 한정: 부마다 소속이 바뀌는 캐릭터를 위한 "부별 소속 재정의" 입력칸.
    // (작품 부에 따라 소속/진영이 바뀌는 캐릭터가 있어서, 기본 소속 하나로는 표현이 안 됨)
    if (isSinsekaiWorld(w)) {
      const partOverrideSection = document.createElement('div');
      partOverrideSection.className = 'part-override-section';
      partOverrideSection.innerHTML = `
        <p class="form-section-title">부별 소속 재정의</p>
        <p class="form-hint">비워두면 그 부에서도 기본 소속 그대로 떠요. 예: 백백도는 평소엔 "이원향"이지만 3부에서만 "오토리 일행"으로 적어두면, 3부 화면에서만 오토리 일행 쪽에 떠요.</p>
      `;
      container.appendChild(partOverrideSection);
      const initialOverrides = existing && existing.fields ? existing.fields.partOverrides : null;
      partOverrideWidget = mountPartOverrideInput(partOverrideSection, initialOverrides);
    }

    document.getElementById('newFieldBtn').addEventListener('click', () => {
      const labelVal = document.getElementById('newFieldLabel').value.trim();
      const typeVal = document.getElementById('newFieldType').value;
      if (!labelVal) return;
      addFieldToWorld(w, labelVal, typeVal);
    });
  }

  // ETC처럼 세계관 하나에 출처가 다 제각각인 캐릭터들이 섞여 있을 때를 위한 섹션.
  // 템플릿(worlds.json)에는 손대지 않고, 지금 이 캐릭터 하나한테만 적용되는 항목을
  // 자유롭게 추가/삭제/이름변경 할 수 있다 — 저장은 "저장하기"를 눌렀을 때 이 캐릭터의
  // JSON 파일 안에 customFields로 같이 담겨서 이뤄진다.
  function renderCustomFieldsSection(w, existingValues) {
    const container = document.getElementById('customFieldsContainer');
    if (!container) return;
    container.innerHTML = '';
    if (!w || !w.perCharacterFields) return;

    const header = document.createElement('h3');
    header.className = 'form-section-title';
    header.textContent = '이 캐릭터만의 항목';
    container.appendChild(header);
    const hint = document.createElement('p');
    hint.className = 'form-hint';
    hint.textContent = '템플릿 공통 항목 말고, 이 캐릭터한테만 필요한 항목을 자유롭게 추가할 수 있어요.';
    container.appendChild(hint);

    const fieldMgr = document.createElement('div');
    fieldMgr.className = 'field-manager';
    const typeBadgeText = { tags: '태그', textarea: '긴 글', collapse: '접은 글', rating: '레이팅', entries: '엔트리' };

    currentCustomFields.forEach((f) => {
      const rawVal = existingValues ? existingValues[f.key] : null;
      const row = document.createElement('div');
      row.className = 'field-manager-row';

      const label = document.createElement('div');
      label.className = 'form-label field-manager-label';

      const labelEditRow = document.createElement('div');
      labelEditRow.className = 'field-manager-label-edit-row';
      const labelInput = document.createElement('input');
      labelInput.type = 'text';
      labelInput.className = 'field-manager-label-edit';
      labelInput.value = f.label;
      labelInput.addEventListener('change', () => {
        const v = labelInput.value.trim();
        f.label = v || f.label;
        labelInput.value = f.label;
      });
      labelEditRow.appendChild(labelInput);
      if (typeBadgeText[f.type]) {
        const badge = document.createElement('span');
        badge.className = 'field-type-tag';
        badge.textContent = typeBadgeText[f.type];
        labelEditRow.appendChild(badge);
      }
      label.appendChild(labelEditRow);

      if (f.type === 'tags') {
        const c = document.createElement('div');
        label.appendChild(c);
        currentFieldWidgets[f.key] = mountTagInput(c, rawVal);
      } else if (f.type === 'textarea' || f.type === 'collapse') {
        mountRichText(label, f.key, rawVal);
      } else if (f.type === 'rating') {
        const c = document.createElement('div');
        label.appendChild(c);
        currentFieldWidgets[f.key] = mountRatingInput(c, rawVal);
      } else if (f.type === 'entries') {
        const c = document.createElement('div');
        label.appendChild(c);
        currentFieldWidgets[f.key] = mountEntryListInput(c, Array.isArray(rawVal) ? rawVal : []);
      } else {
        mountRichText(label, f.key, rawVal);
      }
      row.appendChild(label);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'field-manager-del';
      delBtn.textContent = '항목 삭제';
      delBtn.addEventListener('click', () => {
        const snap = snapshotFieldValues(currentCustomFields);
        currentCustomFields = currentCustomFields.filter((x) => x.key !== f.key);
        renderCustomFieldsSection(w, { ...(existingValues || {}), ...snap });
      });
      row.appendChild(delBtn);

      fieldMgr.appendChild(row);
    });

    const addRow = document.createElement('div');
    addRow.className = 'field-manager-add';
    addRow.innerHTML = `
      <input type="text" class="form-input" id="newCustomFieldLabel" placeholder="새 항목 이름 (예: 포켓몬 타입)">
      <select class="form-input" id="newCustomFieldType">
        <option value="text">텍스트 입력</option>
        <option value="tags">태그 입력</option>
        <option value="textarea">긴 글(소개·성격 등)</option>
        <option value="collapse">접은 글(눌러야 펼쳐짐)</option>
        <option value="rating">레이팅(별점)</option>
        <option value="entries">엔트리 목록(이미지+이름+설명)</option>
      </select>
      <button type="button" class="field-manager-add-btn" id="newCustomFieldBtn">+ 이 캐릭터에 항목 추가</button>
    `;
    fieldMgr.appendChild(addRow);
    container.appendChild(fieldMgr);

    document.getElementById('newCustomFieldBtn').addEventListener('click', () => {
      const labelVal = document.getElementById('newCustomFieldLabel').value.trim();
      const typeVal = document.getElementById('newCustomFieldType').value;
      if (!labelVal) return;
      const snap = snapshotFieldValues(currentCustomFields);
      currentCustomFields.push({ key: 'cf_' + Date.now() + Math.random().toString(36).slice(2, 6), label: labelVal, type: typeVal });
      renderCustomFieldsSection(w, { ...(existingValues || {}), ...snap });
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
      window.alert('세계관/항목 구조를 저장하려면 먼저 왼쪽 아래 설정 아이콘에서 토큰을 등록해주세요.');
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

  // 항목 하나짜리 값을 지금 화면(DOM)에서 그대로 읽어오는 공통 로직. 템플릿 공통 항목
  // (world.fields)이든, 캐릭터 전용 항목(currentCustomFields)이든 똑같이 쓸 수 있다.
  function snapshotFieldValues(fieldsArr) {
    const snap = {};
    (fieldsArr || []).forEach((f) => {
      if (f.key === 'name') return;
      if (f.type === 'tags' || (f.type === 'category' && f.multi)) {
        snap[f.key] = currentFieldWidgets[f.key] ? currentFieldWidgets[f.key].getValues() : [];
      } else if (f.type === 'rating') {
        snap[f.key] = currentFieldWidgets[f.key] ? currentFieldWidgets[f.key].getValue() : 0;
      } else if (f.type === 'entries') {
        // 참고: 엔트리 안에서 새로 고른(아직 저장 안 된) 이미지 파일은 스냅샷에 담을 수 없어서
        // 항목을 추가/삭제하는 등 폼이 다시 그려지면 그 이미지 선택은 다시 해야 한다
        // (캐릭터 이미지(1)/(2) 칸도 원래 같은 제약이 있다).
        snap[f.key] = currentFieldWidgets[f.key] ? currentFieldWidgets[f.key].getEntries() : [];
      } else if (f.type === 'textarea' || f.type === 'collapse' || f.type === 'text') {
        const rt = document.querySelector(`.richtext-editable[data-field-key="${f.key}"]`);
        snap[f.key] = rt ? rt.innerHTML : '';
      } else {
        const inp = document.querySelector(`[data-field-key="${f.key}"]`);
        snap[f.key] = inp ? inp.value : '';
      }
    });
    return snap;
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
    Object.assign(snap.fields, snapshotFieldValues(world.fields || []));
    Object.assign(snap.fields, snapshotFieldValues(currentCustomFields));
    if (isSinsekaiWorld(world) && partOverrideWidget) {
      snap.fields.partOverrides = partOverrideWidget.getValue();
    }
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

  // 항목 순서를 ▲▼ 한 칸씩 말고 드래그로 한 번에 옮기기 위한 SortableJS 연결.
  // 폼이 다시 그려질 때마다(항목 추가/삭제/이름변경 등으로 renderDynamicSection이 재호출될
  // 때마다) 새 rowsWrap에 다시 걸어야 하므로, 이전 인스턴스가 있으면 먼저 정리한다.
  let fieldManagerSortable = null;
  function wireFieldManagerDrag(rowsWrap, world) {
    if (fieldManagerSortable) {
      fieldManagerSortable.destroy();
      fieldManagerSortable = null;
    }
    if (typeof Sortable === 'undefined') return;
    fieldManagerSortable = Sortable.create(rowsWrap, {
      handle: '.field-manager-move',
      animation: 150,
      delay: 150,
      delayOnTouchOnly: true,
      touchStartThreshold: 5,
      onEnd: () => {
        const order = Array.from(rowsWrap.children)
          .map((row) => row.dataset.rowFieldKey)
          .filter(Boolean);
        reorderFieldsInWorld(world, order);
      },
    });
  }

  // 드래그로 정해진 새 순서(키 배열) 그대로 worlds.json에 저장한다.
  async function reorderFieldsInWorld(world, newKeyOrder) {
    const snap = snapshotFormValues(world);
    const ok = await saveWorldsWithMutation((freshWorlds) => {
      const w = freshWorlds.find((x) => x.id === world.id);
      if (!w) return;
      const arr = w.fields || [];
      const byKey = new Map(arr.map((f) => [f.key, f]));
      const reordered = newKeyOrder.map((k) => byKey.get(k)).filter(Boolean);
      // 혹시 드래그 순간 다른 곳에서 먼저 바뀌어 빠진 항목이 있으면 유실되지 않게 맨 뒤에 붙인다.
      arr.forEach((f) => {
        if (!newKeyOrder.includes(f.key)) reordered.push(f);
      });
      w.fields = reordered;
    });
    if (!ok) {
      window.alert('순서 저장에 실패했어요. 다시 시도해주세요.');
    }
    const freshWorld = worldById(world.id) || world;
    renderDynamicSection(freshWorld, snap, null);
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

  async function moveTemplate(world, dir) {
    let moved = false;
    const ok = await saveWorldsWithMutation((freshWorlds) => {
      const idx = freshWorlds.findIndex((w) => w.id === world.id);
      const target = idx + dir;
      if (idx === -1 || target < 0 || target >= freshWorlds.length) return;
      const [item] = freshWorlds.splice(idx, 1);
      freshWorlds.splice(target, 0, item);
      moved = true;
    });
    if (!ok || !moved) return null;
    renderSidebar();
    return worldById(world.id);
  }

  async function toggleWorldFlag(world, flagKey, checked) {
    const ok = await saveWorldsWithMutation((freshWorlds) => {
      const w = freshWorlds.find((x) => x.id === world.id);
      if (w) w[flagKey] = checked;
    });
    if (!ok) return null;
    renderGallery();
    return worldById(world.id);
  }

  function openEditForm(existing, world, presetSubcategory) {
    const isEdit = !!existing;
    const w = world || (existing ? worldById(existing.world) : worlds[0]);
    // 이 캐릭터(수정 중이면 그 id, 새로 만드는 중이면 이 세계관)로 임시저장해둔 내용이
    // 있으면 불러온다 — 저장된 캐릭터 값(existing) 대신 이 초안으로 폼을 채운다.
    let draft = loadDraft(existing, w);
    // 임시저장본이 만들어진 뒤에 그 캐릭터가 이미 다시 저장됐다면(sha가 달라졌다면) 그
    // 임시저장본은 낡은 것이다. 그대로 불러오면 최신 내용을 옛날 내용이 덮어쓰게 되므로 버린다.
    if (draft && isEdit && draft.sha !== existing._sha) {
      clearDraft(existing, w);
      draft = null;
    }
    const renderData = draft ? draft.snap : existing;
    const customValuesSource = draft ? draft.snap.fields : (isEdit ? existing.fields : null);
    // 폼을 다시 열 때(초안 버리고 다시 열기 등) 이전에 돌고 있던 임시저장 타이머가
    // 남아있으면 먼저 멈춘다 — 안 그러면 여러 개가 겹쳐서 돌게 된다.
    if (formAutosaveTimer) {
      clearInterval(formAutosaveTimer);
      formAutosaveTimer = null;
    }

    formBody.innerHTML = `
      <h2 class="form-title">${isEdit ? '캐릭터 수정' : '캐릭터 생성'}</h2>
      ${draft ? `<p class="form-hint draft-restored-hint">작성하다 만 내용을 불러왔어요. <a href="#" id="discardDraftLink">처음부터 다시 쓰기</a></p>` : ''}

      <div class="image-area">
        <div class="template-select-row">
          <select class="template-select" id="fWorld">
            ${worlds.map((wo) => `<option value="${wo.id}" ${wo.id === w.id ? 'selected' : ''}>${wo.name}</option>`).join('')}
          </select>
          <button type="button" class="template-mini-btn" id="templateAddBtn">+ 새 템플릿</button>
          <button type="button" class="template-mini-btn" id="templateRenameBtn">이름 변경</button>
          <button type="button" class="template-mini-btn danger" id="templateDelBtn">템플릿 삭제</button>
          <button type="button" class="template-mini-btn" id="templateMoveUpBtn" title="탭 순서를 앞으로">▲ 순서</button>
          <button type="button" class="template-mini-btn" id="templateMoveDownBtn" title="탭 순서를 뒤로">▼ 순서</button>
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
      <div id="customFieldsContainer"></div>

      <p class="form-error" id="formError"></p>
      <button class="form-submit" id="formSubmit">${isEdit ? '저장하기' : '만들기'}</button>
      <p class="form-hint">
        토큰이 없거나 저장이 안 되면
        <a href="#" id="formFallbackLink">깃허브에서 직접 만들기</a>로 대신하세요.
      </p>
    `;

    renderDynamicSection(w, renderData, presetSubcategory);

    // 이 캐릭터만의 항목(customFields)은 지금 고른 세계관이 이 캐릭터가 원래 속한
    // 세계관과 같을 때만(=수정 중일 때) 기존 값을 그대로 가져오고, 그 외에는 빈 목록에서 시작한다.
    // (새로 추가했다가 아직 저장 안 한 항목 자체는 초안에 담기지 않고, 그 항목에 입력해둔
    // 값만 customValuesSource로 복원된다.)
    currentCustomFields = isEdit && existing && existing.world === w.id && Array.isArray(existing.customFields)
      ? JSON.parse(JSON.stringify(existing.customFields))
      : [];
    renderCustomFieldsSection(w, customValuesSource);
    window.__refreshCustomFieldsSection = (updatedWorld) => {
      renderCustomFieldsSection(updatedWorld, isEdit && existing.world === updatedWorld.id ? existing.fields : null);
    };

    if (draft) {
      const discardLink = document.getElementById('discardDraftLink');
      if (discardLink) {
        discardLink.addEventListener('click', (e) => {
          e.preventDefault();
          clearDraft(existing, w);
          openEditForm(existing, world, presetSubcategory);
        });
      }
    }

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
      currentCustomFields = isEdit && existing && existing.world === newWorld.id && Array.isArray(existing.customFields)
        ? JSON.parse(JSON.stringify(existing.customFields))
        : [];
      renderCustomFieldsSection(newWorld, isEdit && existing.world === newWorld.id ? existing.fields : null);
      window.__refreshCustomFieldsSection = (updatedWorld) => {
        renderCustomFieldsSection(updatedWorld, isEdit && existing.world === updatedWorld.id ? existing.fields : null);
      };
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

    document.getElementById('templateMoveUpBtn').addEventListener('click', async () => {
      const current = worldById(selectedWorldId);
      const moved = await moveTemplate(current, -1);
      if (moved) switchToWorld(moved);
    });

    document.getElementById('templateMoveDownBtn').addEventListener('click', async () => {
      const current = worldById(selectedWorldId);
      const moved = await moveTemplate(current, 1);
      if (moved) switchToWorld(moved);
    });

    document.getElementById('formFallbackLink').addEventListener('click', (e) => {
      e.preventDefault();
      window.open(buildGithubNewFileUrl(worldById(selectedWorldId), presetSubcategory, isEdit ? existing : null), '_blank');
    });

    document.getElementById('formSubmit').addEventListener('click', () => {
      submitForm(isEdit, existing, worldById(selectedWorldId));
    });

    formOverlay.classList.add('is-open');

    // 몇 초마다 지금까지 입력한 내용을 조용히 임시저장해둔다. 실수로 창을 닫거나
    // 다른 화면을 눌러서 나가도, 다시 이 캐릭터(또는 이 세계관의 새 캐릭터 만들기)를
    // 열면 여기서 복원된다 — 실제로 저장(formSubmit 성공)하면 그때 지워진다.
    formAutosaveTimer = setInterval(() => {
      saveDraftNow(existing, worldById(selectedWorldId) || w);
    }, 4000);
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

    const submitBtn = document.getElementById('formSubmit');
    submitBtn.disabled = true;
    submitBtn.textContent = '저장 중...';

    // 아래 전체(화면 값 읽어오기 + 실제 저장)를 하나의 try로 묶어서, 어디서 문제가
    // 생기든 (화면에 입력한 값을 읽는 단계에서 생긴 예상 못한 오류까지 포함해서)
    // 사용자한테 "저장에 실패했어요" 메시지가 반드시 보이게 한다. 예전에는 값을
    // 읽어오는 부분이 이 try 밖에 있어서, 거기서 오류가 나면 버튼도 그대로 멈춰있고
    // 아무 메시지도 안 뜨는 채로 저장이 조용히 실패하는 경우가 있었다.
    try {
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

      // "캐릭터마다 다른 항목 추가 허용"이 켜진 템플릿이면, 템플릿 공통 항목(world.fields)에
      // 이 캐릭터만의 항목(currentCustomFields)을 더해서 같이 처리한다.
      const allValueFields = [...(world.fields || []), ...currentCustomFields];

      obj.fields = {};
      allValueFields.forEach((f) => {
        if (f.key === 'name') return; // 이름은 obj.name(최상위)에 이미 저장됨
        if (f.type === 'tags' || (f.type === 'category' && f.multi)) {
          obj.fields[f.key] = currentFieldWidgets[f.key] ? currentFieldWidgets[f.key].getValues() : [];
        } else if (f.type === 'rating') {
          obj.fields[f.key] = currentFieldWidgets[f.key] ? currentFieldWidgets[f.key].getValue() : 0;
        } else if (f.type === 'entries') {
          const list = currentFieldWidgets[f.key] ? currentFieldWidgets[f.key].getEntries() : [];
          obj.fields[f.key] = list.map((e) => ({ id: e.id, name: e.name || '', desc: e.desc || '', image: e.image || null }));
        } else if (f.type === 'textarea' || f.type === 'collapse' || f.type === 'text') {
          const rt = document.querySelector(`.richtext-editable[data-field-key="${f.key}"]`);
          obj.fields[f.key] = rt ? stripTrailingBr(rt.innerHTML) : '';
        } else if (f.type === 'category') {
          const input = document.querySelector(`[data-field-key="${f.key}"]`);
          obj.fields[f.key] = input ? input.value.trim() : '';
        } else {
          const input = document.querySelector(`[data-field-key="${f.key}"]`);
          obj.fields[f.key] = input ? input.value.trim() || '-' : '-';
        }
      });

      if (world.perCharacterFields) {
        obj.customFields = currentCustomFields.map((f) => ({ key: f.key, label: f.label, type: f.type }));
      }

      if (isSinsekaiWorld(world) && partOverrideWidget) {
        obj.fields.partOverrides = partOverrideWidget.getValue();
      }

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
      for (const f of allValueFields) {
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

      // 실제로 저장이 끝났으니, 그동안 쌓인 임시저장본은 이제 필요 없다.
      clearDraft(existing, world);
      closeFormModal();
      renderSidebar();
      renderGallery();
    } catch (err) {
      console.error(err);
      errorEl.textContent = err.message === 'NO_TOKEN'
        ? '토큰이 없어서 저장할 수 없어요.'
        : '저장에 실패했어요: ' + (err && err.message ? err.message : '알 수 없는 오류') + ' (토큰 권한을 확인해주세요)';
      // 오류 문구가 버튼 바로 위라 스크롤 위치에 따라 눈에 안 띌 수 있어서, 실패했을
      // 때는 그 문구가 확실히 화면에 보이도록 당겨오고 잠깐 눈에 띄게 한다.
      errorEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      errorEl.classList.add('form-error-flash');
      setTimeout(() => errorEl.classList.remove('form-error-flash'), 1600);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? '저장하기' : '만들기';
    }
  }

  // ---------- 설정 모달 ----------
  // 토큰이 없을 때: 다크 모드 / 토큰 설정
  // 토큰이 있을 때: 다크 모드 / (구분선) / 편집 모드 / [편집 모드가 켜져 있을 때만: 사이트 제목,
  // 로고, 파비콘, 카테고리·템플릿 설정] / (구분선) / 토큰 설정
  const settingsOverlay = document.getElementById('settingsOverlay');
  const settingsBody = document.getElementById('settingsBody');
  const settingsClose = document.getElementById('settingsClose');
  const settingsFabEl = document.getElementById('settingsFab');

  // 'main'(기본 설정 화면) 또는 'categories'(카테고리/템플릿 설정 화면)
  let settingsView = 'main';
  // 카테고리/템플릿 설정 화면에서 지금 템플릿(입력 항목 목록)을 펼쳐둔 카테고리 id
  let openTemplateWorldId = null;

  function closeSettingsModal() {
    settingsOverlay.classList.remove('is-open');
    settingsView = 'main';
    openTemplateWorldId = null;
  }
  settingsClose.addEventListener('click', closeSettingsModal);
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) closeSettingsModal();
  });

  function toggleSwitchHtml(id, isOn) {
    return `<button type="button" class="toggle-switch${isOn ? ' is-on' : ''}" id="${id}" role="switch" aria-checked="${isOn}"><span class="toggle-switch-knob"></span></button>`;
  }

  // 사이트 설정은 값이 바뀌는 대로 자동 저장된다. 저장 상태는 작은 회색 글씨 한 줄로만 알려준다.
  function setSiteStatus(text, isError) {
    const el = document.getElementById('siteSaveStatus');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-error', !!isError);
  }

  function debounce(fn, ms) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  // 사이트 제목/로고/파비콘/색상 설정 영역. 편집 모드가 켜져 있을 때만 그려진다.
  function siteSettingsHtml() {
    const logo = siteConfig.logo || {};
    const logoMode = logo.type === 'image' ? 'image' : 'text';
    const def = window.OC_DEFAULT_COLORS.light;
    const col = Object.assign({}, def, (siteConfig.colors && siteConfig.colors.light) || {});
    const logoPreview = logo.image
      ? `<img class="settings-preview" src="${escapeAttr(assetUrl(logo.image))}" alt="현재 로고">`
      : '';
    const faviconPreview = siteConfig.favicon
      ? `<img class="settings-preview settings-preview-small" src="${escapeAttr(assetUrl(siteConfig.favicon))}" alt="현재 파비콘">`
      : '';
    return `
      <div class="settings-row">
        <span class="settings-row-label">사이트 제목</span>
        <input type="text" class="settings-input" id="siteTitleInput" value="${escapeAttr(siteConfig.title || '')}" placeholder="${escapeAttr(DEFAULT_SITE_TITLE)}">
      </div>

      <div class="settings-row is-top">
        <span class="settings-row-label">로고</span>
        <div class="settings-row-right">
          <div class="seg-group" id="logoModeGroup">
            <button type="button" class="seg-btn${logoMode === 'image' ? ' is-active' : ''}" data-mode="image">이미지</button>
            <button type="button" class="seg-btn${logoMode === 'text' ? ' is-active' : ''}" data-mode="text">글씨</button>
          </div>
          <div class="settings-file-line" id="logoPaneImage" ${logoMode === 'image' ? '' : 'hidden'}>
            ${logoPreview}
            <label class="settings-small-btn">파일 선택<input type="file" accept="image/*" id="logoFileInput" hidden></label>
          </div>
          <input type="text" class="settings-input" id="logoTextInput" ${logoMode === 'text' ? '' : 'hidden'} value="${escapeAttr(logo.text || '')}" placeholder="${escapeAttr(DEFAULT_SITE_TITLE)}">
        </div>
      </div>

      <div class="settings-row">
        <span class="settings-row-label">파비콘</span>
        <div class="settings-file-line">
          ${faviconPreview}
          <label class="settings-small-btn">파일 선택<input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/x-icon,image/vnd.microsoft.icon" id="faviconFileInput" hidden></label>
          ${siteConfig.favicon ? '<button type="button" class="settings-small-btn" id="faviconRemove">제거</button>' : ''}
        </div>
      </div>

      <div class="settings-row">
        <span class="settings-row-label">색상</span>
        <div class="color-line">
          <label class="color-chip"><input type="color" data-color="bg" value="${col.bg}"><span>배경</span></label>
          <label class="color-chip"><input type="color" data-color="point" value="${col.point}"><span>포인트</span></label>
          <label class="color-chip"><input type="color" data-color="text" value="${col.text}"><span>글씨</span></label>
        </div>
      </div>

      <div class="settings-row">
        <span class="settings-row-label">메인 문구 설정</span>
        <div class="settings-row-right-inline">
          ${toggleSwitchHtml('noticeToggle', noticeEnabled())}
          <button type="button" class="settings-small-btn" id="openNoticeBox">설정</button>
        </div>
      </div>

      <div class="settings-row">
        <span class="settings-row-label">카테고리 / 템플릿</span>
        <button type="button" class="settings-small-btn" id="openCategorySettings">설정</button>
      </div>

      <p class="settings-status" id="siteSaveStatus"></p>
    `;
  }

  // ---------- 공지 ----------
  // 공지가 켜져 있으면 공지글이 사이트의 첫 화면(로고를 눌렀을 때도 이 화면)이 되고,
  // 꺼져 있으면 All(전체 캐릭터) 화면이 첫 화면이 된다.
  function noticeEnabled() {
    return !!(siteConfig.notice && siteConfig.notice.enabled);
  }

  // 공지글 HTML을 허용한 태그/속성만 남기고 정리한다. (저장할 때, 화면에 그릴 때 모두 사용)
  const NOTICE_TAG_MAP = {
    b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u', s: 's', strike: 's', del: 's',
    h1: 'h2', h2: 'h2', h3: 'h2', div: 'div', p: 'div', br: 'br',
  };
  const NOTICE_BLOCKS = ['div', 'h2'];
  // 링크 주소 정리: http/https/mailto/tel만 허용하고, 주소만 적었으면 https://를 붙여준다.
  function safeNoticeUrl(raw) {
    let u = String(raw || '').trim();
    if (!u) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) {
      return /^(https?:|mailto:|tel:)/i.test(u) ? u : '';
    }
    if (u.startsWith('//')) u = 'https:' + u;
    else u = 'https://' + u;
    return u;
  }
  function sanitizeNoticeHtml(html) {
    const doc = new DOMParser().parseFromString('<body>' + String(html || '') + '</body>', 'text/html');
    function clean(node, out) {
      node.childNodes.forEach((ch) => {
        if (ch.nodeType === 3) {
          out.appendChild(document.createTextNode(ch.nodeValue));
          return;
        }
        if (ch.nodeType !== 1) return;
        const tag = ch.tagName.toLowerCase();
        if (tag === 'script' || tag === 'style') return;
        if (tag === 'a') {
          const href = safeNoticeUrl(ch.getAttribute('href'));
          if (!href) { clean(ch, out); return; }
          const a = document.createElement('a');
          a.setAttribute('href', href);
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
          clean(ch, a);
          out.appendChild(a);
          return;
        }
        const mapped = NOTICE_TAG_MAP[tag];
        if (!mapped) {
          clean(ch, out); // 모르는 태그는 벗겨내고 안의 글만 남긴다.
          return;
        }
        const el = document.createElement(mapped);
        if (NOTICE_BLOCKS.indexOf(mapped) !== -1) {
          let align = (ch.style && ch.style.textAlign) || ch.getAttribute('align') || '';
          align = align.toLowerCase();
          if (align === 'left' || align === 'center' || align === 'right') el.style.textAlign = align;
        }
        if (mapped !== 'br') clean(ch, el);
        out.appendChild(el);
      });
    }
    const holder = document.createElement('div');
    clean(doc.body, holder);
    return holder.innerHTML;
  }

  function noticeHasText(html) {
    const d = document.createElement('div');
    d.innerHTML = sanitizeNoticeHtml(html);
    return d.textContent.trim().length > 0;
  }

  function renderNoticeView() {
    const wrap = document.createElement('div');
    wrap.className = 'notice-view';
    const html = siteConfig.notice && siteConfig.notice.html;
    if (noticeHasText(html)) {
      wrap.innerHTML = sanitizeNoticeHtml(html);
    }
    galleryEl.appendChild(wrap);
  }

  // 공지 설정 박스: 서식 도구 모음 + 글 적는 칸 + 저장 버튼
  const noticeOverlay = document.createElement('div');
  noticeOverlay.className = 'modal-overlay';
  noticeOverlay.innerHTML = `
    <div class="modal-card">
      <button class="modal-close" aria-label="닫기">&times;</button>
      <div class="modal-body">
        <h2 class="form-title">메인 문구 설정</h2>
        <div class="rte-toolbar" id="noticeToolbar">
          <button type="button" class="rte-btn" data-cmd="bold" aria-label="굵게"><b>B</b></button>
          <button type="button" class="rte-btn" data-cmd="italic" aria-label="기울임"><i>I</i></button>
          <button type="button" class="rte-btn" data-cmd="underline" aria-label="밑줄"><u>U</u></button>
          <button type="button" class="rte-btn" data-cmd="strikeThrough" aria-label="취소선"><s>S</s></button>
          <span class="rte-sep"></span>
          <button type="button" class="rte-btn" data-cmd="header" aria-label="헤더">H</button>
          <span class="rte-sep"></span>
          <button type="button" class="rte-btn" data-cmd="link" aria-label="하이퍼링크"><svg viewBox="0 0 16 16" width="16" height="16"><path d="M6.5 9.5a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.8.8M9.5 6.5a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l.8-.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg></button>
          <span class="rte-sep"></span>
          <button type="button" class="rte-btn" data-cmd="left" aria-label="왼쪽 정렬"><svg viewBox="0 0 16 16" width="16" height="16"><path d="M2 3h12M2 6.5h8M2 10h12M2 13.5h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg></button>
          <button type="button" class="rte-btn" data-cmd="center" aria-label="가운데 정렬"><svg viewBox="0 0 16 16" width="16" height="16"><path d="M2 3h12M4 6.5h8M2 10h12M4 13.5h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg></button>
          <button type="button" class="rte-btn" data-cmd="right" aria-label="오른쪽 정렬"><svg viewBox="0 0 16 16" width="16" height="16"><path d="M2 3h12M6 6.5h8M2 10h12M6 13.5h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg></button>
        </div>
        <div class="rte-linkbar" id="noticeLinkBar" hidden>
          <input type="url" inputmode="url" autocapitalize="off" autocorrect="off" class="settings-input" id="noticeLinkInput" placeholder="https://">
          <button type="button" class="settings-small-btn is-primary" id="noticeLinkApply">적용</button>
          <button type="button" class="settings-small-btn" id="noticeLinkRemove">해제</button>
        </div>
        <div class="rte-editor" id="noticeEditor" contenteditable="true" role="textbox" aria-multiline="true" spellcheck="false"></div>
        <p class="settings-status" id="noticeStatus"></p>
        <button type="button" class="form-submit" id="noticeSave">저장</button>
      </div>
    </div>`;
  document.body.appendChild(noticeOverlay);
  const noticeEditorEl = noticeOverlay.querySelector('#noticeEditor');
  const noticeToolbarEl = noticeOverlay.querySelector('#noticeToolbar');
  const noticeStatusEl = noticeOverlay.querySelector('#noticeStatus');
  function closeNoticeBox() { noticeOverlay.classList.remove('is-open'); }
  noticeOverlay.querySelector('.modal-close').addEventListener('click', closeNoticeBox);
  noticeOverlay.addEventListener('click', (e) => { if (e.target === noticeOverlay) closeNoticeBox(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNoticeBox(); });

  // --- 선택 영역 기억/복원 ---
  // 아이폰(iOS)에서는 도구 모음 버튼을 누르는 순간 글 적는 칸의 선택이 풀리는 일이 많아서,
  // 선택이 바뀔 때마다 마지막 선택을 기억해두고, 버튼을 누르면 그 선택을 되살린 뒤에 서식을 적용한다.
  let noticeSavedRange = null;
  function selectionInEditor() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const r = sel.getRangeAt(0);
    return noticeEditorEl.contains(r.commonAncestorContainer) ? r : null;
  }
  document.addEventListener('selectionchange', () => {
    const r = selectionInEditor();
    if (r) {
      noticeSavedRange = r.cloneRange();
      updateNoticeToolbarState();
    }
  });
  function restoreNoticeSelection() {
    noticeEditorEl.focus({ preventScroll: true });
    const sel = window.getSelection();
    let r = noticeSavedRange;
    if (!r || !noticeEditorEl.contains(r.commonAncestorContainer)) {
      r = document.createRange();
      r.selectNodeContents(noticeEditorEl);
      r.collapse(false);
    }
    sel.removeAllRanges();
    sel.addRange(r);
    return r;
  }

  // --- 줄(블록) 정리: 맨 위에 바로 적힌 글이 있으면 div로 감싸 준다 ---
  function ensureNoticeBlocks() {
    if (!noticeEditorEl.firstChild) {
      noticeEditorEl.innerHTML = '<div><br></div>';
      return;
    }
    const sel = window.getSelection();
    const anchor = sel && sel.anchorNode, anchorOff = sel ? sel.anchorOffset : 0;
    let moved = false;
    let run = null;
    Array.from(noticeEditorEl.childNodes).forEach((n) => {
      const isBlock = n.nodeType === 1 && NOTICE_BLOCKS.indexOf(n.tagName.toLowerCase()) !== -1;
      if (isBlock) { run = null; return; }
      if (!run) {
        run = document.createElement('div');
        noticeEditorEl.insertBefore(run, n);
      }
      run.appendChild(n);
      moved = true;
    });
    if (moved && anchor && noticeEditorEl.contains(anchor)) {
      const r = document.createRange();
      r.setStart(anchor, Math.min(anchorOff, anchor.nodeType === 3 ? anchor.length : anchor.childNodes.length));
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }
  noticeEditorEl.addEventListener('input', ensureNoticeBlocks);
  noticeEditorEl.addEventListener('focus', ensureNoticeBlocks);

  function topBlocksOfRange(r) {
    const out = [];
    Array.from(noticeEditorEl.children).forEach((b) => {
      if (r.intersectsNode(b)) out.push(b);
    });
    return out;
  }

  function applyNoticeAlign(align) {
    const r = restoreNoticeSelection();
    ensureNoticeBlocks();
    const blocks = topBlocksOfRange(window.getSelection().getRangeAt(0) || r);
    const allSame = blocks.length > 0 && blocks.every((b) => b.style.textAlign === align);
    blocks.forEach((b) => { b.style.textAlign = allSame && align !== 'left' ? '' : align; });
  }

  function applyNoticeHeader() {
    restoreNoticeSelection();
    ensureNoticeBlocks();
    const sel = window.getSelection();
    const r = sel.getRangeAt(0);
    const blocks = topBlocksOfRange(r);
    if (!blocks.length) return;
    const toDiv = blocks.every((b) => b.tagName.toLowerCase() === 'h2');
    // 선택 영역의 끝점이 바뀐 줄 안에 있으면, 줄이 새 요소로 바뀐 뒤에도 같은 자리를 다시 잡아준다.
    const pts = [[r.startContainer, r.startOffset], [r.endContainer, r.endOffset]];
    const map = new Map();
    blocks.forEach((b) => {
      const nb = document.createElement(toDiv ? 'div' : 'h2');
      if (b.style.textAlign) nb.style.textAlign = b.style.textAlign;
      while (b.firstChild) nb.appendChild(b.firstChild);
      if (!nb.firstChild) nb.appendChild(document.createElement('br'));
      b.parentNode.replaceChild(nb, b);
      map.set(b, nb);
    });
    const fix = (c) => (map.has(c) ? map.get(c) : c);
    try {
      const nr = document.createRange();
      nr.setStart(fix(pts[0][0]), pts[0][1]);
      nr.setEnd(fix(pts[1][0]), pts[1][1]);
      sel.removeAllRanges();
      sel.addRange(nr);
    } catch (e) { /* 선택을 못 되살려도 서식은 이미 적용됨 */ }
  }

  // 굵게/기울임/밑줄/취소선: 브라우저 기본 명령을 쓰되, 안 먹히면(일부 iOS 환경) 직접 감싸서 적용한다.
  const INLINE_CMDS = { bold: 'b', italic: 'i', underline: 'u', strikeThrough: 's' };
  function applyNoticeInline(cmd) {
    const r = restoreNoticeSelection();
    ensureNoticeBlocks();
    let ok = false;
    const before = noticeEditorEl.innerHTML;
    try {
      document.execCommand('styleWithCSS', false, false);
      ok = document.execCommand(cmd, false, null);
    } catch (e) { ok = false; }
    const sel = window.getSelection();
    const cur = sel.rangeCount ? sel.getRangeAt(0) : r;
    if ((!ok || noticeEditorEl.innerHTML === before) && !cur.collapsed) {
      const el = document.createElement(INLINE_CMDS[cmd]);
      try {
        el.appendChild(cur.extractContents());
        cur.insertNode(el);
        sel.removeAllRanges();
        const nr = document.createRange();
        nr.selectNodeContents(el);
        sel.addRange(nr);
      } catch (e) { /* 적용 불가한 선택이면 그대로 둔다 */ }
    }
  }

  // --- 하이퍼링크 ---
  const noticeLinkBarEl = noticeOverlay.querySelector('#noticeLinkBar');
  const noticeLinkInputEl = noticeOverlay.querySelector('#noticeLinkInput');
  function anchorAt(node) {
    let n = node;
    while (n && n !== noticeEditorEl) {
      if (n.nodeType === 1 && n.tagName.toLowerCase() === 'a') return n;
      n = n.parentNode;
    }
    return null;
  }
  function applyNoticeLink(rawUrl) {
    const href = safeNoticeUrl(rawUrl);
    if (!href) return false;
    const r = restoreNoticeSelection();
    ensureNoticeBlocks();
    const sel = window.getSelection();
    const cur = sel.rangeCount ? sel.getRangeAt(0) : r;
    const existing = anchorAt(cur.startContainer);
    if (existing) { existing.setAttribute('href', href); return true; }
    if (cur.collapsed) {
      const a = document.createElement('a');
      a.setAttribute('href', href);
      a.textContent = rawUrl.trim();
      cur.insertNode(a);
      return true;
    }
    let ok = false;
    try { ok = document.execCommand('createLink', false, href); } catch (e) { ok = false; }
    const made = Array.from(noticeEditorEl.querySelectorAll('a')).some((a) => a.getAttribute('href') === href);
    if (!ok || !made) {
      const sc = cur.startContainer, ec = cur.endContainer;
      let b1 = sc, b2 = ec;
      while (b1 && b1.parentNode !== noticeEditorEl) b1 = b1.parentNode;
      while (b2 && b2.parentNode !== noticeEditorEl) b2 = b2.parentNode;
      if (b1 && b1 === b2) { // 한 줄 안의 선택일 때만 직접 감싼다
        const a = document.createElement('a');
        a.setAttribute('href', href);
        a.appendChild(cur.extractContents());
        cur.insertNode(a);
      } else {
        return false;
      }
    }
    return true;
  }
  function removeNoticeLink() {
    const r = restoreNoticeSelection();
    const sel = window.getSelection();
    const cur = sel.rangeCount ? sel.getRangeAt(0) : r;
    const anchors = new Set();
    const first = anchorAt(cur.startContainer);
    if (first) anchors.add(first);
    noticeEditorEl.querySelectorAll('a').forEach((a) => { if (cur.intersectsNode(a)) anchors.add(a); });
    anchors.forEach((a) => {
      while (a.firstChild) a.parentNode.insertBefore(a.firstChild, a);
      a.parentNode.removeChild(a);
    });
  }
  function toggleNoticeLinkBar() {
    const open = noticeLinkBarEl.hidden;
    noticeLinkBarEl.hidden = !open;
    if (open) {
      const r = noticeSavedRange;
      const a = r ? anchorAt(r.startContainer) : null;
      noticeLinkInputEl.value = a ? a.getAttribute('href') : '';
      noticeLinkInputEl.focus();
    }
  }
  noticeOverlay.querySelector('#noticeLinkApply').addEventListener('click', () => {
    if (applyNoticeLink(noticeLinkInputEl.value)) {
      noticeLinkBarEl.hidden = true;
      noticeSavedRange = selectionInEditor() ? selectionInEditor().cloneRange() : noticeSavedRange;
      updateNoticeToolbarState();
    }
  });
  noticeOverlay.querySelector('#noticeLinkRemove').addEventListener('click', () => {
    removeNoticeLink();
    noticeLinkBarEl.hidden = true;
    updateNoticeToolbarState();
  });
  noticeLinkInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); noticeOverlay.querySelector('#noticeLinkApply').click(); }
  });
  // 적어 넣은 칸 안의 링크를 눌러도 다른 페이지로 넘어가지 않게 한다.
  noticeEditorEl.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('a')) e.preventDefault(); });

  function updateNoticeToolbarState() {
    if (!noticeOverlay.classList.contains('is-open')) return;
    const r = selectionInEditor();
    const set = (cmd, on) => {
      const b = noticeToolbarEl.querySelector(`[data-cmd="${cmd}"]`);
      if (b) b.classList.toggle('is-active', !!on);
    };
    Object.keys(INLINE_CMDS).forEach((c) => {
      let on = false;
      try { on = document.queryCommandState(c); } catch (e) {}
      set(c, on);
    });
    let block = r ? r.startContainer : null;
    while (block && block.parentNode !== noticeEditorEl) block = block.parentNode;
    const tag = block && block.nodeType === 1 ? block.tagName.toLowerCase() : '';
    const al = (block && block.style && block.style.textAlign) || 'left';
    set('header', tag === 'h2');
    set('link', r && anchorAt(r.startContainer));
    set('left', al === 'left');
    set('center', al === 'center');
    set('right', al === 'right');
  }

  noticeToolbarEl.querySelectorAll('.rte-btn').forEach((btn) => {
    // 버튼을 누를 때 글 적는 칸의 선택/키보드가 풀리지 않도록 기본 동작(포커스 이동)을 막는다.
    ['pointerdown', 'mousedown'].forEach((ev) => btn.addEventListener(ev, (e) => e.preventDefault()));
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.cmd;
      if (cmd === 'link') { toggleNoticeLinkBar(); return; }
      if (INLINE_CMDS[cmd]) applyNoticeInline(cmd);
      else if (cmd === 'header') applyNoticeHeader();
      else applyNoticeAlign(cmd);
      noticeSavedRange = selectionInEditor() ? selectionInEditor().cloneRange() : noticeSavedRange;
      updateNoticeToolbarState();
    });
  });

  function openNoticeBox() {
    const html = siteConfig.notice && siteConfig.notice.html;
    noticeEditorEl.innerHTML = sanitizeNoticeHtml(html) || '<div><br></div>';
    noticeSavedRange = null;
    noticeLinkBarEl.hidden = true;
    noticeStatusEl.textContent = '';
    noticeStatusEl.classList.remove('is-error');
    noticeOverlay.classList.add('is-open');
  }

  noticeOverlay.querySelector('#noticeSave').addEventListener('click', async () => {
    ensureNoticeBlocks();
    const html = noticeHasText(noticeEditorEl.innerHTML) ? sanitizeNoticeHtml(noticeEditorEl.innerHTML) : '';
    noticeStatusEl.classList.remove('is-error');
    noticeStatusEl.textContent = '저장하는 중...';
    const r = await saveSiteWithMutation((d) => {
      d.notice = Object.assign({}, d.notice, { html });
    });
    noticeStatusEl.textContent = r.ok ? '저장됐어요.' : '저장에 실패했어요: ' + r.message;
    noticeStatusEl.classList.toggle('is-error', !r.ok);
    if (r.ok && showNotice) renderGallery();
  });

  // 토큰 설정은 따로 뜨는 박스 안에서 보여준다.
  const tokenOverlay = document.createElement('div');
  tokenOverlay.className = 'modal-overlay';
  tokenOverlay.innerHTML = `
    <div class="modal-card">
      <button class="modal-close" aria-label="닫기">&times;</button>
      <div class="modal-body" id="tokenBody"></div>
    </div>`;
  document.body.appendChild(tokenOverlay);
  const tokenBody = tokenOverlay.querySelector('#tokenBody');
  function closeTokenBox() { tokenOverlay.classList.remove('is-open'); }
  tokenOverlay.querySelector('.modal-close').addEventListener('click', closeTokenBox);
  tokenOverlay.addEventListener('click', (e) => { if (e.target === tokenOverlay) closeTokenBox(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTokenBox(); });

  function renderTokenBox() {
    const hasToken = !!getToken();
    tokenBody.innerHTML = `
      <h2 class="form-title">토큰 설정</h2>
      <div class="token-guide">
        <p>토큰은 사이트 내에서 편집과 저장을 할 수 있는 기능을 제공해요!</p>
        <p><a class="token-link" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">이 곳</a>에서 토큰을 발급해 주세요.</p>
        <ol>
          <li>Repository access를 사용 중인 저장소로 지정해 주세요.</li>
          <li>Permissions에서 Contents: Read and write를 선택해 주세요.</li>
          <li>토큰을 생성 후, 아래에 붙여넣고 저장해 주세요.</li>
        </ol>
        <p>(* 토큰이 생성된 페이지를 떠난 후에는 토큰을 다시 확인할 수 없으니, 필요하시다면 꼭..!! 다른 곳에 토큰을 백업해 주세요!)</p>
      </div>
      <input type="password" class="form-input" id="tokenInput" autocomplete="off" placeholder="${hasToken ? '토큰이 등록되어 있어요!' : ''}">
      <p class="form-error" id="settingsError"></p>
      <button class="form-submit" id="tokenSave">저장</button>
      ${hasToken ? '<button class="form-submit form-submit-secondary" id="tokenClear">토큰 삭제</button>' : ''}
    `;
    document.getElementById('tokenSave').addEventListener('click', () => {
      const v = document.getElementById('tokenInput').value.trim();
      if (!v) {
        document.getElementById('settingsError').textContent = hasToken
          ? '바꾸려면 새 토큰을 붙여넣어 주세요.'
          : '토큰을 입력해주세요.';
        return;
      }
      setToken(v);
      refreshEditUi();
      renderTokenBox();
      renderSettingsBody();
    });
    const tokenClearEl = document.getElementById('tokenClear');
    if (tokenClearEl) {
      tokenClearEl.addEventListener('click', () => {
        setToken('');
        refreshEditUi();
        renderTokenBox();
        renderSettingsBody();
      });
    }
  }

  // 다크모드/편집모드/토큰이 바뀔 때마다 모달을 닫지 않고 안쪽만 다시 그려서 바로 반영한다.
  function renderSettingsBody() {
    if (settingsView === 'categories') {
      renderCategorySettings();
      return;
    }
    const hasToken = !!getToken();
    const editOn = hasToken && isEditModeOn();

    settingsBody.innerHTML = `
      <h2 class="form-title">설정</h2>

      <div class="settings-row">
        <span class="settings-row-label">다크 모드</span>
        ${toggleSwitchHtml('darkModeToggle', isDarkModeOn())}
      </div>

      ${hasToken ? `
        <hr class="settings-divider">
        <div class="settings-row">
          <span class="settings-row-label">편집 모드</span>
          ${toggleSwitchHtml('editModeToggle', isEditModeOn())}
        </div>
        ${editOn ? siteSettingsHtml() : ''}
        <hr class="settings-divider">
      ` : ''}

      <div class="settings-row">
        <span class="settings-row-label">토큰 설정</span>
        <button type="button" class="settings-small-btn" id="openTokenBox">설정</button>
      </div>
    `;

    document.getElementById('darkModeToggle').addEventListener('click', () => {
      setDarkModeOn(!isDarkModeOn());
      renderSettingsBody();
    });

    const editToggleEl = document.getElementById('editModeToggle');
    if (editToggleEl) {
      editToggleEl.addEventListener('click', () => {
        setEditModeOn(!isEditModeOn());
        refreshEditUi();
        renderSettingsBody();
      });
    }

    if (editOn) wireSiteSettings();

    document.getElementById('openTokenBox').addEventListener('click', () => {
      renderTokenBox();
      tokenOverlay.classList.add('is-open');
    });
  }

  // 편집 모드/토큰이 바뀌면, 그에 따라 보이거나 숨겨져야 하는 버튼들(캐릭터 생성, 순서 편집)을
  // 다시 정리하고 갤러리를 다시 그린다.
  function refreshEditUi() {
    refreshCreateButtonVisibility();
    renderGallery();
  }

  // 사이트 설정 저장 공통 처리: 상태 글씨를 갱신하고 결과를 돌려준다.
  async function autoSaveSite(mutateFn) {
    setSiteStatus('저장하는 중...', false);
    const r = await saveSiteWithMutation(mutateFn);
    setSiteStatus(r.ok ? '저장됐어요.' : '저장에 실패했어요: ' + r.message, !r.ok);
    return r;
  }

  function wireSiteSettings() {
    // ---- 사이트 제목 ----
    const titleEl = document.getElementById('siteTitleInput');
    const saveTitle = () => {
      const v = titleEl.value.trim();
      autoSaveSite((d) => { if (v) d.title = v; else delete d.title; });
    };
    const saveTitleSoon = debounce(saveTitle, 700);
    titleEl.addEventListener('input', saveTitleSoon);
    titleEl.addEventListener('change', saveTitle);

    // ---- 로고 ----
    const modeGroup = document.getElementById('logoModeGroup');
    const logoTextEl = document.getElementById('logoTextInput');
    modeGroup.querySelectorAll('.seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        modeGroup.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
        document.getElementById('logoPaneImage').hidden = mode !== 'image';
        logoTextEl.hidden = mode !== 'text';
        autoSaveSite((d) => { d.logo = Object.assign({}, d.logo, { type: mode }); });
      });
    });
    const saveLogoText = () => {
      const v = logoTextEl.value.trim();
      autoSaveSite((d) => {
        d.logo = Object.assign({}, d.logo, { type: 'text' });
        if (v) d.logo.text = v; else delete d.logo.text;
      });
    };
    logoTextEl.addEventListener('input', debounce(saveLogoText, 700));
    logoTextEl.addEventListener('change', saveLogoText);
    document.getElementById('logoFileInput').addEventListener('change', async (e) => {
      const original = e.target.files[0];
      e.target.value = '';
      if (!original) return;
      const picked = await pickSiteImage(original, { aspectRatio: 5, width: 1000 });
      if (!picked) return;
      const prevImage = siteConfig.logo && siteConfig.logo.image;
      setSiteStatus('저장하는 중...', false);
      let path;
      try {
        path = await uploadSiteImage(picked.file, 'logo', picked.ext);
      } catch (err) {
        setSiteStatus('이미지를 올리지 못했어요: ' + err.message, true);
        return;
      }
      const r = await autoSaveSite((d) => {
        d.logo = Object.assign({}, d.logo, { type: 'image', image: path });
      });
      if (r.ok && prevImage && prevImage !== path) deleteSiteImageQuietly(prevImage);
      if (r.ok) { renderSettingsBody(); setSiteStatus('저장됐어요.', false); }
    });

    // ---- 파비콘 ----
    document.getElementById('faviconFileInput').addEventListener('change', async (e) => {
      const original = e.target.files[0];
      e.target.value = '';
      if (!original) return;
      const picked = await pickSiteImage(original, { aspectRatio: 1, width: 256 });
      if (!picked) return;
      const prevFavicon = siteConfig.favicon;
      setSiteStatus('저장하는 중...', false);
      let path;
      try {
        path = await uploadSiteImage(picked.file, 'favicon', picked.ext);
      } catch (err) {
        setSiteStatus('이미지를 올리지 못했어요: ' + err.message, true);
        return;
      }
      const r = await autoSaveSite((d) => { d.favicon = path; });
      if (r.ok && prevFavicon && prevFavicon !== path) deleteSiteImageQuietly(prevFavicon);
      if (r.ok) { renderSettingsBody(); setSiteStatus('저장됐어요.', false); }
    });
    const faviconRemoveEl = document.getElementById('faviconRemove');
    if (faviconRemoveEl) {
      faviconRemoveEl.addEventListener('click', async () => {
        const prevFavicon = siteConfig.favicon;
        const r = await autoSaveSite((d) => { delete d.favicon; });
        if (r.ok && prevFavicon) deleteSiteImageQuietly(prevFavicon);
        if (r.ok) { renderSettingsBody(); setSiteStatus('저장됐어요.', false); }
      });
    }

    // ---- 색상 (라이트 모드 색만 정하면, 다크 모드는 거기에 맞춰 자동으로 만들어진다) ----
    document.querySelectorAll('input[data-color]').forEach((inp) => {
      // 고르는 동안은 바로바로 화면에 미리 보여주고,
      inp.addEventListener('input', () => {
        const colors = JSON.parse(JSON.stringify(siteConfig.colors || {}));
        colors.light = Object.assign({}, colors.light, { [inp.dataset.color]: inp.value });
        siteConfig = Object.assign({}, siteConfig, { colors });
        applyDarkMode();
      });
      // 색 선택을 마치면 저장한다.
      inp.addEventListener('change', () => {
        const key = inp.dataset.color;
        const val = inp.value;
        autoSaveSite((d) => {
          d.colors = d.colors || {};
          d.colors = { light: Object.assign({}, d.colors.light, { [key]: val }) };
        });
      });
    });

    document.getElementById('openNoticeBox').addEventListener('click', openNoticeBox);
    document.getElementById('noticeToggle').addEventListener('click', async () => {
      const on = !noticeEnabled();
      const r = await autoSaveSite((d) => { d.notice = Object.assign({}, d.notice, { enabled: on }); });
      if (!r.ok) return;
      // 홈(All) 화면을 보고 있었다면 바로 공지 화면으로/에서 전환해서 보여준다.
      if (activeWorld === 'all' && !activeSubFilter) showNotice = on;
      else if (!on) showNotice = false;
      renderSidebar();
      renderGallery();
      renderSettingsBody();
      setSiteStatus('저장됐어요.', false);
    });

    document.getElementById('openCategorySettings').addEventListener('click', () => {
      settingsView = 'categories';
      renderSettingsBody();
    });
  }

  // ---------- 사이트 설정(제목/로고/파비콘) 저장소 연동 ----------
  async function fetchSiteForSave() {
    const token = getToken();
    const headers = { Accept: 'application/vnd.github+json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${SITE_PATH}?ref=${GITHUB_BRANCH}`,
      { headers, cache: 'no-store' }
    );
    if (res.status === 404) return { data: {}, sha: undefined };
    if (!res.ok) throw new Error(`사이트 설정 파일을 불러오지 못했어요 (${res.status})`);
    const body = await res.json();
    return { data: JSON.parse(b64DecodeUnicode(body.content)), sha: body.sha };
  }

  // 동시에 여러 번 눌러도 한 번에 하나씩 순서대로 저장되게 줄을 세운다. 저장할 때마다 깃허브의
  // 최신 내용을 받아서 그 위에 이번 변경만 적용하므로, 제목/로고/파비콘이 서로 덮어쓰지 않는다.
  let siteSaveQueue = Promise.resolve();
  function saveSiteWithMutation(mutateFn) {
    const run = siteSaveQueue.then(async () => {
      if (!getToken()) return { ok: false, message: '토큰이 없어요.' };
      const maxAttempts = 4;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const { data, sha } = await fetchSiteForSave();
          mutateFn(data);
          await githubPutFile(SITE_PATH, b64EncodeUnicode(JSON.stringify(data, null, 2)), 'Update site settings', sha);
          applySiteConfig(data);
          writeSiteCache(data);
          return { ok: true };
        } catch (err) {
          const isConflict = /sha|does not match|expected/i.test(err.message || '');
          if (!isConflict || attempt === maxAttempts - 1) {
            console.error(err);
            return { ok: false, message: err.message || '알 수 없는 오류' };
          }
          await new Promise((r) => setTimeout(r, 150 + Math.random() * 250));
        }
      }
      return { ok: false, message: '알 수 없는 오류' };
    });
    siteSaveQueue = run.catch(() => ({ ok: false }));
    return run;
  }

  // file: 사용자가 고른 원본 파일이거나 자르기 결과(blob). ext: 파일 확장자(점 없이).
  async function uploadSiteImage(file, kind, ext) {
    const e = (ext || (file.name || 'x.png').split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const path = `${ASSETS_DIR}/site/${kind}-${Date.now()}.${e}`;
    const b64 = file instanceof File ? await fileToBase64(file) : await blobToBase64(file);
    await githubPutFile(path, b64, `Upload site ${kind}`);
    return path;
  }

  // 로고/파비콘 이미지는 올리기 전에 자르기 창을 먼저 띄운다. 로고는 5:1, 파비콘은 1:1.
  // 반환: 올릴 { file, ext } 또는 (창을 그냥 닫으면) null. 자르기 도구를 못 불러왔으면 원본 그대로.
  function pickSiteImage(file, cropOpts) {
    return new Promise((resolve) => {
      if (typeof Cropper === 'undefined') {
        resolve({ file, ext: null });
        return;
      }
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      openCropModal(file, (blob) => finish({ file: blob, ext: 'png' }), Object.assign({
        mime: 'image/png',
        onSkip: () => finish({ file, ext: null }),
      }, cropOpts));
      // X 버튼/바깥 클릭으로 닫으면 취소
      let seenOpen = false;
      const watch = setInterval(() => {
        const open = cropOverlayEl.classList.contains('is-open');
        if (open) seenOpen = true;
        else if (seenOpen) {
          clearInterval(watch);
          setTimeout(() => finish(null), 50);
        }
        if (done) clearInterval(watch);
      }, 150);
    });
  }

  // 새 이미지로 바꾸거나 기본으로 되돌린 뒤, 더 안 쓰는 예전 이미지 파일은 저장소에서 지운다.
  // 지우다 실패해도 사이트 동작에는 영향이 없으니 조용히 넘어간다.
  async function deleteSiteImageQuietly(path) {
    try {
      await githubDeleteFile(path, 'Remove unused site image');
    } catch (err) {
      console.warn('예전 사이트 이미지를 지우지 못했어요:', path, err);
    }
  }

  // ---------- 카테고리 / 템플릿 설정 화면 ----------
  const FIELD_TYPE_LABELS = {
    text: '텍스트', tags: '태그', textarea: '긴 글', collapse: '접은 글',
    rating: '레이팅', entries: '엔트리', category: '분류',
  };
  let catBusy = false;

  // 카테고리(=worlds.json의 세계관) 구조를 바꾸고, 사이드바/갤러리/이 화면을 같이 갱신한다.
  async function catMutate(mutateFn) {
    if (catBusy) return false;
    catBusy = true;
    const ok = await saveWorldsWithMutation(mutateFn);
    catBusy = false;
    if (activeWorld !== 'all' && !worldById(activeWorld)) {
      activeWorld = 'all';
      activeSubFilter = null;
    }
    renderSidebar();
    renderGallery();
    renderCategorySettings();
    return ok;
  }

  function makeEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function renderCategorySettings() {
    settingsBody.innerHTML = '';
    const back = makeEl('button', 'settings-back', '← 설정으로');
    back.type = 'button';
    back.addEventListener('click', () => {
      settingsView = 'main';
      renderSettingsBody();
    });
    settingsBody.appendChild(back);
    settingsBody.appendChild(makeEl('h2', 'form-title', '카테고리 / 템플릿 설정'));
    const catHint = makeEl('p', 'form-hint');
    catHint.innerHTML = '각 카테고리의 순서, 이름, 프로필 템플릿을 변경/삭제할 수 있어요.<br>모든 변경 사항은 자동으로 저장됩니다.';
    settingsBody.appendChild(catHint);

    const list = makeEl('div', 'cat-list');
    worlds.forEach((w, idx) => {
      const item = makeEl('div', 'cat-item');
      const row = makeEl('div', 'cat-row');

      const moveWrap = makeEl('div', 'field-manager-move');
      const up = makeEl('button', 'field-manager-move-btn', '▲');
      up.type = 'button';
      up.disabled = idx === 0;
      up.addEventListener('click', () => catMutate((fw) => {
        const i = fw.findIndex((x) => x.id === w.id);
        if (i > 0) { const [it] = fw.splice(i, 1); fw.splice(i - 1, 0, it); }
      }));
      const down = makeEl('button', 'field-manager-move-btn', '▼');
      down.type = 'button';
      down.disabled = idx === worlds.length - 1;
      down.addEventListener('click', () => catMutate((fw) => {
        const i = fw.findIndex((x) => x.id === w.id);
        if (i !== -1 && i < fw.length - 1) { const [it] = fw.splice(i, 1); fw.splice(i + 1, 0, it); }
      }));
      moveWrap.appendChild(up);
      moveWrap.appendChild(down);
      row.appendChild(moveWrap);

      const nameInput = makeEl('input', 'form-input cat-name-input');
      nameInput.type = 'text';
      nameInput.value = w.name;
      nameInput.addEventListener('change', () => {
        const v = nameInput.value.trim();
        if (!v || v === w.name) { nameInput.value = w.name; return; }
        catMutate((fw) => {
          const t = fw.find((x) => x.id === w.id);
          if (t) { t.name = v; t.shortName = v; }
        });
      });
      row.appendChild(nameInput);

      const isOpen = openTemplateWorldId === w.id;
      const tplBtn = makeEl('button', 'settings-small-btn' + (isOpen ? ' is-primary' : ''), isOpen ? '템플릿 닫기' : '템플릿');
      tplBtn.type = 'button';
      tplBtn.addEventListener('click', () => {
        openTemplateWorldId = isOpen ? null : w.id;
        renderCategorySettings();
      });
      row.appendChild(tplBtn);

      const delBtn = makeEl('button', 'settings-small-btn is-danger', '삭제');
      delBtn.type = 'button';
      delBtn.addEventListener('click', () => {
        if (worlds.length <= 1) {
          window.alert('카테고리가 하나뿐이라 삭제할 수 없어요.');
          return;
        }
        if (!window.confirm(`"${w.name}" 카테고리를 삭제할까요? (이 카테고리로 만든 기존 캐릭터의 데이터는 남지만, 화면에서 이 카테고리 자체는 사라져요)`)) return;
        if (openTemplateWorldId === w.id) openTemplateWorldId = null;
        catMutate((fw) => {
          const i = fw.findIndex((x) => x.id === w.id);
          if (i !== -1) fw.splice(i, 1);
        });
      });
      row.appendChild(delBtn);

      item.appendChild(row);
      if (isOpen) item.appendChild(buildTemplateEditor(w));
      list.appendChild(item);
    });
    settingsBody.appendChild(list);

    const addRow = makeEl('div', 'cat-add-row');
    const addInput = makeEl('input', 'form-input');
    addInput.type = 'text';
    addInput.id = 'catNewName';
    addInput.placeholder = '새 카테고리 이름';
    const addBtn = makeEl('button', 'settings-small-btn is-primary', '+ 카테고리 추가');
    addBtn.type = 'button';
    addBtn.addEventListener('click', () => {
      const name = addInput.value.trim();
      if (!name) return;
      const newId = slugify();
      openTemplateWorldId = newId;
      catMutate((fw) => {
        fw.push({
          id: newId, name, shortName: name, description: '', color: '#9a9a9a',
          fields: [{ key: 'name', label: '이름', type: 'text', core: true }],
        });
      });
    });
    addRow.appendChild(addInput);
    addRow.appendChild(addBtn);
    settingsBody.appendChild(addRow);
  }

  // 한 카테고리의 프로필 템플릿(입력 항목 목록) 편집기. 순서 변경, 이름 변경, 삭제, 추가,
  // 분류/태그 항목의 사이드바·갤러리 역할 설정을 할 수 있다.
  function buildTemplateEditor(w) {
    const box = makeEl('div', 'tpl-editor');
    const fields = w.fields || [];

    function mutateField(key, fn) {
      return catMutate((fw) => {
        const t = fw.find((x) => x.id === w.id);
        const f = t && (t.fields || []).find((ff) => ff.key === key);
        if (f) fn(f, t);
      });
    }

    fields.forEach((f, idx) => {
      const row = makeEl('div', 'tpl-row');
      const top = makeEl('div', 'tpl-row-top');

      const moveWrap = makeEl('div', 'field-manager-move');
      const up = makeEl('button', 'field-manager-move-btn', '▲');
      up.type = 'button';
      up.disabled = idx === 0;
      up.addEventListener('click', () => catMutate((fw) => {
        const t = fw.find((x) => x.id === w.id);
        const arr = t && t.fields;
        if (!arr) return;
        const i = arr.findIndex((ff) => ff.key === f.key);
        if (i > 0) [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
      }));
      const down = makeEl('button', 'field-manager-move-btn', '▼');
      down.type = 'button';
      down.disabled = idx === fields.length - 1;
      down.addEventListener('click', () => catMutate((fw) => {
        const t = fw.find((x) => x.id === w.id);
        const arr = t && t.fields;
        if (!arr) return;
        const i = arr.findIndex((ff) => ff.key === f.key);
        if (i !== -1 && i < arr.length - 1) [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
      }));
      moveWrap.appendChild(up);
      moveWrap.appendChild(down);
      top.appendChild(moveWrap);

      const labelInput = makeEl('input', 'form-input tpl-label-input');
      labelInput.type = 'text';
      labelInput.value = f.label;
      labelInput.addEventListener('change', () => {
        const v = labelInput.value.trim();
        if (!v || v === f.label) { labelInput.value = f.label; return; }
        mutateField(f.key, (ff) => { ff.label = v; });
      });
      top.appendChild(labelInput);

      const typeLabel = f.core ? '필수 항목' : (FIELD_TYPE_LABELS[f.type] || f.type);
      top.appendChild(makeEl('span', 'field-type-tag', typeLabel));

      if (!f.core) {
        const del = makeEl('button', 'settings-small-btn is-danger', '삭제');
        del.type = 'button';
        del.addEventListener('click', () => {
          if (!window.confirm('이 항목을 삭제할까요? (기존 캐릭터의 값은 남아있지만 화면에 더 이상 보이지 않아요)')) return;
          catMutate((fw) => {
            const t = fw.find((x) => x.id === w.id);
            if (t) t.fields = (t.fields || []).filter((ff) => ff.key !== f.key);
          });
        });
        top.appendChild(del);
      }
      row.appendChild(top);

      const roles = [];
      if (f.core) roles.push({ label: '캐릭터마다 다른 항목 추가 허용', checked: !!w.perCharacterFields, apply: (checked) => catMutate((fw) => {
        const t = fw.find((x) => x.id === w.id);
        if (t) t.perCharacterFields = checked;
      }) });
      if (f.type === 'tags' || f.type === 'category') {
        roles.push({ label: '사이드바 필터로 쓰기', checked: !!f.sidebarFilter, apply: (c) => mutateField(f.key, (ff) => { ff.sidebarFilter = c; }) });
        roles.push({ label: '갤러리 구역으로 묶기', checked: !!f.galleryGroup, apply: (c) => mutateField(f.key, (ff) => { ff.galleryGroup = c; }) });
      }
      if (f.type === 'category') {
        roles.push({ label: '여러 개 선택 가능 (예: 1부~5부에 걸쳐 등장)', checked: !!f.multi, apply: (c) => mutateField(f.key, (ff) => { ff.multi = c; }) });
      }
      if (roles.length) {
        const roleRow = makeEl('div', 'field-category-roles');
        roles.forEach((r) => {
          const lab = makeEl('label', 'field-category-role-chk');
          const chk = document.createElement('input');
          chk.type = 'checkbox';
          chk.checked = r.checked;
          chk.addEventListener('change', () => r.apply(chk.checked));
          lab.appendChild(chk);
          lab.appendChild(document.createTextNode(' ' + r.label));
          roleRow.appendChild(lab);
        });
        row.appendChild(roleRow);
      }
      box.appendChild(row);
    });

    const addRow = makeEl('div', 'tpl-add-row');
    const addInput = makeEl('input', 'form-input');
    addInput.type = 'text';
    addInput.placeholder = '새 항목 이름 (예: 취미)';
    const typeSel = makeEl('select', 'form-input');
    [
      ['text', '텍스트 입력'], ['tags', '태그 입력'], ['textarea', '긴 글(소개·성격 등)'],
      ['collapse', '접은 글(눌러야 펼쳐짐)'], ['rating', '레이팅(별점)'],
      ['entries', '엔트리 목록(이미지+이름+설명)'], ['category', '분류(사이드바·갤러리 구역)'],
    ].forEach(([v, l]) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = l;
      typeSel.appendChild(o);
    });
    const addBtn = makeEl('button', 'settings-small-btn is-primary', '+ 항목 추가');
    addBtn.type = 'button';
    addBtn.addEventListener('click', () => {
      const label = addInput.value.trim();
      if (!label) return;
      const key = 'f_' + Date.now();
      const type = typeSel.value;
      catMutate((fw) => {
        const t = fw.find((x) => x.id === w.id);
        if (t) {
          t.fields = t.fields || [];
          t.fields.push({ key, label, type });
        }
      });
    });
    addRow.appendChild(addInput);
    addRow.appendChild(typeSel);
    addRow.appendChild(addBtn);
    box.appendChild(addRow);
    return box;
  }

  if (settingsFabEl) {
    settingsFabEl.addEventListener('click', () => {
      settingsView = 'main';
      openTemplateWorldId = null;
      renderSettingsBody();
      settingsOverlay.classList.add('is-open');
    });
  }

  createTopBtnEl.addEventListener('click', () => {
    const world = activeWorld === 'all' ? worlds[0] : worldById(activeWorld);
    const preset = activeSubFilter || null;
    openEditForm(null, world, preset);
  });

  if (orderEditBtnEl) {
    orderEditBtnEl.addEventListener('click', () => {
      editOrderMode = !editOrderMode;
      updateOrderEditButton();
      const world = activeWorld === 'all' ? null : worldById(activeWorld);
      refreshSortableInstances(world);
    });
  }

  // 캐릭터 생성 버튼도 수정하기/삭제와 마찬가지로, 저장용 개인 토큰을 등록해둔
  // 사람(=실제 운영자)한테만 보이게 한다. 토큰을 넣고 뺄 때마다 다시 확인한다.
  function refreshCreateButtonVisibility() {
    createTopBtnEl.style.display = canEditNow() && !(showNotice && noticeEnabled()) ? '' : 'none';
  }
  refreshCreateButtonVisibility();

  applyDarkMode();
  const sitePromise = loadSite();
  [worlds, characters] = await Promise.all([loadWorlds(), loadCharacters()]);
  await sitePromise;
  showNotice = noticeEnabled();

  renderSidebar();
  renderGallery();

  // 화면 크기가 모바일/넓은 화면 기준을 넘나들 때(가로세로 전환 등) 하위 카테고리 위치가
  // 맞는 쪽으로 다시 그려지도록 한다.
  let wasMobileNav = window.matchMedia('(max-width: 640px)').matches;
  window.addEventListener('resize', () => {
    const isMobileNav = window.matchMedia('(max-width: 640px)').matches;
    if (isMobileNav !== wasMobileNav) {
      wasMobileNav = isMobileNav;
      renderSidebar();
    }
  });
})();
