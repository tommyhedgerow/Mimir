<picture>
  <source media="(prefers-color-scheme: dark)"  srcset="assets/banner_1280x320.png">
  <source media="(prefers-color-scheme: light)" srcset="assets/banner_light_1280x320.png">
  <img alt="世界树下的密米尔之井：青色的根系垂入发光的石井，卢恩树符与 M 符上下相叠，排在同一根垂直轴线上。" src="assets/banner_1280x320.png">
</picture>

# Mimir

[English](README.md) · **简体中文**

**一个会教书的 Obsidian 学习库。** 它由一个 [Obsidian](https://obsidian.md) 笔记库和一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 预设组成。两者接在一起，让 agent 成为导师而不是聊天机器人：先探测你已经掌握了什么，再规划这个学科的依赖图，等你确认之后，一个节点一个节点地讲下去，同时把过程写进笔记库。

名字取自世界树下的密米尔之井（Mímir's well），智慧之泉。你看到的是那口井；笔记库是水去的地方。

<img alt="一段六秒的循环像素动画：根系从画面顶端垂下，散成尘埃，一口石井从扩散中升起。两个卢恩字符在井上方显形。" src="assets/mimir-startup-loop.gif" width="640">

---

<picture>
  <source media="(prefers-color-scheme: dark)"  srcset="assets/divider_1280.png">
  <source media="(prefers-color-scheme: light)" srcset="assets/divider_light_1280.png">
  <img alt="" src="assets/divider_1280.png" width="100%">
</picture>

## 它要解决的问题

读过一件事，和真正理解一件事，是两种不同的状态，而只有一种能撑过一个月。一堆互不相连的事实会烂掉；由连接固定住的事实不会，因为每一条都能从其他条目里重新推出来。

所以这里的目标不是覆盖面。目标是那一瞬间：一堆零散事实塌缩成两三个能生出其余一切的念头，并且不再散开。

整套系统建立在两条原则上，其余都是它们的下游：

1. **无条件真理优先。** 从少数你可以原样接受、不带任何保留的事实出发。不是因为自下而上更整齐，而是因为不带保留的事实，是头脑唯一愿意不加防备地记住的东西。在你所处的层面上如果找不到无例外的真理，诚实的做法是说出来，然后退到下一块坚实的地面：一个定义、一组区分、一条约束。
2. **「我当初怎么可能自己发现它？」** 一个看不出理由的事实显得武断，而武断的事实留不住。所以每一步都要从当初把人推上这条路的问题出发。没有东西是凭空出现的。

方法移植自 [amosblomqvist/learn](https://github.com/amosblomqvist/learn)，为 DSH 重写：参考系统里的选择题扩展变成了真正的可选择问答工具，它的研究与绘图步骤变成了预设子代理，它的 markdown 日志变成了一个真实的笔记库。

## 你会得到什么

| | |
| --- | --- |
| **预设** | `Mimir Tutor` —— 九项方法技能、六个专家子代理，以及「先核实再断言」的常设规则。这就是那位导师。 |
| **笔记库** | 一个可用的 Obsidian 库：会话、概念与图谱模板，间隔复习队列，脚本生成的 SVG 依赖图，一个只从课上真正用到的词里长出来的术语表，以及每节课最多两本书的阅读清单。 |
| **课程板** | 本课本身，发布进对话里：依赖节点的主干与你在每个节点上的位置、题目、一行提示，以及库里的图。往回翻、刷新、分叉——它是对话的一部分，所以一直都在。 |
| **主题** | `Mimir` —— 白天是暖纸色与鼠尾草绿，夜里换成青与品红光照下的冷蓝黑；正文用衬线，界面用等宽。 |
| **三个插件** | 阅读字号与明暗切换、启动动画，以及把完成的笔记连同它嵌入的文件复制进第二个文库的发布器。 |
| **两种导出** | 把完成的课印成 A4，一份是记录，一份是习题；以及把其中事实形状的部分收成一副 Anki 牌组，带它自己的笔记类型。各是一条命令，都读笔记。 |
| **链接预览** | 把指针停驻在对话里的链接上，旁边开出一张卡片：页面标题、开头段落、主图——维基百科的链接用条目自己的摘要。 |

### 课程板

每一节课都是随讲随发布的。导师讲一个节点时调用 `mimir_board`，把下面这些放进对话：

- **主干** —— 依赖图的节点，按讲授顺序排列，每个标着已掌握、正在学、不稳固或计划中，所以你不离开这节课就能看见自己站在哪；
- **题目**与选项，和你作答的那张卡片一字不差；
- 一行**提示**，只在真的有用时才给；
- 这节课用到的**图**，满宽渲染。

关于图有两件事值得知道，因为这正是课程板要是一个工具、而不是一条笔记的原因。它们进入你的界面，**从不进入模型的上下文**——导师只知道它们的文件名，别的什么都不知道，所以一节课可以带四张图，而不让四千个 token 的路径数据涌进对话。而一张缺失、读不出或过大的图，会**在屏幕上被点名说成「未显示」**，而不是悄悄不见：一节引用了你看不见的图的课，比一节承认图不在的课更糟。

不需要第二扇窗去保持同步。对话就是这节课；课程板是你一眼扫过的那部分。

### 一节课讲完之后去哪里

笔记库是记录本身；两条命令把记录取出来。

```sh
node Tools/export-lesson-pdf.mjs --done --both   # A4，写进 Learn/Exports/
node Tools/anki-cards.mjs --all                  # 牌组，写进 Learn/Exports/anki/
```

`export-lesson-pdf.mjs` 把每节课印两遍。**记录**是这节课当时的样子——计划、节点、每次检查以及它暴露了什么。**习题**是同一节课，把检查变成题目、把答案挪到附录，因此它是拿来做的，不是拿来读的。它能量的都量：会导致标题孤行的一页会提前断开；一张缺失的图会被点名说出，而不是印出一个文件名。

`anki-cards.mjs` 只收 Anki 擅长的东西——一个名称、一个日期、一个特征、一句要判断的错话——写在被它考的知识旁边的 `## 🃏 Cards` 一节里，用笔记类型认得的两种形状：`front :: back :: kind`，以及写作 `{{c1::…}}` 的填空卡。**推导永远不会变成卡片**，因为卡片把重建变成辨认，而复习方法说得很明确：那比不复习更糟。物种卡必须带上用于分辨它的特征；术语表条目只有在它的笔记写着 `card: true` 时才成卡——参考应当慷慨，牌组不应当。它写出的包里有两种笔记类型、它们的模板和 CSS，所以导入那一个文件就是全部安装。

两个工具都接受 `--vault DIR`，用来读它们所在之外的一个库。

### 悬停卡片

对话里的链接，是可以不离开这节课就看一眼的。把指针停在上面片刻，旁边就开出一张卡片；维基百科的链接拿到的是条目自己的开头段落，来自 Wikimedia 的摘要 API，而不是抓取页面。

它必须是两半，原因值得知道。对话在一个 `connect-src 'self'` 的内容安全策略下提供，所以页面自己不能去取维基百科，而 iframe 会被 `X-Frame-Options` 拒绝。于是**宿主端**在工作区旁边取，只答一条回环路由；**浏览器端**只负责听悬停。那条路由按它所是的那种服务端抓取来设栏：只允许 http 与 https、不带凭据、不跟随重定向进本机、限制正文大小、硬性超时——而拒绝是一个带可读理由的普通答复，绝不是一张空白卡片。

## 安装

你需要 [Obsidian](https://obsidian.md) 和 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。

```sh
git clone https://github.com/tommyhedgerow/Mimir.git
cd Mimir
./scripts/install.sh --lang zh-CN
```

它做两件事：把预设放进你的 DSH 目录，并把课程板装进你的 DSH profile。两件都要——预设载不动课程板的浏览器端，所以少了第二步，你得到的是一个往空处发布的导师。

也可以只装导师，不克隆任何东西。两个预设都在 Preset Square 上，各自是单个 `.dshpreset` 文件，在 DSH Desktop 的「设置 → Agent presets → 导入」里安装：

- **[Mimir Tutor (English)](https://dshdesktop.com/preset/p/mimir-tutor-english-5e09de)** —— 用英文讲授。
- **[Mimir Tutor (Simplified Chinese)](https://dshdesktop.com/preset/p/mimir-tutor-simplified-chinese-51a04d)** —— 用简体中文讲授。

广场上还留着两个旧条目——`mimir-tutor-20d96e` 与 `mimir-tutor-chinese-582526`——它们**已经过时**：早于课程板，并且仍然带着已删除的课程面板。Preset Square 没有更新接口，所以预设变了就重新发布一次，而不是就地修改。请用上面两条。

那条路只给你导师：没有笔记库、没有主题、没有插件，也没有课程板。如果你已经有自己的库、只想要这套方法，那条路是对的。

安装脚本替换任何东西之前都会先备份，而不是直接覆盖。`--lang zh-CN` 装的是中文预设，不传则装英文的。

然后：

1. **重启 DSH。** 预设在一个进程里只组装一次，所以不重启就看不到新的那个。课程板的行也是在同一个时刻组装的。
2. **在 DSH 里把 `Mimir` 文件夹作为工作区打开**，在会话选择器里选 **Mimir Tutor**。
3. **在 Obsidian 里把同一个文件夹作为笔记库打开。**
4. **说出你想学什么。** 「教我板块构造。」「我想弄明白康德到底做了什么。」「讲讲菌根。」

`./scripts/install.sh --dry-run` 只说明会做什么，不碰任何东西。`--no-board` 跳过课程板，只装预设。`./scripts/uninstall.sh` 撤销安装。

### 在浏览器里跑，而不是桌面应用

这里的一切在 `dsh web` 下和在 DSH Desktop 里完全一样——同一个预设根目录、同一个 profile、同一块课程板。有两点要知道：

- **用 `./scripts/serve.sh` 起服务，不要直接 `dsh web`。** harness 按包名解析 profile 插件，走的是 Node 的内部模块加载器，而那个加载器只有在进程带 `--expose-internals` 启动时才可达。DSH Desktop 在自己的启动器里写死了这个参数，命令行的 `dsh` 没有。少了它，课程板那一行的导入就会失败，整棵插件树加载不起来，服务根本起不来——而报错指的是 harness 自己的加载器，不是那个缺失的参数。
- **导入 `.dshpreset` 是 DSH Desktop 才有的功能。** 导入导出的路由随桌面外壳一起发布，不在 harness 核心里，所以在 `dsh web` 下没有东西接住那个文件。走 `./scripts/install.sh`，或者手工把预设复制到 `<dsh 目录>/.agent-presets/mimir-tutor-zh/`——目录结构完全一样。

更详细的说明，包括手动安装、Windows 的注意事项，以及怎么打包一个 `.dshpreset` 给别人，都在 **[INSTALL.md](INSTALL.md)**（英文）。

<picture>
  <source media="(prefers-color-scheme: dark)"  srcset="assets/mark_well_256.png">
  <source media="(prefers-color-scheme: light)" srcset="assets/mark_well_light_256.png">
  <img alt="" width="22" height="22" src="assets/mark_well_256.png">
</picture>

## 一节课实际怎么走

**探测。** 导师问一组夹逼式的问题：一个你按说答得对的，一个你按说答不对的。真相在两者之间。全对说明题太浅，它会立刻加难。一次答错是一个坐标，不是判决：它会在错处周围继续探，弄清那是手滑、是缺口、还是错误认知——因为错误认知必须被拆掉，而不是被补上。

**计划。** 先由一个制图员子代理把这片领域摸一遍，免得计划建在一知半解之上。回来的东西是一段文字加一张小小的依赖图，根基在上，你的目标在下。**然后它等。** 那张图是你的检查点，也是授课顺序。

**讲授。** 一次一个节点，每个节点都走同样的四步：给出动机、确立它、把它连到你已经掌握的东西上、检查它。答错就停下来修，绝不在没确认的节点上继续搭。

**写下来。** 会话、概念、图谱和复习条目随讲随落进笔记库，而不是事后重述。图是由脚本从笔记自己的属性里生成的，所以「你站在哪里」这张图不会悄悄过期。

**复习。** 讲过的概念会得到一个到期日。先提取，答错就修，下次间隔由这次表现决定。连续四次干净提取，这个概念就从队列里退下来。

## 仓库里有什么

```
Learn/              笔记库
  How We Learn.md     方法，写给学习者而不是写给机器
  🌱 Learn Index.md   入口
  Learner Profile.md  空白表格：你的下限、边界、错误认知
  Sessions/           每节课一条带日期的笔记，随讲随写
  Concepts/           原子笔记，一条一个念头，用双链连成图
  Maps/               每个脉络一张，记录依赖顺序与当前前沿
  Reviews/            间隔复习队列
  Glossary/           课上真正需要的生词，一个词一条
  Templates/          Session、Concept、Map
  Viz/                生成的 SVG，按阅读栏宽度绘制
  Dashboard.base      实时视图：什么到期了、什么不稳固、每个脉络走到哪

  以上每份学习者会读的文档都有简体中文副本（我们如何学习.md、🌱 学习索引.md、
  学习者档案.md、学习清单.md、阅读清单.md、术语表.md、概览.md …），中英文并列
  放在同一个库中，读哪一份都可以。文件夹名和属性字段保持英文——它们是脚本、
  模板和技能之间的契约，见 docs/zh-CN-glossary.md。

preset/             DSH 英文预设，以及课程板
preset-zh/          DSH 中文预设，结构与英文版一一对应
  preset.yml          会话选择器里显示的名称与描述
  agent.cordis.yml    人格设定、工具行、六个专家
  skills/             九项方法技能，一项一个目录

preset/mimir-skin/  课程板：宿主端、浏览器端，和它自己的 profile 层

.obsidian/          主题与三个插件，开箱可用
Tools/              生成器、两种导出、课程板的构建与测试
  vault-map.mjs       校验各条主干，并写出生成的图谱
  vault-chart.mjs     从那些主干画出 Learn/Viz 里的每一张 SVG
  export-lesson-pdf.mjs 一节课印成 A4：记录与习题
  anki-cards.mjs      库里卡片形状的部分收成 Anki 包
  lib/                笔记库的 markdown 读取、Anki 写入、笔记类型
  link-preview/       悬停卡的两半，以及它的构建器
assets/             本 README 里的图，以及启动动画
scripts/            安装、卸载、插件同步、预设打包、本地起服务
```

<picture>
  <source media="(prefers-color-scheme: dark)"  srcset="assets/divider_1280.png">
  <source media="(prefers-color-scheme: light)" srcset="assets/divider_light_1280.png">
  <img alt="" src="assets/divider_1280.png" width="100%">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)"  srcset="assets/mark_rune_256.png">
  <source media="(prefers-color-scheme: light)" srcset="assets/mark_rune_light_256.png">
  <img alt="" width="22" height="22" src="assets/mark_rune_256.png">
</picture>

## 六个专家

导师把活派给分工很窄的角色，而不是一个什么都能干的助手。每个角色有自己的个人设定和一份工具白名单，所以它跑不偏。

| | |
| --- | --- |
| **核查员** | 快速、有边界的查证者。Wikipedia 是它的工具，并且有硬性的调用次数上限——没有上限的查证，正是一节课卡住六分钟的原因。它对每条断言给出结论，并在问题本身的前提有错时指出前提错了。 |
| **制图员** | 在规划之前先摸清一个主题的概念地形：真正的根基是什么、什么依赖什么、经典的坑在哪、以及这门学科本身哪里有争议。 |
| **绘图员** | 把一个念头变成一张读得懂的图，mermaid 或手写 SVG。先做减法：超过七个节点通常就是坏图。 |
| **出题员** | 设计题目。干扰项的做法是把正确答案改写成它最像的那个具体错误认知，所以选项的均衡是构造出来的，不是凑出来的。 |
| **诘问者** | 唱反调的那位读者。先把一个主张讲成它最强的样子，再攻击那个版本。它区分「这是错的」「这是有争议的」和「这是定义问题」。 |
| **管理员** | 管书架：先扩写已有笔记而不是新建近似重复的；让图谱保持最新；有东西挪动就修双链；把复习条目归档。 |

<picture>
  <source media="(prefers-color-scheme: dark)"  srcset="assets/mark_axis_256.png">
  <source media="(prefers-color-scheme: light)" srcset="assets/mark_axis_light_256.png">
  <img alt="" width="22" height="22" src="assets/mark_axis_256.png">
</picture>

## 三个插件

三个都是 MIT，都可以从各自的仓库手动安装，仓库里有源码、发布工作流和 README（英文）：

- **[Mimir Controls](https://github.com/tommyhedgerow/obsidian-mimir-controls)** —— 在笔记顶栏里调整阅读字号、切换明暗。它只写 Obsidian 自己的两个设置，不保存任何属于自己的状态。
- **[Mimir Splash](https://github.com/tommyhedgerow/obsidian-mimir-splash)** —— 打开库时把上面那段像素动画播一次，然后让开。按任意键即可跳过。
- **[Lesson Publisher](https://github.com/tommyhedgerow/obsidian-lesson-publisher)** —— 把一条完成的笔记和它嵌入的每个文件发布进第二个库，目录结构镜像过去，双链因此仍然可用。仅限桌面端。

主题是 **[Mimir](https://github.com/tommyhedgerow/obsidian-mimir-theme)**。

<picture>
  <source media="(prefers-color-scheme: dark)"  srcset="assets/divider_1280.png">
  <source media="(prefers-color-scheme: light)" srcset="assets/divider_light_1280.png">
  <img alt="" src="assets/divider_1280.png" width="100%">
</picture>

## 依赖，以及它会去动什么

- **Obsidian** 1.5 或更高。笔记库、主题和两个阅读类插件在桌面端和移动端都能用；Lesson Publisher 只支持桌面端，因为它要往库外写文件。
- **DeepSeek Harness**，并配好模型路由。预设只组合 harness 已经提供的 `@deepseek-ai/*` 包；课程板是随仓库附带的那个包，自己不安装、不下载任何东西。
- **联网搜索**，给核查员用。预设只给这个角色 `web_search` 和 `web_fetch`，不给别的，并把调用次数限制在八次。
- **Node.js**，只用于笔记库的三个生成脚本。

## 其他值得知道的

- **主题不从网络加载任何东西。** 没有网络字体，没有远程图片：系统字体，本地 CSS。离线可用。
- **课程板是可选的。** 没有它预设照样工作：课照上，题照答，只是都发生在平实的对话里，而不是在课程板上。
- **一切都是纯文件。** 预设是你可以读、可以改的目录；技能是 markdown；笔记库是 markdown。改技能在下次加载时生效；改 `agent.cordis.yml` 需要重启 DSH，原因上面说过。
- **中文界面。** 预设、库内文档和三个插件的界面都跟随 Obsidian 的界面语言；把 Obsidian 设为简体中文即可。课程板上的字用的是库自己的语言。agent 面向的技能文件保持英文——读它们的是模型，不是学习者。

<picture>
  <source media="(prefers-color-scheme: dark)"  srcset="assets/badge_row_1280.png">
  <source media="(prefers-color-scheme: light)" srcset="assets/badge_row_light_1280.png">
  <img alt="" src="assets/badge_row_1280.png" width="100%">
</picture>

## 许可

MIT。见 [LICENSE](LICENSE)。
