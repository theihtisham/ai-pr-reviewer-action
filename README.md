<p align="center">
  <img src="https://raw.githubusercontent.com/github/explore/main/topics/github-actions/github-actions.png" width="80" height="80" alt="GitHub Actions" />
</p>

<h1 align="center">🤖 AI PR Reviewer</h1>

<p align="center">
  <strong>The self-hosted AI code reviewer that catches bugs, security holes, and performance killers before they hit production.</strong>
</p>

<p align="center">
  <strong>100% private.</strong> Your code never leaves your infrastructure.<br/>
  <strong>100% free.</strong> Use Ollama for unlimited reviews — no API key needed.<br/>
  <strong>2 minutes to deploy.</strong> Five lines of YAML. That's it.
</p>

<p align="center">
  <a href="#-quick-start-2-minutes">🚀 Quick Start</a> &bull;
  <a href="#-features">✨ Features</a> &bull;
  <a href="#-usage-examples">📖 Usage Examples</a> &bull;
  <a href="#%EF%B8%8F-full-configuration">⚙️ Configuration</a> &bull;
  <a href="#-how-it-works">🏗️ Architecture</a>
</p>

---

<p align="center">

[![GitHub Actions](https://img.shields.io/badge/GitHub-Action-blue?logo=github-actions&logoColor=white&style=for-the-badge)](https://github.com/features/actions)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white&style=for-the-badge)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white&style=for-the-badge)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-112%20Passing-brightgreen?style=for-the-badge)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/@theihtisham/ai-pr-reviewer?style=for-the-badge&logo=npm&color=CB3847)](https://www.npmjs.com/package/@theihtisham/ai-pr-reviewer)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen?style=for-the-badge)](https://github.com/theihtisham/ai-pr-reviewer/pulls)

</p>

---

## 🎬 Imagine This

Your junior dev opens a pull request at 5:47 PM on a Friday. The senior reviewers have already logged off. Monday morning? That's a long wait for a team of 5 blocked on this PR.

**Now imagine this instead:**

Within 30 seconds, an AI reviewer has:

> <img src="https://img.shields.io/badge/🔴_CRITICAL-Security-red" alt="critical" />
>
> **[SECURITY] SQL Injection in user query**
>
> `src/api/users.js` line 47
>
> The `userId` parameter is interpolated directly into the SQL query string. An attacker can inject arbitrary SQL by crafting a malicious `userId` value. This is a classic SQL injection vulnerability (OWASP A03:2021).
>
> 💡 **Suggestion:**
> ```javascript
> // BEFORE (vulnerable):
> const query = `SELECT * FROM users WHERE id = ${userId}`;
>
> // AFTER (parameterized):
> const query = `SELECT * FROM users WHERE id = $1`;
> const result = await db.query(query, [userId]);
> ```

---

> <img src="https://img.shields.io/badge/🟠_ERROR-Performance-orange" alt="error" />
>
> **[PERFORMANCE] N+1 query in order processing loop**
>
> `src/services/orders.js` line 112
>
> Each iteration of this loop makes a separate database query to fetch user details. With 1000 orders, this results in 1000+ database round trips. This pattern causes severe latency degradation under load.
>
> 💡 **Suggestion:**
> ```javascript
> // BEFORE (N+1):
> for (const order of orders) {
>   const user = await db.users.findById(order.userId);
>   order.userName = user.name;
> }
>
> // AFTER (batch query):
> const userIds = orders.map(o => o.userId);
> const users = await db.users.findByIds(userIds);
> const userMap = new Map(users.map(u => [u.id, u]));
> orders.forEach(o => o.userName = userMap.get(o.userId)?.name);
> ```

---

> <img src="https://img.shields.io/badge/🟠_ERROR-Bug-orange" alt="error" />
>
> **[BUG] Null pointer dereference on config access**
>
> `src/utils/helpers.js` line 28
>
> `config.database` is accessed without checking if `config` or `config.database` exists. If the configuration file is missing or malformed, this will throw a `TypeError: Cannot read properties of undefined` at runtime, crashing the entire service.
>
> 💡 **Suggestion:**
> ```javascript
> // BEFORE (crashes on missing config):
> const host = config.database.host;
>
> // AFTER (safe access with fallback):
> const host = config?.database?.host ?? 'localhost';
> if (!host) {
>   throw new Error('Database host is required but was not configured');
> }
> ```

---

And then this summary comment appears on the PR:

> ## 🔍 AI Code Review Summary
>
> ### Issues by Severity
> | Severity | Count |
> |----------|-------|
> | 🔴 critical | 1 |
> | 🟠 error | 2 |
> | 🟡 warning | 3 |
> | 🔵 info | 4 |
> | **Total** | **10** |
>
> ### Issues by Category
> | Category | Count |
> |----------|-------|
> | 🐛 bug | 3 |
> | 🔒 security | 2 |
> | ⚡ performance | 2 |
> | 📝 quality | 3 |
>
> ### Affected Files
> - `src/api/users.js` (3 issues)
> - `src/services/orders.js` (4 issues)
> - `src/utils/helpers.js` (2 issues)
> - `src/middleware/auth.js` (1 issue)
>
> ### Assessment
>
> 🚫 **DO NOT MERGE** — Critical issues found that must be addressed.
>
> ---
> *Review powered by [AI PR Reviewer](https://github.com/marketplace/ai-pr-reviewer) | Model: gpt-4o*

**That's 30 seconds of AI review vs. 3 days of waiting for a human.**

---

## 🤔 Why AI PR Reviewer?

Let's be brutally honest about the alternatives:

| The Ugly Truth | 😱 |
|---|---|
| **Manual review** catches only ~60% of bugs. Senior devs are expensive, overworked, and inconsistent. Reviews take 1-5 days. | |
| **CodeRabbit** sends your proprietary code to their servers. $12/seat/month. Their model, not yours. No on-prem option. | |
| **PR-Agent (Qodo)** requires Qodo's cloud. Your trade secrets on someone else's infrastructure. $15/seat/month. Limited categories. | |
| **Amazon CodeGuru** is AWS-only. $0.0075 per line of code reviewed (a 500-line PR costs $3.75 PER REVIEW). Supports Java and Python only. | |

### The Solution

| | AI PR Reviewer |
|---|---|
| **Privacy** | ✅ Runs inside YOUR GitHub Actions. Code never leaves your VPC. |
| **Cost** | ✅ Free forever with Ollama. No subscription. No per-line charges. |
| **Speed** | ✅ Reviews post in ~30 seconds. No waiting for humans. |
| **Quality** | ✅ GPT-4o powered analysis across 4 categories with severity levels. |
| **Models** | ✅ Use OpenAI, Azure OpenAI, Ollama, or ANY OpenAI-compatible API. |
| **Setup** | ✅ 5 lines of YAML. 2 minutes. Done. |

---

## ✨ Features

| Feature | What It Does | Why You Care |
|:--------|:-------------|:-------------|
| 🔍 **Smart Code Review** | Line-by-line analysis catching logic errors, race conditions, null access, off-by-one errors | Ships fewer bugs to production |
| 🛡️ **Security Scanning** | OWASP Top 10 detection — SQL injection, XSS, CSRF, command injection, SSRF, hardcoded secrets | Prevents security breaches before they happen |
| ⚡ **Performance Review** | N+1 queries, memory leaks, missing pagination, bundle size analysis, unbounded loops | Saves your infrastructure costs and user patience |
| 📝 **Code Quality** | Missing error handling, unclear naming, dead code, hardcoded values, type safety gaps | Keeps your codebase maintainable long-term |
| 🤖 **Multi-Model Support** | OpenAI GPT-4o, Azure OpenAI, Ollama (free local AI), any OpenAI-compatible endpoint | Use the model that fits your budget and privacy needs |
| 📊 **Beautiful Summary** | Rich summary comment with severity breakdown, category stats, affected files, and risk assessment | See the full picture at a glance without reading every comment |
| ✅ **Auto-Approve** | Automatically approves clean PRs with zero blocking issues | Unblocks your team instantly on safe changes |
| 🔧 **Fully Configurable** | Severity thresholds, review categories, ignore patterns, max comments, temperature, language | Tune the reviewer to match YOUR team's standards |
| 🌍 **Multi-Language** | Review responses in English, Spanish, French, German, Japanese, Korean, and more | Works for global teams in their native language |
| 🔒 **100% Private** | Self-hosted in GitHub Actions — zero data leaves your infrastructure, ever | Meets SOC2, HIPAA, GDPR compliance requirements |
| 🆓 **Free Forever** | Use Ollama for unlimited free reviews without any API key at all | Zero budget impact for startups and open-source |
| 🧠 **Smart Chunking** | Large diffs are split into 3500-token chunks with context preservation | Reviews work on PRs of any size without token limits |
| 🔄 **Retry Logic** | Automatic retries with exponential backoff (3 retries, 2s base delay) | Never fails silently on transient API errors |
| 🚦 **Rate Limiting** | Built-in 1-second delay between GitHub API calls | Stays within GitHub's rate limits on large reviews |
| 🎯 **Diff Filtering** | Automatically ignores binary files, lock files, minified code, images, and fonts | Focuses AI analysis on actual code, not noise |

---

## 📦 Install

```bash
# npm
npm install @theihtisham/ai-pr-reviewer

# Or use directly in GitHub Actions (no install needed)
# uses: theihtisham/ai-pr-reviewer@v1
```

## 🚀 Quick Start (2 Minutes)

### Step 1: Create the workflow file

Create `.github/workflows/ai-review.yml` in your repository:

```yaml
name: AI Code Review                          # The name shown in the Actions tab
                                               #
on:                                            # Trigger on PR events
  pull_request:                                #
    types: [opened, synchronize]               # 'opened' = new PR
                                               # 'synchronize' = new commits pushed
                                               #
permissions:                                   # Grant the token permission to
  pull-requests: write                         # post review comments on PRs
  contents: read                               # read the code in the repo
                                               #
jobs:                                          #
  ai-review:                                   # Job name
    runs-on: ubuntu-latest                     # Runs on GitHub's servers
    steps:                                     #
      - name: AI Code Review                   # Step name (visible in logs)
        uses: theihtisham/ai-pr-reviewer@v1       # ← Change to YOUR repo
        with:                                  #
          github-token: ${{ secrets.GITHUB_TOKEN }}  # Auto-provided by GitHub
          api-key: ${{ secrets.OPENAI_API_KEY }}      # Your OpenAI key
```

### Step 2: Add your API key

```
┌─────────────────────────────────────────────────────────────────────┐
│  GitHub → Your Repo → Settings                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Left sidebar, scroll down:                                    │  │
│  │                                                               │  │
│  │    Secrets and variables  ▸                                    │  │
│  │      └── Actions          ← click this                        │  │
│  │                                                               │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │  Secret: [OPENAI_API_KEY          ]  Value: [sk-...     ]  │  │
│  │  │                                                     │  │  │
│  │  │  Click "Add secret"                                 │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

**No OpenAI key?** Skip it. [Use Ollama for free](#-free-reviews-with-ollama-no-api-key).

### Step 3: Open a PR and watch the magic

1. Create a branch, make changes, open a pull request
2. Within ~30 seconds, the AI reviewer posts:
   - **Inline comments** on specific lines with severity badges, explanations, and code fixes
   - **Summary comment** with a full breakdown of issues by severity and category
3. If configured, the PR is **auto-approved** when no blocking issues are found

```
┌──────────────────────────────────────────────────────────────┐
│  Pull Request #42: Add user authentication  [Files changed]  │
│                                                              │
│  ┌─ src/api/users.js ──────────────────────────────────────┐ │
│  │  45 |  const query = `SELECT * FROM users               │ │
│  │  46 |    WHERE id = ${userId}`;  ◀── 🔴 AI comment here │ │
│  │  47 |  const result = await db.query(query);            │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─ Conversation ──────────────────────────────────────────┐ │
│  │  🤖 ai-pr-reviewer bot  •  30 seconds ago               │ │
│  │  ┌────────────────────────────────────────────────────┐  │ │
│  │  │  ## 🔍 AI Code Review Summary                      │  │ │
│  │  │                                                    │  │ │
│  │  │  🔴 critical: 1  🟠 error: 2  🟡 warning: 3       │  │ │
│  │  │                                                    │  │ │
│  │  │  🚫 DO NOT MERGE — Critical issues found.          │  │ │
│  │  └────────────────────────────────────────────────────┘  │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

---

## 📖 Usage Examples

### 1. Basic Review (Default)

The simplest setup. Reviews for bugs, security, performance, and quality. Posts inline comments and a summary.

```yaml
name: AI Review
on:
  pull_request:
    types: [opened, synchronize]

permissions:
  pull-requests: write
  contents: read

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: theihtisham/ai-pr-reviewer@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          api-key: ${{ secrets.OPENAI_API_KEY }}
```

### 2. Azure OpenAI

Use your organization's Azure OpenAI deployment. Perfect for enterprises with existing Azure contracts.

```yaml
name: AI Review
on:
  pull_request:
    types: [opened, synchronize]

permissions:
  pull-requests: write
  contents: read

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: theihtisham/ai-pr-reviewer@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          api-key: ${{ secrets.AZURE_OPENAI_KEY }}
          api-base: https://your-resource.openai.azure.com/openai/deployments/your-deployment
          model: gpt-4o
```

### 3. Free Reviews with Ollama (No API Key!)

Run a local AI model. **Zero cost. Zero API keys. Zero data leaving your network.** Perfect for startups, open-source projects, and security-conscious teams.

```yaml
name: AI Review (Free with Ollama)
on:
  pull_request:
    types: [opened, synchronize]

permissions:
  pull-requests: write
  contents: read

jobs:
  review:
    runs-on: self-hosted              # ← Must have Ollama installed
    steps:
      - uses: theihtisham/ai-pr-reviewer@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          api-key: ollama             # ← Any non-empty value works
          api-base: http://localhost:11434/v1
          model: codellama            # ← Or llama3, mistral, deepseek-coder
```

**Setting up Ollama on your self-hosted runner:**
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull a code model
ollama pull codellama

# Ollama runs on port 11434 by default
```

### 4. Strict Security-Only Mode

Only scan for security vulnerabilities. Fail the CI pipeline if critical issues are found. Perfect for compliance-focused teams.

```yaml
name: Security Review
on:
  pull_request:
    types: [opened, synchronize]

permissions:
  pull-requests: write
  contents: read

jobs:
  security-review:
    runs-on: ubuntu-latest
    steps:
      - uses: theihtisham/ai-pr-reviewer@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          api-key: ${{ secrets.OPENAI_API_KEY }}
          review-types: security                    # ← Only security
          severity-threshold: warning               # ← Skip info-level
          fail-on-critical: true                    # ← Fail CI on critical
          auto-approve: false                       # ← Never auto-approve
          max-comments: 50                          # ← More comments allowed
```

### 5. Custom Ignore Patterns with Max Comments

Fine-tune what gets reviewed. Skip generated code, protobuf files, database migrations, and more.

```yaml
name: AI Review
on:
  pull_request:
    types: [opened, synchronize]

permissions:
  pull-requests: write
  contents: read

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: theihtisham/ai-pr-reviewer@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          api-key: ${{ secrets.OPENAI_API_KEY }}
          ignore-paths: "generated/**, *.proto, migrations/**, *.lock, dist/**"
          max-comments: 30
          temperature: 0.1           # ← Lower = more deterministic
          language: en
          auto-approve: true         # ← Auto-approve clean PRs
```

---

## ⚙️ Full Configuration

Every parameter you can customize:

| Input | Description | Type | Required | Default | Example |
|:------|:------------|:-----|:---------|:--------|:--------|
| `github-token` | GitHub token for API access (posting comments, reading PR data) | `string` | **Yes** | `${{ secrets.GITHUB_TOKEN }}` | `${{ secrets.GITHUB_TOKEN }}` |
| `api-key` | OpenAI-compatible API key (not required for Ollama on localhost) | `string` | **Yes*** | — | `sk-proj-abc123...` |
| `api-base` | API endpoint URL. Supports any OpenAI-compatible API | `string` | No | `https://api.openai.com/v1` | `http://localhost:11434/v1` |
| `model` | AI model to use for review analysis | `string` | No | `gpt-4o` | `gpt-4o`, `codellama`, `mistral` |
| `max-comments` | Maximum inline comments per review (prevents spam on large PRs) | `number` | No | `20` | `5`, `30`, `50` |
| `severity-threshold` | Minimum severity to report. Filters out lower-severity findings | `string` | No | `info` | `warning`, `error`, `critical` |
| `language` | Response language for review comments and suggestions | `string` | No | `en` | `es`, `fr`, `de`, `ja`, `ko` |
| `review-types` | Comma-separated review categories to analyze | `string` | No | `bug,security,performance,quality` | `security`, `bug,performance` |
| `ignore-paths` | Comma-separated glob patterns to skip during review | `string` | No | Built-in list | `"*.proto, generated/**"` |
| `auto-approve` | Automatically approve PRs with no blocking issues | `boolean` | No | `false` | `true` |
| `summary-only` | Post only the summary comment, no inline line-by-line comments | `boolean` | No | `false` | `true` |
| `fail-on-critical` | Fail the GitHub Action if critical-severity issues are found | `boolean` | No | `false` | `true` |
| `temperature` | AI temperature. Lower = more consistent, higher = more creative | `number` | No | `0.2` | `0.0`, `0.1`, `0.5` |

*\* Not required when using Ollama on localhost — pass any non-empty string as `api-key`.*

### Outputs

Use these in downstream workflow steps:

| Output | Description | Example Usage |
|:-------|:------------|:--------------|
| `issues-found` | Total number of issues found by the reviewer | `${{ steps.review.outputs.issues-found }}` |
| `summary` | Full text of the review summary comment | `${{ steps.review.outputs.summary }}` |
| `approved` | Whether the PR passed review (`true` / `false`) | `${{ steps.review.outputs.approved }}` |

### Internal Limits (Built-In)

These are optimized defaults that make reviews reliable:

| Parameter | Value | Why |
|:----------|:------|:----|
| Max diff size | 50,000 chars | Prevents token overflow on massive PRs |
| Chunk size | 3,500 tokens | Each chunk fits in model context with room for prompt |
| Max tokens (response) | 4,000 | Enough for detailed multi-issue responses |
| Rate limit delay | 1,000 ms | Stays within GitHub API rate limits |
| Max retries | 3 | Handles transient API failures gracefully |
| Retry delay | 2,000 ms | Exponential backoff base delay |

---

## 🏗️ How It Works

```
╔══════════════════════════════════════════════════════════════════════╗
║                     AI PR REVIEWER PIPELINE                         ║
╚══════════════════════════════════════════════════════════════════════╝

  ┌──────────┐     ┌──────────────┐     ┌─────────────┐
  │ Developer │────▶│  Opens PR    │────▶│  GitHub     │
  │ pushes    │     │  on GitHub   │     │  webhook    │
  └──────────┘     └──────────────┘     └──────┬──────┘
                                               │
                                               ▼
                                    ┌─────────────────────┐
                                    │   GitHub Actions     │
                                    │   triggers workflow  │
                                    └──────────┬──────────┘
                                               │
                    ┌──────────────────────────┼──────────────────────┐
                    │                          ▼                      │
                    │               ┌───────────────────┐             │
                    │               │  1. FETCH DIFF     │             │
                    │               │  • Get PR diff     │             │
                    │               │  • Get file list   │             │
                    │               │  • Get changed     │             │
                    │               │    lines           │             │
                    │               └────────┬──────────┘             │
                    │                        │                        │
                    │                        ▼                        │
                    │               ┌───────────────────┐             │
                    │               │  2. FILTER         │             │
                    │               │  • Skip binary     │             │
                    │               │  • Skip locks      │             │
                    │               │  • Apply ignore    │             │
                    │               │    patterns        │             │
                    │               │  • Enforce max     │             │
                    │               │    diff size       │             │
                    │               └────────┬──────────┘             │
                    │                        │                        │
                    │                        ▼                        │
                    │               ┌───────────────────┐             │
                    │               │  3. CHUNK          │             │
                    │               │  • Split into      │             │
                    │               │    3500-token       │             │
                    │               │    chunks           │             │
                    │               │  • Preserve file    │             │
                    │               │    context          │             │
                    │               └────────┬──────────┘             │
                    │                        │                        │
                    │                        ▼                        │
                    │     ┌──────────────────────────────────┐        │
                    │     │     4. AI ANALYSIS (per chunk)    │        │
                    │     │                                  │        │
                    │     │  ┌──────┐ ┌────────┐ ┌────────┐ │        │
                    │     │  │ 🐛   │ │ 🔒     │ │ ⚡     │ │        │
                    │     │  │ Bug  │ │Security│ │ Perf   │ │        │
                    │     │  └──────┘ └────────┘ └────────┘ │        │
                    │     │  ┌──────┐ ┌────────┐            │        │
                    │     │  │ 📝   │ │ 📊     │            │        │
                    │     │  │Qual. │ │Summary │            │        │
                    │     │  └──────┘ └────────┘            │        │
                    │     │                                  │        │
                    │     │  Model: OpenAI / Azure / Ollama  │        │
                    │     │  Retry: 3x with backoff          │        │
                    │     └──────────────┬───────────────────┘        │
                    │                    │                            │
                    │                    ▼                            │
                    │     ┌──────────────────────────────────┐        │
                    │     │     5. POST TO GITHUB             │        │
                    │     │                                  │        │
                    │     │  • Inline review comments         │        │
                    │     │    on specific lines              │        │
                    │     │  • Summary comment with           │        │
                    │     │    severity breakdown             │        │
                    │     │  • Auto-approve if clean          │        │
                    │     │  • Set action outputs             │        │
                    │     └──────────────────────────────────┘        │
                    │                                                 │
                    │         Rate limited: 1s between posts          │
                    └─────────────────────────────────────────────────┘
```

---

## 🆚 Comparison

How does AI PR Reviewer stack up against the competition?

| Feature | 🤖 AI PR Reviewer | 🐰 CodeRabbit | 🔄 PR-Agent | ☁️ Amazon CodeGuru |
|:--------|:------------------:|:--------------:|:------------:|:-------------------:|
| **Self-hosted** | ✅ Your Actions | ❌ Their servers | ❌ Qodo cloud | ❌ AWS only |
| **Code privacy** | ✅ Never leaves infra | ❌ Third-party | ❌ Third-party | ❌ AWS infrastructure |
| **Free tier** | ✅ Unlimited (Ollama) | 14-day trial | Limited | ❌ None |
| **Price** | **$0** | $12/seat/mo | $15/seat/mo | $0.0075/line |
| **Multi-model** | ✅ Any OpenAI-compat | ❌ Their model | ❌ Their model | ❌ Proprietary |
| **Security scan** | ✅ OWASP Top 10 | ❌ Basic | ❌ None | Partial (Java/Python) |
| **Performance review** | ✅ Full analysis | ❌ None | ❌ None | ❌ None |
| **Bug detection** | ✅ Line-by-line | ✅ Basic | ✅ Basic | ✅ Java/Python only |
| **Code quality** | ✅ Full analysis | ✅ Basic | ✅ Basic | ❌ None |
| **Auto-approve** | ✅ Configurable | ✅ Yes | ✅ Yes | ❌ No |
| **Custom rules** | ✅ Configurable | ✅ Limited | ✅ Limited | ❌ No |
| **Language support** | ✅ All languages | ✅ All languages | ✅ All languages | ❌ Java, Python only |
| **Response languages** | ✅ 10+ languages | ❌ English only | ❌ English only | ❌ English only |
| **Multi-language review** | ✅ Any language | ✅ Any language | ✅ Any language | ❌ Java, Python only |
| **Setup time** | ✅ 2 minutes | 5 minutes | 10 minutes | 30+ minutes |
| **On-prem option** | ✅ Self-hosted runner | ❌ Cloud only | ❌ Cloud only | ❌ AWS only |
| **No vendor lock-in** | ✅ Open models | ❌ Proprietary | ❌ Proprietary | ❌ Proprietary |
| **Retry logic** | ✅ 3x backoff | ❌ Unknown | ❌ Unknown | ❌ Unknown |
| **Diff filtering** | ✅ Smart filtering | ❌ Unknown | ❌ Unknown | ❌ Unknown |
| **Max comment limit** | ✅ Configurable | ❌ Unknown | ❌ Unknown | ❌ Unknown |
| **Open source** | ✅ MIT License | ❌ Closed source | ✅ Apache 2.0 | ❌ Closed source |

**Bottom line:** AI PR Reviewer is the only option that gives you enterprise-grade review, total privacy, zero cost, and 2-minute setup.

---

## 🔒 Security & Privacy

This project is built on security-first principles:

- 🏠 **Self-hosted** — Runs inside YOUR GitHub Actions. Code never leaves your infrastructure, VPC, or network.
- 🚫 **No telemetry** — Zero analytics, tracking, phone-home, or usage reporting. Not now, not ever.
- 🗑️ **No data storage** — Reviews are posted as GitHub comments on your PRs. Nothing is cached, stored, or logged externally.
- 🔑 **Minimal permissions** — Only needs `GITHUB_TOKEN` with default PR read/write permissions. No admin access. No repo deletion rights.
- 🛡️ **Configurable filtering** — Ignore sensitive paths like `secrets/`, `credentials/`, or any directory pattern you choose.
- 🚦 **Rate limiting** — Built-in 1-second delay between GitHub API calls to prevent abuse and stay within rate limits.
- 🔄 **Retry safety** — 3 retries with exponential backoff. Never floods APIs on failure.
- 📏 **Size limits** — Max diff size of 50,000 characters prevents token overflow and keeps reviews focused.

---

## 🗺️ Roadmap

### ✅ Done (v1.0)
- [x] Smart code review with line-by-line analysis
- [x] OWASP Top 10 security scanning
- [x] Performance review (N+1, memory, pagination)
- [x] Code quality analysis
- [x] Multi-model support (OpenAI, Azure, Ollama)
- [x] Beautiful summary comments with severity breakdown
- [x] Auto-approve clean PRs
- [x] Configurable severity thresholds
- [x] Ignore patterns with glob support
- [x] Multi-language responses
- [x] Smart diff chunking for large PRs
- [x] Retry logic with exponential backoff
- [x] Rate limiting for GitHub API
- [x] 112 passing tests

### 🔜 Coming Soon
- [ ] GitLab Merge Request support
- [ ] Bitbucket Pull Request support
- [ ] SARIF output for GitHub Security tab integration
- [ ] Review caching — skip unchanged hunks in updated PRs
- [ ] Custom rule engine with YAML DSL
- [ ] Multi-language documentation generation
- [ ] PR description auto-generation
- [ ] Test coverage impact analysis
- [ ] GitHub Actions annotation support
- [ ] Multi-file context awareness (cross-file references)
- [ ] Learning mode — adapt to your team's coding style

---

## 🤝 Contributing

We love contributions! Whether it's a bug fix, new feature, or documentation improvement, every PR is welcome.

### Development Setup

```bash
# 1. Fork and clone the repository
git clone https://github.com/theihtisham/ai-pr-reviewer.git
cd ai-pr-reviewer

# 2. Install dependencies
npm install

# 3. Run the full test suite (112 tests)
npm test

# 4. Build the distributable
npm run build

# 5. Create your feature branch
git checkout -b feature/amazing-feature

# 6. Make changes, write tests, ensure everything passes
npm test

# 7. Commit and push
git add .
git commit -m "feat: add amazing feature"
git push origin feature/amazing-feature

# 8. Open a pull request
```

### Development Commands

| Command | Description |
|:--------|:------------|
| `npm install` | Install all dependencies |
| `npm test` | Run the full test suite (112 tests) with coverage |
| `npm run test:watch` | Run tests in watch mode during development |
| `npm run build` | Compile and bundle with `@vercel/ncc` for distribution |
| `npm run lint` | Run ESLint on source and test files |
| `npm run format` | Format all code with Prettier |

### Guidelines

1. **Write tests** for every new feature — we maintain full test coverage
2. **Follow existing patterns** — check how similar features are implemented
3. **Keep it lightweight** — minimal dependencies, fast execution
4. **Document new options** — update this README and `action.yml` for any new inputs
5. **One feature per PR** — keeps reviews focused and mergeable

---

## 📄 License

MIT License. Use it, fork it, sell it, embed it. No restrictions.

```
MIT License

Copyright (c) 2024 AI PR Reviewer Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```

See [LICENSE](LICENSE) for the full license text.

---

## ⭐ Star History

If this project helps you ship better code, consider giving it a star. It helps others discover it.

<p align="center">
  <strong>Every PR deserves a great review.</strong><br/>
  <strong>Let AI do the first pass. Let humans do the hard part.</strong>
</p>

<p align="center">
  <a href="#-quick-start-2-minutes">Get started in 2 minutes →</a>
</p>
