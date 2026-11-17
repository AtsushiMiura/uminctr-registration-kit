# uminctr-registration-kit

UMIN登録用のWord原稿を、UMIN-CTRの各フォームへ転記・照合・保存するCodexスキルです。項目の対応表とブラウザ操作の補助コードを備え、文字制限、日英の欄、番号・改行を確認します。

[`$fill-umin-registration-draft`](skills/fill-umin-registration-draft/SKILL.md) の明示指定で起動します。最終確認画面への遷移、正式登録・公開は行いません。

## スキルの使い方

Codexにスキルを配置したうえで、ブラウザで対象のUMINフォームを開き、Word原稿のパスと対象画面を指定します。

```text
$fill-umin-registration-draft
「/path/to/UMIN登録案.docx」を、Chromeで開いている対象試験のフォームへ入力してください。
各フォームを保存し、フォーム選択画面で止めてください。
```

部分修正では対象項目と変更内容も指定してください。練習画面で試す場合は「ダミー入力でテスト」と明記します。原稿や入力済みデータはリポジトリに保存しないでください。

## Chrome拡張「UMIN-CTR 転記補助 1.0」

定型DOCXを端末内で読み取り、確認が必要な項目を確定してからUMINへ一括転記する拡張も同梱しています。外部AIは使わず、練習環境と本番の登録前下書きに対応し、最終確認画面へ進む手前で停止します。導入方法・対応書式・検証範囲は[拡張のREADME](extension/README.md)を参照してください。
