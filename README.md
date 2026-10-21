# DSH 终末地推理滑条

> 给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）用的 **终末地风格「模型＋推理等级」选择器**：
> 一枚模型按钮，同时管理模型列表和推理滑条；输入框也采用同一套黑白、荧黄与工业面板样式。

[![version](https://img.shields.io/badge/version-0.8.2-blue?style=flat-square)](https://github.com/hanagasakugoro-blip/dsh-endfield-slider/releases/tag/v0.8.2)
![DSH](https://img.shields.io/badge/DSH-0.2.1--rc.2-5b6ef5?style=flat-square)
![platform](https://img.shields.io/badge/platform-Windows-0078d4?style=flat-square)
[![license](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

![模型面板、推理滑条与输入框的实际渲染截图](docs/screenshots/desktop-panel.png)

截图由本项目客户端实际渲染，模型名称与档位为演示数据。实际使用时读取 DSH 的模型目录。

**[下载最新版本](https://github.com/hanagasakugoro-blip/dsh-endfield-slider/releases/latest)** · [安装](#安装) · [使用](#使用) · [反馈问题](https://github.com/hanagasakugoro-blip/dsh-endfield-slider/issues)

---

## 目录

- [这是什么](#这是什么)
- [功能](#功能)
- [安装](#安装)
- [使用](#使用)
- [配置](#配置)
- [兼容性](#兼容性)
- [已知限制](#已知限制)
- [常见问题](#常见问题)
- [开发](#开发)
- [打包与发布](#打包与发布)
- [项目结构](#项目结构)
- [文档](#文档)
- [致谢与许可](#致谢与许可)

---

## 这是什么

本插件接管 DSH Web 输入区的模型按钮。点击后打开“模型与推理”面板，在一个窗口内完成两件事：

| 区域 | 内容 |
| --- | --- |
| **模型列表** | 提供方 → 该提供方的模型列表，支持搜索与当前项标记 |
| **推理等级** | 当前模型的推理选项、连续滑条、档位名称与保存状态 |

输入框同时增加通行证风格的侧带、挂孔、刻线和等高线，悬停、聚焦与发送时有对应反馈。

当前已验证 **Windows 桌面浏览器中的 DSH Web 0.2.1-rc.2**，默认安装到 `web` profile。DSH Desktop 专用 profile 尚未验证。

---

## 功能

### 推理滑条

- **拖动连续跟手**：滑块可停在两档之间；松手时吸附最近档位，再向宿主提交一次。拖动期间不反复写入。
- **点击平滑移动**：点轨道时移向点击位置，松手保存；点档位文字时立即提交，滑块滑到对应位置。
- **档位按模型读取**：使用宿主提供的名称和取值。有推理元数据但未声明默认强度时，增加“提供方默认”选项，选择它会省略 `reasoningEffort`。
- **逐模型记忆**：按提供方和模型分别记录。首次打开沿用 DSH 当前设置；切回已使用模型恢复有效记忆，未记录的模型采用宿主默认设置。
- **保存状态清楚**：显示临时选择、保存中、已保存或错误；只有宿主确认成功后才更新记忆，失败时回到宿主值。
- **键盘可操作**：方向键调整一档，`Home`／`End` 到两端，`PageUp`／`PageDown` 调整两档；松开按键保存，`Escape` 可取消未提交选择。

### 模型列表

- **两级浏览**：先选提供方，再进入该组的模型列表；列表保留宿主目录顺序。
- **组内搜索**：按模型名称查找，忽略大小写；搜索结果保留模型在目录中的原编号。
- **切模型后继续调整**：选择模型不会关闭面板，推理区随当前模型更新。
- **当前项可识别**：当前提供方和模型使用选中块面标记；当前模型带勾选，多选项模型显示档位数量。
- **空状态与失败可读**：目录未就绪、搜索无匹配、提供方失败和保存失败都有对应提示；读取失败时可重试。

### 界面与操作反馈

- **终末地风格排版**：黑白块面、荧黄强调、切角、细线和编号，搭配英文小字与粗体中文标题。
- **按钮混色波浪**：模型按钮在悬停或展开时渐显荧黄、米白与浅灰的动态混色。
- **面板开合**：黑黄覆盖层从左向右扫入，再伴随像素块与网点散开；关闭时像素横条错层向右拉长并淡出。
- **选中确认**：成功切换模型或推理等级时，局部短闪与模型弹窗震颤给出确认。
- **输入框响应**：四角随悬停和聚焦展开、扣合；发送时局部闪烁并跳动黄条，保留 DSH 的发送、停止、快捷键和禁用规则。
- **主题与减少动态效果**：跟随 DSH 深浅主题；系统启用“减少动态效果”时停止动画，操作功能保留。

---

## 安装

> 直接下载 [Releases](https://github.com/hanagasakugoro-blip/dsh-endfield-slider/releases) 中的运行包
> **[dsh-endfield-reasoning-slider-0.8.2.zip](https://github.com/hanagasakugoro-blip/dsh-endfield-slider/releases/download/v0.8.2/dsh-endfield-reasoning-slider-0.8.2.zip)**，解压后安装即可。

前置条件：已初始化的 DSH Web profile，以及终端可用的 **Node.js 22 或更高版本**。运行包已包含客户端，安装时无需构建或下载 npm 依赖。

### 方式一：安装脚本

把 ZIP 解压到准备长期保留的目录，双击 `install.cmd`；或在解压目录的 PowerShell 中运行：

```powershell
.\install.cmd       # 安装到当前用户的默认 Web profile
```

默认目标为当前用户主目录下的 `.dsh/profiles/web`。成功时窗口可能直接关闭；需要查看完整输出时，使用下面的 Node.js 命令。

### 方式二：Node.js 命令

同样在解压目录执行：

```powershell
# 默认 Web profile
node scripts/install-profile.mjs

# 自定义 Web profile：将路径替换为实际绝对路径
node scripts/install-profile.mjs --profile-path "<Web profile 完整路径>"
```

`install.cmd` 和 `uninstall.cmd` 不转发参数。自定义 profile 请直接使用 Node.js 命令。

安装器会备份 profile 配置 → 添加 `link:` 依赖 → 追加插件 bundle → 创建目录链接并校验。备份保存在插件目录的 `backups/`，原有皮肤和插件配置保留。

**安装后不要移动或删除插件目录**，DSH 通过该目录链接加载客户端。

### 确认已生效

刷新 DSH Web，点击输入框上的模型按钮，应出现“模型与推理”面板。若仍显示原入口，重启 DSH 后再刷新，并确认安装的是正在使用的 Web profile。

### 升级与卸载

- **升级**：先在旧目录卸载，再解压新版、从新目录安装，随后刷新 DSH；必要时重启。
- **卸载**：从当时安装的目录运行 `uninstall.cmd`，或使用下面的命令。卸载后刷新 DSH。
- **记忆保留**：正常卸载不会清除浏览器中的逐模型记忆，同一来源下重装可继续使用。

```powershell
# 卸载默认 Web profile 中的本插件
node scripts/install-profile.mjs --uninstall

# 卸载自定义 Web profile 中的本插件
node scripts/install-profile.mjs --uninstall --profile-path "<Web profile 完整路径>"
```

自定义 profile 升级时，在旧目录执行第二条卸载命令，再在新目录执行带相同 `--profile-path` 的安装命令。卸载器只处理本插件的依赖、bundle 和已验证的链接，其他插件与皮肤保留。

### 下载校验

将同一 Release 中的 `SHA256SUMS.txt` 下载到本地，在 ZIP 所在目录执行：

```powershell
Get-FileHash .\dsh-endfield-reasoning-slider-0.8.2.zip -Algorithm SHA256
```

将输出的哈希值与清单中该文件对应的一行对照。

---

## 使用

**收起时**，输入区显示模型按钮：

```text
[ 模型名称  |  当前推理等级  ⌄ ]
```

**点开后**，模型列表与推理滑条在同一面板中：

| 操作 | 结果 |
| --- | --- |
| 点击模型按钮 | 打开／关闭面板 |
| 点击提供方 | 进入该提供方的模型列表 |
| 在搜索框输入名称 | 筛选当前提供方的模型，忽略大小写 |
| 点击模型 | 切换模型，面板保持打开，推理区随之更新 |
| 拖动滑条 | 连续跟手，松手吸附最近档位并保存 |
| 轻点轨道 | 平滑移向点击位置，松手提交最近档位 |
| 点击档位文字 | 提交指定档位，滑块平滑移动 |
| 滑条聚焦后按方向键、`Home`／`End`、`PageUp`／`PageDown` | 调整临时选择，松开按键保存 |
| `Escape` | 依次取消未提交选择 → 返回提供方列表 → 关闭面板 |
| `Tab`／`Shift+Tab` | 在面板控件间切换焦点 |
| 点击面板外 | 关闭面板 |

设置作用于**下一次请求**，正在执行的请求继续遵循宿主规则。重复选择当前档位不会再次提交，取消拖动或未提交的键盘选择也不会保存。

输入框的发送动效表示“发起发送”，服务端结果仍由 DSH 展示。

---

## 配置

插件目前没有独立设置面板，日常行为由以下来源决定：

| 项目 | 来源 |
| --- | --- |
| 模型与推理档位 | DSH 提供方和模型目录 |
| 默认强度 | 模型的默认值，或交由宿主决定 |
| 已使用模型的档位 | 当前浏览器保存的逐模型记忆 |
| 深浅主题 | DSH 主题设置 |
| 减少动态效果 | 系统辅助功能设置 |

需要自行调整配色、排版或动效时，修改 `src/` 中对应源码后执行 `npm run build`。样式位于 `src/style.css`，交互与输入框动效分别位于 `src/motion.mjs`、`src/closing.mjs` 和 `src/composer.mjs`。

---

## 兼容性

| 项目 | 说明 |
| --- | --- |
| DSH | 已在 **DSH Web 0.2.1-rc.2** 验证，其他版本尚未确认 |
| 平台 | Windows 桌面浏览器 |
| profile | 默认 `web`；DSH Desktop 专用 profile 尚未验证 |
| 宿主接口 | 使用 `slots`、`sessions`、`remote`、`remote.session` 和 `modelDirectories`，接管 `conversation.input.model` 单槽 |
| 运行时依赖 | React 由 DSH 提供，客户端与字体已打包 |
| Node.js | `>=22`，用于本项目安装、卸载和开发脚本 |
| 主题 | 跟随 DSH 深浅主题 |

---

## 已知限制

- **模型入口由本插件接管**：原模型按钮会被替换；同时修改该槽位的其他选择器可能与本插件互相覆盖。
- **模型信息来自宿主**：目录未列出的模型不会出现；未提供推理元数据的模型不显示可调滑条。
- **“提供方默认”是额外选项**：模型有推理元数据但未声明默认强度时显示，选择后省略 `reasoningEffort`，因此选项总数可能比显式档位数多一个。
- **记忆按浏览器来源保存**：同一来源下的会话共享逐模型记忆；不同浏览器、域名或端口不共享。
- **其他皮肤可能影响外观**：样式集中在输入区域和本插件面板，其他皮肤修改相同区域时仍可能产生覆盖差异。
- **依赖宿主接口与输入框结构**：DSH 更新这些部分后，可能需要相应更新插件。

---

## 常见问题

**装完没变化，还是原来的模型按钮？**

先刷新 DSH Web，必要时重启 DSH。仍未生效时，检查安装的是否是正在使用的 Web profile，以及是否有其他模型选择器占用了同一个槽位。

**安装时提示找不到 profile 或其 `package.json`？**

确认已运行并初始化 DSH Web。默认路径在当前用户主目录的 `.dsh/profiles/web`；其他位置请用 `--profile-path` 指定。安装脚本不会代建一个空 profile。

**安装器提示已有其他目录的插件？**

先从原安装目录卸载，再安装新目录中的版本。安装器会检查链接归属，避免覆盖原安装。

**模型列表为空，或者某个提供方加载失败？**

先检查 DSH 中的提供方、账号和模型配置，再查看面板的加载状态或报错，必要时点“重试”。反馈时提供 DSH 版本、复现步骤与已隐藏凭据的错误信息。

**某个模型没有滑条，或者只能显示一个选项？**

模型未提供推理元数据时，不显示可调滑条；只有一个有效选项时无法继续调节。档位名称、数量和默认值均按当前模型处理，“提供方默认”的规则见[已知限制](#已知限制)。

**切换模型后，档位如何决定？**

首次打开保留 DSH 当前设置。切换模型时先恢复该提供方和模型的有效记忆，没有有效记忆时采用宿主默认设置。

**如何清空模型记忆？**

在实际使用的 DSH 页面打开开发者工具，执行后刷新页面：

```js
localStorage.removeItem('dsh.endfield.reasoning.v1')
```

**可以关闭动画吗？**

在系统辅助功能中启用“减少动态效果”，插件会停止动画并保留操作功能。

---

## 开发

需要 **Node.js 22 或更高版本**。使用仓库源码，或下载 [0.8.2 开发源码包](https://github.com/hanagasakugoro-blip/dsh-endfield-slider/releases/download/v0.8.2/dsh-endfield-reasoning-slider-0.8.2-source.zip) 并解压，在包含 `package.json` 和 `src/` 的源码根目录运行以下命令。

### 构建与默认检查

这几项只使用 Node.js 内置模块，**无需先执行 `npm install` 或 `npm ci`**：

```powershell
# 将 src/ 模块、CSS 和 Saira 字体构建为客户端
npm run build

# 检查构建后的客户端语法
node --check lib/client.js

# 核心逻辑与隔离安装器检查，共 12 项
npm test
```

源码与产物的关系：

| 位置 | 用途 |
| --- | --- |
| `src/core.mjs` | 宿主目录接入、档位选择与逐模型记忆 |
| `src/ui.mjs` | 模型面板、搜索、滑条与键盘操作 |
| `src/style.css` | 本插件与输入区域的样式 |
| `src/motion.mjs`、`src/closing.mjs`、`src/composer.mjs` | 交互动效、面板关闭与输入框反馈 |
| `src/client.mjs` | 客户端服务与槽位接线 |
| `lib/client.js` | 构建产物，修改上面的源码后重新生成 |
| `lib/index.js` | 宿主侧插件入口 |

默认 `npm test` 包含两部分：

- `test/core.test.mjs`：验证宿主档位、默认值、逐模型记忆、目录访问和保存失败处理。
- `test/installer.test.mjs`：在隔离 profile 中执行安装与卸载，验证目录链接及原有皮肤、配置的保留。

这些默认检查不需要运行 DSH，不发起模型推理请求。修改源码后先重新构建，再刷新或重启实际使用的 DSH 加载新客户端。

### 可选：宿主契约检查

这项检查读取本机已安装 DSH 的模型目录实现，验证模型选择参数的传递。需要相应版本的 DSH，并将下方路径替换为其实际的 `node_modules/@deepseek-ai` 目录：

```powershell
$env:DSH_EF_HOST_MODULES = '<DSH 安装目录>/node_modules/@deepseek-ai'
npm run test:contract
```

浏览器专项检查另需 `npm ci` 安装开发依赖及本机 Google Chrome，不包含在默认 `npm test` 中。已有验证范围见 [VALIDATION.md](VALIDATION.md)。

---

## 打包与发布

```powershell
npm run build         # 生成客户端产物
npm run pack:local    # 输出运行包、源码包和校验清单
```

产物位于 `dist/`，用于 GitHub Releases 附件：

| 文件 | 内容 | 用途 |
| --- | --- | --- |
| `dsh-endfield-reasoning-slider-<版本>.zip` | 客户端、安装／卸载脚本、文档与许可文件 | 安装和升级 |
| `dsh-endfield-reasoning-slider-<版本>-source.zip` | 运行文件以及源码、锁文件、测试和开发脚本 | 阅读、修改与重新构建 |
| `SHA256SUMS.txt` | 两个 ZIP 的 SHA-256 值 | 下载校验 |

发布新版本前，保持 `package.json`、`package-lock.json` 与版本标签一致，再构建打包。将两个 ZIP 和对应的校验清单一起上传到 Release。

---

## 项目结构

主要文件如下：

```text
src/
  core.mjs                 模型目录、档位选择与记忆
  ui.mjs                   提供方／模型面板、搜索与推理滑条
  style.css                本插件及输入区域样式
  motion.mjs               操作反馈
  closing.mjs              面板关闭动效
  composer.mjs             输入框修饰与发送反馈
  client.mjs               客户端服务与槽位接线
lib/
  index.js                 宿主侧插件入口
  client.js                构建后的客户端，修改源码后重新生成
scripts/
  build.mjs                合并源码、CSS 与字体
  install-profile.mjs      profile 安装／卸载与备份
  package.mjs              生成分发 ZIP 和 SHA-256 清单
test/                      核心、安装器、宿主契约与浏览器专项检查
assets/                    Saira 字体及许可证
docs/                      桌面截图、发布说明与检查记录
cordis.patch.yml           插件组合层声明
install.cmd                默认 Web profile 安装入口
uninstall.cmd              默认 Web profile 卸载入口
```

---

## 文档

| 文档 | 内容 |
| --- | --- |
| [CHANGELOG.md](CHANGELOG.md) | 逐版本变化 |
| [VALIDATION.md](VALIDATION.md) | 验证环境、范围和限制 |
| [发布准备记录](docs/release-preparation.md) | 0.8.2 构建、12 项核心／安装器检查及桌面检查结果 |
| [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) | 参考实现、字体与第三方许可 |

---

## 致谢与许可

- **目标宿主**：[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)。
- **模型目录与槽位接入参考**：[Bai-2008/a-better-dsh-codex-effort-slider](https://github.com/Bai-2008/a-better-dsh-codex-effort-slider)，相关上游版权声明保留在 LICENSE 中。
- **终末地风格设计指引**：[hhikr/endfield-ui-skill](https://github.com/hhikr/endfield-ui-skill)，为排版、配色、组件和动效设计提供参考。
- **README 组织与写法参考**：[Bai-2008/a-better-dsh-codex-effort-slider](https://github.com/Bai-2008/a-better-dsh-codex-effort-slider) 与 [ABING1111/dsh-codex-model-effort-selector](https://github.com/ABING1111/dsh-codex-model-effort-selector)。
- **许可**：代码采用 [MIT License](LICENSE)，Saira 字体采用 [SIL Open Font License 1.1](assets/Saira-OFL.txt)。

本项目与鹰角网络、《明日方舟：终末地》无官方关联，不包含游戏素材、标志或官方字体。
