# OC ARCHIVE

세계관별 오리지널 캐릭터를 갤러리 형식으로 정리하는 사이트. 깃허브 웹사이트 안에서 캐릭터 추가/수정, 이미지 업로드가 모두 가능하도록 만들어졌다.

## 구조

```
index.html                 메인 페이지 (갤러리 + 상세 모달)
css/style.css               스타일
js/app.js                   데이터 로드, 갤러리 렌더링, 모달 로직
data/worlds.json            세계관 목록과 세계관별 상세 항목 정의
data/characters/            캐릭터 파일들 (파일 하나 = 캐릭터 한 명)
data/characters/_template.json   새 캐릭터 만들 때 복사해서 쓰는 틀
assets/                     캐릭터 이미지
```

## 캐릭터 추가하는 법 (깃허브 웹에서)

1. `data/characters` 폴더로 들어간다.
2. `_template.json`을 열어서 내용을 전체 복사한다.
3. 폴더 화면에서 **Add file → Create new file**을 누른다.
4. 파일 이름 칸에 `data/characters/캐릭터영문이름.json` 형태로 입력한다. (예: `data/characters/haru.json`)
5. 복사해둔 템플릿 내용을 붙여넣고, 값들을 채운다.
   - `world`: `ymkb` / `fantasy` / `genre` / `daily` 중 하나 (data/worlds.json 참고)
   - `fields` 안의 항목들은 그 세계관의 `worlds.json`에 정의된 항목과 이름이 같아야 값이 화면에 뜬다.
   - 이미지가 없으면 `image`를 `null`로 둔다. 있으면 `"assets/파일명.png"` 형태로 적는다.
6. 아래 **Commit changes**를 누르면 바로 사이트에 반영된다. (새로고침하면 보임)

파일 이름이 `_`로 시작하면(`_template.json`처럼) 목록에 안 뜨니, 틀을 복제해서 새로 만들 때 실수로 밑줄을 남기지 않도록 주의한다.

## 이미지 추가하는 법

1. `assets` 폴더로 들어간다.
2. **Add file → Upload files**를 누르고 이미지를 선택/드래그해서 올린다.
3. Commit 한다.
4. 해당 캐릭터 json 파일의 `image` 값을 `"assets/올린파일명.png"`로 수정한다.

## 세계관 자체를 바꾸는 법

`data/worlds.json`을 연다. 각 세계관은 이런 형태다.

```json
{
  "id": "world-id",
  "name": "세계관 전체 이름",
  "shortName": "필터 버튼에 보일 짧은 이름",
  "description": "설명",
  "color": "#hex색상",
  "fields": [
    { "key": "field-key", "label": "모달에 보일 라벨" }
  ]
}
```

`fields`는 이름/나이/소속(공통 항목) 외에 그 세계관에서만 추가로 보여줄 항목이다. 새 세계관을 만들고 싶으면 이 형식대로 배열에 항목 하나를 더 추가하면 된다.

## 동작 원리

사이트는 열릴 때마다 깃허브 API로 `data/characters` 폴더 안의 파일 목록을 자동으로 읽어온다. 그래서 캐릭터를 추가할 때 다른 파일을 건드리거나 목록에 등록할 필요 없이, 파일 하나만 새로 만들면 자동으로 갤러리에 나타난다.

## 깃허브 Pages 켜기 (사이트 주소 만들기)

저장소 **Settings → Pages**로 들어가서 Source를 `Deploy from a branch`, Branch를 `main` / `(root)`로 설정하고 저장한다. 몇 분 후 안내되는 주소로 접속하면 사이트가 보인다.
