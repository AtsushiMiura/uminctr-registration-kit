# uminctr-registration-kit

UMIN-CTR の登録準備を支援する、リポジトリ管理の Codex スキル。

## 現在のスキル

[fill-umin-registration-draft](skills/fill-umin-registration-draft/SKILL.md) は、UMIN登録用のドラフト Word を原本として、ブラウザの各フォームへ転記・照合・保存する。最終確認画面への遷移、正式登録、公開は行わない。

`$fill-umin-registration-draft` と明示して使用する。`agents/openai.yaml` の `policy.allow_implicit_invocation: false` により自動選択を無効にしている。

Python 3 の標準ライブラリだけで Word の表・段落・自動番号・選択記号・変更後本文を抽出する。未対応のレイアウトは警告を確認して視覚照合する。ブラウザ操作には利用環境の操作ツールとログイン済みの対象タブが必要。

## Codex への配置

このリポジトリを任意の場所に clone し、`skills/fill-umin-registration-draft` を `~/.codex/skills/fill-umin-registration-draft` へ絶対パスのシンボリックリンクで接続する。リンク先に同名のファイルやリンクが存在する場合は上書きしない。

`create-symlinks` スキルがある環境では、次を実行する（`/absolute/path/uminctr-registration-kit` は実際の clone 先に置換）。

```bash
python3 ~/.codex/skills/create-symlinks/scripts/create_symlinks.py \
  --target-base /absolute/path/uminctr-registration-kit/skills \
  --link-dir ~/.codex/skills \
  --names fill-umin-registration-draft
```

スキル本体の変更はこのリポジトリで管理する。リンク先を別途コピーして編集しない。

## 検証

```bash
python3 skills/fill-umin-registration-draft/scripts/test_extract_umin_docx.py
```

[評価例](skills/fill-umin-registration-draft/references/evaluation-cases.md) に明示起動、部分修正、保存と正式登録の境界を記載している。テストは架空データで実行し、実際の登録操作は行わない。

## 次段階の実装方針（未実装）

1. 研究計画書（Word）から、日本語の情報を抽出し、英語を翻訳して UMIN登録用ドラフト Word を作成する。
2. クライアントとの確認・修正のやり取りは、このドラフト Word で行う。原計画書の該当箇所、抽出値、翻訳、不明点を追跡できる形を検討する。
3. クライアント確認後の確定版ドラフト Word を転記の原本とし、現在のスキルで UMIN-CTR の仮登録準備（各フォームの保存）まで行う。

ドラフト生成・翻訳は今後別スキルとして実装する。転記時には翻訳を作り直したり、クライアント修正を原計画書で上書きしたりしない。正式登録・公開を自動化の完了条件に含めない。

## 移行元

2026-10-16 に ChatGPT の `fill-umin-registration-draft` からエクスポートした7ファイルを移行。抽出処理と既存7テストを維持し、明示起動の評価例、ブラウザツールの環境依存記述、実行パスの説明を整えた。

試験原稿、研究計画書、連絡先、受付番号、スクリーンショットなどの案件情報はコミットしない。
