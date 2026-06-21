# سرور MCP برای Azure DevOps

یک سرور [Model Context Protocol (MCP)](https://modelcontextprotocol.io) برای **Azure DevOps Server 2022** (نصب داخلی) که قابلیت‌های Azure DevOps را به‌صورت ابزارهای قابل‌فراخوانی توسط هوش مصنوعی در می‌آورد — و به هر دستیار AI سازگار با MCP امکان می‌دهد از طریق زبان طبیعی با pipeline‌ها، pull requestها، build‌ها، مخازن کد و work itemها کار کند.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20-green)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-1.x-purple)](https://modelcontextprotocol.io)
[![Docker](https://img.shields.io/badge/Docker-ready-blue)](https://www.docker.com/)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-ready-326CE5)](https://kubernetes.io/)

---

## چه کارهایی می‌تواند انجام دهد؟

از دستیار هوش مصنوعی خود به زبان ساده بپرسید — سرور MCP فراخوانی‌های REST API را مدیریت می‌کند:

**سوالات ساده**
```
"همه پروژه‌های موجود را نشان بده"
"شاخه‌های مخزن backend چیست؟"
"تمام pull requestهای باز را نمایش بده"
"آخرین build چه وضعیتی دارد؟"
"work item شماره ۴۲ به چه کسی اختصاص دارد؟"
"فایل appsettings.json را از شاخه main بخوان"
```

**سوالات متوسط**
```
"تمام build‌های شکست‌خورده ۲۴ ساعت گذشته را با نام pipeline نشان بده"
"PR‌های باز که به شاخه main می‌روند و reviewer دارند را نشان بده"
"تمام work itemهای نوع Bug با وضعیت Active را پیدا کن"
"یک pull request از feature/payment به develop با توضیحات ایجاد کن"
"جان را به‌عنوان reviewer به PR شماره ۸۷ اضافه کن"
"pipeline با نام deploy-staging را روی شاخه release اجرا کن"
```

**سوالات پیچیده**
```
"کدام PR‌هایی که در ۴۸ ساعت گذشته باز شده‌اند هنوز reviewer ندارند؟ بر اساس مخزن دسته‌بندی کن"
"لاگ‌های آخرین build شکست‌خورده pipeline 'deploy-prod' را بگیر و خلاصه کن چه خطایی رخ داده"
"تمام work itemهای در حال انجام که به کاربر فعلی اختصاص دارند را بر اساس اولویت مرتب کن"
"نظرات review حل‌نشده PR شماره ۱۱۲ را نشان بده — چه بازخوردهایی هنوز باقی مانده؟"
"۵ build آخر pipeline backend را نشان بده. این هفته چند تا موفق و چند تا شکست خورده؟"
"work itemهایی با اولویت بالا که بیش از ۳ روز است به‌روز نشده‌اند را پیدا کن"
"کدام مخازن PR باز بدون reviewer دارند و همزمان نظر حل‌نشده هم دارند؟"
```

---

## ابزارهای موجود

### پروژه‌ها
| ابزار | توضیح |
|-------|-------|
| `list_projects` | لیست تمام پروژه‌های موجود در collection |

### مخازن و شاخه‌ها
| ابزار | توضیح |
|-------|-------|
| `list_repositories` | لیست مخازن Git در یک پروژه |
| `list_branches` | لیست شاخه‌های یک مخزن |
| `get_file_content` | خواندن محتوای فایل از مخزن در هر شاخه‌ای |

### Pull Requestها
| ابزار | توضیح |
|-------|-------|
| `list_pull_requests` | لیست PR‌های تمام مخازن یک پروژه (با فیلتر وضعیت) |
| `list_prs_without_reviewer` | پیدا کردن PR‌های باز بدون reviewer (با بازه زمانی اختیاری) |
| `get_pull_request` | جزئیات یک PR: توضیحات، وضعیت merge، reviewerها و رای آن‌ها |
| `get_pr_comments` | نظرات review یک PR به‌صورت thread (فیلتر active/resolved) |
| `add_pr_reviewer` | اضافه کردن reviewer به PR با ایمیل یا نام |
| `create_pull_request` | ایجاد PR جدید از شاخه مبدأ به مقصد (پشتیبانی از draft) |

### Pipeline‌ها و Build‌ها
| ابزار | توضیح |
|-------|-------|
| `list_pipelines` | لیست تمام pipeline‌های تعریف‌شده در پروژه |
| `get_last_build` | وضعیت آخرین build (با فیلتر اختیاری نام pipeline) |
| `list_builds` | لیست build‌های اخیر با فیلتر pipeline یا وضعیت |
| `list_failed_builds` | پیدا کردن build‌های شکست‌خورده در N ساعت گذشته |
| `get_build` | جزئیات یک build مشخص |
| `get_build_logs` | دریافت خروجی کنسول یک build (خودکار به ۱۵۰ خط آخر محدود می‌شود) |
| `run_pipeline_by_name` | پیدا کردن و اجرای pipeline با نام (جستجوی جزئی، بدون نیاز به ID) |
| `run_pipeline` | اجرای pipeline با ID عددی |

### Work Itemها
| ابزار | توضیح |
|-------|-------|
| `list_work_items` | جستجوی work item بر اساس نوع، وضعیت، مسئول یا کلیدواژه (WIQL) |
| `get_work_item` | جزئیات کامل یک work item با ID |
| `create_work_item` | ایجاد work item جدید (Bug، Task، User Story و غیره) |
| `update_work_item` | به‌روزرسانی فیلدهای یک work item (وضعیت، مسئول، عنوان و غیره) |

---

## معماری

```
کلاینت هوش مصنوعی (Claude, Open WebUI و ...)
        │  پروتکل MCP (JSON-RPC)
        ▼
┌─────────────────────────┐
│   Azure DevOps MCP      │
│   ─────────────────     │
│  HTTP (Kubernetes) یا   │
│  stdio (محلی)           │
│                         │
│  tools/                 │
│    projects.ts          │
│    repos.ts             │
│    pipelines.ts         │
│    workitems.ts         │
└────────────┬────────────┘
             │  REST API (api-version 7.0)
             │  Basic Auth (PAT)
             ▼
┌─────────────────────────┐
│  Azure DevOps Server    │
│  2022 (نصب داخلی)      │
└─────────────────────────┘
```

- **Transport:** HTTP بدون state برای Kubernetes (مقیاس‌پذیر افقی) یا stdio برای استفاده محلی
- **احراز هویت:** Personal Access Token از طریق HTTP Basic auth
- **نسخه API:** 7.0 — بالاترین نسخه پشتیبانی‌شده توسط Azure DevOps Server 2022.0.x

---

## پیش‌نیازها

- Node.js نسخه ۲۰ یا بالاتر
- Azure DevOps Server 2022 (نصب داخلی)
- یک Personal Access Token با دسترسی‌های زیر:
  - `Code (Read & Write)` — برای ابزارهای مخزن، شاخه، فایل و PR
  - `Build (Read & Execute)` — برای ابزارهای pipeline و build
  - `Work Items (Read & Write)` — برای ابزارهای work item

---

## شروع سریع

### محلی (stdio — برای Claude Desktop / Claude Code)

```bash
npm install
npm run build

# ثبت در Claude Code
claude mcp add azure-devops \
  --env AZDO_ORG_URL=https://your-server.example.com/YourCollection \
  --env AZDO_PAT=your_pat_here \
  --env AZDO_PROJECT=YourProject \
  -- node dist/index.js
```

### Docker

```bash
# ساخت image
docker build -t your-registry/azure-devops-mcp:1.0.0 .

# اجرای محلی برای تست
docker run -p 3000:3000 \
  -e AZDO_ORG_URL=https://your-server.example.com/YourCollection \
  -e AZDO_PAT=your_pat_here \
  -e AZDO_PROJECT=YourProject \
  your-registry/azure-devops-mcp:1.0.0
```

### Kubernetes

```bash
# ۱. ایجاد namespace
kubectl create namespace mcp-servers

# ۲. ایجاد secret (نگه داشتن PAT خارج از git)
kubectl create secret generic azure-devops-mcp-secret \
  --namespace mcp-servers \
  --from-literal=AZDO_PAT='your_pat_here'

# ۳. ویرایش k8s/configmap.yaml با مقادیر AZDO_ORG_URL و AZDO_PROJECT

# ۴. اعمال فایل‌های manifest
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

# ۵. بررسی وضعیت
kubectl -n mcp-servers rollout status deploy/azure-devops-mcp
```

آدرس داخلی در cluster:
```
http://azure-devops-mcp.mcp-servers.svc.cluster.local/mcp
```

### تست سریع با port-forward

```bash
# ترمینال ۱
kubectl -n mcp-servers port-forward deploy/azure-devops-mcp 3000:3000

# ترمینال ۲ — بررسی سلامت
curl http://127.0.0.1:3000/healthz

# ترمینال ۲ — لیست پروژه‌ها
curl -sS -X POST http://127.0.0.1:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data-binary '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_projects","arguments":{}}}'
```

---

## پیکربندی

### متغیرهای محیطی

| متغیر | اجباری | توضیح |
|-------|--------|-------|
| `AZDO_ORG_URL` | بله | آدرس Collection، مثال: `https://your-server.example.com/YourCollection` |
| `AZDO_PAT` | بله | Personal Access Token |
| `AZDO_PROJECT` | خیر | پروژه پیش‌فرض — از ارسال نام پروژه در هر درخواست جلوگیری می‌کند |
| `AZDO_API_VERSION` | خیر | پیش‌فرض: `7.0` |
| `MCP_TRANSPORT` | خیر | `http` برای Kubernetes، `stdio` برای محلی (پیش‌فرض: `stdio`) |
| `PORT` | خیر | پورت HTTP، پیش‌فرض: `3000` |
| `MCP_PATH` | خیر | مسیر endpoint، پیش‌فرض: `/mcp` |

### نمونه فایل `.env`

```env
AZDO_ORG_URL=https://your-server.example.com/YourCollection
AZDO_PAT=your_pat_here
AZDO_PROJECT=YourProject
MCP_TRANSPORT=http
PORT=3000
```

---

## ساختار پروژه

```
src/
├── index.ts          نقطه ورود — انتخاب transport بر اساس MCP_TRANSPORT
├── config.ts         خواندن و اعتبارسنجی متغیرهای محیطی
├── server.ts         ساخت سرور MCP و ثبت ابزارها
├── azureClient.ts    کلاینت REST با احراز هویت PAT و timeout 30 ثانیه
├── httpServer.ts     HTTP Transport بدون state برای Kubernetes
└── tools/
    ├── projects.ts   ابزارهای کشف پروژه
    ├── repos.ts      ابزارهای مخزن، شاخه و pull request
    ├── pipelines.ts  ابزارهای pipeline و build
    ├── workitems.ts  ابزارهای work item (WIQL، ایجاد، به‌روزرسانی)
    └── helpers.ts    توابع مشترک (فرمت‌بندی پاسخ، truncation)

k8s/
├── configmap.yaml    پیکربندی غیرمحرمانه
├── deployment.yaml   Kubernetes Deployment (بدون root، filesystem فقط‌خواندنی)
└── service.yaml      ClusterIP Service
```

---

## نکات فنی

- **HTTP بدون state:** هر درخواست یک instance مستقل از سرور MCP ایجاد می‌کند — بدون نیاز به sticky session، به‌راحتی افقی مقیاس می‌شود.
- **Health check:** مسیر `GET /healthz` برای liveness و readiness probe در Kubernetes.
- **نسخه API 7.0:** Azure DevOps Server 2022.0.x حداکثر از نسخه 7.0 پشتیبانی می‌کند. نسخه 7.1 فقط در Azure DevOps Services (cloud) و Server 2022.1+ موجود است.
- **محدودیت پاسخ:** پاسخ ابزارها به ۲۴٬۰۰۰ کاراکتر محدود می‌شود تا context window مدل پر نشود.
- **timeout درخواست:** تمام فراخوانی‌های API پس از ۳۰ ثانیه با پیام خطای واضح متوقف می‌شوند.
- **امنیت container:** به‌عنوان کاربر غیر root (UID 1000) اجرا می‌شود، filesystem فقط‌خواندنی، تمام Linux capabilities حذف شده.
- **سازگاری با مدل‌های ضعیف:** ابزارها داده‌های پردازش‌شده و آماده پاسخ‌دهی برمی‌گردانند نه JSON خام — با مدل‌های کوچک‌تر که در پردازش پاسخ‌های بزرگ API مشکل دارند نیز به‌خوبی کار می‌کند.

---

## مجوز

MIT
