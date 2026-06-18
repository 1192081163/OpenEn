# Contributing

感谢你对 OpenEn 感兴趣。这个项目目前以小而清晰的浏览器扩展为目标，优先保证划词翻译、生词本和 Safari/Chrome 兼容路径稳定。

## 开发流程

1. Fork 仓库并创建功能分支。
2. 安装依赖：

```bash
npm install
```

3. 修改代码前先看现有模块边界：
   - `src/content/`：网页划词、弹窗和高亮逻辑
   - `src/background/`：扩展消息处理
   - `src/providers/`：翻译 Provider
   - `src/storage/`：生词本存储和导出
   - `src/ui/`：扩展弹窗和生词本页面
   - `src/shared/`：共享类型、消息和浏览器 API 兼容层
4. 提交前运行：

```bash
npm test
npm run typecheck
npm run build
```

涉及 Safari 适配时也运行：

```bash
npm run build:safari
```

## 代码约定

- UI 文案面向中文用户，按钮和主要操作文案使用中文。
- 翻译结果默认只展示中文释义，避免把词性、例句等额外信息塞进划词弹窗。
- DeepSeek API Key 只能由用户在扩展中填写，不要写进源码、测试 fixture 或文档示例。
- 新功能尽量补对应测试，尤其是消息处理、存储、Provider 和内容脚本行为。
- 不提交 `dist/`、`dist-safari/`、`.env`、Xcode `xcuserdata` 或 `*.xcuserstate`。

## Pull Request

PR 描述建议包含：

- 改了什么
- 为什么需要这个改动
- 怎么验证
- 是否影响 Chrome、Edge 或 Safari
