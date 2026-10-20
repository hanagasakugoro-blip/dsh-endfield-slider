# DSH 终末地推理滑条

为 DSH Web 增加终末地风格的模型选择与推理等级面板，以及输入框装饰和操作反馈。

当前版本：**0.8.2**。面向 Windows 桌面端 DSH Web，已在 DSH **0.2.1-rc.2** 验证；其他版本尚未确认兼容性。项目与鹰角网络、《明日方舟：终末地》无官方关联，不包含游戏素材。

## 界面预览

![模型与推理面板，使用演示模型目录](docs/screenshots/desktop-panel.png)

截图来自独立演示页面，模型名称与档位仅用于展示。实际安装后读取 DSH 的真实目录。

## 功能

- 按提供方浏览模型，只展示宿主提供的推理档位。
- 连续拖动滑条，松手吸附最近档位；点击档位平滑移动，支持键盘操作。
- 按提供方和模型分别记忆档位，宿主确认保存成功后才更新记忆；失败时提示并恢复。
- 模型按钮动态混色，面板黑黄覆盖与粒子转场，选中确认反馈。
- 输入框采用通行证风格的边角、侧带和等高线装饰，发送时给出即时反馈。
- 支持深浅主题与系统“减少动态效果”，保留宿主原有发送、停止和禁用行为。

## 安装

需要已安装并初始化过 Web profile 的 DSH，以及可在终端运行的 **Node.js 22 或更高版本**。

1. 从仓库 **Releases** 下载 `dsh-endfield-reasoning-slider-0.8.2.zip`。普通用户使用此运行包；源码包用于开发。
2. 解压到准备长期保留的目录。不要直接在压缩包内运行。
3. 双击 `install.cmd`，或在解压目录运行：

   ```powershell
   node scripts/install-profile.mjs
   ```

4. 安装成功后刷新 DSH Web；宿主未加载插件时再重启 DSH。

默认 profile 位于当前用户的 `.dsh/profiles/web`。如使用自定义 profile：

```powershell
node scripts/install-profile.mjs --profile-path "你的 Web profile 完整路径"
```

安装器会先在插件目录的 `backups/` 保存 profile 配置备份，再添加本插件的依赖和 bundle，保留其他插件和皮肤。目录通过链接供 DSH 加载，**安装后不要移动或删除插件目录**。更新时可先卸载旧目录中的插件，再安装新目录。

运行包已包含构建产物，安装时无需执行 `npm install` 或重新构建。

## 卸载

在当时安装的插件目录中双击 `uninstall.cmd`，或运行：

```powershell
node scripts/install-profile.mjs --uninstall
```

自定义 profile 需要同时传入相同的 `--profile-path`。卸载只移除本插件的依赖与目录链接，保留其他插件、皮肤和模型记忆；随后刷新 DSH Web。

模型记忆位于浏览器当前 DSH 来源的 localStorage。需要清空时，可在该页面开发者工具中执行：

```js
localStorage.removeItem('dsh.endfield.reasoning.v1')
```

## 开发与预览

在源码目录执行：

```powershell
npm ci
npm run build
npm run preview
```

打开 <http://127.0.0.1:3086/>。该页面使用模拟宿主，不连接模型服务。预览可选读取当前用户已安装的 maid 皮肤样式；未安装该皮肤也可使用。

开发依赖仅用于预览与验证：React、React DOM 和 Playwright。DSH 运行时提供 React；插件构建本身不需要下载依赖。

```powershell
npm test
npm run pack:local
```

`npm test` 运行可独立执行的核心与安装器检查，不需要 DSH 实例或模型调用。`pack:local` 在 `dist/` 输出运行包、源码包和 `SHA256SUMS.txt`。

高级宿主检查需要本机安装对应版本的 DSH，并通过 `DSH_EF_HOST_MODULES` 指向其 `node_modules/@deepseek-ai` 目录，然后执行 `npm run test:contract`。现有浏览器专项脚本需要本机 Google Chrome；本次发布准备仅验证桌面预览，未重新运行整套历史专项。

## 使用边界

- 推理设置作用于下一次请求，不更改正在执行的请求。
- 没有推理元数据的模型不会显示可调滑条，不自行生成推理预算或档位。
- 档位记忆按浏览器来源保存；不同浏览器、域名或端口不共享。
- 插件占用 `conversation.input.model` 单槽，同样替换该位置的插件可能与它冲突。
- 未兼容 DSH 后续可能变化的内部接口。遇到问题请提供 DSH 版本、复现步骤与截图，避免附带访问 token 或凭据。

## 许可与致谢

代码使用 [MIT License](LICENSE)。接入参考项目的许可与版权声明已保留，详见 [第三方说明](THIRD_PARTY_NOTICES.md)。Saira 字体使用 SIL Open Font License 1.1，许可文件位于 `assets/Saira-OFL.txt`。

版本变化见 [CHANGELOG.md](CHANGELOG.md)，验证范围见 [VALIDATION.md](VALIDATION.md)。
