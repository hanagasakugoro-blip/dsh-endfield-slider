# DSH 终末地推理滑条

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）用的终末地风格美化插件。

把输入框上的模型按钮换成一个带模型列表和推理滑条的弹窗，也给输入框加上了通行证元素和动效。整体是黑白灰配荧黄，按钮、边角和弹窗都做了对应的动画。

[![version](https://img.shields.io/badge/version-0.8.2-blue?style=flat-square)](https://github.com/hanagasakugoro-blip/dsh-endfield-slider/releases/tag/v0.8.2)
![DSH](https://img.shields.io/badge/DSH-0.2.1--rc.2-5b6ef5?style=flat-square)
![platform](https://img.shields.io/badge/platform-Windows-0078d4?style=flat-square)
[![license](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

![模型面板和输入框截图](docs/screenshots/desktop-panel.png)

图里用的是演示模型，装好以后显示的是你在 DSH 里配置的模型。

目前验证的是 **Windows 下的 DSH Web 0.2.1-rc.2**，默认安装到 `web` profile。DSH Desktop 的专用 profile 还没验证。

[下载](https://github.com/hanagasakugoro-blip/dsh-endfield-slider/releases/latest) · [安装方法](#安装) · [反馈问题](https://github.com/hanagasakugoro-blip/dsh-endfield-slider/issues)

## 目录

- [功能](#功能)
- [安装](#安装)
- [使用](#使用)
- [配置](#配置)
- [兼容性与限制](#兼容性与限制)
- [常见问题](#常见问题)
- [开发](#开发)
- [打包](#打包)
- [项目结构](#项目结构)
- [相关文档](#相关文档)
- [致谢与许可](#致谢与许可)

## 功能

- **模型和推理强度放在一起。** 先选提供方，再选模型；模型多了可以按名称搜索，不分大小写。选完模型后弹窗留着，可以接着调档位。
- **滑条可以连续拖。** 拖动时跟着鼠标走，可以停在两档之间；松手后吸附到最近一档，再保存一次。点档位文字也能直接切换。
- **每个模型记住自己的档位。** 切回用过的模型时恢复上次选择；没记过的模型用 DSH 的默认设置。第一次打开面板时，显示 DSH 正在使用的值。
- 保存时会显示“正在保存”，没写进去会报错并回到原值。正在用的模型会打勾，当前档位也会标出来。
- 模型按钮上的黄、白、浅灰会像波浪一样流动；切换成功时有短闪和轻微抖动。
- 弹窗打开时，黑黄块从左往右扫过，再带着像素和网点散开；关上时变成错开的横条，向右拉长后淡出。
- 输入框加了细侧带、挂孔、刻线和等高线。鼠标移上去、点进输入框、按下发送，都会有各自的反应。发送、停止和原有快捷键仍然照常使用。
- 随 DSH 切换深浅主题。系统开启“减少动态效果”时，插件也会关掉动画。

## 安装

任务简报都是废纸？你可以直接告诉deepseek：帮我安装这个！

如果你愿意自己装的话，可以按照以下方法：

先准备好已初始化的 DSH Web，以及能在终端使用的 **Node.js 22 或更高版本**。

从 [Releases](https://github.com/hanagasakugoro-blip/dsh-endfield-slider/releases) 下载运行包：

**[dsh-endfield-reasoning-slider-0.8.2.zip](https://github.com/hanagasakugoro-blip/dsh-endfield-slider/releases/download/v0.8.2/dsh-endfield-reasoning-slider-0.8.2.zip)**

解压到一个打算长期保留的目录，双击 `install.cmd`。刷新 DSH Web，再点输入框上的模型按钮，看到“模型与推理”面板就装好了。没变化的话，重启 DSH 后再刷新。

运行包已经构建好，不需要 `npm install`。名字带 `-source` 的 ZIP 留给开发用。

### 命令行安装

如果想看安装输出，在解压目录打开 PowerShell：

```powershell
node scripts/install-profile.mjs
```

默认装到当前用户目录下的 `.dsh/profiles/web`。你的 Web profile 在别处，就把路径传进去：

```powershell
node scripts/install-profile.mjs --profile-path "<Web profile 完整路径>"
```

`install.cmd` 和 `uninstall.cmd` 只处理默认路径，不接收参数。自定义目录请用上面的 Node.js 命令。

安装时会先把 profile 配置备份到插件目录的 `backups/`，再添加插件和目录链接。已有的皮肤和其他插件会保留。

**装好后别移动或删除插件目录。** DSH 需要通过这个目录链接加载文件。

### 升级与卸载

- 升级：在旧目录运行 `uninstall.cmd`，解压新版后再运行新版的 `install.cmd`。
- 卸载：在当时安装的目录运行 `uninstall.cmd`。
- 完成后刷新 DSH，必要时重启。卸载会保留模型档位记忆，重装还能继续用。

也可以用命令卸载：

```powershell
# 默认 Web profile
node scripts/install-profile.mjs --uninstall

# 自定义 Web profile
node scripts/install-profile.mjs --uninstall --profile-path "<Web profile 完整路径>"
```

自定义 profile 升级时，在旧目录卸载、在新目录安装，两次都传入同一个 `--profile-path`。

### 校验下载文件

需要校验的话，再下载同一 Release 里的 `SHA256SUMS.txt`。在 ZIP 所在目录运行：

```powershell
Get-FileHash .\dsh-endfield-reasoning-slider-0.8.2.zip -Algorithm SHA256
```

把结果和清单里对应文件的哈希值对照即可。

## 使用

输入框上会显示这样的按钮：

```text
[ 模型名称  |  推理等级  ⌄ ]
```

点开以后，上面选模型，下面调推理等级。

用键盘调档位前，先按 `Tab` 把焦点移到滑条上。

| 操作 | 会发生什么 |
| --- | --- |
| 点提供方 | 打开这一组的模型列表 |
| 输入模型名称 | 搜索当前提供方的模型 |
| 点模型 | 切换模型，弹窗保持打开 |
| 拖滑条 | 连续跟手，松手吸附并保存 |
| 点轨道 | 滑到点击位置，松手保存最近一档 |
| 点档位文字 | 直接保存这一档，滑块平滑移过去 |
| 方向键 | 移动一档，松开按键保存 |
| `Home`／`End`、`PageUp`／`PageDown` | 到两端，或一次移动两档 |
| `Esc` | 有未提交的选择就先取消；否则返回提供方列表或关闭弹窗 |
| `Tab`／`Shift+Tab` | 切换焦点 |
| 点外面，或再点模型按钮 | 关闭弹窗 |

改动用于**下一次请求**。正在跑的请求按 DSH 原来的规则继续，发送按钮的闪动也只表示“点了发送”，回复是否成功仍看 DSH。

## 配置

目前没有单独的插件设置页。模型和档位从 DSH 读取，主题跟着 DSH，是否播放动画跟着系统设置。

想自己换颜色或改动效，可以修改 `src/style.css` 及对应的 `.mjs` 文件，再运行 `npm run build`。主要文件的位置见[项目结构](#项目结构)。

## 兼容性与限制

| 项目 | 说明 |
| --- | --- |
| DSH | 已在 Web 0.2.1-rc.2 验证，其他版本还没确认 |
| 平台 | Windows 桌面浏览器 |
| profile | 默认 `web`；Desktop 专用 profile 还没验证 |
| Node.js | 安装、卸载和开发脚本需要 22 或更高版本 |
| 额外依赖 | 运行包无需再下载 npm 依赖，React 由 DSH 提供 |

有几件事需要注意：

- 插件会替换原来的模型按钮。另一个插件也改这个位置时，可能会互相覆盖。
- 档位取决于模型。模型没有提供推理设置，就没有可调滑条；只有一个选项时也没法继续调。
- 模型有推理设置但没给默认强度时，会多出“提供方默认”。选它就让 DSH 决定强度，不传 `reasoningEffort`，所以界面上可能比模型列出的档位多一个选项。
- 同一浏览器、同一个 DSH 站点下的聊天会共用模型记忆。换浏览器、域名或端口后，记忆另算。
- 其他皮肤也可能改输入框，最终外观会受它们影响。
- DSH 如果更新了模型接口或输入框结构，插件可能需要跟着更新。

## 常见问题

**双击安装后，窗口一闪就没了？**

成功时也会这样。先刷新 DSH 看看；不确定的话，在插件目录打开 PowerShell，运行 `node scripts/install-profile.mjs`，就能看到输出。

**装完还是原来的模型按钮？**

先重启 DSH，再刷新页面。还不行就检查是不是装到了另一个 Web profile，或者有其他模型选择器占了同一个位置。

**提示找不到 profile 的 `package.json`？**

先确认 DSH Web 的 profile 已经初始化。默认找的是当前用户目录下的 `.dsh/profiles/web`；放在别处的，用 `--profile-path` 指过去。

**提示插件已经装在另一个目录？**

回到原目录卸载，再从新目录安装。安装器会检查目录链接指向哪里，避免把已有安装覆盖掉。

**模型列表是空的，或者提供方报错？**

先看 DSH 里的提供方、账号和模型配置。插件展示的是 DSH 返回的目录，读取失败时面板会显示报错，可以点“重试”。提 issue 时带上 DSH 版本、复现步骤和错误信息，记得删掉 token 等凭据。

**怎么清掉记住的档位？**

在你使用的 DSH 页面打开开发者工具，执行这句，然后刷新：

```js
localStorage.removeItem('dsh.endfield.reasoning.v1')
```

**动画能关吗？**

可以，在系统辅助功能里开启“减少动态效果”，插件会跟着关。

## 开发

需要 Node.js 22 或更高版本。下载仓库源码或 [0.8.2 源码包](https://github.com/hanagasakugoro-blip/dsh-endfield-slider/releases/download/v0.8.2/dsh-endfield-reasoning-slider-0.8.2-source.zip)，在源码根目录运行：

```powershell
npm run build                 # 把 src/、CSS 和字体打进 lib/client.js
node --check lib/client.js    # 检查产物语法
npm test                      # 核心逻辑和安装器测试，12 项
```

这几条只用 Node.js 内置模块，可以直接跑，不用先 `npm install`。

改代码请改 `src/`，`lib/client.js` 是构建出来的。改完重新 build，再刷新或重启 DSH。

默认测试用假模型数据检查档位、记忆和保存失败的处理；安装器测试会建一个临时 profile，装上再卸掉，检查原配置和目录链接。两部分都不需要启动 DSH，也不调用模型。

想对照本机 DSH 的模型目录实现再检查一次，先把路径换成实际安装位置：

```powershell
$env:DSH_EF_HOST_MODULES = '<DSH 安装目录>/node_modules/@deepseek-ai'
npm run test:contract
```

浏览器测试另外需要 `npm ci` 安装开发依赖，以及本机 Google Chrome。默认的 `npm test` 不包含这些测试，已跑过的范围见 [VALIDATION.md](VALIDATION.md)。

## 打包

```powershell
npm run build
npm run pack:local
```

文件会放到 `dist/`：

| 文件 | 给谁用 |
| --- | --- |
| `dsh-endfield-reasoning-slider-<版本>.zip` | 安装或升级，已经构建好 |
| `dsh-endfield-reasoning-slider-<版本>-source.zip` | 看源码、自己改、重新构建 |
| `SHA256SUMS.txt` | 核对两个 ZIP 的下载文件 |

发布新版时，让 `package.json`、`package-lock.json` 和标签里的版本号对上，再把两个 ZIP 和校验清单一起传到 GitHub Release。

## 项目结构

```text
src/
  core.mjs                 模型目录、档位和记忆
  ui.mjs                   模型面板和滑条
  style.css                样式
  motion.mjs               选中等操作的动效
  closing.mjs              关闭弹窗的动效
  composer.mjs             输入框装饰和发送反馈
  client.mjs               把插件接到 DSH
lib/
  index.js                 宿主侧入口
  client.js                构建产物
scripts/
  build.mjs                构建
  install-profile.mjs      安装、卸载和备份配置
  package.mjs              打发布包
test/                      测试
assets/                    字体和许可证
docs/                      实现说明、问题记录、截图和发布说明
cordis.patch.yml           把插件加入 profile 的组合配置
install.cmd                安装到默认 Web profile
uninstall.cmd              从默认 Web profile 卸载
```

## 相关文档

- [实现说明](docs/ARCHITECTURE.md)：模型接入、滑条保存、弹窗和输入框动效的实现。
- [问题记录](docs/INCIDENTS.md)：遇到过的问题、原因和修复过程。
- [更新日志](CHANGELOG.md)：每个版本改了什么。

## 致谢与许可

- [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)：插件所用的 DSH。
- [Bai-2008/a-better-dsh-codex-effort-slider](https://github.com/Bai-2008/a-better-dsh-codex-effort-slider)：模型目录和槽位接入参考了这个项目，相关版权声明保留在 LICENSE 中。
- [hhikr/endfield-ui-skill](https://github.com/hhikr/endfield-ui-skill)：终末地风格的排版、配色和动效参考。

代码采用 [MIT License](LICENSE)。Saira 字体采用 [SIL Open Font License 1.1](assets/Saira-OFL.txt)。第三方来源与许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

本项目与鹰角网络、《明日方舟：终末地》无官方关联，不包含游戏素材、标志或官方字体。
