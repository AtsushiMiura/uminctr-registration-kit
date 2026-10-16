# ブラウザ操作コード

## 対応表と使う場面

`scripts/umin_forms.mjs` は、接続済みタブのDOMを読み、差分入力・照合・個別フォーム保存を行う補助コード。独自のブラウザ起動、直接HTTP送信、最終確認・正式登録の処理は持たない。画面の構造が違えば止め、その箇所だけ確認する。全面的なE2E基盤は使わない。

`references/form-catalog.json` は2026-10-16の練習画面から採取した項目定義。入力値・受付番号は含まない。必要なフォーム・項目だけ抽出して読む。

| ID | フォーム | 論理項目数 |
| --- | --- | ---: |
| `basic` | 基本情報 | 9 |
| `purpose` | 目的 | 17 |
| `design` | 試験デザイン | 46 |
| `management` | 管理情報等 | 90 |
| `results` | 結果等 | 24 |
| `progress` | 進捗等 | 24 |

チェックボックスの同名グループは1項目。項目ごとに `name`、見出し、言語、姓名の行ラベル、選択肢のコード／表示を持つ。日付の年の選択肢は現在の画面から取得する。`maxlength` も実行時に読む。

## 実行例

利用環境のブラウザ操作APIの説明を先に読む。Chrome指定ならそのChromeの対象タブを使う。`cua_repl` で接続した `tab` と、ローカルのスキルの絶対パスを使う例：

```javascript
let umin = await import('/absolute/path/fill-umin-registration-draft/scripts/umin_forms.mjs');
let session = umin.createSession(tab, {
  receipt: '対象試験で観測した受付番号',
  scientificTitle: '対象試験の科学的試験名（日本語）',
  // 省略時は練習環境。別環境では現在観測したHTTPSディレクトリを明示する。
  baseUrl: 'https://center6.umin.ac.jp/cgi-bin/ctr_test/'
});
nodeRepl.write(await session.inspect());
```

コードは supplied tab の `playwright` と `getAXState` を使う。タブを新たに推測・検索する処理はない。対象の受付番号と科学的試験名が違えば操作を止める。新規の基本情報だけは `{newBasic:true, scientificTitle:..., baseUrl:...}` を使い、保存後の `toMenu()` で発行された受付番号を確認してセッションに固定する。新規作成の前に既存下書きの重複を確認する。

フォーム一覧から必要なフォームを開き、Wordと対応を確認した項目だけ `patch` に含める。`patch` は入力名をキー、文字列を値とする。選択欄も表示文言ではなく対応表の文字列コード、チェックボックスだけコードの配列を指定する。

```javascript
nodeRepl.write(await session.openForm('design'));
// 必要な定義だけ表示。全210項目や画面全文を毎回表示しない。
nodeRepl.write(umin.catalog.forms.design.fields.filter(f => ['incj','inc'].includes(f.name)));
let patch = {incj: approvedJapaneseCriteria}; // 原稿で確認した値だけ
nodeRepl.write(await session.plan('design', patch));
nodeRepl.write(await session.fill('design', patch));
let result = await session.confirm();
nodeRepl.write(result);
if (result.phase === 'confirm') nodeRepl.write(await session.save());
// 続ける場合だけフォーム一覧へ。最後はここで止める。
nodeRepl.write(await session.toMenu());
```

- 現在すでに入力画面なら `openForm()` は不要。`fill(id,{})` で現在値だけ照合できる。
- 入力は差分だけ。入力後・確認画面・保存後に未変更欄も含めて照合する。正常時の出力は件数と差分に限る。
- 日付を変える場合は `*_yyyy`・`*_mm`・`*_dd` の3つを空欄も含めて指定する。空欄は `''`。勝手に日付や未選択を補わない。
- 科学的試験名の変更は対象識別にも関わるため、変更前後を個別に確認して扱う。通常の部分修正とまとめて実行しない。
- 「修正箇所はありません。」は `unchanged`。保存を押さず、`toMenu()` が「戻る」で値を再確認して一覧へ戻る。
- 遷移や保存でエラー・タイムアウトが起きたら再クリックせず、現在の画面を一度確認する。`save()` は確認済み状態を一度だけ消費する。保存済み画面なら `verifySaved()` で照合できる。入力エラーなら該当欄だけ直す。
- 画面構造・選択肢・対象試験の相違で停止したら、その部分のDOM／画面を調べる。対応表を無条件に再生成して検査を通さない。
- フォーム一覧の「入力内容確認」は使わない。

## 機関選択

`management` のスポンサーと研究費提供組織は専用ポップアップを使う。`browser` は同じ接続済みブラウザ。通常は検索せず「その他」を選び、原稿の日英名称を直接入力する。

```javascript
nodeRepl.write(await session.chooseInstitution(browser, 'sponsor', {useOther:true}));
// 選択完了後、原稿の日英名称をそれぞれ sponsorj / sponsor に入力する。
```

研究費提供組織は `'funding'`、直接記入欄は `fundj` / `fund`。部署・個人名欄へ組織名を入れない。公的機関、機関コードの指定、ユーザーから検索の指示がある場合は次を使う。

```javascript
nodeRepl.write(await session.chooseInstitution(browser, 'sponsor', {
  query: approvedInstitutionName, exactName: approvedInstitutionName
}));
```

検索で完全一致がなければ止まる。原稿と検索結果を確認して「その他」が適切なら `useOther:true` を指定する。どちらの経路でも、`popup_loading` が返ったら新たに開かず `finishInstitution(browser)` を呼ぶ。選択された機関が正しい役割の欄に戻ったことを確認してから自由記入欄を埋める。

## 文字制限

`scripts/umin_text.mjs` と `references/input-constraints.json` が事前検査を行う。出典は [公式FAQ](https://www.umin.ac.jp/ctr/UMIN-CTR_FAQ.htm) と [用語集の入力サイズ](https://www.umin.ac.jp/ctr/UMIN-CTR_Yougo.htm)。全角2・ASCIIと改行1のUMIN換算を使い、UTF-8のバイト数とは区別する。英語欄はASCII、数値欄は半角数字。半角カナ、HTML実体参照、制御文字なども検査する。

`suggestAscii(text)` は不等号・全角ASCII等の置換案と変更箇所を返すだけで、自動適用しない。意味・単位・番号を原稿と照合してから使う。未対応の記号は勝手に翻訳しない。上限超過時は短縮案を別途確認し、切り詰めない。

Word原稿の作成時にも同じ上限・文字検査を使うと手戻りを減らせる。記号の置換で換算値が変わるため、転記前にも再検査する。超過時は欄名・換算値・上限・超過量を示し、内容の短縮は原稿の修正として確認する。

用語集に上限が明記されていない欄は `byte_limit_not_documented` とする。現在の `maxlength` とサーバー側の結果も確認する。公式資料と画面に相違がある場合も推測で上限を変更しない。必須条件や全ての組合せをローカルで再実装せず、個別フォームの確認画面でサーバーの検査を確認する。

## Wordからの整形とダミーテスト

- 単一行の住所・IRB欄に原稿の改行がある場合は、項目の対応を確認して空白で接続する。日英別欄がある場合は先に分割する。基準や介入の複数行欄では番号と改行を保持する。
- 英語の全角スペースも `suggestAscii()` の置換候補になる。置換前後を確認して適用する。
- ダミーテストでは選択状態・未記入欄・項目数・文字量を参考にし、研究内容・連絡先・日付は架空化する。数値比較の書式は維持する。上限超過は検出結果を記録し、ダミーだけ調整する。実原稿の短縮許可とみなさない。
