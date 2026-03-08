# ブロック崩し

ブロックを崩すと背景イラストが少しずつ見えてくるブロック崩しゲーム。

🎮 **プレイ**: GitHub Pages でデプロイ後にアクセス可能

---

## ゲームの特徴

| 機能 | 説明 |
|------|------|
| 🖼️ 背景イラスト演出 | ブロックを崩すほど背景が明らかになる |
| 🏓 バー自動追跡 | バーが自動でボールを追いかけるので操作不要 |
| ⚡ レーザー砲 | ボタンを押している間だけ発動 |
| ⚠️ レーザーのリスク | 使用中はバーが止まりボール速度が上がる |

## 背景画像の差し替え

`images/bg.jpg` を好きな画像に置き換えるだけです。
詳細は [`images/BG_README.md`](images/BG_README.md) を参照。

## 技術スタック

- HTML5 Canvas + Vanilla JavaScript
- PWA 対応 (ホーム画面に追加可能)
- GitHub Pages でホスティング

## GitHub Pages の有効化

1. リポジトリの **Settings → Pages**
2. Source を `main` ブランチのルートに設定
3. 保存すると `https://USERNAME.github.io/blockkuzushi/` でアクセス可能
