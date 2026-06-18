# OpenEn

[English](README.en.md) | 简体中文

OpenEn 是一个面向英语阅读的浏览器扩展，支持划词后手动翻译成中文、保存生词本，并在网页中高亮已经保存过的生词。

## 功能

- 划词后显示中文操作按钮，点击“翻译”后再请求翻译
- 支持 DeepSeek 翻译配置，API Key 保存在浏览器本地存储中
- 本地中文兜底模式，便于无 API Key 时开发和测试
- 生词本保存、搜索、删除、JSON/CSV 导出
- 词形归一，`leading`、`led` 等词形可归并到基础词
- 网页中自动高亮已加入生词本的英文单词
- 选中已高亮单词时优先显示旧翻译，并支持“重新翻译”
- Chrome / Edge Manifest V3
- Safari Web Extension 构建适配

## 安装开发依赖

```bash
npm install
```

## Chrome / Edge 本地调试

```bash
npm run build
```

然后打开：

- Chrome: `chrome://extensions`
- Edge: `edge://extensions`

开启开发者模式，点击“加载已解压的扩展程序”，选择仓库里的 `dist` 目录。

## Safari 本地调试

先构建 Safari WebExtension 资源：

```bash
npm run build:safari
```

再生成或更新 Xcode 工程：

```bash
xcrun safari-web-extension-converter dist-safari \
  --project-location safari/OpenEnSafari \
  --app-name OpenEn \
  --bundle-identifier com.example.openen \
  --copy-resources \
  --swift \
  --no-open
```

把 `com.example.openen` 换成你自己的 bundle identifier。打开生成的 Xcode 工程后，选择 macOS App scheme 和 `My Mac` 运行。

如果 Safari 扩展列表里看不到本地扩展，请在 Safari 的开发者设置中打开“允许未签名的扩展”，然后重新运行 macOS App。

更多说明见 [docs/safari.md](docs/safari.md)。

## DeepSeek 配置

打开扩展弹窗，在 DeepSeek 设置里填入 API Key 并保存。项目不会在仓库中保存任何 API Key；密钥只保存在浏览器本地扩展存储中。

默认模型是：

```text
deepseek-v4-flash
```

## 常用命令

```bash
npm test
npm run typecheck
npm run build
npm run build:safari
```

## 发布版本

版本号需要保持这些文件一致：

- `package.json`
- `public/manifest.json`
- `public/manifest.safari.json`

Chrome / Edge 发布使用 `dist`。Safari 发布需要先运行 `npm run build:safari`，再用 `safari-web-extension-converter` 更新 Xcode 工程。

## 安全

请不要把真实 API Key、浏览器配置文件或 Xcode 用户状态提交到仓库。发现安全问题时请参考 [SECURITY.md](SECURITY.md)。

## 许可证

本项目使用 [MIT License](LICENSE)。
