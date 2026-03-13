# Railway 后端部署指南

## 📋 部署前准备

### 1. 确认GitHub仓库
- 后端代码仓库：`https://github.com/jeremyphp/yuanfang-back`
- 确保代码已推送（master分支）

### 2. Railway账号
- 已登录Railway：`https://railway.app`
- 使用GitHub账号登录（推荐）

## 🚀 部署步骤

### 步骤1：创建新项目
1. 登录Railway后，点击 **"New Project"** 按钮
2. 选择 **"Deploy from GitHub repo"**
3. 授权Railway访问您的GitHub账户（首次需要）
4. 在仓库列表中找到并选择 `jeremyphp/yuanfang-back`

### 步骤2：等待初始部署
- Railway会自动检测配置并开始部署
- 部署过程大约需要2-5分钟
- 可以在 **"Logs"** 标签页查看实时日志

### 步骤3：配置环境变量（关键步骤）

部署完成后，点击项目进入详情页，然后：

1. 点击顶部 **"Variables"** 标签
2. 点击 **"New Variable"** 按钮
3. 逐个添加以下环境变量：

#### 必需环境变量
| 变量名 | 值 | 说明 |
|--------|-----|------|
| `PORT` | `5000` | 服务端口 |
| `NODE_ENV` | `production` | 生产环境 |
| `JWT_SECRET` | `strong-random-secret-change-this` | **重要：修改为强随机字符串** |
| `FRONTEND_URL` | `*` | 暂时允许所有来源，部署前端后更新 |
| `DATABASE_URL` | `file:./prod.db` | 数据库文件路径 |
| `ADMIN_EMAIL` | `admin@yuanfang.com` | 管理员邮箱 |
| `ADMIN_PASSWORD` | `change-this-password` | **重要：修改管理员密码** |
| `API_DOCS_PATH` | `/api-docs` | API文档路径 |
| `RATE_LIMIT_WINDOW_MS` | `900000` | 15分钟（毫秒） |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | 限制请求数 |

#### 可选环境变量（后续配置）
| 变量名 | 值 | 说明 |
|--------|-----|------|
| `SMTP_HOST` | `smtp.gmail.com` | 邮件服务器（邀请功能） |
| `SMTP_PORT` | `587` | 邮件端口 |
| `SMTP_USER` | `your-email@gmail.com` | 邮箱账号 |
| `SMTP_PASS` | `your-app-password` | 邮箱密码/应用专用密码 |
| `EMAIL_FROM` | `noreply@yuanfang.com` | 发件人邮箱 |
| `GEMINI_API_KEY` | `your-api-key` | Google Gemini API密钥 |
| `OPENAI_API_KEY` | `your-api-key` | OpenAI API密钥 |
| `ANTHROPIC_API_KEY` | `your-api-key` | Anthropic Claude API密钥 |

### 步骤4：重新部署应用
添加完环境变量后：
1. 点击顶部 **"Deployments"** 标签
2. 找到最新的部署记录
3. 点击 **"Redeploy"** 按钮使环境变量生效

### 步骤5：获取后端URL
1. 点击顶部 **"Settings"** 标签
2. 在 **"Domains"** 部分查看生成的域名
3. 您的后端URL格式：`https://your-project-name.railway.app`

**记录这个URL**：`https://__________.railway.app`

## 🛠️ 验证部署

### 1. 健康检查
访问：`https://your-project.railway.app/health`
期望响应：`{"status":"ok","timestamp":"..."}`

### 2. API测试
- 使用Postman或curl测试API端点
- 示例：`GET https://your-project.railway.app/api/auth/health`

### 3. 查看日志
- 在Railway项目面板点击 **"Logs"** 标签
- 查看应用运行日志，确保没有错误

## ⚠️ 重要注意事项

### 1. 数据库问题（重要！）
**当前使用SQLite文件数据库**，在Railway上可能遇到：
- 文件系统可能不持久
- 多实例部署时数据库不同步
- 重启后数据可能丢失

#### 解决方案：升级到PostgreSQL（推荐）
1. 在Railway项目面板，点击 **"New"** → **"Database"**
2. 选择 **"PostgreSQL"**
3. Railway会自动创建并设置`DATABASE_URL`环境变量
4. **需要代码修改**：更新项目以支持PostgreSQL

### 2. JWT密钥安全性
- **必须**在生产环境修改`JWT_SECRET`
- 使用强随机字符串，长度至少32字符
- 示例生成命令：`openssl rand -base64 32`

### 3. 管理员密码
- **必须**修改默认的`ADMIN_PASSWORD`
- 使用强密码，包含大小写字母、数字、特殊字符

### 4. CORS配置
- 初始设置`FRONTEND_URL="*"`允许测试
- 部署前端后，更新为前端实际域名：`https://your-frontend.vercel.app`

## 🔧 故障排除

### 常见问题及解决方案

| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| 构建失败 | Node.js版本不兼容 | Railway使用Nixpacks自动选择版本 |
| 启动失败 | 环境变量缺失 | 检查所有必需变量是否已设置 |
| 数据库错误 | SQLite文件权限问题 | 考虑切换到PostgreSQL |
| CORS错误 | FRONTEND_URL配置错误 | 检查域名格式，暂时设为`*` |
| 404错误 | 路由配置问题 | 检查API端点路径 |

### 查看详细错误
1. **"Logs"** 标签页查看实时日志
2. **"Deployments"** 标签页查看部署历史
3. 点击部署记录查看详细构建日志

## 📞 后续步骤

### 完成部署后：
1. ✅ 获得后端生产URL
2. ✅ 运行中的API服务
3. ✅ 可访问的 `/health` 端点

### 联系支持：
- 如果遇到技术问题，查看Railway文档
- 或在Railway项目页面点击 **"Support"**

## 🚀 下一步：前端部署

获取后端URL后，进行前端部署：
1. 部署前端到Vercel
2. 配置前端环境变量`VITE_API_BASE_URL`
3. 更新后端`FRONTEND_URL`为前端域名
4. 全面测试前后端集成

---
*最后更新：2026-03-13*
*部署状态：待执行*