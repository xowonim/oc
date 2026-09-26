# xowon's OC

세계관별 오리지널 캐릭터를 정리하는 사이트. 사이트 안에서 바로 캐릭터를 추가·수정하고 이미지를 올릴 수 있다.

## 구조

```
index.html                       메인 페이지 (사이드바 + 갤러리 + 상세/생성 모달)
css/style.css                     스타일
js/app.js                         데이터 로드, 정렬/그룹, 렌더링, 생성·수정 로직
data/worlds.json                  세계관(神世界/OC/YMKB/ETC) 정의와 정렬·분류 규칙
data/characters/                  캐릭터 파일들 (파일 하나 = 캐릭터 한 명)
data/characters/_template.json    수동으로 만들 때 참고용 틀
assets/                           캐릭터 이미지
```

## 사이트에서 바로 캐릭터 추가/수정하기 (처음 한 번만 설정)

이 사이트는 깃허브에 직접 저장하기 위해 개인 토큰이 필요하다. 최초 1회만 설정하면 이후엔 사이트 안에서 버튼 클릭만으로 캐릭터를 만들고 고칠 수 있다.

1. 사이드바 아래 **⚙ 저장 설정**을 누른다.
2. 안내된 링크에서 새 토큰(fine-grained personal access token)을 발급한다.
   - Repository access: 이 저장소(`xowonim/oc`)만 선택
   - Permissions → **Contents: Read and write** 선택
3. 발급된 토큰을 복사해서 설정 창에 붙여넣고 저장한다. (이 기기의 브라우저에만 저장되고, 깃허브에는 올라가지 않는다.)

이후에는:
- 갤러리의 점선 **"+ 캐릭터 생성"** 타일을 누르면 그 자리에서 바로 폼이 열린다. 이름/나이/소속/세부 항목/소개/이미지를 채우고 **만들기**를 누르면 자동으로 깃허브에 커밋되고 갤러리에 바로 나타난다.
- 캐릭터 카드를 눌러 상세 모달을 연 뒤 **수정하기**를 누르면 같은 폼이 기존 값으로 채워진 채 열리고, **저장하기**로 바로 반영된다.
- 이미지도 폼의 파일 선택으로 올리면 `assets/`에 자동으로 저장된다.

토큰 설정을 안 했거나 저장이 실패하면, 폼 아래 **"깃허브에서 직접 만들기"** 링크로 깃허브의 파일 편집 화면으로 이동해서 수동으로 처리할 수 있다.

## 수동으로 캐릭터 파일 만들기 (토큰 없이)

1. `data/characters` 폴더의 `_template.json`을 열어 내용을 복사한다.
2. **Add file → Create new file**에서 파일 이름을 `data/characters/캐릭터영문이름.json`으로 입력.
3. 내용을 붙여넣고 값을 채운 뒤 Commit. (파일 이름이 `_`로 시작하면 목록에서 제외되니 새 파일명에는 밑줄을 넣지 않는다.)

## 캐릭터 파일의 필드

```json
{
  "id": "character-id",
  "world": "sinsekai",
  "part": "1부",
  "subcategory": "오토리 일행",
  "name": "캐릭터 이름",
  "age": 0,
  "affiliation": "소속",
  "grade": null,
  "class": null,
  "image": null,
  "fields": { "role": "-", "power": "-" },
  "bio": "캐릭터 소개"
}
```

- `world`: `sinsekai`(神世界) / `oc`(OC) / `ymkb`(YMKB) / `etc`(ETC) 중 하나.
- `part`: **神世界 캐릭터만** 적는다. `1부`~`5부` 중 하나 — 사이드바의 하위 필터로 쓰인다.
- `subcategory`: **神世界·OC 캐릭터만** 적는다.
  - 神世界: 오토리 일행 / 음양오행의 신 / 이원향 / 글리샬라볼라스 / 바드르 제단 / 예레미야 / 예르모 행성 — 갤러리에서 이 이름으로 구역이 나뉜다.
  - OC: 요조라 / 미조레 / 시노노메 — 사이드바 하위 필터로 쓰인다.
- `grade`, `class`: **OC·YMKB 캐릭터만** 적는다 (학년/학급 순 정렬에 쓰인다).
- `image`: 없으면 `null`. 있으면 `"assets/파일명.png"`.
- `fields`: 세계관마다 다른 추가 항목. `data/worlds.json`의 해당 세계관 `fields` 키와 이름이 같아야 값이 화면에 뜬다.
- ETC 캐릭터는 `part`, `subcategory`, `grade`, `class`가 필요 없다 — 이름만 맞으면 정해진 순서(아래 참고)대로 자동 정렬된다.

## 정렬·분류 규칙 (자동)

- **All**: 이름 가나다순.
- **神世界**: 사이드바에서 1부~5부로 필터링. 갤러리는 항상 오토리 일행→음양오행의 신→이원향→글리샬라볼라스→바드르 제단→예레미야→예르모 행성 순서로 구역이 나뉘어 표시된다.
- **OC**: 사이드바에서 요조라/미조레/시노노메로 필터링. 그 안에서 학년 오름차순 → 학급 오름차순 → 이름순.
- **YMKB**: 학년 오름차순 → 학급 오름차순 → 이름순.
- **ETC**: `data/worlds.json`의 `fixedOrderList`에 적힌 이름 순서대로.

## 이미지만 따로 올릴 때

사이트 폼으로 올리는 게 가장 쉽지만, 직접 올리고 싶다면 `assets` 폴더에서 **Add file → Upload files**로 올린 뒤 캐릭터 json의 `image` 값을 `"assets/올린파일명.png"`로 수정하면 된다.

## 세계관 자체를 바꾸는 법

`data/worlds.json`을 연다.

- `id`, `name`, `shortName`, `color`: 기본 정보.
- `parts`: 있으면 사이드바 하위 필터가 된다 (神世界).
- `subcategories`: `parts`가 없으면 사이드바 하위 필터 + 정렬 기준이 된다 (OC). `groupInGallery: true`와 함께 있으면 사이드바 대신 갤러리 구역 제목으로 쓰인다 (神世界).
- `useGradeClass`: `true`면 학년/학급 정렬을 적용.
- `fixedOrderList`: 있으면 이름 기준 고정 순서 정렬 (ETC).
- `fields`: 상세 모달·생성 폼에서 나이/소속 아래에 추가로 보여줄 항목들.

## 깃허브 Pages 켜기

저장소 **Settings → Pages**에서 Source를 `Deploy from a branch`, Branch를 `main` / `(root)`로 설정하고 저장한다.
