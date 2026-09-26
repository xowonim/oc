# xowon's OC

세계관별 오리지널 캐릭터를 정리하는 사이트. 깃허브 웹사이트 안에서 캐릭터 추가/수정, 이미지 업로드가 모두 가능하도록 만들어졌다.

## 구조

```
index.html                       메인 페이지 (사이드바 + 갤러리 + 상세 모달)
css/style.css                     스타일
js/app.js                         데이터 로드, 정렬, 렌더링, 모달 로직
data/worlds.json                  세계관(神世界/OC/YMKB/ETC) 정의와 정렬 규칙
data/characters/                  캐릭터 파일들 (파일 하나 = 캐릭터 한 명)
data/characters/_template.json    새 캐릭터 만들 때 복사해서 쓰는 틀
assets/                           캐릭터 이미지
```

## 캐릭터 추가하는 법

**가장 쉬운 방법:** 사이트에서 원하는 세계관(또는 전체)을 선택한 상태로 갤러리 맨 끝에 있는 점선 **"+ 캐릭터 생성"** 타일을 누른다. 깃허브의 "새 파일 만들기" 화면이 새 탭으로 열리고, 현재 보고 있던 세계관에 맞는 틀이 이미 채워져 있다. 파일 이름을 캐릭터에 맞게 바꾸고, 내용을 채운 뒤 **Commit changes**를 누르면 끝. 새로고침하면 바로 반영된다.

**직접 만들 때:**
1. `data/characters` 폴더로 들어가 `_template.json`을 열어 내용을 복사한다.
2. **Add file → Create new file**을 누르고 파일 이름 칸에 `data/characters/캐릭터영문이름.json` 형태로 입력한다.
3. 복사한 내용을 붙여넣고 값을 채운다 (아래 필드 설명 참고).
4. Commit.

파일 이름이 `_`로 시작하면 목록에서 제외되니, 새 캐릭터 파일 이름에는 밑줄을 넣지 않는다.

## 캐릭터 파일의 필드

```json
{
  "id": "character-id",
  "world": "sinsekai",
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
- `subcategory`: **神世界·OC 캐릭터만** 적는다. `data/worlds.json`에 정의된 세부 카테고리 이름과 정확히 같아야 한다.
  - 神世界: 오토리 일행 / 음양오행의 신 / 이원향 / 글리샬라볼라스 / 바드르 제단 / 예레미야 / 예르모 행성
  - OC: 요조라 / 미조레 / 시노노메
- `grade`, `class`: **OC·YMKB 캐릭터만** 적는다 (학년/학급 순 정렬에 쓰인다). 그 외에는 `null`로 둔다.
- `image`: 없으면 `null`. 있으면 `"assets/파일명.png"`.
- `fields`: 세계관마다 다른 추가 항목. `data/worlds.json`의 해당 세계관 `fields` 키와 이름이 같아야 값이 화면에 뜬다.
- ETC 캐릭터는 `subcategory`, `grade`, `class`가 필요 없다 — 이름만 맞으면 정해진 순서(아래 참고)대로 자동 정렬된다.

## 정렬 규칙 (자동)

- **All**: 이름 가나다순.
- **神世界**: 지정된 세부 카테고리 순서 → 그 안에서 이름순.
- **OC**: 지정된 지역(요조라/미조레/시노노메) 순서 → 학년 오름차순 → 학급 오름차순 → 이름순.
- **YMKB**: 학년 오름차순 → 학급 오름차순 → 이름순.
- **ETC**: `data/worlds.json`의 `fixedOrderList`에 적힌 이름 순서대로. 목록에 없는 이름은 맨 뒤로 밀리고 이름순으로 정렬된다.

세부 카테고리 순서나 ETC 고정 순서를 바꾸고 싶으면 `data/worlds.json`의 `subcategories` / `fixedOrderList` 배열 순서를 바꾸면 된다.

## 이미지 추가하는 법

1. `assets` 폴더로 들어가 **Add file → Upload files**로 이미지를 올리고 Commit.
2. 해당 캐릭터 json 파일의 `image` 값을 `"assets/올린파일명.png"`로 수정.

## 세계관 자체를 바꾸는 법

`data/worlds.json`을 연다. 각 세계관 항목의 의미:

- `id`, `name`, `shortName`, `color`: 기본 정보와 사이드바 버튼 색.
- `subcategories`: 세부 카테고리 목록이 있으면 사이드바에 펼쳐지는 하위 목록으로 표시되고, 그 순서가 정렬 순서가 된다.
- `useGradeClass`: `true`면 학년/학급 정렬을 적용.
- `fixedOrderList`: 있으면 이름 기준 고정 순서 정렬을 적용 (ETC처럼).
- `fields`: 상세 모달에서 나이/소속 아래에 추가로 보여줄 항목들.

## 깃허브 Pages 켜기

저장소 **Settings → Pages**에서 Source를 `Deploy from a branch`, Branch를 `main` / `(root)`로 설정하고 저장한다. 몇 분 후 안내되는 주소로 접속하면 사이트가 보인다.
