# 月相塔罗预约系统（前后端整合版）

## 服务器部署
要求 Linux 服务器、Node.js 20+、npm。将整个目录上传服务器，进入项目根目录执行：

```bash
npm install
cp .env.example .env
nano .env
npm start
```

`.env` 中务必设置 `ADMIN_PASSWORD` 为至少16位独立随机密码。`ADMIN_USERNAME` 可修改。不要把 `.env` 或数据库目录公开。

默认监听 `0.0.0.0:3000`。通过域名反向代理到 `127.0.0.1:3000`，并配置 HTTPS。网站入口 `/`，后台入口 `/admin.html`。服务器防火墙/云安全组只开放必要的 HTTP/HTTPS 端口，生产环境不要直接暴露 Node 端口。

建议用 PM2 守护进程：`npm install -g pm2`，`pm2 start server.js --name lunar-booking`，`pm2 save`。备份 `data/bookings.sqlite`。

## 功能
- 保留原上传前端的视觉设计与页面内容，预约日期/时段改为从后端实时读取。
- 预约真实写入 SQLite；后台实时收到新增记录。
- 管理员确认/取消预约；取消后释放时段。
- 数据库唯一索引防止同一日期时间重复预约。
- SSE 实时推送；基础请求限流；后台登录。

## 短信
当前不发送短信（你选择暂不申请服务），预约会保存在后台。接入阿里云/腾讯云时需要补充真实短信服务商适配代码、签名模板和服务器密钥；不得把密钥放入前端。后台实时更新不依赖短信。

## API
`GET /api/availability`、`POST /api/bookings`、`GET /api/events`、`POST /api/admin/login`、`GET /api/admin/bookings`、`PATCH /api/admin/bookings/:id`。


## GitHub Pages + 后端服务器部署说明

本项目已加入 GitHub Actions 工作流：`.github/workflows/pages.yml`。它只把 `public/` 静态前端发布到 GitHub Pages。**GitHub Pages 不能运行 `server.js`，所以预约提交、数据库和实时事件仍必须部署到支持 Node.js 的后端服务器（例如 Render）。**

1. 在 GitHub 仓库 Settings → Pages 中，将 Build and deployment 的 Source 设为 `GitHub Actions`。仓库默认分支需为 `main`；若分支不是 `main`，请同步修改 `pages.yml` 中的分支名。
2. 后端部署到 Render，配置环境变量：`ADMIN_USERNAME`、`ADMIN_PASSWORD`（至少 16 位随机密码）、`FRONTEND_ORIGIN`（GitHub Pages 实际站点来源，例如 `https://用户名.github.io`；不要在来源末尾加仓库路径）。
3. 后端成功部署后，打开 `public/config.js`，把 `https://YOUR-RENDER-SERVICE.onrender.com` 替换为 Render 实际分配的 HTTPS 服务地址，然后提交到 GitHub。
4. GitHub Actions 会重新发布前端。用户页面是 GitHub Pages 地址，管理员页面是在该地址后加 `/admin.html`。

注意：当前后端仍使用 SQLite。Render 免费实例的本地磁盘不适合长期保存预约记录；正式接收预约前应配置持久化磁盘或改用托管 PostgreSQL。当前版本尚未完成 Render 部署及跨域联调测试。不要把 `.env`、管理员密码或数据库文件上传到 GitHub。
