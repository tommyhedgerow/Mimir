# 简体中文术语与命名对照 · Simplified Chinese terminology and naming

This repository ships in English and Simplified Chinese. This file is the
contract both languages are written to: it fixes the vocabulary, the filenames,
and what is deliberately *not* translated. Keep it current when either side
changes; a second language that drifts is worse than no second language.

本仓库同时提供英文与简体中文。本文件是两种语言的共同约定：固定术语、文件名，
以及刻意不翻译的部分。任何一侧变动时请同步更新本文件——会漂移的第二语言比没有
第二语言更糟。

## What is translated, and what is not

| | |
| --- | --- |
| **Translated** | Everything the learner reads: the README, the method, the hub, the blank forms, the review queue, the reading list, the glossary hub, the dashboard, the template prompts, the three plugins' interface strings. |
| **Not translated** | Everything the machine reads: folder names, frontmatter keys, the `graph:` spine format, `Tools/` scripts, `AGENTS.md`, and the agent-facing skill *structure*. |
| **Both** | The tutor preset, which ships twice: `mimir-tutor` (English) and `mimir-tutor-zh` (Chinese). |

**为什么结构性路径不翻译。** `Learn/Sessions/`、`Learn/Concepts/`、`Learn/Viz/`
这些路径是脚本、模板前言字段和 `vault-craft` 技能之间的契约。翻译它们会让工具链
为两种语言分叉，而学习者得不到任何好处；中文 Obsidian 用户使用英文文件夹名也
完全常见。真正需要中文的是**学习者读到的内容**，不是磁盘上的结构。

## Filenames

The English document and its Chinese twin sit side by side in the same folder.
Structural paths are identical; only the document's own name differs.

| English | 简体中文 |
| --- | --- |
| `README.md` | `README.zh-CN.md` |
| `Learn/How We Learn.md` | `Learn/我们如何学习.md` |
| `Learn/🌱 Learn Index.md` | `Learn/🌱 学习索引.md` |
| `Learn/Learner Profile.md` | `Learn/学习者档案.md` |
| `Learn/Backlog.md` | `Learn/学习清单.md` |
| `Learn/Reading List.md` | `Learn/阅读清单.md` |
| `Learn/Glossary.md` | `Learn/术语表.md` |
| `Learn/Dashboard.md` | `Learn/概览.md` |
| `Learn/Dashboard.base` | `Learn/概览.base` |
| `Learn/Glossary.base` | `Learn/术语表.base` |
| `Learn/Reviews/Review Queue.md` | `Learn/Reviews/复习队列.md` |
| `Learn/Wikipedia inside the vault.md` | `Learn/库内维基百科.md` |
| `Learn/Templates/Session.md` | `Learn/Templates/Session.zh-CN.md` |
| `Learn/Templates/Concept.md` | `Learn/Templates/Concept.zh-CN.md` |
| `Learn/Templates/Map.md` | `Learn/Templates/Map.zh-CN.md` |
| `Learn/AGENTS.md` *(root)* | not translated — see above |

Unchanged in both: `Learn/Sessions/`, `Learn/Concepts/`, `Learn/Maps/`,
`Learn/Reviews/`, `Learn/Sources/`, `Learn/Viz/`, `Learn/Glossary/`,
`Learn/Inbox/`, `Learn/Attachments/`, `Learn/Sessions/.live/`, `Tools/`,
`preset/`, `preset-zh/`, `scripts/`, `assets/`.

## Vocabulary

Used consistently. Where a term has a settled Chinese form in the Obsidian and
PKM communities, that form wins over a literal translation.

| English | 简体中文 | Note |
| --- | --- | --- |
| learner | 学习者 | never 学生; the method is about a person who already holds things |
| the teacher | 导师 | the agent. Not 老师 |
| learning vault | 学习库 | this repository, opened in Obsidian |
| library vault | 文库 | the second vault a finished note is published into |
| note | 笔记 | |
| session | 会话 | a dated teaching sitting; `Learn/Sessions/` stays English |
| lesson | 本课 | the thing on screen in the Lesson pane — the question, the drawings and the spine for the *current* sitting. Distinct from 会话, which is the whole dated sitting; 本课 is what the pane is showing right now. |
| session note | 会话笔记 | |
| concept note | 概念笔记 | |
| map | 图谱 | a strand's map note |
| dependency map | 依赖图 | the picture, `graph:` block → SVG |
| spine | 主干 | the `graph:` frontmatter block |
| node | 节点 | one entry in the spine |
| foundation | 根基 | `foundations:` in the spine |
| frontier | 前沿 | where a strand currently stands |
| probe | 探测 | the bracketing step |
| bracketing | 夹逼 | floor above, ceiling below |
| floor / ceiling | 下限 / 上限 | in the probe |
| plan | 计划 | |
| teach | 讲授 | |
| motivate | 动机 | the first of the four moves |
| establish | 确立 | |
| connect | 连接 | |
| check | 检查 | |
| check question | 检查题 | |
| distractor | 干扰项 | an option that encodes a real misconception |
| misconception | 错误认知 | never 误解 — the point is that it is held, not missed |
| unconditional truth | 无条件真理 | |
| axiom | 公理 | |
| derivation | 推导 | |
| definition | 定义 | |
| distinction | 区分 | |
| review | 复习 | |
| spaced review | 间隔复习 | |
| retrieval | 提取 | retrieval, not re-reading |
| established | 已确立 | a concept's state |
| learning | 学习中 | a concept's state |
| fragile | 不稳固 | taught, but not solid |
| seed | 萌芽 | a concept with no teaching behind it yet |
| glossary | 术语表 | `Learn/Glossary/` stays English |
| term | 术语 | |
| reading list | 阅读清单 | at most two books a session |
| backlog | 学习清单 | |
| learner profile | 学习者档案 | |
| session ritual | 会话惯例 | |
| wikilink | 双链 | |
| inline link | 行内链接 | |
| frontmatter | 属性 | first mention: frontmatter（属性） |
| diagram | 图 | |
| generated | 生成 | never 自动生成 — a script draws it, that is the point |
| preset | 预设 | |
| skill | 技能 | |
| sub-agent | 子代理 | |
| verifier | 核查员 | the fact-checking specialist |
| cartographer | 制图员 | maps the field before planning |
| diagram maker | 绘图员 | |
| examiner | 出题员 | |
| sophist | 诘问者 | the adversarial reader |
| librarian | 管理员 | keeps the shelf in order |
| source | 来源 | |
| to verify | 核实 | |
| unverified | 未核实 | |

## Voice

The English is plain, direct and explains *why* before *what*. The Chinese keeps
that shape rather than becoming formal or literary:

- Short sentences. Full stops, not chains of clauses joined by 逗号.
- Explain the reason. A rule without its reason is the one thing this project
  does not write.
- Second person for the learner-facing documents (你), not 您. The tone is a
  teacher talking to one person, not a manual.
- No marketing language: 强大、无缝、颠覆性、一键搞定 are all wrong here.
- Chinese punctuation throughout, including 「」 only where a quotation needs
  marking; prefer 引号 “” for ordinary quotation.
- Where a term is genuinely technical and English is what practitioners say
  (SVG, frontmatter, Obsidian, DeepSeek Harness, DSH, wikilink), keep the
  English and gloss it once.
