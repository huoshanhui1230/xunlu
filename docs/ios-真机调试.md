# 在 Windows 上把训录装进 iPhone

写给这台 Windows 机器：从零到 App 跑在自己的 iPhone 上，再到给 5 位测试者装上。

> **先说结论**
> 苹果从 2022 年 9 月起不再允许 DCloud 的标准调试基座在 iOS 真机上运行
> （[DCloud 公告](https://ask.dcloud.net.cn/article/40041)），所以**必须有自己的苹果开发者账号**
> （个人 99 美元/年）。没有账号，iPhone 真机这条路走不通，只能用浏览器预览。
>
> iTunes 这条路**已经不好使了**：还带 App Store 的 iTunes 12.6.5.3 只认 iOS 12 及更低的设备，
> 新版 iTunes 根本没有安装 App 的入口。Windows 上装 ipa 现在用**爱思助手**（或 3uTools、iMazing）。

一共两条路，先做哪条看你要什么：

| 想要什么 | 走哪条 |
| --- | --- |
| 自己改代码、马上在手机上看到 | A：自定义调试基座（第 1–7 步） |
| 给 5 位测试者装上，跑 5 秒测试 | B：Ad Hoc 正式包（第 8 步） |

两条路前 4 步完全一样（账号、证书、描述文件），做一次就够。

---

## 第 1 步：拿到 DCloud appid

CLI 工程的 `src/manifest.json` 里 `appid` 是空的，没有它不能云打包。

1. 装 [HBuilderX](https://www.dcloud.io/hbuilderx.html)（App 开发版，不是标准版），注册并登录 DCloud 账号。
2. 终端里先编一次 App 端，让 HBuilderX 有东西可开：

   ```bash
   cd apps/mobile
   npm install
   npm run dev:app
   ```

   这条命令会一直开着监听，编译结果在 `apps/mobile/dist/dev/app`。
3. HBuilderX → **文件 → 导入 → 从本地目录导入** → 选 `apps/mobile/dist/dev/app`。
4. 在 HBuilderX 里打开这个项目的 `manifest.json` → **基础配置** → 点 **重新获取**，
   拿到一串 `__UNI__XXXXXX`。
5. 把这串 appid 抄回**源码**里的 `apps/mobile/src/manifest.json` 的 `"appid"` 字段。

   > 一定要抄回源码。`dist/dev/app` 是编译产物，下次编译就被覆盖了。

抄完重新跑一次 `npm run dev:app`，确认 `dist/dev/app/manifest.json` 里的 `"id"` 不再是空的。

## 第 2 步：苹果开发者账号与设备 UDID

1. 在 <https://developer.apple.com> 注册个人开发者账号，交完年费、等审核通过。
2. 把 iPhone 用数据线连上电脑，装 [爱思助手](https://www.i4.cn/)，在设备信息里复制 **UDID**
   （一串 40 位或 25 位的字符）。
3. 5 位测试者的 iPhone 也要各拿一个 UDID —— 开发和 Ad Hoc 的描述文件都是按设备白名单发的，
   没登记的手机装不上。一个账号最多登记 100 台 iPhone，一年只能清空一次，别乱加。

## 第 3 步：在 Windows 上做证书

苹果要的 CSR（证书签名请求）在 Mac 上是用钥匙串生成的；Windows 上用 OpenSSL 做同样的事。
装一个 [Win64 OpenSSL](https://slproweb.com/products/Win32OpenSSL.html)，然后在 Git Bash 里：

```bash
# 1. 生成私钥（这个文件丢了证书就废了，收好）
openssl genrsa -out ios_dev.key 2048

# 2. 生成 CSR，邮箱填开发者账号的邮箱
openssl req -new -key ios_dev.key -out ios_dev.certSigningRequest \
  -subj "/emailAddress=你的邮箱/CN=Xunlu Dev/C=CN"
```

接着到 <https://developer.apple.com/account/resources> 里依次做四件事：

1. **Certificates** → 加一个 **Apple Development** 证书，上传刚才的 `ios_dev.certSigningRequest`，
   下载得到 `development.cer`。
2. **Identifiers** → 建一个 App ID，Bundle ID 填 `com.你的名字.xunlu` 之类，**记下来**，
   第 4 步要用，必须一字不差。
3. **Devices** → 把第 2 步拿到的 UDID 都登记进去。
4. **Profiles** → 建一个 **iOS App Development** 描述文件，选上面的 App ID、刚才的证书、
   要调试的设备，下载得到 `.mobileprovision`。

最后把证书转成 HBuilderX 要的 `.p12`：

```bash
# 3. cer 转 pem
openssl x509 -inform DER -in development.cer -out development.pem

# 4. pem + 私钥打包成 p12，记一个密码，云打包时要填
openssl pkcs12 -export -inkey ios_dev.key -in development.pem -out ios_dev.p12 -legacy
```

> `-legacy` 这个参数不能省。OpenSSL 3.x 默认用新的加密算法打包 p12，
> HBuilderX 导入时会报 `certificate file(p12) import failed`。

## 第 4 步：填 iOS 包名

在 HBuilderX 里打开导入的项目，`manifest.json` → **App 基础配置 / 常用其它设置** →
把 **iOS 包名（Bundle ID）** 填成第 3 步建的那个 App ID，和描述文件里的必须完全一致。
填完同样抄回源码的 `apps/mobile/src/manifest.json`。

---

## A：自定义调试基座（改一行代码就能在手机上看到）

### 第 5 步：云打包做基座

HBuilderX → 顶部 **发行 → 原生App-云打包**（快捷键 `Ctrl+U`）：

- 平台只勾 **iOS**
- 证书选 **使用自有证书**，选上 `ios_dev.p12`、刚才记的密码、`.mobileprovision`
- 勾上 **打自定义调试基座**
- 打包类型选 **调试**

打完的文件在 `apps/mobile/dist/dev/app/unpackage/debug/iOS_debug.ipa`
（HBuilderX 会在控制台给出准确路径，一个项目只保留最后一次的结果）。

### 第 6 步：把基座装进 iPhone

爱思助手 → 连上 iPhone → 左边 **应用** → **导入安装** → 选 `iOS_debug.ipa`。

装完在 iPhone 上：**设置 → 通用 → VPN与设备管理** → 找到你的开发者账号 → **信任**。
不信任的话 App 点开就闪退。

### 第 7 步：HBuilderX 运行到基座

1. 终端里的 `npm run dev:app` 保持开着（它在监听改动）。
2. HBuilderX → **运行 → 运行到手机或模拟器**（`Ctrl+R`）→ 在设备列表里选 **自定义基座**。
3. iPhone 上打开刚装的 App，改代码保存后它会自己刷新。

> Windows 上 HBuilderX 能不能直接认到 iPhone，取决于你的 HBuilderX 版本和驱动，
> 这一步我没法在这台机器上替你验证。如果设备列表里找不到手机：
> 先确认爱思助手能认到（说明驱动正常），再把 HBuilderX 升到最新版。
> 还是不行就走 B 路 —— 打一个正式包装上去，改完重新打包，慢一点但一定能用。

---

## B：给测试者装（第一道放行用这个）

### 第 8 步：Ad Hoc 正式包

5 位测试者只要 App 能装、能用，不需要热更新，所以打一个普通的正式包就行。

1. 回到第 3 步，在 **Profiles** 里再建一个 **Ad Hoc** 描述文件
   （证书改用 **Apple Distribution**，CSR 还是同一个；设备选上 5 台测试机）。
2. HBuilderX → **发行 → 原生App-云打包** → iOS → 自有证书（Distribution 的 p12 + Ad Hoc 描述文件），
   **不勾**「打自定义调试基座」，打包类型选 **正式**。
3. 打出来的 `.ipa` 发给测试者，各自用爱思助手装；第一次打开前同样要在
   **设置 → 通用 → VPN与设备管理** 里信任。

改了代码就重新打一个包发过去。想省事可以考虑 TestFlight，但那要先过一次苹果审核，
这一轮没必要。

---

## 卡住的时候

| 症状 | 多半是 |
| --- | --- |
| 云打包报 `certificate file(p12) import failed` | p12 是 OpenSSL 3.x 默认算法打的，加 `-legacy` 重做一遍 |
| 云打包报包名不匹配 | manifest.json 里的 iOS 包名和描述文件里的 App ID 不一致 |
| App 装上点开就闪退 | 没在「VPN与设备管理」里信任开发者，或这台手机的 UDID 没登记进描述文件 |
| 提示没有 appid | 第 1 步的 appid 没抄回 `src/manifest.json`，或抄完没重新编译 |
| 记录存不进去 | `manifest.json` 的 `modules` 里要有 `"SQLite": {}`，本仓库已经配好，别删 |
| 深色模式不跟随系统 | `app-plus.darkmode` 要是 `true` 且有 `themeLocation: "theme.json"`，本仓库已经配好 |

证书、描述文件、UDID 这些一年到期一次，到期后 App 会打不开，重新签一遍就行。

## 这一版在真机上该看什么

1. 滚轮是不是系统原生的手感（`picker-view` 在 App 端是原生控件，H5 下是拖的）。
2. 完成一组有没有震一下，训练过程中屏幕会不会自己熄。
3. 把 App 从后台划掉再打开，能不能接着上次的训练记；面板开着时划掉也一样。
4. 间隔计时切后台再回来对不对（计时只存时间戳，回前台立刻重算）。
5. 每组用时：连上电脑看 HBuilderX 控制台的 `[训录] … 用时 x.x 秒`，
   这就是第一道放行的那个数。
