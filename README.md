# Azure DevOps MCP Server

یک [MCP Server](https://modelcontextprotocol.io) برای **Azure DevOps Server 2022** (on-premise) که قابلیت‌های Azure DevOps را به‌صورت ابزار (tool) در اختیار مدل‌های هوش مصنوعی قرار می‌دهد.

- **زبان:** TypeScript / Node.js 20
- **احراز هویت:** Personal Access Token (PAT)
- **API Version:** 7.0 (بالاترین نسخه‌ی پشتیبانی‌شده توسط Azure DevOps Server 2022.0.x)
- **Transport:** HTTP (برای Kubernetes) یا stdio (برای اجرای محلی)

---

## قابلیت‌ها — چه کارهایی می‌تواند انجام دهد

### Projects
| ابزار | توضیح |
|---|---|
| `list_projects` | لیست تمام پروژه‌های موجود در collection. وقتی نام پروژه مشخص نیست، اول اینجا جستجو کن |

### Repositories & Branches
| ابزار | توضیح |
|---|---|
| `list_repositories` | لیست تمام Git repositoryهای یک پروژه (نام، branch پیش‌فرض، آدرس) |
| `list_branches` | لیست branchهای یک repository |
| `get_file_content` | خواندن محتوای یک فایل از repository، روی یک branch دلخواه |

### Pull Requests
| ابزار | توضیح |
|---|---|
| `list_pull_requests` | لیست PR‌های یک پروژه با فیلتر وضعیت (active / completed / abandoned / all) |
| `list_prs_without_reviewer` | PR‌های بدون reviewer، با فیلتر زمانی (مثلاً ۲۴ ساعت اخیر) |
| `get_pull_request` | جزئیات کامل یک PR: توضیحات، وضعیت merge، لیست reviewer‌ها و رأی هر کدام |
| `create_pull_request` | ایجاد PR جدید از یک branch به branch دیگر (با قابلیت draft) |

### Pipelines & Builds
| ابزار | توضیح |
|---|---|
| `list_pipelines` | لیست تمام pipeline‌های تعریف‌شده در یک پروژه |
| `get_last_build` | آخرین build با فیلتر اختیاری نام pipeline |
| `list_builds` | لیست آخرین buildها با فیلتر بر اساس pipeline یا وضعیت |
| `list_failed_builds` | buildهای شکست‌خورده در N ساعت اخیر |
| `get_build` | جزئیات یک build: نتیجه، زمان شروع/پایان، branch، درخواست‌دهنده |
| `get_build_logs` | لاگ کنسول یک build |
| `run_pipeline_by_name` | اجرای pipeline با نام (partial match) بدون نیاز به id |
| `run_pipeline` | اجرای pipeline با id عددی روی branch دلخواه |

---

## نمونه prompt‌هایی که مدل می‌تواند پاسخ دهد

```
آخرین pipeline که اجرا شده موفق بود یا شکست خورد؟
```
```
لیست PR‌های open پروژه MyProject را نشان بده
```
```
در ۲۴ ساعت گذشته چه PR‌هایی بازبینی نشده‌اند؟
```
```
فایل appsettings.json از repo backend را بخوان
```
```
یک PR از branch feature/login به main در پروژه MyProject بساز
```
```
pipeline با نام "my-service [alpha]" را اجرا کن
```
```
buildهای شکست‌خورده ۴۸ ساعت اخیر را نشان بده
```

---

## پیکربندی

### متغیرهای محیطی

| متغیر | اجباری | توضیح |
|---|---|---|
| `AZDO_ORG_URL` | بله | آدرس collection، مثلاً `https://your-server.example.com/YourCollection` |
| `AZDO_PAT` | بله | Personal Access Token |
| `AZDO_PROJECT` | خیر | پروژه پیش‌فرض — اگر تنظیم شود، نیازی به ذکر نام پروژه در هر درخواست نیست |
| `AZDO_API_VERSION` | خیر | پیش‌فرض: `7.0` |
| `MCP_TRANSPORT` | خیر | `http` برای Kubernetes، `stdio` برای اجرای محلی (پیش‌فرض: `stdio`) |
| `PORT` | خیر | پورت HTTP، پیش‌فرض: `3000` |
| `MCP_PATH` | خیر | مسیر endpoint، پیش‌فرض: `/mcp` |

**اسکوپ‌های PAT مورد نیاز:**
- `Code (Read & Write)` — برای ابزارهای repo، branch، file، pull request
- `Build (Read & Execute)` — برای ابزارهای pipeline و build

---

## راه‌اندازی

### Docker

```bash
# Build
docker build -t your-registry/azure-devops-mcp:1.0.0 .

# اجرای محلی برای تست
docker run -p 3000:3000 \
  -e AZDO_ORG_URL=https://your-server.example.com/YourCollection \
  -e AZDO_PAT=your_token_here \
  -e AZDO_PROJECT=YourProject \
  your-registry/azure-devops-mcp:1.0.0
```

### Kubernetes

```bash
# secret (یک‌بار — PAT نباید در git باشد)
kubectl create secret generic azure-devops-mcp-secret \
  --namespace mcp-servers \
  --from-literal=AZDO_PAT='your_token_here'

# configmap + deployment + service
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

# بررسی وضعیت
kubectl -n mcp-servers rollout status deploy/azure-devops-mcp
```

آدرس سرویس داخل کلاستر:
```
http://azure-devops-mcp.mcp-servers.svc.cluster.local/mcp
```

### تست سریع با port-forward

```bash
# ترمینال ۱
kubectl -n mcp-servers port-forward deploy/azure-devops-mcp 3000:3000

# ترمینال ۲ — health check
curl http://127.0.0.1:3000/healthz

# ترمینال ۲ — لیست پروژه‌ها
curl -sS -X POST http://127.0.0.1:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data-binary '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_projects","arguments":{}}}'
```

### اجرای محلی (stdio برای Claude Desktop / Claude Code)

```bash
npm install
npm run build

# ثبت در Claude Code
claude mcp add azure-devops \
  --env AZDO_ORG_URL=https://your-server.example.com/YourCollection \
  --env AZDO_PAT=your_token_here \
  --env AZDO_PROJECT=YourProject \
  -- node dist/index.js
```

---

## ساختار پروژه

```
src/
  index.ts          نقطه ورود — انتخاب transport بر اساس MCP_TRANSPORT
  config.ts         خواندن و اعتبارسنجی متغیرهای محیطی
  server.ts         ساخت MCP server و ثبت تمام ابزارها
  azureClient.ts    کلاینت REST با احراز هویت PAT (Basic auth)
  httpServer.ts     HTTP transport (stateless Streamable HTTP) برای Kubernetes
  tools/
    projects.ts     ابزارهای پروژه
    repos.ts        ابزارهای repository و pull request
    pipelines.ts    ابزارهای pipeline و build
    helpers.ts      توابع کمکی مشترک

k8s/
  configmap.yaml
  deployment.yaml
  service.yaml
```

---

## نکات فنی

- **HTTP transport، stateless:** هر درخواست یک MCP server مستقل می‌سازد — بدون نیاز به sticky session، افقی scale می‌شود.
- **Health check:** `GET /healthz` برای liveness و readiness probe کوبرنتیز.
- **API version 7.0:** Azure DevOps Server 2022.0.x فقط تا نسخه‌ی 7.0 پشتیبانی می‌کند؛ نسخه‌ی 7.1 فقط در Azure DevOps Services (ابری) و Server 2022.1+ موجود است.
- **امنیت container:** اجرا به‌عنوان non-root user، read-only filesystem، تمام capabilities غیرفعال.
