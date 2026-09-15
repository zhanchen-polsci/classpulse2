# ClassPulse 公网部署说明

如果学生会使用不同网络、VPN、移动流量或学校 Wi-Fi，ClassPulse 不能只运行在老师电脑的 `127.0.0.1` 或局域网 IP 上。你需要把它部署到一个公网 HTTPS 地址，例如：

```text
https://classpulse-your-name.onrender.com
```

这样二维码无论被哪种网络的手机扫描，都能打开。

## 推荐方案：部署到 Render / Railway / Fly.io 这类 Node.js Web Service

这个项目是一个轻量 Node.js app，不需要学生账号，也没有复杂依赖。

部署时需要设置：

```text
Start command: node server.js
Environment variable:
NODE_ENV=production
PUBLIC_URL=https://你的公网域名
DATABASE_URL=你的 Postgres 数据库连接地址
```

如果平台要求手动指定监听地址，也设置：

```text
HOST=0.0.0.0
```

大多数平台会自动提供 `PORT`，本 app 已经会读取 `process.env.PORT`。

## Render 上的大致步骤

1. 把这个项目放到 GitHub 仓库。
2. 在 Render 新建 Web Service。
3. 连接这个仓库。
4. Runtime 选 Node。
5. Start command 填：

```bash
node server.js
```

6. Environment variables 填：

```text
NODE_ENV=production
PUBLIC_URL=https://你的-render-url.onrender.com
DATABASE_URL=你的 Postgres Internal Database URL
```

7. 部署完成后，打开 Render 给你的 HTTPS URL。
8. 创建课堂 session。
9. 老师页面里的二维码和 join link 就会使用这个公网 URL。

## 关于数据保存

本地开发时，ClassPulse 会使用本地 JSON 文件保存 session 和回答：

```text
work/classpulse-db.json
```

部署到 Render 时，请使用 Postgres。只要设置了 `DATABASE_URL`，ClassPulse 会自动使用 Postgres 保存 session、问题和回答。这样服务休眠、重启或重新部署后，问卷仍然存在。

### Render Postgres 设置

1. 在 Render Dashboard 点 **New +**。
2. 选择 **PostgreSQL**。
3. 名字可以填：

```text
classpulse-db
```

4. 创建完成后，打开这个数据库页面。
5. 找到 **Internal Database URL**，复制它。
6. 回到 ClassPulse Web Service 的 **Environment** 页面。
7. 添加：

```text
DATABASE_URL=刚才复制的 Internal Database URL
```

8. 保存后点 **Manual Deploy → Deploy latest commit**。

注意：不要把数据库 URL 发到聊天里，也不要上传到 GitHub。

## 为什么不推荐只用老师电脑本地运行？

`http://127.0.0.1:4173` 只对老师电脑自己有效。学生手机扫描后，手机会把 `127.0.0.1` 理解为“手机自己”，所以打不开。

`http://192.168.x.x:4173` 只适合同一个 Wi-Fi 内使用。如果学生开 VPN、使用移动流量、或不在同一个网络，也可能打不开。

公网 HTTPS URL 是唯一适合“所有学生都能扫码”的方式。
