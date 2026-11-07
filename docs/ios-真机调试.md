# 在 Windows 上把训录装进 iPhone

从零到 App 跑在自己的 iPhone 上，再到第一道放行。

苹果开发者账号是绕不开的（个人 99 美元/年）：2022 年 9 月 14 日起 iOS 真机不能再用 DCloud 的标准基座（[官方公告](https://ask.dcloud.net.cn/article/40041)），必须用自己的证书。

一共两条路，前 4 步相同：

| 想要什么 | 走哪条 |
| --- | --- |
| 手机连着电脑，改代码马上看到，控制台能看到每组用时 | A：自定义调试基座（第 5–6 步） |
| 给手机不在身边的人装一个独立的包 | B：Ad Hoc 包（第 7 步） |

第一道放行优先走 A：测试者轮流用连着电脑的手机，每组用时直接在 HBuilderX 控制台里看。B 路装出来的包看不到控制台，`sets.log_ms` 写在测试者手机的本地库里读不出来（见文末）。

> 这份文档里，OpenSSL 的命令在 Windows 的 Git Bash 里实际跑过。HBuilderX 的步骤来自 DCloud 官方文档，还没有用这个工程在真机上走通过，菜单文字可能随版本略有出入。

---

## 准备

**iTunes（必须装）。** Windows 上 HBuilderX 靠 iTunes 带的驱动认 iPhone，`如果是 windows 电脑搭配 iOS 设备，需要安装 itunes`（[官方 FAQ](https://uniapp.dcloud.net.cn/tutorial/run/run-app-faq.html)）。用不着拿它装 App，运行时也不用开着。

1. 从苹果官网下 64 位安装包：<https://www.apple.com/itunes/download/win64>。**不要用微软商店版**，FAQ 明确说不行。
2. 装完重启电脑。
3. 用数据线连上 iPhone，手机上点「信任」。
4. 打开 iTunes，能看到手机就算通了。iTunes 连不上，HBuilderX 一定也连不上。

**依赖。** HBuilderX 用的是工程自己的编译器，所以要先装好：

```bash
cd apps/mobile
npm install
```

---

## 第 1 步：把工程拖进 HBuilderX，拿 appid

把 **`apps/mobile` 整个文件夹**拖进 HBuilderX。官方文档：把整个项目拖入时，「编译时走的是项目下的编译器」（[来源](https://uniapp.dcloud.net.cn/quickstart-cli.html)）。

- 不要只拖 `src`：那样会改用 HBuilderX 自带的编译器。
- 不要导入 `dist/dev/app`：那是编译产物，HBuilderX 不会把它当 uni-app 工程看，打包结果也会被下次编译覆盖。

然后在 HBuilderX 里打开 `src/manifest.json` → **基础配置** → **重新获取**，它会直接写回 `src/manifest.json`。uni-app 工程的 appid 一般是 `__UNI__` 开头。

> 这份文档的上一版让你导入 `dist/dev/app`，所以现在仓库里的 appid 是 `H5GFD11F1A` 这种样子。按上面的做法重新获取一次，换成 `__UNI__` 开头的。

## 第 2 步：开发者账号与设备

1. 在 <https://developer.apple.com> 注册个人开发者账号，交完年费、等审核通过。
2. 拿 iPhone 的 UDID：连上手机打开 iTunes，在摘要页点几下序列号那一行，切到 UDID 后复制。

开发和 Ad Hoc 的描述文件都按设备白名单发，没登记的手机装不上。一个描述文件最多绑 100 台设备。

## 第 3 步：做证书和描述文件

苹果要的 CSR（证书签名请求）在 Mac 上用钥匙串生成，Windows 上用 OpenSSL。Git Bash 自带，不用另装。

找一个**仓库外面**的文件夹，在 Git Bash 里运行（邮箱换成开发者账号的）：

```bash
# 1. 生成私钥。这个文件丢了证书就废了，收好，别进仓库
openssl genrsa -out ios_dev.key 2048

# 2. 生成 CSR。前面的 MSYS_NO_PATHCONV=1 不能省，否则 Git Bash 会把 /emailAddress 当成路径改掉
MSYS_NO_PATHCONV=1 openssl req -new -key ios_dev.key -out ios_dev.certSigningRequest -subj "/emailAddress=you@example.com/CN=Xunlu Dev/C=CN"
```

到 <https://developer.apple.com/account/resources> 依次做四件事：

1. **Certificates**：新建 **Apple Development** 证书，上传 `ios_dev.certSigningRequest`，下载得到 `development.cer`。
2. **Identifiers**：新建 App ID，Bundle ID 填 `com.你的名字.xunlu` 这样的，记下来，后面要一字不差。
3. **Devices**：把第 2 步的 UDID 登记进去。
4. **Profiles**：新建 **iOS App Development** 描述文件，选上面的 App ID、证书和设备，下载得到 `.mobileprovision`。

把证书转成 HBuilderX 要的 `.p12`：

```bash
# 3. cer 转 pem
openssl x509 -inform DER -in development.cer -out development.pem

# 4. pem 加私钥打包成 p12。它会让你设一个密码，云打包时要填
openssl pkcs12 -export -inkey ios_dev.key -in development.pem -out ios_dev.p12 -legacy
```

`-legacy` 不要省：OpenSSL 3 默认的加密算法 HBuilderX 可能导入失败。

## 第 4 步：确认 Bundle ID

云打包时要填 iOS 的 Bundle ID，必须和第 3 步描述文件里的 App ID 完全一致。

---

## A：自定义调试基座

### 第 5 步：云打包做基座

HBuilderX 顶部 **发行 → 原生 App-云打包**（`Ctrl+U`）：

- 平台只勾 iOS
- Bundle ID 填第 3 步那个
- 证书选自有证书：`ios_dev.p12`、刚才设的密码、`.mobileprovision`
- 选择**打自定义调试基座**

打完的文件在 `apps/mobile/unpackage/debug/iOS_debug.ipa`。这个文件不要自己装：官方写明「自定义运行基座必须在 HBuilderX 中真机运行使用，不可直接安装使用」。

### 第 6 步：运行到 iPhone

1. iPhone 用数据线连电脑，保持亮屏。
2. HBuilderX 顶部 **运行**（`Ctrl+R`）→ 运行到 iOS 设备，选你的手机。第一次运行可能提示安装真机运行插件，装上。
3. 基座选**自定义基座-本地基座**。HBuilderX 会把基座装到手机上，手机提示时点允许。
4. 在 iPhone 上手动点图标打开（只有 Mac 上才会自动启动）。

打开时如果提示「未受信任的开发者」：**设置 → 通用 → VPN与设备管理** → 信任。
如果提示要开发者模式（iOS 16 起）：**设置 → 隐私与安全性 → 开发者模式** → 打开并重启。这个开关有时要先装过一次开发版 App 才出现。

之后改代码保存，手机上会自动刷新。每组用时打在 HBuilderX 控制台：

```
[训录] barbell-bench-press 第 1 组 用时 2.4 秒（confirm，直接确认）
```

---

## B：Ad Hoc 包

### 第 7 步

1. **Certificates** 新建 **Apple Distribution** 证书，CSR 用同一个，下载后按第 3 步的命令转成 p12（文件名换成 `distribution`）。
2. **Devices** 登记测试机的 UDID，**Profiles** 新建 **Ad Hoc** 描述文件，选上这些设备。
3. HBuilderX **发行 → 原生 App-云打包**，用 Distribution 的 p12 和 Ad Hoc 描述文件，**不勾**自定义调试基座。
4. 打出来的 `.ipa` 用爱思助手装：连上手机 → 应用 → 导入安装。这是正式包，可以直接装。新版 iTunes 已经没有装 App 的入口。

改了代码要重新打包、重新装。

---

## 卡住的时候

| 症状 | 多半是 |
| --- | --- |
| iTunes 看不到手机 | Windows 服务里 Apple Mobile Device Service 没启动（启动后要重新插拔）；或数据线只能充电；或手机上没点信任 |
| HBuilderX 看不到手机，iTunes 能看到 | 把 HBuilderX 升到最新版，用管理员身份运行，或把它加进杀毒软件白名单 |
| `req: subject name is expected to be in the format` | CSR 命令前面漏了 `MSYS_NO_PATHCONV=1` |
| 云打包报 `certificate file(p12) import failed` | 打 p12 时漏了 `-legacy` |
| 云打包报包名不匹配 | Bundle ID 和描述文件里的 App ID 不一致 |
| App 点开就闪退 | 没信任开发者，或这台手机的 UDID 不在描述文件里 |
| 提示没有 appid | 第 1 步没做，或 `src/manifest.json` 的 appid 还是空的 |
| 开 App 弹「本地记录出错了」 | 把弹窗里的原文记下来。`manifest.json` 的 `modules` 里要有 `"SQLite": {}`，仓库里已配好，打包时别在 HBuilderX 里关掉 |
| 拖进 HBuilderX 后识别不了或编译报错 | 退路：终端里 `npm run dev:app`，再把 `dist/dev/app` 导入 HBuilderX 运行（这是编译器提示的方式），appid 仍要写在 `src/manifest.json` |

证书和描述文件一年到期，到期后 App 打不开，重新做一遍第 3 步再打包。

## 这一版在真机上该看什么

这些在浏览器里都验证不了：

1. **滚轮手感**：`picker-view` 在 App 的 vue 页面里不是系统原生控件，是 webview 里模拟的。三个滚轮连着滑会不会跟手、会不会被拽回去，是 5 秒测试最该看的。
2. **状态栏和 Home Indicator**：顶部「推日 / 结束」不能被灵动岛挡住，底部「完成本组」不能压住 Home Indicator。
3. **存储**：记几组后从后台划掉 App 再打开，要弹「继续上次训练」，组都在；面板开着时划掉也一样。
4. **震动和常亮**：点「完成本组」震一下，训练中屏幕不熄。
5. **切后台**：切出去一分钟再回来，计时要是对的。

### 第一道放行的数据

每组用时写在本地库 `sets.log_ms`，并打在控制台。目前没有把库导出来的入口，所以：

- 走 A 路，手机连着 HBuilderX，从控制台抄数。
- 用时只算「点完成本组 → 保存」。第 1 组没选 RIR 就确认的话，之后点「补填」的时间不算在内；看数据时留意 `closed_by` 和第 1 组。
- 面板开着时 App 被杀掉，重开后才保存的那一组，用时会特别长，统计时剔除。
